import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '../../lib/supabase';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Alle bestemmingen — TripPick',
  description: 'Bekijk alle vakantiebestemmingen die TripPick kan matchen op maand, budget en wensen.',
};

const NL_MONTHS: Record<string, string> = {
  Jan:'jan', Feb:'feb', Mar:'mrt', Apr:'apr', May:'mei', Jun:'jun',
  Jul:'jul', Aug:'aug', Sep:'sep', Oct:'okt', Nov:'nov', Dec:'dec',
};

function formatMonths(months: string[]): string {
  if (!months?.length) return '';
  return months.map(m => NL_MONTHS[m] ?? m).join(' · ');
}

const MOTIVE_COLORS: Record<string, string> = {
  beach:   'linear-gradient(135deg, #0099cc 0%, #17BEBB 100%)',
  nature:  'linear-gradient(135deg, #2E7D32 0%, #66BB6A 100%)',
  culture: 'linear-gradient(135deg, #6A1B9A 0%, #AB47BC 100%)',
  city:    'linear-gradient(135deg, #37474F 0%, #78909C 100%)',
  active:  'linear-gradient(135deg, #BF360C 0%, #FF7043 100%)',
  ski:     'linear-gradient(135deg, #1565C0 0%, #64B5F6 100%)',
};

const DEFAULT_GRADIENT = 'linear-gradient(135deg, #13a8a5 0%, #17BEBB 100%)';

interface Destination {
  id:      string;
  name:    string;
  country: string;
  months:  string[] | null;
  motives: string[] | null;
}

export default async function Bestemmingen() {
  const db = createServerClient();
  const { data, error } = await db
    .from('destinations')
    .select('id, name, country, months, motives')
    .eq('active', true)
    .order('country')
    .order('name');

  if (error) {
    return (
      <main className="tp-page">
        <div className="tp-page-header">
          <Link href="/" className="tp-logo">TripPick</Link>
        </div>
        <p className="tp-error-msg">Kon bestemmingen niet laden. Probeer het later opnieuw.</p>
      </main>
    );
  }

  const destinations = (data ?? []) as Destination[];
  const intl = new Intl.DisplayNames(['nl'], { type: 'region' });

  return (
    <main className="tp-page">
      <div className="tp-page-header">
        <Link href="/" className="tp-logo">TripPick</Link>
        <Link href="/" className="tp-back-link">← Match mij een bestemming</Link>
      </div>

      <div className="tp-catalog-title">
        <h1>Alle bestemmingen</h1>
        <span className="tp-catalog-count">{destinations.length} bestemmingen</span>
      </div>

      <div className="tp-dest-grid">
        {destinations.map(d => {
          const firstMotive = d.motives?.[0] ?? '';
          const gradient = MOTIVE_COLORS[firstMotive] ?? DEFAULT_GRADIENT;
          const countryName = intl.of(d.country) ?? d.country;
          return (
            <div key={d.id} className="tp-dest-card">
              <div className="tp-dest-card-stripe" style={{ background: gradient }} />
              <div className="tp-dest-card-body">
                <div className="tp-dest-country">{countryName}</div>
                <div className="tp-dest-name">{d.name}</div>
                {d.months?.length ? (
                  <div className="tp-dest-months">{formatMonths(d.months)}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
