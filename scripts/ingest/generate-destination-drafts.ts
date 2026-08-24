/**
 * generate-destination-drafts.ts
 *
 * Usage (after ingest:fetch + ingest:parse for at least one source):
 *   tsx generate-destination-drafts.ts [batch_id] [--top=300]
 *
 * What it does:
 *   1. Queries staging_offers for the top-N destination_str values by frequency
 *   2. Cross-references a built-in knowledge table for destinations we already know
 *   3. Inserts proposals into destinations_draft (upsert — safe to re-run)
 *   4. Writes a human-readable CSV to ./destination-proposals.csv for operator review
 *
 * After the operator reviews destinations_draft in Supabase and sets approved=true,
 * run promote-destination-drafts.ts to push approved rows into destinations.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { getDb } from './lib/db.js';

const TOP_N = parseInt(process.argv.find(a => a.startsWith('--top='))?.slice(6) ?? '300', 10);
const BATCH_ARG = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : null;

// ---------------------------------------------------------------------------
// Built-in knowledge table
// Key: lowercase, unaccented destination name fragment (matched via includes())
// ---------------------------------------------------------------------------
interface DestKnowledge {
  id:        string;
  name:      string;
  country:   string;       // ISO-2
  months:    string[];     // 3-char: 'Jan','Feb',…
  audiences: string[];
  motives:   string[];
  friction:  string | null;
  photo_url: string | null;
}

const KNOWN: DestKnowledge[] = [
  { id:'mallorca',    name:'Mallorca',      country:'ES', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'], audiences:['couple','family','friends'], motives:['beach','city'],            friction:null,                                          photo_url:null },
  { id:'tenerife',   name:'Tenerife',      country:'ES', months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], audiences:['couple','family','seniors'], motives:['beach','nature'],          friction:null,                                          photo_url:null },
  { id:'lanzarote',  name:'Lanzarote',     country:'ES', months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], audiences:['couple','friends','seniors'], motives:['beach','nature','active'], friction:null,                                          photo_url:null },
  { id:'ibiza',      name:'Ibiza',         country:'ES', months:['May','Jun','Jul','Aug','Sep'],                 audiences:['couple','friends'],         motives:['beach','city'],            friction:'Druk en luidruchtig in de zomer.',             photo_url:null },
  { id:'fuerteventura', name:'Fuerteventura', country:'ES', months:['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'], audiences:['couple','family','friends'], motives:['beach','active'],       friction:null,                                          photo_url:null },
  { id:'gran-canaria', name:'Gran Canaria', country:'ES', months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], audiences:['couple','family','seniors'], motives:['beach','nature'],        friction:null,                                          photo_url:null },
  { id:'kreta',      name:'Kreta',         country:'GR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family','friends'], motives:['beach','culture','nature'], friction:'Erg heet in juli-augustus (35°C+).',           photo_url:null },
  { id:'rhodos',     name:'Rhodos',        country:'GR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family','friends'], motives:['beach','culture'],          friction:null,                                          photo_url:null },
  { id:'zakynthos',  name:'Zakynthos',     country:'GR', months:['May','Jun','Jul','Aug','Sep','Oct'],          audiences:['couple','friends','family'], motives:['beach','nature'],           friction:'Druk door partyjongeren in Laganas.',          photo_url:null },
  { id:'kos',        name:'Kos',           country:'GR', months:['May','Jun','Jul','Aug','Sep','Oct'],          audiences:['couple','family','friends'], motives:['beach','culture'],          friction:null,                                          photo_url:null },
  { id:'corfu',      name:'Corfu',         country:'GR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family'],           motives:['beach','nature'],           friction:null,                                          photo_url:null },
  { id:'mykonos',    name:'Mykonos',       country:'GR', months:['May','Jun','Jul','Aug','Sep'],                audiences:['couple','friends'],          motives:['beach','city'],             friction:'Erg duur. Druk in de hoogseizoen.',            photo_url:null },
  { id:'santorini',  name:'Santorini',     country:'GR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple'],                    motives:['culture','city'],           friction:'Duur. Veel trappen, minder geschikt voor rolstoelgebruikers en kleine kinderen.', photo_url:null },
  { id:'chalkidiki', name:'Chalkidiki',    country:'GR', months:['Jun','Jul','Aug','Sep'],                      audiences:['couple','family'],           motives:['beach','nature'],           friction:null,                                          photo_url:null },
  { id:'antalya',    name:'Antalya',       country:'TR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family'],           motives:['beach','culture'],          friction:'Hitte in zomer. Check reisadvies MBZ.',       photo_url:null },
  { id:'alanya',     name:'Alanya',        country:'TR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family'],           motives:['beach'],                    friction:'Check reisadvies MBZ voor Turkije.',           photo_url:null },
  { id:'bodrum',     name:'Bodrum',        country:'TR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','friends'],          motives:['beach','city'],             friction:'Check reisadvies MBZ voor Turkije.',           photo_url:null },
  { id:'side',       name:'Side',          country:'TR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family'],           motives:['beach','culture'],          friction:'Check reisadvies MBZ voor Turkije.',           photo_url:null },
  { id:'tunesie',    name:'Tunesië',       country:'TN', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family'],           motives:['beach','culture'],          friction:'Check reisadvies MBZ. Culturele kledingregels.', photo_url:null },
  { id:'marrakech',  name:'Marrakech',     country:'MA', months:['Mar','Apr','May','Sep','Oct','Nov'],          audiences:['couple','friends'],          motives:['culture','city'],           friction:'Opdringerige verkopers in de medina.',         photo_url:null },
  { id:'agadir',     name:'Agadir',        country:'MA', months:['Mar','Apr','May','Jun','Sep','Oct','Nov'],    audiences:['couple','family','seniors'], motives:['beach'],                    friction:null,                                          photo_url:null },
  { id:'hurghada',   name:'Hurghada',      country:'EG', months:['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'], audiences:['couple','family'], motives:['beach','active'],          friction:'Check reisadvies MBZ voor Egypte.',           photo_url:null },
  { id:'sharm',      name:'Sharm el-Sheikh', country:'EG', months:['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'], audiences:['couple','family'], motives:['beach','active'],        friction:'Check reisadvies MBZ voor Egypte.',           photo_url:null },
  { id:'dubai',      name:'Dubai',         country:'AE', months:['Oct','Nov','Dec','Jan','Feb','Mar','Apr'],    audiences:['couple','friends','family'], motives:['city','active'],            friction:'Duur. Strikte kledingregels op publieke plekken.', photo_url:null },
  { id:'curacao',    name:'Curaçao',       country:'CW', months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], audiences:['couple','friends','family'], motives:['beach','active','city'], friction:'Lang vliegtraject (~10u).',        photo_url:null },
  { id:'aruba',      name:'Aruba',         country:'AW', months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], audiences:['couple','seniors'],          motives:['beach'],                    friction:'Lang vliegtraject (~10u).',        photo_url:null },
  { id:'bali',       name:'Bali',          country:'ID', months:['Apr','May','Jun','Jul','Aug','Sep'],          audiences:['couple','friends','solo'],   motives:['nature','culture','active'], friction:'Erg lang vliegen (±16u). Droog seizoen mei-sept.', photo_url:null },
  { id:'thailand',   name:'Thailand',      country:'TH', months:['Nov','Dec','Jan','Feb','Mar'],                audiences:['couple','friends','solo'],   motives:['nature','culture','beach'], friction:'Lang vliegen (±12u). Natte moesson apr-okt.',   photo_url:null },
  { id:'costa-del-sol', name:'Costa del Sol', country:'ES', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'], audiences:['couple','family','seniors'], motives:['beach','city'],            friction:null,                                          photo_url:null },
  { id:'algarve',    name:'Algarve',       country:'PT', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family','seniors','friends'], motives:['beach','active','nature'], friction:null,                                  photo_url:null },
  { id:'lissabon',   name:'Lissabon',      country:'PT', months:['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct'], audiences:['couple','friends','solo'], motives:['city','culture'],          friction:'Steil terrein, minder geschikt voor beperkte mobiliteit.', photo_url:null },
  { id:'porto',      name:'Porto',         country:'PT', months:['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct'], audiences:['couple','friends','solo'], motives:['city','culture'],          friction:null,                                          photo_url:null },
  { id:'barcelona',  name:'Barcelona',     country:'ES', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','friends','solo'],   motives:['city','culture','beach'],   friction:'Zakkenrollen in drukke toeristische zones.',  photo_url:null },
  { id:'madrid',     name:'Madrid',        country:'ES', months:['Apr','May','Jun','Sep','Oct'],                audiences:['couple','friends','solo'],   motives:['city','culture'],           friction:null,                                          photo_url:null },
  { id:'rome',       name:'Rome',          country:'IT', months:['Mar','Apr','May','Jun','Sep','Oct'],          audiences:['couple','friends','solo'],   motives:['culture','city'],           friction:'Erg druk in de zomer. Zakkenrollen.',         photo_url:null },
  { id:'florence',   name:'Florence',      country:'IT', months:['Apr','May','Jun','Sep','Oct'],                audiences:['couple','solo'],             motives:['culture','city'],           friction:'Overtoerisme in zomer.',                      photo_url:null },
  { id:'venetie',    name:'Venetië',       country:'IT', months:['Apr','May','Sep','Oct'],                      audiences:['couple','solo'],             motives:['culture','city'],           friction:'Erg duur. Toeristentax. Overtoerisme.',       photo_url:null },
  { id:'sicilie',    name:'Sicilië',       country:'IT', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family'],           motives:['beach','culture'],          friction:null,                                          photo_url:null },
  { id:'sardinie',   name:'Sardinië',      country:'IT', months:['May','Jun','Jul','Aug','Sep','Oct'],          audiences:['couple','family'],           motives:['beach','nature'],           friction:null,                                          photo_url:null },
  { id:'napels',     name:'Napels & Amalfi', country:'IT', months:['Apr','May','Jun','Sep','Oct'],              audiences:['couple','solo'],             motives:['culture','nature'],         friction:'Chaotisch verkeer. Pas op voor zakkenrollen.', photo_url:null },
  { id:'amsterdam',  name:'Amsterdam',     country:'NL', months:['Apr','May','Jun','Jul','Aug','Sep'],          audiences:['couple','friends','solo'],   motives:['city','culture'],           friction:'Erg druk in de zomer. Duur.',                  photo_url:null },
  { id:'parijs',     name:'Parijs',        country:'FR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','solo','friends'],   motives:['city','culture'],           friction:'Zakkenrollen op drukke plekken.',             photo_url:null },
  { id:'berlijn',    name:'Berlijn',       country:'DE', months:['Apr','May','Jun','Jul','Aug','Sep'],          audiences:['couple','friends','solo'],   motives:['city','culture'],           friction:null,                                          photo_url:null },
  { id:'praag',      name:'Praag',         country:'CZ', months:['Apr','May','Jun','Jul','Aug','Sep'],          audiences:['couple','friends','solo'],   motives:['city','culture'],           friction:'Populaire vrijgezellenbestemming. Druk centrum.', photo_url:null },
  { id:'budapest',   name:'Budapest',      country:'HU', months:['Apr','May','Jun','Jul','Aug','Sep'],          audiences:['couple','friends','solo'],   motives:['city','culture'],           friction:null,                                          photo_url:null },
  { id:'wenen',      name:'Wenen',         country:'AT', months:['Mar','Apr','May','Jun','Sep','Oct'],          audiences:['couple','solo','seniors'],   motives:['city','culture'],           friction:null,                                          photo_url:null },
  { id:'brussel',    name:'Brussel',       country:'BE', months:['Apr','May','Jun','Jul','Aug','Sep'],          audiences:['couple','solo'],             motives:['city','culture'],           friction:null,                                          photo_url:null },
  { id:'dublin',     name:'Dublin',        country:'IE', months:['May','Jun','Jul','Aug'],                      audiences:['couple','friends','solo'],   motives:['city','culture'],           friction:'Wisselvallig weer. Duur.',                    photo_url:null },
  { id:'kopenhagen', name:'Kopenhagen',    country:'DK', months:['May','Jun','Jul','Aug'],                      audiences:['couple','solo','friends'],   motives:['city','culture'],           friction:'Erg duur.',                                   photo_url:null },
  { id:'stockholm',  name:'Stockholm',     country:'SE', months:['May','Jun','Jul','Aug'],                      audiences:['couple','solo','friends'],   motives:['city','nature'],            friction:'Duur.',                                       photo_url:null },
  { id:'oslo',       name:'Oslo',          country:'NO', months:['Jun','Jul','Aug'],                            audiences:['couple','solo'],             motives:['city','nature'],            friction:'Erg duur.',                                   photo_url:null },
  { id:'reykjavik',  name:'Reykjavik',     country:'IS', months:['Jun','Jul','Aug'],                            audiences:['couple','friends','solo'],   motives:['nature','active'],          friction:'Erg duur. Wisselvallig weer.',                photo_url:null },
  { id:'edinburgh',  name:'Edinburgh',     country:'GB', months:['May','Jun','Jul','Aug'],                      audiences:['couple','solo','friends'],   motives:['city','culture'],           friction:'Wisselvallig weer.',                          photo_url:null },
  { id:'londen',     name:'Londen',        country:'GB', months:['Apr','May','Jun','Jul','Aug','Sep'],          audiences:['couple','family','solo','friends'], motives:['city','culture'],  friction:'Duur. Brexitgevolgen voor EU-reizigers.',    photo_url:null },
  { id:'new-york',   name:'New York',      country:'US', months:['Apr','May','Sep','Oct','Nov'],                audiences:['couple','friends','solo'],   motives:['city','culture'],           friction:'Lang vliegen (~8u). ESTA vereist.',           photo_url:null },
  { id:'miami',      name:'Miami',         country:'US', months:['Nov','Dec','Jan','Feb','Mar','Apr'],          audiences:['couple','friends'],          motives:['beach','city'],             friction:'Lang vliegen (~10u). ESTA vereist.',          photo_url:null },
  { id:'cancun',     name:'Cancún',        country:'MX', months:['Nov','Dec','Jan','Feb','Mar','Apr','May'],    audiences:['couple','friends','family'], motives:['beach','culture'],          friction:'Lang vliegen (~11u). Check reisadvies MBZ.',  photo_url:null },
  { id:'maldiven',   name:'Malediven',     country:'MV', months:['Nov','Dec','Jan','Feb','Mar','Apr'],          audiences:['couple'],                    motives:['beach','active'],           friction:'Erg duur. Lang vliegen (~10u).',              photo_url:null },
  { id:'sri-lanka',  name:'Sri Lanka',     country:'LK', months:['Nov','Dec','Jan','Feb','Mar'],                audiences:['couple','solo','friends'],   motives:['nature','culture','beach'], friction:'Lang vliegen (~11u). Check reisadvies MBZ.',  photo_url:null },
  { id:'brugge',     name:'Brugge',        country:'BE', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','seniors','solo'],   motives:['city','culture'],           friction:null,                                          photo_url:null },
  { id:'split',      name:'Split',         country:'HR', months:['May','Jun','Jul','Aug','Sep','Oct'],          audiences:['couple','friends','solo'],   motives:['beach','culture'],          friction:'Erg druk in juli-augustus.',                  photo_url:null },
  { id:'dubrovnik',  name:'Dubrovnik',     country:'HR', months:['May','Jun','Jul','Aug','Sep','Oct'],          audiences:['couple','solo'],             motives:['culture','beach'],          friction:'Overtoerisme. Duur. Geen auto in centrum.',   photo_url:null },
  { id:'hvar',       name:'Hvar',          country:'HR', months:['May','Jun','Jul','Aug','Sep'],                audiences:['couple','friends'],          motives:['beach','city'],             friction:'Populaire party-eiland. Duur in zomer.',      photo_url:null },
  { id:'montenegro', name:'Montenegro',    country:'ME', months:['May','Jun','Jul','Aug','Sep'],                audiences:['couple','family','friends'], motives:['beach','nature'],           friction:null,                                          photo_url:null },
  { id:'albanie',    name:'Albanië',       country:'AL', months:['May','Jun','Jul','Aug','Sep'],                audiences:['couple','solo','friends'],   motives:['beach','nature','culture'], friction:'Infrastructuur minder ontwikkeld.',           photo_url:null },
  { id:'bulgarije',  name:'Bulgarije (kust)', country:'BG', months:['Jun','Jul','Aug','Sep'],                  audiences:['couple','family'],           motives:['beach'],                    friction:null,                                          photo_url:null },
  { id:'kusadasi',   name:'Kuşadası',      country:'TR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family'],           motives:['beach','culture'],          friction:'Check reisadvies MBZ voor Turkije.',           photo_url:null },
  { id:'marmaris',   name:'Marmaris',      country:'TR', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','friends'],          motives:['beach'],                    friction:'Check reisadvies MBZ voor Turkije.',           photo_url:null },
  { id:'kenya',      name:'Kenya (safari)', country:'KE', months:['Jul','Aug','Sep','Oct','Jan','Feb'],         audiences:['couple','family','friends'], motives:['nature','active'],          friction:'Vaccinaties vereist. Check reisadvies MBZ.',   photo_url:null },
  { id:'zanzibar',   name:'Zanzibar',      country:'TZ', months:['Jun','Jul','Aug','Sep','Dec','Jan','Feb'],    audiences:['couple','friends'],          motives:['beach','nature','culture'], friction:'Lang vliegen (~10u). Malariaprofylaxe.',       photo_url:null },
  { id:'mauritius',  name:'Mauritius',     country:'MU', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple'],                    motives:['beach','nature'],           friction:'Lang vliegen (~11u). Duur.',                   photo_url:null },
  { id:'seychellen', name:'Seychellen',    country:'SC', months:['Apr','May','Oct','Nov'],                      audiences:['couple'],                    motives:['beach','nature'],           friction:'Erg duur. Lang vliegen (~12u).',              photo_url:null },
  { id:'puglia',     name:'Puglia',        country:'IT', months:['Apr','May','Jun','Jul','Aug','Sep','Oct'],    audiences:['couple','family','solo'],    motives:['beach','culture','nature'], friction:null,                                          photo_url:null },
  { id:'toscane',    name:'Toscane',       country:'IT', months:['Apr','May','Jun','Sep','Oct'],                audiences:['couple','solo','seniors'],   motives:['nature','culture'],         friction:'Druk en duur in de zomer.',                   photo_url:null },
  { id:'costa-brava', name:'Costa Brava',  country:'ES', months:['May','Jun','Jul','Aug','Sep'],                audiences:['family','couple'],           motives:['beach'],                    friction:null,                                          photo_url:null },
  { id:'lloret',     name:'Lloret de Mar', country:'ES', months:['Jun','Jul','Aug','Sep'],                      audiences:['friends','couple'],          motives:['beach','city'],             friction:'Populaire party-bestemming in de zomer.',     photo_url:null },
  { id:'benidorm',   name:'Benidorm',      country:'ES', months:['May','Jun','Jul','Aug','Sep','Oct'],          audiences:['friends','seniors','family'], motives:['beach','city'],            friction:null,                                          photo_url:null },
  { id:'salou',      name:'Salou',         country:'ES', months:['May','Jun','Jul','Aug','Sep'],                audiences:['family','couple'],           motives:['beach'],                    friction:null,                                          photo_url:null },
  { id:'val-thorens', name:'Val Thorens',  country:'FR', months:['Dec','Jan','Feb','Mar'],                      audiences:['friends','couple','family'], motives:['active'],                   friction:'Hoge kosten skipass en uitrusting.',          photo_url:null },
  { id:'innsbruck',  name:'Innsbruck',     country:'AT', months:['Dec','Jan','Feb','Mar'],                      audiences:['couple','family','friends'], motives:['active','nature'],          friction:null,                                          photo_url:null },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchKnowledge(str: string): DestKnowledge | null {
  const normalized = str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const k of KNOWN) {
    const kNorm = k.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const idNorm = k.id.replace(/-/g, ' ');
    if (
      normalized.includes(kNorm) ||
      kNorm.includes(normalized) ||
      normalized.includes(idNorm) ||
      idNorm.includes(normalized)
    ) {
      return k;
    }
  }
  return null;
}

function genericProposal(str: string): Omit<DestKnowledge, 'id' | 'name'> {
  return {
    country:   'UNKNOWN',
    months:    ['Jun','Jul','Aug'],
    audiences: ['couple','family'],
    motives:   ['beach'],
    friction:  null,
    photo_url: null,
  };
}

interface DraftRow {
  destination_str:    string;
  suggested_id:       string;
  suggested_name:     string;
  suggested_country:  string;
  suggested_months:   string[];
  suggested_audiences: string[];
  suggested_motives:  string[];
  suggested_friction: string | null;
  suggested_photo_url: string | null;
  occurrence_count:   number;
}

async function main() {
  const db = getDb();

  // ── 1. Pull top-N destination strings from staging_offers ──────────────
  console.log(`Querying top ${TOP_N} destination strings from staging_offers…`);

  let query = db
    .from('staging_offers')
    .select('destination_str')
    .not('destination_str', 'is', null);

  if (BATCH_ARG) {
    query = query.eq('batch_id', BATCH_ARG);
    console.log(`  Filtering to batch_id = ${BATCH_ARG}`);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`Query failed: ${JSON.stringify(error)}`);
  if (!rows || rows.length === 0) {
    console.error('No staging_offers rows found. Run ingest:fetch + ingest:parse first.');
    process.exit(1);
  }

  // Count frequencies
  const freq = new Map<string, number>();
  for (const row of rows) {
    const s = (row as { destination_str: string }).destination_str?.trim();
    if (!s) continue;
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }

  const topN = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);

  console.log(`Found ${freq.size} unique destination strings. Taking top ${topN.length}.`);

  // ── 2. Build draft rows ─────────────────────────────────────────────────
  const drafts: DraftRow[] = topN.map(([str, count]) => {
    const known = matchKnowledge(str);
    const base  = known ?? genericProposal(str);
    const id    = known?.id ?? slugify(str.split(/[-–,]/)[0]!.trim());
    const name  = known?.name ?? str.split(/[-–,]/)[0]!.trim();

    return {
      destination_str:     str,
      suggested_id:        id,
      suggested_name:      name,
      suggested_country:   base.country,
      suggested_months:    base.months,
      suggested_audiences: base.audiences,
      suggested_motives:   base.motives,
      suggested_friction:  base.friction ?? null,
      suggested_photo_url: base.photo_url ?? null,
      occurrence_count:    count,
    };
  });

  // ── 3. Upsert into destinations_draft ──────────────────────────────────
  console.log(`Upserting ${drafts.length} rows into destinations_draft…`);
  const CHUNK = 50;
  for (let i = 0; i < drafts.length; i += CHUNK) {
    const chunk = drafts.slice(i, i + CHUNK);
    const { error: upsertErr } = await db
      .from('destinations_draft')
      .upsert(chunk, { onConflict: 'destination_str', ignoreDuplicates: false });
    if (upsertErr) throw new Error(`Upsert failed at chunk ${i}: ${JSON.stringify(upsertErr)}`);
  }
  console.log('  destinations_draft updated.');

  // ── 4. Write CSV for operator review ────────────────────────────────────
  const csvPath = './destination-proposals.csv';
  const header = [
    'occurrence_count','destination_str','suggested_id','suggested_name',
    'suggested_country','suggested_months','suggested_audiences','suggested_motives',
    'suggested_friction','suggested_photo_url',
  ].join(',');
  const csvRows = drafts.map(d =>
    [
      d.occurrence_count,
      `"${d.destination_str.replace(/"/g, '""')}"`,
      d.suggested_id,
      `"${d.suggested_name}"`,
      d.suggested_country,
      `"${d.suggested_months.join(';')}"`,
      `"${d.suggested_audiences.join(';')}"`,
      `"${d.suggested_motives.join(';')}"`,
      `"${(d.suggested_friction ?? '').replace(/"/g, '""')}"`,
      d.suggested_photo_url ?? '',
    ].join(','),
  );
  writeFileSync(csvPath, [header, ...csvRows].join('\n'), 'utf8');
  console.log(`\nCSV geschreven naar ${csvPath}`);

  // ── 5. Summary ──────────────────────────────────────────────────────────
  const known     = drafts.filter(d => d.suggested_country !== 'UNKNOWN').length;
  const unknown   = drafts.length - known;
  const countries = new Set(drafts.map(d => d.suggested_country)).size;
  console.log(`\nKlaar voor controle door opdrachtgever:`);
  console.log(`  ${known} bestemmingen herkend uit kennistabel`);
  console.log(`  ${unknown} bestemmingen ONBEKEND (suggested_country = 'UNKNOWN') — vereisen handmatige invulling`);
  console.log(`  ${countries} unieke landen`);
  console.log(`\nStap 4 gereed. Bekijk destinations_draft in Supabase of open ${csvPath}.`);
  console.log('Zet approved=true nadat u de rijen heeft nagelopen, voeg daarna promote-destination-drafts.ts uit.');
}

main().catch(err => { console.error(err); process.exit(1); });
