/**
 * Stage 01 — Fetch
 *
 * Downloads a feed for the given source_id, hashes it,
 * compares with the previous hash. If identical: exits early.
 * If new: saves to .feed-cache/ and writes a row to raw_feeds.
 *
 * Usage: tsx 01-fetch.ts <source_id>
 */
import 'dotenv/config';
import { getDb } from './lib/db.js';
import { sha256, saveFeedFile } from './lib/utils.js';

const SOURCE_URL_ENV: Record<string, string> = {
  'daisycon-prijsvrij':       'FEED_URL_DAISYCON_PRIJSVRIJ',
  'daisycon-dutchflyguys':    'FEED_URL_DAISYCON_DUTCHFLYGUYS',
  'tradetracker-bungalownet': 'FEED_URL_TRADETRACKER_BUNGALOWNET',
  'daisycon-solmar':          'FEED_URL_DAISYCON_SOLMAR',
};

export async function fetch(sourceId: string): Promise<number | null> {
  const db = getDb();

  const envKey = SOURCE_URL_ENV[sourceId];
  if (!envKey) throw new Error(`Unknown source_id: ${sourceId}`);

  const feedUrl = process.env[envKey];
  if (!feedUrl) throw new Error(`${envKey} is not set in environment`);

  console.log(`[fetch] ${sourceId} → ${feedUrl}`);

  // Download
  const res = await globalThis.fetch(feedUrl);
  if (!res.ok) throw new Error(`[fetch] HTTP ${res.status} from ${feedUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256(buf);

  // Compare with last hash for this source
  const { data: lastRun } = await db
    .from('raw_feeds')
    .select('file_hash')
    .eq('source_id', sourceId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRun?.file_hash === hash) {
    console.log(`[fetch] ${sourceId}: no change (hash identical), skipping`);
    return null;
  }

  // Save to disk
  const rawPath = saveFeedFile(sourceId, buf);
  console.log(`[fetch] ${sourceId}: saved ${buf.length} bytes → ${rawPath}`);

  // Record in DB
  const { data: row, error } = await db
    .from('raw_feeds')
    .insert({ source_id: sourceId, file_hash: hash, raw_path: rawPath })
    .select('id')
    .single();

  if (error) throw new Error(`[fetch] DB insert failed: ${JSON.stringify(error)}`);
  console.log(`[fetch] ${sourceId}: batch_id = ${row.id}`);
  return row.id as number;
}

// CLI entrypoint
const sourceId = process.argv[2];
if (!sourceId) { console.error('Usage: tsx 01-fetch.ts <source_id>'); process.exit(1); }
fetch(sourceId)
  .then(id => { if (id === null) process.exit(0); console.log(`[fetch] done, batch_id=${id}`); })
  .catch(e => { console.error(e); process.exit(1); });
