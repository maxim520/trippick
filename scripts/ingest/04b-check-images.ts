/**
 * Stage 04b — Check Images
 *
 * Voor elke staging_offer in dit batch met een niet-null image_url:
 * 1. HEAD-check de URL (3 s timeout, beperkte concurrency)
 * 2. Gebruik image_url_cache voor cross-run dedup (alleen nieuwe URLs)
 * 3. Zet image_url = NULL voor URLs die falen — de publish-stap valt
 *    daarna automatisch terug op destinations.photo_url via de bestaande
 *    coalesce-logica in match_offers()
 *
 * Draait ná resolve (destination_id gevuld) en vóór publish.
 *
 * Usage: tsx 04b-check-images.ts <source_id> [batch_id]
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { getDb } from './lib/db.js';
import { checkImageUrls } from './lib/check-image-url.js';

const PAGE_SIZE  = 1_000;
const NULL_CHUNK = 500;

async function getLatestBatchId(sourceId: string): Promise<number | null> {
  const db = getDb();
  const { data } = await db
    .from('raw_feeds').select('id').eq('source_id', sourceId)
    .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
  return data ? (data as { id: number }).id : null;
}

export async function checkImages(sourceId: string, batchIdOverride?: number): Promise<void> {
  const db = getDb();
  const batchId = batchIdOverride ?? await getLatestBatchId(sourceId);
  if (!batchId) { console.log(`[check-images] geen batch gevonden voor ${sourceId}`); return; }
  console.log(`[check-images] ${sourceId} batch=${batchId}`);

  // 1. Haal alle (id, image_url) op uit dit batch — gepagineerd
  const stagingRows: Array<{ id: number; image_url: string }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from('staging_offers')
      .select('id, image_url')
      .eq('batch_id', batchId)
      .not('image_url', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`[check-images] fetch: ${JSON.stringify(error)}`);
    if (!data || data.length === 0) break;
    stagingRows.push(...(data as typeof stagingRows));
    if (data.length < PAGE_SIZE) break;
  }

  if (stagingRows.length === 0) {
    console.log('[check-images] geen image-URLs in dit batch — stap overgeslagen');
    return;
  }

  // 2. Bouw url → [staging_offer_id, …] index
  const urlToIds = new Map<string, number[]>();
  for (const { id, image_url } of stagingRows) {
    const ids = urlToIds.get(image_url) ?? [];
    ids.push(id);
    urlToIds.set(image_url, ids);
  }

  const uniqueUrls = [...urlToIds.keys()];
  console.log(`[check-images] ${stagingRows.length} rows, ${uniqueUrls.length} unieke URLs`);

  // 3. Check (cache + HEAD)
  let checkedSoFar = 0;
  const results = await checkImageUrls(uniqueUrls, db, {
    onProgress: (done, total) => {
      checkedSoFar = done;
      process.stdout.write(`\r[check-images] ${done}/${total} gecheckt…`);
    },
  });
  if (checkedSoFar > 0) process.stdout.write('\n');

  // 4. Verzamel IDs om te nullen
  const toNull: number[] = [];
  let okCount = 0;
  let failCount = 0;

  for (const [url, ok] of results) {
    if (ok) {
      okCount++;
    } else {
      failCount++;
      toNull.push(...(urlToIds.get(url) ?? []));
    }
  }

  // 5. Zet image_url = NULL voor falende URLs (in chunks)
  if (toNull.length > 0) {
    for (let i = 0; i < toNull.length; i += NULL_CHUNK) {
      const { error } = await db
        .from('staging_offers')
        .update({ image_url: null })
        .in('id', toNull.slice(i, i + NULL_CHUNK));
      if (error) throw new Error(`[check-images] null update: ${JSON.stringify(error)}`);
    }
  }

  const fromCache = results.size - uniqueUrls.filter(u => results.has(u) && !urlToIds.has(u)).length;
  console.log(
    `[check-images] klaar: ${okCount} ok, ${failCount} geblokkeerd` +
    ` (${toNull.length} rows genulld)` +
    (results.size < uniqueUrls.length
      ? `, ${uniqueUrls.length - results.size} niet beantwoord (onveranderd)`
      : ''),
  );
  void fromCache; // suppress unused warning; intern afgehandeld door checkImageUrls
}

// CLI — guard voorkomt uitvoering bij import door runner.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [sourceId, batchIdStr] = process.argv.slice(2);
  if (!sourceId) {
    console.error('Usage: tsx 04b-check-images.ts <source_id> [batch_id]');
    process.exit(1);
  }
  const batchId = batchIdStr
    ? parseInt(batchIdStr, 10)
    : await getLatestBatchId(sourceId);
  if (!batchId) throw new Error(`Geen batch gevonden voor ${sourceId}`);
  checkImages(sourceId, batchId).catch(e => { console.error(e); process.exit(1); });
}
