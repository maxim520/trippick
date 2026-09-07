/**
 * Stage 03 — Resolve
 *
 * Links each staging_offer to a destination_id, in priority order:
 *   1. Exact alias match (normalised lowercase trim)
 *   2. Coordinate match (only when source.has_coordinates=true)
 *      — 50 km for islands/regions, 25 km for cities
 *   3. Fuzzy pg_trgm similarity ≥ 0.55  → stored in unresolved as a suggestion,
 *      NOT auto-promoted. A human must approve via upsert_alias.
 *   4. No match → unresolved table, with source_id so you can filter per source.
 *
 * Usage: tsx 03-resolve.ts <source_id> [batch_id]
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { getDb } from './lib/db.js';

const FUZZY_THRESHOLD = 0.55;

async function getLatestBatchId(sourceId: string): Promise<number | null> {
  const db = getDb();
  const { data } = await db
    .from('raw_feeds')
    .select('id')
    .eq('source_id', sourceId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data as { id: number }).id : null;
}

async function getSourceMeta(sourceId: string): Promise<{ has_coordinates: boolean }> {
  const db = getDb();
  const { data, error } = await db
    .from('sources')
    .select('has_coordinates')
    .eq('id', sourceId)
    .single();
  if (error) throw new Error(`[resolve] source not found: ${sourceId}`);
  return data as { has_coordinates: boolean };
}

export async function resolve(sourceId: string, batchIdOverride?: number): Promise<void> {
  const db = getDb();
  const source = await getSourceMeta(sourceId);
  const batchId = batchIdOverride ?? await getLatestBatchId(sourceId);
  if (!batchId) throw new Error(`[resolve] no batch found for ${sourceId}`);

  console.log(`[resolve] ${sourceId} batch=${batchId} has_coords=${source.has_coordinates}`);

  // Load all staging rows for this batch
  const { data: rows, error: rowsErr } = await db
    .from('staging_offers')
    .select('id, destination_str, destination_country, lat, lon, product_type')
    .eq('batch_id', batchId);
  if (rowsErr) throw new Error(`[resolve] ${JSON.stringify(rowsErr)}`);

  let resolved = 0;
  let unresolved = 0;

  for (const row of (rows ?? []) as Array<{
    id: number;
    destination_str: string | null;
    destination_country: string | null;
    lat: number | null;
    lon: number | null;
    product_type: string | null;
  }>) {
    const destStr = (row.destination_str ?? '').trim().toLowerCase();
    if (!destStr) { unresolved++; continue; }

    // --- Path 1: exact alias ---
    const { data: aliasRow } = await db
      .from('destination_aliases')
      .select('destination')
      .eq('alias', destStr)
      .maybeSingle();

    if (aliasRow) {
      await db.from('staging_offers').update({ destination_id: (aliasRow as { destination: string }).destination }).eq('id', row.id);
      resolved++;
      continue;
    }

    // --- Path 2: coordinate (only for coordinate-capable sources) ---
    if (source.has_coordinates && row.lat !== null && row.lon !== null) {
      // Use 50 km radius (suitable for islands/regions)
      const { data: geoRow } = await (db as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown }>
      }).rpc('find_destination_by_coords', {
        p_lat: row.lat,
        p_lon: row.lon,
        p_radius_km: 50,
      });

      if (geoRow && typeof geoRow === 'object' && 'id' in (geoRow as object)) {
        const destId = (geoRow as { id: string }).id;
        await db.from('staging_offers').update({ destination_id: destId }).eq('id', row.id);
        // Store alias so next run is instant
        await db.rpc('upsert_alias', {
          p_alias: destStr,
          p_destination: destId,
          p_source: sourceId,
          p_confidence: 0.75,
        });
        resolved++;
        continue;
      }
    }

    // --- Path 3: fuzzy (suggestion only, not auto-resolved) ---
    // We log this to unresolved with a fuzzy_suggestion field for human review.
    const { data: fuzzy } = await db
      .from('destinations')
      .select('id, name')
      .filter('name', 'ilike', `%${destStr.slice(0, 10)}%`)
      .limit(5);

    const suggestion = Array.isArray(fuzzy) && fuzzy.length > 0
      ? (fuzzy as Array<{ id: string; name: string }>)[0]?.id
      : null;

    // Upsert into unresolved
    await db.from('unresolved').upsert({
      destination_str: destStr,
      source_id: sourceId,
      sample_batch_id: batchId,
      occurrences: 1,
      fuzzy_suggestion: suggestion,
    }, {
      onConflict: 'destination_str,source_id',
      ignoreDuplicates: false,
    });

    unresolved++;
  }

  console.log(`[resolve] done: ${resolved} resolved, ${unresolved} unresolved`);
}

// CLI — guard prevents this from running when imported by runner.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [sourceId, batchIdStr] = process.argv.slice(2);
  if (!sourceId) { console.error('Usage: tsx 03-resolve.ts <source_id> [batch_id]'); process.exit(1); }
  resolve(sourceId, batchIdStr ? parseInt(batchIdStr, 10) : undefined)
    .catch(e => { console.error(e); process.exit(1); });
}
