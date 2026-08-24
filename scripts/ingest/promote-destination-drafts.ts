/**
 * promote-destination-drafts.ts
 *
 * Stap 5b (na handmatige goedkeuring in destinations_draft):
 * Kopieert alle rijen waar approved=true naar de live destinations-tabel.
 * Maakt ook een alias aan met de destination_str als alias.
 *
 * Veilig om meerdere keren te draaien (upsert op id).
 *
 * Gebruik:
 *   tsx promote-destination-drafts.ts
 */
import 'dotenv/config';
import { getDb } from './lib/db.js';

async function main() {
  const db = getDb();

  // Haal goedgekeurde drafts op
  const { data: approved, error } = await db
    .from('destinations_draft')
    .select('*')
    .eq('approved', true);

  if (error) throw new Error(`Query failed: ${JSON.stringify(error)}`);
  if (!approved || approved.length === 0) {
    console.log('Geen goedgekeurde drafts gevonden. Zet approved=true in destinations_draft eerst.');
    return;
  }

  console.log(`${approved.length} goedgekeurde bestemmingen gevonden. Promoveren naar destinations…`);

  interface Draft {
    destination_str:     string;
    suggested_id:        string;
    suggested_name:      string;
    suggested_country:   string;
    suggested_months:    string[] | null;
    suggested_audiences: string[] | null;
    suggested_motives:   string[] | null;
    suggested_friction:  string | null;
    suggested_photo_url: string | null;
  }

  const destinationRows = (approved as Draft[]).map(d => ({
    id:        d.suggested_id,
    name:      d.suggested_name,
    country:   d.suggested_country,
    months:    d.suggested_months ?? [],
    audiences: d.suggested_audiences ?? [],
    motives:   d.suggested_motives ?? [],
    friction:  d.suggested_friction ?? null,
    photo_url: d.suggested_photo_url ?? null,
    active:    true,
  }));

  // Upsert per chunk
  const CHUNK = 50;
  for (let i = 0; i < destinationRows.length; i += CHUNK) {
    const { error: upsertErr } = await db
      .from('destinations')
      .upsert(destinationRows.slice(i, i + CHUNK), { onConflict: 'id', ignoreDuplicates: false });
    if (upsertErr) throw new Error(`destinations upsert failed: ${JSON.stringify(upsertErr)}`);
  }

  // Maak aliases aan: destination_str → destination_id
  const aliasRows = (approved as Draft[]).map(d => ({
    alias:       d.destination_str.toLowerCase().trim(),
    destination: d.suggested_id,
    source:      'manual_draft',
    confidence:  1.0,
  }));

  for (let i = 0; i < aliasRows.length; i += CHUNK) {
    const { error: aliasErr } = await db
      .from('destination_aliases')
      .upsert(aliasRows.slice(i, i + CHUNK), { onConflict: 'alias', ignoreDuplicates: false });
    if (aliasErr) throw new Error(`alias upsert failed: ${JSON.stringify(aliasErr)}`);
  }

  // Markeer als gepromoveerd
  const promotedStrs = (approved as Draft[]).map(d => d.destination_str);
  await db
    .from('destinations_draft')
    .update({ approved_at: new Date().toISOString() })
    .in('destination_str', promotedStrs);

  console.log(`\nKlaar:`);
  console.log(`  ${destinationRows.length} bestemmingen ingevoegd/bijgewerkt in destinations`);
  console.log(`  ${aliasRows.length} aliases aangemaakt in destination_aliases`);
  console.log(`\nU kunt nu ingest:resolve, ingest:validate en ingest:publish draaien (stap 6).`);
}

main().catch(err => { console.error(err); process.exit(1); });
