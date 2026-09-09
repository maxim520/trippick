/**
 * Gedeelde image-URL checker voor de ingest-pipeline.
 *
 * - HEAD-request per URL met configureerbare timeout (standaard 3 s)
 * - Fallback naar GET bij HTTP 405 (server ondersteunt geen HEAD)
 * - In-run in-memory dedup: dezelfde URL wordt per procesrun slechts
 *   één keer gecheckt, ook als hij in meerdere aanbiedingen voorkomt
 * - Cross-run persistentie: resultaten worden opgeslagen in de
 *   image_url_cache tabel en bij de volgende run opgehaald
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_TIMEOUT_MS  = 3_000;
const DEFAULT_CONCURRENCY = 10;
const DB_CHUNK            = 200; // max URLs per .in()-query (URL-lengte-limiet PostgREST)

interface CacheRow { url: string; ok: boolean; }

const USER_AGENT = 'Mozilla/5.0 (compatible; TripPick-imagecheck/1.0)';

async function headCheck(url: string, timeoutMs: number): Promise<boolean> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
    });
    if (resp.status === 405) {
      // Server ondersteunt geen HEAD — korte GET met vroeg afbreken
      clearTimeout(timer);
      const ctrl2  = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), timeoutMs);
      try {
        const resp2 = await fetch(url, {
          method: 'GET',
          signal: ctrl2.signal,
          redirect: 'follow',
          headers: { 'User-Agent': USER_AGENT },
        });
        clearTimeout(timer2);
        ctrl2.abort(); // sluit verbinding
        return resp2.ok;
      } catch { return false; } finally { clearTimeout(timer2); }
    }
    return resp.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}

async function loadCacheFromDb(
  db: SupabaseClient,
  urls: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  for (let i = 0; i < urls.length; i += DB_CHUNK) {
    const { data } = await db
      .from('image_url_cache')
      .select('url, ok')
      .in('url', urls.slice(i, i + DB_CHUNK));
    for (const row of (data ?? []) as CacheRow[]) result.set(row.url, row.ok);
  }
  return result;
}

async function saveCacheToDb(
  db: SupabaseClient,
  entries: CacheRow[],
): Promise<void> {
  const ts   = new Date().toISOString();
  const rows = entries.map(e => ({ ...e, checked_at: ts }));
  for (let i = 0; i < rows.length; i += DB_CHUNK) {
    await db
      .from('image_url_cache')
      .upsert(rows.slice(i, i + DB_CHUNK), { onConflict: 'url' });
  }
}

/**
 * Controleer een lijst van image-URLs.
 *
 * Geeft een Map<url, ok> terug voor elke unieke input-URL.
 * URLs die al in image_url_cache staan worden niet opnieuw gecheckt.
 * Nieuwe resultaten worden naar de DB weggeschreven voor toekomstige runs.
 */
export async function checkImageUrls(
  urls: string[],
  db: SupabaseClient,
  opts: {
    timeoutMs?:   number;
    concurrency?: number;
    onProgress?:  (done: number, total: number) => void;
  } = {},
): Promise<Map<string, boolean>> {
  const {
    timeoutMs   = DEFAULT_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
  } = opts;

  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const cached  = await loadCacheFromDb(db, unique);
  const toCheck = unique.filter(u => !cached.has(u));

  const fresh = new Map<string, boolean>();
  let done = 0;

  for (let i = 0; i < toCheck.length; i += concurrency) {
    const batch   = toCheck.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(url => headCheck(url, timeoutMs).then(ok => ({ url, ok }))),
    );
    for (const { url, ok } of results) fresh.set(url, ok);
    done += batch.length;
    onProgress?.(done, toCheck.length);
  }

  if (fresh.size > 0) {
    await saveCacheToDb(db, [...fresh.entries()].map(([url, ok]) => ({ url, ok })));
  }

  return new Map([...cached, ...fresh]);
}
