/**
 * Stage 04 — Validate
 *
 * Per-record checks:
 *   - Must have a destination_id (resolved)
 *   - price_cents between €50 (5000) and €25.000 (2.500.000)
 *   - For product_type='package': departure_date must exist and be
 *     in [today, today+18 months]
 *
 * Batch-wide anomaly checks (compare to previous run of same source):
 *   - Volume must not have dropped >30%
 *   - Median price must not have shifted >25%
 *
 * On anomaly: logs an error and exits non-zero without publishing.
 * Records that fail per-record checks are simply excluded from publish,
 * not deleted from staging (kept for debugging).
 *
 * Usage: tsx 04-validate.ts <source_id> [batch_id]
 */
import 'dotenv/config';
import { getDb } from './lib/db.js';

const PRICE_MIN  = parseInt(process.env['PRICE_MIN_CENTS']  ?? '5000',    10);
const PRICE_MAX  = parseInt(process.env['PRICE_MAX_CENTS']  ?? '2500000', 10);
const DEPART_WIN = parseInt(process.env['DEPARTURE_WINDOW_MONTHS'] ?? '18', 10);
const VOL_DROP   = parseFloat(process.env['VOLUME_DROP_THRESHOLD']  ?? '0.30');
const PRICE_SHF  = parseFloat(process.env['PRICE_SHIFT_THRESHOLD']  ?? '0.25');

interface ValidateResult {
  batchId: number;
  validIds: number[];
  invalid: { price: number; date: number; unresolved: number };
}

async function getLatestBatchId(sourceId: string): Promise<number | null> {
  const db = getDb();
  const { data } = await db
    .from('raw_feeds').select('id').eq('source_id', sourceId)
    .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
  return data ? (data as { id: number }).id : null;
}

export async function validate(sourceId: string, batchIdOverride?: number): Promise<ValidateResult> {
  const db = getDb();
  const batchId = batchIdOverride ?? await getLatestBatchId(sourceId);
  if (!batchId) throw new Error(`[validate] no batch found for ${sourceId}`);

  console.log(`[validate] ${sourceId} batch=${batchId}`);

  const { data: rows, error } = await db
    .from('staging_offers')
    .select('id, destination_id, price_cents, departure_date, product_type')
    .eq('batch_id', batchId);
  if (error) throw new Error(`[validate] ${JSON.stringify(error)}`);

  const now = new Date();
  const maxDate = new Date(now);
  maxDate.setMonth(maxDate.getMonth() + DEPART_WIN);

  const validIds: number[] = [];
  const invalid = { price: 0, date: 0, unresolved: 0 };

  for (const row of (rows ?? []) as Array<{
    id: number;
    destination_id: string | null;
    price_cents: number | null;
    departure_date: string | null;
    product_type: string | null;
  }>) {
    if (!row.destination_id)   { invalid.unresolved++; continue; }
    if (row.price_cents === null || row.price_cents < PRICE_MIN || row.price_cents > PRICE_MAX) {
      invalid.price++; continue;
    }
    if (row.product_type === 'package') {
      if (!row.departure_date) { invalid.date++; continue; }
      const dep = new Date(row.departure_date);
      if (dep < now || dep > maxDate) { invalid.date++; continue; }
    }
    validIds.push(row.id);
  }

  console.log(`[validate] valid=${validIds.length} | invalid: price=${invalid.price} date=${invalid.date} unresolved=${invalid.unresolved}`);

  // --- Batch-wide anomaly checks ---
  const { data: prevBatch } = await db
    .from('raw_feeds').select('id').eq('source_id', sourceId)
    .order('fetched_at', { ascending: false }).range(1, 1).maybeSingle();

  if (prevBatch) {
    const prevBatchId = (prevBatch as { id: number }).id;

    // Previous valid count
    const { count: prevCount } = await db
      .from('staging_offers').select('id', { count: 'exact', head: true })
      .eq('batch_id', prevBatchId).not('destination_id', 'is', null);

    const prevValid = prevCount ?? 0;
    if (prevValid > 0) {
      const dropRatio = 1 - validIds.length / prevValid;
      if (dropRatio > VOL_DROP) {
        throw new Error(
          `[validate] ANOMALY: volume dropped ${(dropRatio * 100).toFixed(1)}% ` +
          `(${validIds.length} vs prev ${prevValid}). ` +
          `Threshold: ${VOL_DROP * 100}%. Aborting publish.`
        );
      }

      // Median price comparison — use avg as proxy (no native median in PostgREST)
      const { data: curPrices }  = await db.from('staging_offers').select('price_cents').in('id', validIds.slice(0, 500));
      const { data: prevPrices } = await db.from('staging_offers').select('price_cents')
        .eq('batch_id', prevBatchId).not('price_cents', 'is', null).limit(500);

      const avg = (arr: Array<{ price_cents: number }>) =>
        arr.reduce((s, r) => s + r.price_cents, 0) / arr.length;

      if ((curPrices?.length ?? 0) > 10 && (prevPrices?.length ?? 0) > 10) {
        const curAvg  = avg(curPrices as Array<{ price_cents: number }>);
        const prevAvg = avg(prevPrices as Array<{ price_cents: number }>);
        const shift   = Math.abs(curAvg - prevAvg) / prevAvg;
        if (shift > PRICE_SHF) {
          throw new Error(
            `[validate] ANOMALY: avg price shifted ${(shift * 100).toFixed(1)}% ` +
            `(cur €${(curAvg / 100).toFixed(0)} vs prev €${(prevAvg / 100).toFixed(0)}). ` +
            `Threshold: ${PRICE_SHF * 100}%. Aborting publish.`
          );
        }
      }
    }
  }

  return { batchId, validIds, invalid };
}

// CLI
const [sourceId, batchIdStr] = process.argv.slice(2);
if (!sourceId) { console.error('Usage: tsx 04-validate.ts <source_id> [batch_id]'); process.exit(1); }
validate(sourceId, batchIdStr ? parseInt(batchIdStr, 10) : undefined)
  .then(r => console.log(`[validate] done: ${r.validIds.length} valid offers`))
  .catch(e => { console.error(e); process.exit(1); });
