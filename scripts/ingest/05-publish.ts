/**
 * Stage 05 — Publish
 *
 * Atomically swaps validated staging rows into the live offers table
 * for a single source (never touches other sources' data).
 * After publish: updates sources.photo_coverage_pct via DB helper.
 *
 * Usage: tsx 05-publish.ts <source_id> [batch_id]
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { getDb } from './lib/db.js';
import { validate } from './04-validate.js';

const PUBLISH_BATCH = 500;

export async function publish(sourceId: string, batchIdOverride?: number): Promise<void> {
  const db = getDb();

  // Run validation first — throws on anomaly
  const { batchId, validIds } = await validate(sourceId, batchIdOverride);

  if (validIds.length === 0) {
    console.log('[publish] No valid offers to publish — skipping');
    return;
  }

  console.log(`[publish] ${sourceId}: publishing ${validIds.length} offers…`);

  // Delete old offers for this source only
  const { error: delErr } = await db.from('offers').delete().eq('source_id', sourceId);
  if (delErr) throw new Error(`[publish] delete old offers: ${JSON.stringify(delErr)}`);

  // Fetch valid staging rows in chunks
  let published = 0;
  for (let i = 0; i < validIds.length; i += PUBLISH_BATCH) {
    const chunk = validIds.slice(i, i + PUBLISH_BATCH);
    const { data: staging, error: fetchErr } = await db
      .from('staging_offers')
      .select('destination_id, product_type, accommodation_name, price_cents, departure_date, transport_type, provider, deeplink, image_url')
      .in('id', chunk);

    if (fetchErr) throw new Error(`[publish] fetch staging: ${JSON.stringify(fetchErr)}`);

    const rows = (staging ?? []).map((s: Record<string, unknown>) => ({
      source_id:          sourceId,
      destination_id:     s['destination_id'],
      product_type:       s['product_type'],
      accommodation_name: s['accommodation_name'],
      price_cents:        s['price_cents'],
      departure_date:     s['departure_date'] ?? null,
      transport_type:     s['transport_type'] ?? null,
      provider:           s['provider'] ?? null,
      deeplink:           s['deeplink'],
      image_url:          s['image_url'] ?? null,
      last_seen_at:       new Date().toISOString(),
    }));

    const { error: insErr } = await db.from('offers').insert(rows);
    if (insErr) throw new Error(`[publish] insert offers: ${JSON.stringify(insErr)}`);

    published += rows.length;
    process.stdout.write(`\r[publish] ${published}/${validIds.length}…`);
  }

  // Update photo_coverage_pct for this source
  await db.rpc('update_photo_coverage', { p_source_id: sourceId });

  // Stamp last_ingest_at
  await db.from('sources').update({ last_ingest_at: new Date().toISOString() }).eq('id', sourceId);

  console.log(`\n[publish] ${sourceId}: done — ${published} offers live`);
}

// CLI — guard prevents this from running when imported by runner.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [sourceId, batchIdStr] = process.argv.slice(2);
  if (!sourceId) { console.error('Usage: tsx 05-publish.ts <source_id> [batch_id]'); process.exit(1); }
  publish(sourceId, batchIdStr ? parseInt(batchIdStr, 10) : undefined)
    .catch(e => { console.error(e); process.exit(1); });
}
