/**
 * Stage 02 — Parse
 *
 * Reads the raw XML from the latest batch for a given source,
 * normalises each record into a StagingOffer row, and bulk-inserts
 * into staging_offers.
 *
 * Key decisions made here (from feed analysis):
 * - product_type: 'package' if departure_date present, 'accommodation' if lat/lon without date
 * - destination_country normalised via country_code_map (unknown values logged, not dropped)
 * - price → integer cents
 * - full original record stored in raw (jsonb) for debugging
 *
 * Usage: tsx 02-parse.ts <source_id> [batch_id]
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { getDb } from './lib/db.js';
import { toISO2, reportUnknownCountries } from './lib/country-codes.js';
import { getPath, parsePriceCents, parseDate } from './lib/utils.js';
import { SOURCE_FIELD_MAPS, type StagingOffer, type ProductType, type TransportType } from './lib/types.js';

const BATCH_SIZE = 500;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '_',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === 'product' || name === 'item' || name === 'offer',
});

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

function detectArrayNode(parsed: unknown): unknown[] {
  // Feed XMLs wrap records in varying element names — try common ones
  const candidates = ['products.product', 'items.item', 'offers.offer',
    'channel.item', 'feed.entry', 'products', 'items'];
  for (const path of candidates) {
    const val = getPath(parsed, path);
    if (Array.isArray(val) && val.length > 0) return val as unknown[];
  }
  // Last resort: find first array in the root
  if (typeof parsed === 'object' && parsed !== null) {
    for (const v of Object.values(parsed as Record<string, unknown>)) {
      if (typeof v === 'object' && v !== null) {
        for (const vv of Object.values(v as Record<string, unknown>)) {
          if (Array.isArray(vv)) return vv as unknown[];
        }
      }
    }
  }
  return [];
}

export async function parse(sourceId: string, batchIdOverride?: number): Promise<void> {
  const db = getDb();
  const map = SOURCE_FIELD_MAPS[sourceId];
  if (!map) throw new Error(`No field map for source: ${sourceId}`);

  const batch = batchIdOverride
    ? { id: batchIdOverride, raw_path: '' }
    : await getLatestBatchId(sourceId);

  if (!batch) throw new Error(`No raw_feeds row found for source: ${sourceId}`);

  // Find file path: either given or looked up
  let rawPath = batch.raw_path;
  if (!rawPath && batchIdOverride) {
    const { data } = await db.from('raw_feeds').select('raw_path').eq('id', batchIdOverride).single();
    rawPath = (data as { raw_path: string }).raw_path;
  }

  console.log(`[parse] ${sourceId} batch=${batch.id} reading ${rawPath}`);
  const xml = readFileSync(rawPath);
  const parsed: unknown = xmlParser.parse(xml);
  const records = detectArrayNode(parsed);
  console.log(`[parse] ${records.length} records found`);

  let staged = 0;
  const rows: Omit<StagingOffer, never>[] = [];

  for (const rec of records) {
    const raw = rec as Record<string, unknown>;

    const priceRaw = getPath(raw, map.pricePath);
    const priceCents = parsePriceCents(priceRaw);

    const departureDateRaw = map.departureDatePath ? getPath(raw, map.departureDatePath) : null;
    const departureDate = parseDate(departureDateRaw);

    const latRaw  = map.latPath  ? getPath(raw, map.latPath)  : null;
    const lonRaw  = map.lonPath  ? getPath(raw, map.lonPath)  : null;
    const lat  = latRaw  !== null && latRaw  !== undefined ? parseFloat(String(latRaw))  : null;
    const lon  = lonRaw  !== null && lonRaw  !== undefined ? parseFloat(String(lonRaw))  : null;

    const productType: ProductType | null =
      departureDate ? 'package' :
      (lat !== null && lon !== null) ? 'accommodation' :
      null;

    const countryRaw = map.countryRaw ? String(getPath(raw, map.countryRaw) ?? '') : '';
    const countryISO = await toISO2(countryRaw);

    const transportRaw = map.transportPath ? getPath(raw, map.transportPath) : null;
    const transportType: TransportType =
      transportRaw === 'Flight'       ? 'Flight'       :
      transportRaw === 'Bus'          ? 'Bus'          :
      transportRaw === 'By own means' ? 'By own means' :
      null;

    const imageRaw = map.imagePath ? getPath(raw, map.imagePath) : null;
    const imageUrl = imageRaw && String(imageRaw).startsWith('http') ? String(imageRaw) : null;

    rows.push({
      batch_id:               batch.id,
      raw:                    raw,
      product_type:           productType,
      destination_str:        map.destinationStr ? String(getPath(raw, map.destinationStr) ?? '') : null,
      destination_country_raw: countryRaw || null,
      destination_country:    countryISO,
      price_cents:            priceCents,
      departure_date:         departureDate,
      transport_type:         transportType,
      accommodation_name:     map.accommodationName ? String(getPath(raw, map.accommodationName) ?? '') || null : null,
      lat:                    isNaN(lat!) ? null : lat,
      lon:                    isNaN(lon!) ? null : lon,
      image_url:              imageUrl,
      provider:               map.providerPath ? String(getPath(raw, map.providerPath) ?? '') || null : null,
      deeplink:               map.deeplinkPath ? String(getPath(raw, map.deeplinkPath) ?? '') : '',
    });

    if (rows.length >= BATCH_SIZE) {
      const { error } = await db.from('staging_offers').insert(rows);
      if (error) throw new Error(`[parse] staging insert error: ${JSON.stringify(error)}`);
      staged += rows.length;
      rows.length = 0;
      process.stdout.write(`\r[parse] staged ${staged}…`);
    }
  }

  if (rows.length > 0) {
    const { error } = await db.from('staging_offers').insert(rows);
    if (error) throw new Error(`[parse] staging insert error: ${JSON.stringify(error)}`);
    staged += rows.length;
  }

  console.log(`\n[parse] done: ${staged} rows staged for batch ${batch.id}`);
  reportUnknownCountries();
}

// CLI — guard prevents this from running when imported by runner.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [sourceId, batchIdStr] = process.argv.slice(2);
  if (!sourceId) { console.error('Usage: tsx 02-parse.ts <source_id> [batch_id]'); process.exit(1); }
  parse(sourceId, batchIdStr ? parseInt(batchIdStr, 10) : undefined)
    .catch(e => { console.error(e); process.exit(1); });
}
