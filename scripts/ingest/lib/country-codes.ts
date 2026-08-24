import { getDb } from './db.js';

let cache: Map<string, string> | null = null;
const unknownLog = new Set<string>();

async function loadCache(): Promise<Map<string, string>> {
  if (cache) return cache;
  const db = getDb();
  const { data, error } = await db.from('country_code_map').select('raw_value, iso2');
  if (error) throw new Error(`[country-codes] Failed to load: ${JSON.stringify(error)}`);
  cache = new Map((data ?? []).map((r: { raw_value: string; iso2: string }) => [
    r.raw_value.trim().toLowerCase(),
    r.iso2.toUpperCase(),
  ]));
  return cache;
}

/**
 * Normalise a raw country value to ISO-2.
 * Returns null if unknown (and logs it so you can extend country_code_map).
 */
export async function toISO2(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  const map = await loadCache();
  const key = raw.trim().toLowerCase();
  const iso2 = map.get(key) ?? null;
  if (!iso2 && !unknownLog.has(key)) {
    unknownLog.add(key);
    console.warn(`[country-codes] Unknown value "${raw}" — add to country_code_map`);
  }
  return iso2;
}

/** Flush the unknown values to stdout at end of run for easy copy-paste into migration */
export function reportUnknownCountries(): void {
  if (unknownLog.size === 0) return;
  console.warn('\n[country-codes] Unknown country values encountered this run:');
  for (const v of unknownLog) {
    console.warn(`  ('${v}', '??'),   -- TODO: map to ISO-2`);
  }
}
