/**
 * fix-destination-drafts.ts — eenmalige correctieronde op destinations_draft
 * vóór promote-destination-drafts.ts wordt gedraaid.
 *
 * Stap 1: Porto-split (3 afzonderlijke Mallorca/Madeira plaatsen)
 * Stap 2: Blokkeer niet-bestemmingen (productcategorieën)
 * Stap 3: Egyptische Rode Zee + Curaçao/Aruba seizoen/motief
 * Stap 4: Istanbul-wijken + Sevilla + Thessaloniki motief/seizoen
 * Stap 5: UNKNOWN-landen invullen (Gambia)
 * Stap 5b: Query Santa Maria uit staging_offers
 * Stap 6: Bulk approve alle resterende rijen
 *
 * Veilig om meerdere keren te draaien (alles is idempotent).
 */
import 'dotenv/config';
import { getDb } from './lib/db.js';

const db = getDb();

async function update(
  destinationStr: string,
  fields: Record<string, unknown>,
  label?: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('destinations_draft')
    .update(fields)
    .eq('destination_str', destinationStr)
    .select('destination_str');
  if (error) throw new Error(`update "${destinationStr}": ${JSON.stringify(error)}`);
  const hit = (data?.length ?? 0) > 0;
  if (!hit) console.warn(`  [warn] rij niet gevonden: "${destinationStr}"${label ? ` (${label})` : ''}`);
  return hit;
}

async function main() {
  // ── Huidige staat opvragen ───────────────────────────────────────────────
  const { data: all } = await db.from('destinations_draft').select('destination_str, suggested_id, suggested_country, approved');
  const existing = new Set((all ?? []).map((r: { destination_str: string }) => r.destination_str));
  console.log(`destinations_draft heeft ${existing.size} rijen.\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAP 1 — Porto-split
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── Stap 1: Porto-split ──');
  let stap1 = 0;

  stap1 += await update('Porto Colom', {
    suggested_id:        'porto-colom',
    suggested_name:      'Porto Colom',
    suggested_country:   'ES',
    suggested_months:    ['Apr','May','Jun','Jul','Aug','Sep','Oct'],
    suggested_audiences: ['couple','family','friends'],
    suggested_motives:   ['beach'],
    suggested_friction:  null,
  }) ? 1 : 0;

  stap1 += await update('Portopetro', {
    suggested_id:        'portopetro',
    suggested_name:      'Portopetro',
    suggested_country:   'ES',
    suggested_months:    ['Apr','May','Jun','Jul','Aug','Sep','Oct'],
    suggested_audiences: ['couple','family','friends'],
    suggested_motives:   ['beach'],
    suggested_friction:  null,
  }) ? 1 : 0;

  stap1 += await update('Porto Moniz', {
    suggested_id:        'porto-moniz',
    suggested_name:      'Porto Moniz',
    suggested_country:   'PT',
    suggested_months:    ['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct'],
    suggested_audiences: ['couple','solo','seniors'],
    suggested_motives:   ['nature','active'],
    suggested_friction:  null,
  }) ? 1 : 0;

  console.log(`  ${stap1} rijen bijgewerkt.\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAP 2 — Blokkeer productcategorieën
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── Stap 2: Blokkeer niet-bestemmingen ──');
  const nonDestinations = [
    'Cruisereizen',
    'Rondreizen',
    'Rondreizen Madeira',
    'Rondreizen Turkije',
    'Nijlcruise',
    'Bingoreizen Egypte',
    'Excursiereizen Lefkas',
    'Excursiereizen Lesbos',
    'Excursiereizen Parga',
    'Excursiereizen Samos',
  ];
  let stap2 = 0;
  for (const str of nonDestinations) {
    const hit = await update(str, {
      approved: false,
      notes:    'Geen bestemming, productcategorie — niet promoten.',
    });
    if (hit) stap2++;
  }
  console.log(`  ${stap2}/${nonDestinations.length} rijen geblokkeerd.\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAP 3 — Egyptische Rode Zee + Curaçao/Aruba
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── Stap 3: Seizoen/motief correcties ──');
  const egyptMonths = ['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'];
  const egyptFriction = 'Check reisadvies MBZ voor Egypte.';

  const egyptPlaces = [
    'El Gouna','Makadi Bay','Nabq Bay','Sharks Bay','Soma Bay',
    'Marsa Alam','El Quseir','Ras Um El Sid','Sahl Hasheesh',
  ];
  let stap3egypt = 0;
  for (const str of egyptPlaces) {
    const hit = await update(str, {
      suggested_months:  egyptMonths,
      suggested_motives: ['beach','active'],
      suggested_friction: egyptFriction,
    });
    if (hit) stap3egypt++;
  }
  console.log(`  Egypte Rode Zee: ${stap3egypt}/${egyptPlaces.length} bijgewerkt.`);

  // Curaçao specifiek: Willemstad culture toevoegen
  const curacaoAllYear = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  await update('Willemstad', {
    suggested_months:  curacaoAllYear,
    suggested_motives: ['beach','culture','city'],
  });

  // Overige Curaçao-plaatsen
  const curacaoPlaces = ['Jan Thiel Baai','Mambo Beach','Piscadera Baai','Sint Willibrordus'];
  let stap3curacao = 0;
  for (const str of curacaoPlaces) {
    const hit = await update(str, {
      suggested_months:  curacaoAllYear,
      suggested_motives: ['beach','nature'],
    });
    if (hit) stap3curacao++;
  }

  // Aruba
  await update('Oranjestad', {
    suggested_months:  curacaoAllYear,
    suggested_motives: ['beach','city','culture'],
  });

  console.log(`  Curaçao/Aruba: Willemstad + ${stap3curacao} plaatsen + Oranjestad bijgewerkt.\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAP 4 — Istanbul + Sevilla + Thessaloniki
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── Stap 4: Istanbul-wijken + cultuursteden ──');
  const istanbulMonths = ['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'];
  const istanbulDistricts = [
    'Sultanahmet','Taksim','Sisli','Beyoglu','Sirkeci','Kumkapi',
    'Kalamis','Kalamis-Fenerbahçe',
  ];
  let stap4istanbul = 0;
  for (const str of istanbulDistricts) {
    // Alle wijken samenvoegen naar één destination_id 'istanbul'
    const hit = await update(str, {
      suggested_id:        'istanbul',
      suggested_name:      'Istanbul',
      suggested_country:   'TR',
      suggested_months:    istanbulMonths,
      suggested_motives:   ['culture','city'],
      suggested_friction:  'Check reisadvies MBZ voor Turkije.',
    });
    if (hit) stap4istanbul++;
  }
  console.log(`  Istanbul: ${stap4istanbul}/${istanbulDistricts.length} wijken samengevoegd naar id 'istanbul'.`);

  let stap4overig = 0;
  for (const str of ['Sevilla','Thessaloniki']) {
    const hit = await update(str, {
      suggested_motives: ['culture','city'],
      suggested_months:  ['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct'],
    });
    if (hit) stap4overig++;
  }
  console.log(`  Sevilla + Thessaloniki: ${stap4overig}/2 bijgewerkt.\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAP 5 — UNKNOWN-landen invullen (Gambia)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── Stap 5: UNKNOWN-landen ──');
  const gambiaPlaces: Record<string, string[]> = {
    'Bijilo':       ['Jan','Feb','Mar','Apr','Oct','Nov','Dec'],
    'Kololi':       ['Jan','Feb','Mar','Apr','Oct','Nov','Dec'],
    'Kotu':         ['Jan','Feb','Mar','Apr','Oct','Nov','Dec'],
    'Cape Point':   ['Jan','Feb','Mar','Apr','Oct','Nov','Dec'],
  };
  let stap5 = 0;
  for (const [str, months] of Object.entries(gambiaPlaces)) {
    const hit = await update(str, {
      suggested_country:   'GM',
      suggested_months:    months,
      suggested_motives:   ['beach','nature'],
      suggested_audiences: ['couple','friends','solo'],
      suggested_friction:  'Vaccinaties aanbevolen. Check reisadvies MBZ.',
    });
    if (hit) stap5++;
  }
  console.log(`  Gambia: ${stap5}/4 rijen bijgewerkt.\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAP 5b — Santa Maria: query staging_offers
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── Stap 5b: Santa Maria — context uit staging_offers ──');
  const { data: santaRows } = await db
    .from('staging_offers')
    .select('provider, price_cents, departure_date, destination_country_raw, destination_country, departure_airport, accommodation_name, raw')
    .eq('destination_str', 'Santa Maria')
    .order('price_cents', { ascending: true });

  if (santaRows && santaRows.length > 0) {
    type SantaRow = {
      provider: string | null;
      price_cents: number | null;
      departure_date: string | null;
      destination_country_raw: string | null;
      destination_country: string | null;
      departure_airport: string | null;
      accommodation_name: string | null;
      raw: Record<string, unknown> | null;
    };
    const rows = santaRows as SantaRow[];

    // Haal ontbrekende velden uit raw JSONB als de kolommen null zijn
    const getRaw = (r: SantaRow, key: string): string | null =>
      r.raw ? String(r.raw[key] ?? '') || null : null;

    const countryRaws  = [...new Set(rows.map(r => r.destination_country_raw || getRaw(r, 'country')).filter(Boolean))];
    const countries    = [...new Set(rows.map(r => r.destination_country).filter(Boolean))];
    const providers    = [...new Set(rows.map(r => r.provider || getRaw(r, 'brand') || getRaw(r, 'provider')).filter(Boolean))];
    const airports     = [...new Set(rows.map(r => r.departure_airport || getRaw(r, 'iataDeparture')).filter(Boolean))];
    const prices       = rows.map(r => r.price_cents ?? (r.raw ? parseFloat(String(r.raw['price'] ?? '0')) * 100 : 0)).filter(p => p > 0);
    const avgPrice     = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length / 100) : null;
    const accomNames   = [...new Set(rows.map(r => r.accommodation_name || getRaw(r, 'name')).filter(Boolean))].slice(0, 5);
    const rawCountry   = countryRaws[0] ?? 'onbekend';

    console.log(`  ${rows.length} records gevonden voor 'Santa Maria'`);
    console.log(`  land (raw feed-waarde):   "${rawCountry}"`);
    console.log(`  destination_country ISO:  ${countries.join(', ') || 'NULL (landcode niet gemapped vóór parse)'}`);
    console.log(`  providers:                ${providers.join(', ') || 'n.v.t.'}`);
    console.log(`  vertrekluchthavens:       ${airports.join(', ') || 'n.v.t.'}`);
    console.log(`  gemiddelde prijs:         €${avgPrice ?? 'onbekend'}`);
    console.log(`  accommodaties (max 5):    ${accomNames.join(' | ') || 'n.v.t.'}`);
    console.log(`  Santa Maria blijft op approved=false (wacht op uw beslissing).\n`);
  } else {
    console.log(`  Geen records gevonden voor 'Santa Maria' in staging_offers.\n`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STAP 6 — Bulk approve alle overige rijen
  // Niet-goedgekeurde rijen ophalen en filteren, dan per chunk updaten.
  // Vermijdt PostgREST NULL-vergelijkingsproblemen bij .not().not() ketens.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── Stap 6: Bulk approve ──');
  const doNotApprove = new Set([...nonDestinations, 'Santa Maria']);

  const { data: pendingRows, error: pendingErr } = await db
    .from('destinations_draft')
    .select('destination_str')
    .eq('approved', false);
  if (pendingErr) throw new Error(`Fetch pending: ${JSON.stringify(pendingErr)}`);

  const toApprove = (pendingRows ?? [])
    .map((r: { destination_str: string }) => r.destination_str)
    .filter(s => !doNotApprove.has(s));

  const CHUNK = 50;
  let approved6 = 0;
  for (let i = 0; i < toApprove.length; i += CHUNK) {
    const chunk = toApprove.slice(i, i + CHUNK);
    const { error: chunkErr } = await db
      .from('destinations_draft')
      .update({ approved: true })
      .in('destination_str', chunk);
    if (chunkErr) throw new Error(`Approve chunk ${i}: ${JSON.stringify(chunkErr)}`);
    approved6 += chunk.length;
  }
  console.log(`  ${approved6} rijen goedgekeurd.\n`);

  // ─── Eindsamenvatting ───────────────────────────────────────────────────
  const { data: finalState } = await db
    .from('destinations_draft')
    .select('approved, notes')
    .then(res => res);

  const totaal     = (finalState ?? []).length;
  const approved   = (finalState ?? []).filter((r: { approved: boolean }) => r.approved).length;
  const blocked    = (finalState ?? []).filter((r: { notes: string | null }) => r.notes?.includes('productcategorie')).length;
  const openstaand = totaal - approved - blocked;

  console.log('══ EINDSAMENVATTING ══════════════════════════════');
  console.log(`  Totaal rijen:         ${totaal}`);
  console.log(`  Goedgekeurd:          ${approved}`);
  console.log(`  Geblokkeerd:          ${blocked}`);
  console.log(`  Open (wacht review):  ${openstaand}`);
  console.log('══════════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
