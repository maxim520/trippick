/**
 * Retroactieve afbeeldingsvalidatie over de bestaande offers-catalogus.
 *
 * Twee passes per bron:
 *   1. HTTP → HTTPS: UPDATE offers SET image_url = 'https://...'
 *      WHERE image_url LIKE 'http://%'  (geen netwerkcall nodig)
 *   2. Hotlink-check: HEAD-request per unieke image_url;
 *      falende URLs worden op NULL gezet zodat de sfeerbeeld-fallback
 *      (destinations.photo_url) automatisch overneemt
 *
 * Na beide passes: update_photo_coverage() opnieuw berekenen.
 * Rapport per bron: hoeveel HTTPS-fixes, hoeveel geblokkeerd,
 * fotodekking voor en na.
 *
 * Usage:
 *   tsx _fix-image-urls.ts               # alle bronnen
 *   tsx _fix-image-urls.ts tradetracker-bungalownet  # één bron
 */
import 'dotenv/config';
import { getDb } from './lib/db.js';
import { checkImageUrls } from './lib/check-image-url.js';

const CHUNK = 500;

const ALL_SOURCES = [
  'daisycon-prijsvrij',
  'daisycon-dutchflyguys',
  'tradetracker-bungalownet',
  'daisycon-solmar',
  'tradetracker-corendon',
];

async function fixSource(sourceId: string): Promise<void> {
  const db = getDb();
  console.log(`\n===== ${sourceId} =====`);

  // ── Nulmeting ────────────────────────────────────────────────────────────
  const { count: total } = await db
    .from('offers').select('*', { count: 'exact', head: true })
    .eq('source_id', sourceId);
  const { count: withImgBefore } = await db
    .from('offers').select('*', { count: 'exact', head: true })
    .eq('source_id', sourceId).not('image_url', 'is', null);

  const pctBefore = total
    ? ((withImgBefore ?? 0) / total * 100).toFixed(1)
    : 'n/a';
  console.log(`  Totaal offers: ${total ?? 0} | Met afbeelding vóór: ${withImgBefore ?? 0} (${pctBefore}%)`);

  // ── Pass 1: HTTP → HTTPS ─────────────────────────────────────────────────
  const httpRows: Array<{ id: number; image_url: string }> = [];
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await db
      .from('offers')
      .select('id, image_url')
      .eq('source_id', sourceId)
      .like('image_url', 'http://%')
      .range(offset, offset + CHUNK - 1);
    if (error) throw new Error(`[fix-images:${sourceId}] fetch http rows: ${JSON.stringify(error)}`);
    if (!data || data.length === 0) break;
    httpRows.push(...(data as typeof httpRows));
    if (data.length < CHUNK) break;
  }

  let httpFixed = 0;
  if (httpRows.length > 0) {
    // Groepeer per https-url zodat updates gebatcht kunnen worden
    const byHttpsUrl = new Map<string, number[]>();
    for (const { id, image_url } of httpRows) {
      const httpsUrl = 'https://' + image_url.slice(7);
      const ids = byHttpsUrl.get(httpsUrl) ?? [];
      ids.push(id);
      byHttpsUrl.set(httpsUrl, ids);
    }
    for (const [httpsUrl, ids] of byHttpsUrl) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { error } = await db
          .from('offers')
          .update({ image_url: httpsUrl })
          .in('id', ids.slice(i, i + CHUNK));
        if (error) throw new Error(`[fix-images:${sourceId}] http→https: ${JSON.stringify(error)}`);
      }
      httpFixed += ids.length;
    }
  }
  console.log(`  Pass 1 (HTTP→HTTPS): ${httpFixed} rows bijgewerkt`);

  // ── Pass 2: HEAD-check alle image_urls ───────────────────────────────────
  const allRows: Array<{ id: number; image_url: string }> = [];
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await db
      .from('offers')
      .select('id, image_url')
      .eq('source_id', sourceId)
      .not('image_url', 'is', null)
      .range(offset, offset + CHUNK - 1);
    if (error) throw new Error(`[fix-images:${sourceId}] fetch all urls: ${JSON.stringify(error)}`);
    if (!data || data.length === 0) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < CHUNK) break;
  }

  const urlToIds = new Map<string, number[]>();
  for (const { id, image_url } of allRows) {
    const ids = urlToIds.get(image_url) ?? [];
    ids.push(id);
    urlToIds.set(image_url, ids);
  }

  const uniqueUrls = [...urlToIds.keys()];
  if (uniqueUrls.length === 0) {
    console.log('  Pass 2 (HEAD-check): geen afbeeldingen om te checken');
  } else {
    console.log(`  Pass 2 (HEAD-check): ${uniqueUrls.length} unieke URLs…`);
    let checkedSoFar = 0;
    const results = await checkImageUrls(uniqueUrls, db, {
      onProgress: (done, total) => {
        checkedSoFar = done;
        process.stdout.write(`\r  ${done}/${total} gecheckt…`);
      },
    });
    if (checkedSoFar > 0) process.stdout.write('\n');

    const toNull: number[] = [];
    let okUrls = 0, failUrls = 0, cachedUrls = 0;

    for (const [url, ok] of results) {
      if (!uniqueUrls.includes(url)) { cachedUrls++; continue; }
      if (ok) { okUrls++; } else { failUrls++; toNull.push(...(urlToIds.get(url) ?? [])); }
    }

    if (toNull.length > 0) {
      for (let i = 0; i < toNull.length; i += CHUNK) {
        const { error } = await db
          .from('offers')
          .update({ image_url: null })
          .in('id', toNull.slice(i, i + CHUNK));
        if (error) throw new Error(`[fix-images:${sourceId}] null update: ${JSON.stringify(error)}`);
      }
    }

    console.log(
      `  Pass 2 (HEAD-check): ${okUrls} ok, ${failUrls} geblokkeerd` +
      ` → ${toNull.length} rows genulld` +
      (cachedUrls ? ` (${cachedUrls} uit cache)` : ''),
    );
  }

  // ── update_photo_coverage ────────────────────────────────────────────────
  await db.rpc('update_photo_coverage', { p_source_id: sourceId });

  // ── Eindmeting ───────────────────────────────────────────────────────────
  const { count: withImgAfter } = await db
    .from('offers').select('*', { count: 'exact', head: true })
    .eq('source_id', sourceId).not('image_url', 'is', null);

  const pctAfter = total
    ? ((withImgAfter ?? 0) / total * 100).toFixed(1)
    : 'n/a';
  console.log(
    `  Fotodekking: ${pctBefore}% → ${pctAfter}%` +
    ` (${withImgAfter ?? 0}/${total ?? 0} offers met afbeelding)`,
  );
}

(async () => {
  const targetSource = process.argv[2];
  const sources = targetSource ? [targetSource] : ALL_SOURCES;
  for (const src of sources) {
    await fixSource(src);
  }
  console.log('\n[fix-image-urls] Klaar.');
})().catch(e => { console.error(e); process.exit(1); });
