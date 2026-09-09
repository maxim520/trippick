/**
 * parse-tradetracker-properties.ts
 *
 * Parser specifiek voor feeds met het TradeTracker <properties>-formaat:
 *
 *   <product ID="123">
 *     <properties>
 *       <property name="city"><value>Hurghada-Stad</value></property>
 *       <property name="price"><value>799.00</value></property>
 *       ...
 *     </properties>
 *   </product>
 *
 * Dit formaat wijkt structureel af van het platte-veldensjabloon in 02-parse.ts.
 * Gebruik deze parser uitsluitend voor bronnen met dit formaat (momenteel: tradetracker-corendon).
 * Pas 02-parse.ts NIET aan om dit formaat ook te herkennen.
 *
 * Afwijkingen van 02-parse.ts die hier expliciet worden afgehandeld:
 *   - Datumformaat: DD/MM/YYYY (niet ISO) — gevalideerd op jaarrange 2025-2028
 *   - flightIncluded=true/false → transport_type='Flight' / null
 *   - iataDeparture wordt opgeslagen in departure_airport
 *   - Coordinates: latitude/longitude (100% gevuld bij Corendon)
 *   - Landnaam is Nederlands ("Egypte", "Griekenland") → via country_code_map
 *
 * Usage: tsx parse-tradetracker-properties.ts <source_id> [batch_id]
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { getDb } from './lib/db.js';
import { toISO2, reportUnknownCountries } from './lib/country-codes.js';
import { parsePriceCents, normalizeImageUrl } from './lib/utils.js';
import type { ProductType, TransportType } from './lib/types.js';

// Alleen bronnen die het <properties><property name="..."> formaat gebruiken
const SUPPORTED_SOURCES = new Set(['tradetracker-corendon', 'tradetracker-bungalownet']);

const BATCH_SIZE = 500;

// ── XML-parser config ──────────────────────────────────────────────────────
// property-elementen altijd als array behandelen (ook als er maar één is)
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '_',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === 'product' || name === 'property',
  // Bungalow.net description fields contain 100k+ HTML entities (&lt;br/&gt; etc.).
  // normalizeProcessEntities() does Math.max(1, value) so 0 → 1. Use Infinity to disable the cap.
  processEntities: { enabled: true, maxTotalExpansions: Infinity, maxExpandedLength: Infinity } as unknown as boolean,
});

// ── Property-helpers ───────────────────────────────────────────────────────
interface PropertyItem {
  _name: string;
  value: unknown;
}

function buildPropMap(product: Record<string, unknown>): Map<string, string> {
  const raw = (product['properties'] as Record<string, unknown>)?.['property'];
  if (!Array.isArray(raw)) return new Map();
  const map = new Map<string, string>();
  for (const item of raw as PropertyItem[]) {
    if (item._name && item.value !== null && item.value !== undefined) {
      map.set(item._name, String(item.value).trim());
    }
  }
  return map;
}

function prop(map: Map<string, string>, name: string): string | null {
  return map.get(name) ?? null;
}

// ── Date parsing: DD/MM/YYYY with range guard ──────────────────────────────
// Throws on invalid format or implausible year, so a silent date error is
// immediately visible in logs rather than silently stored as null.
function parseDDMMYYYY(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) {
    // Fallback: attempt ISO or other parseDate-compatible formats
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return raw.slice(0, 10);
    throw new Error(`[corendon-date] Unexpected format: "${raw}"`);
  }
  const [, d, mo, y] = m as [string, string, string, string];
  const year = parseInt(y, 10);
  if (year < 2025 || year > 2028) {
    throw new Error(`[corendon-date] Year ${year} out of allowed range 2025-2028 in "${raw}"`);
  }
  return `${y}-${mo}-${d}`;
}

// ── Batch ID lookup ────────────────────────────────────────────────────────
async function getLatestBatchId(sourceId: string): Promise<{ id: number; raw_path: string } | null> {
  const db = getDb();
  const { data } = await db
    .from('raw_feeds')
    .select('id, raw_path')
    .eq('source_id', sourceId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: number; raw_path: string } | null;
}

// ── Main ───────────────────────────────────────────────────────────────────
export async function parseTradeTrackerProperties(sourceId: string, batchIdOverride?: number): Promise<void> {
  if (!SUPPORTED_SOURCES.has(sourceId)) {
    throw new Error(
      `parseTradeTrackerProperties does not support source "${sourceId}". ` +
      `Supported: ${[...SUPPORTED_SOURCES].join(', ')}. ` +
      `Use 02-parse.ts for flat-field feed formats.`,
    );
  }

  const db = getDb();

  const batch = batchIdOverride
    ? { id: batchIdOverride, raw_path: '' }
    : await getLatestBatchId(sourceId);

  if (!batch) throw new Error(`No raw_feeds row found for source: ${sourceId}`);

  let rawPath = batch.raw_path;
  if (!rawPath && batchIdOverride) {
    const { data } = await db.from('raw_feeds').select('raw_path').eq('id', batchIdOverride).single();
    rawPath = (data as { raw_path: string }).raw_path;
  }

  console.log(`[parse-properties] ${sourceId} batch=${batch.id} reading ${rawPath}`);
  const xml = readFileSync(rawPath);
  const parsed: unknown = xmlParser.parse(xml);

  // Corendon feeds: <products><product ID="...">
  let records: unknown[] = [];
  if (typeof parsed === 'object' && parsed !== null) {
    for (const rootVal of Object.values(parsed as Record<string, unknown>)) {
      if (typeof rootVal === 'object' && rootVal !== null) {
        for (const v of Object.values(rootVal as Record<string, unknown>)) {
          if (Array.isArray(v) && v.length > 0) { records = v as unknown[]; break; }
        }
      }
      if (records.length > 0) break;
    }
  }

  if (records.length === 0) throw new Error(`[parse-properties] No product records found in XML`);
  console.log(`[parse-properties] ${records.length} products found`);

  let staged = 0;
  let dateErrors = 0;
  const rows: Record<string, unknown>[] = [];

  for (const rec of records) {
    const product = rec as Record<string, unknown>;
    const props = buildPropMap(product);

    // ── Price — top-level <price currency="EUR">589.00</price> ─────────
    // fast-xml-parser wraps mixed content (attr + text) as { _currency, '#text' }
    // Bungalow.net has price=0.00 at top-level; real price is in fromPrice property.
    const priceNode = product['price'];
    const priceVal = (priceNode !== null && typeof priceNode === 'object')
      ? (priceNode as Record<string, unknown>)['#text']
      : priceNode;
    const topLevelCents = parsePriceCents(priceVal);
    const priceCents = (topLevelCents !== null && topLevelCents > 0)
      ? topLevelCents
      : parsePriceCents(prop(props, 'fromPrice') ?? prop(props, 'price'));

    // ── Date ───────────────────────────────────────────────────────────
    let departureDate: string | null = null;
    const rawDate = prop(props, 'departureDate');
    if (rawDate) {
      try {
        departureDate = parseDDMMYYYY(rawDate);
      } catch (e) {
        dateErrors++;
        if (dateErrors <= 5) console.warn(`  [warn] ${(e as Error).message}`);
        // Keep departureDate null — record still staged for debugging via raw
      }
    }

    // ── Coordinates ────────────────────────────────────────────────────
    // Bungalow.net uses European comma decimal: "37,60899079" → "37.60899079"
    const latStr = prop(props, 'latitude');
    const lonStr = prop(props, 'longitude');
    const lat = latStr ? parseFloat(latStr.replace(',', '.')) : null;
    const lon = lonStr ? parseFloat(lonStr.replace(',', '.')) : null;

    // ── Product type ───────────────────────────────────────────────────
    // Corendon always has departure_date; coordinates present as bonus
    const productType: ProductType | null =
      departureDate ? 'package' :
      (lat !== null && lon !== null) ? 'accommodation' :
      null;

    // ── Country ────────────────────────────────────────────────────────
    // Bungalow.net already provides ISO-2 (e.g. "IT", "NL"); Corendon uses Dutch names.
    // If the value looks like an ISO-2 code (2 uppercase ASCII letters), use it directly.
    const countryRaw = prop(props, 'country') ?? '';
    const countryISO = /^[A-Z]{2}$/.test(countryRaw)
      ? countryRaw
      : await toISO2(countryRaw);

    // ── Transport ──────────────────────────────────────────────────────
    // flightIncluded=true → 'Flight', false or missing → null
    const flightIncluded = prop(props, 'flightIncluded');
    const transportType: TransportType =
      flightIncluded === 'true' ? 'Flight' : null;

    // ── Image — top-level <images><image>url</image></images> ──────────
    // Fallback to productimage_1 in properties if images block is absent.
    const imagesNode = product['images'] as Record<string, unknown> | null;
    let imageUrl: string | null = null;
    if (imagesNode?.['image']) {
      const imgArr = Array.isArray(imagesNode['image']) ? imagesNode['image'] : [imagesNode['image']];
      const first = imgArr[0];
      imageUrl = normalizeImageUrl(typeof first === 'string' ? first : null);
    }
    if (!imageUrl) {
      imageUrl = normalizeImageUrl(prop(props, 'productimage_1'));
    }

    // ── Deeplink — top-level <URL> ─────────────────────────────────────
    const deeplinkTop = product['URL'];
    const deeplink = (typeof deeplinkTop === 'string' && deeplinkTop.startsWith('http'))
      ? deeplinkTop
      : (prop(props, 'deeplink') ?? prop(props, 'url') ?? '');

    // ── Store raw props as flat object for raw jsonb ───────────────────
    const rawRecord: Record<string, unknown> = { _ID: product['_ID'] };
    for (const [k, v] of props) rawRecord[k] = v;

    rows.push({
      batch_id:               batch.id,
      raw:                    rawRecord,
      product_type:           productType,
      destination_str:        prop(props, 'city'),
      destination_country_raw: countryRaw || null,
      destination_country:    countryISO,
      price_cents:            priceCents,
      departure_date:         departureDate,
      transport_type:         transportType,
      accommodation_name:     (product['name'] as string | null) ?? prop(props, 'name'),
      lat:                    lat !== null && !isNaN(lat) ? lat : null,
      lon:                    lon !== null && !isNaN(lon) ? lon : null,
      image_url:              imageUrl,
      provider:               prop(props, 'brand') ?? 'Corendon',
      deeplink:               deeplink,
      departure_airport:      prop(props, 'iataDeparture') ?? prop(props, 'departureAirport'),
    });

    if (rows.length >= BATCH_SIZE) {
      const { error } = await db.from('staging_offers').insert(rows);
      if (error) throw new Error(`[parse-properties] staging insert error: ${JSON.stringify(error)}`);
      staged += rows.length;
      rows.length = 0;
      process.stdout.write(`\r[parse-properties] staged ${staged}…`);
    }
  }

  if (rows.length > 0) {
    const { error } = await db.from('staging_offers').insert(rows);
    if (error) throw new Error(`[parse-properties] staging insert error: ${JSON.stringify(error)}`);
    staged += rows.length;
  }

  if (dateErrors > 0) {
    console.warn(`\n[parse-properties] ${dateErrors} records with unparseable departureDate (kept as null)`);
  }
  console.log(`\n[parse-properties] done: ${staged} rows staged for batch ${batch.id}`);
  reportUnknownCountries();
}

// CLI — guard prevents this from running when imported by runner.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [sourceId, batchIdStr] = process.argv.slice(2);
  if (!sourceId) {
    console.error('Usage: tsx parse-tradetracker-properties.ts <source_id> [batch_id]');
    process.exit(1);
  }
  parseTradeTrackerProperties(sourceId, batchIdStr ? parseInt(batchIdStr, 10) : undefined)
    .catch(e => { console.error(e); process.exit(1); });
}
