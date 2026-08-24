/**
 * navago-widget / MatchWidget
 *
 * A brand-agnostic multi-step questionnaire that calls the TripPick
 * match API and renders up to 3 results. Bring your own CSS —
 * this component attaches data-* attributes and class names only.
 *
 * Props: see MatchWidgetProps in types.ts
 */
import React, { useState, useCallback } from 'react';
import type {
  MatchWidgetProps, MatchResult, UserProfile,
  QuestionStep, TransportMode, Audience, Motive,
} from './types.js';

const MONTHS = [
  'Januari','Februari','Maart','April','Mei','Juni',
  'Juli','Augustus','September','Oktober','November','December',
];

const TRANSPORT_OPTS: { value: TransportMode; label: string }[] = [
  { value: 'flight', label: 'Vliegen' },
  { value: 'car',    label: 'Met de auto' },
  { value: 'train',  label: 'Trein' },
  { value: 'bus',    label: 'Bus' },
];

const AUDIENCE_OPTS: { value: Audience; label: string }[] = [
  { value: 'couple',  label: 'Stel' },
  { value: 'family',  label: 'Gezin met kinderen' },
  { value: 'solo',    label: 'Solo' },
  { value: 'friends', label: 'Vrienden' },
  { value: 'seniors', label: 'Senioren' },
];

const MOTIVE_OPTS: { value: Motive; label: string }[] = [
  { value: 'beach',   label: 'Strand & zon' },
  { value: 'city',    label: 'Stad & cultuur' },
  { value: 'nature',  label: 'Natuur & rust' },
  { value: 'culture', label: 'Historie & musea' },
  { value: 'active',  label: 'Actief & sport' },
];

const BUDGET_STEPS = [
  { cents: 50000,  label: '< €500' },
  { cents: 100000, label: '< €1.000' },
  { cents: 150000, label: '< €1.500' },
  { cents: 250000, label: '< €2.500' },
  { cents: 500000, label: '< €5.000' },
  { cents: 999999, label: 'Geen grens' },
];

const STEPS: QuestionStep[] = ['month', 'budget', 'transport', 'audience', 'motives', 'results'];

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

function ResultCard({
  result,
  onDeeplinkClick,
}: {
  result: MatchResult;
  onDeeplinkClick?: ((r: MatchResult) => void) | undefined;
}) {
  const imgSrc = result.imageUrl;
  const isFallback = result.imageIsFallback;

  return (
    <div className="nw-result-card" data-destination-id={result.destinationId}>
      <div className="nw-result-image-wrap">
        {imgSrc ? (
          <>
            <img src={imgSrc} alt={result.destinationName} className="nw-result-image" loading="lazy" />
            {isFallback && (
              <span className="nw-result-image-badge">Sfeerbeeld</span>
            )}
          </>
        ) : (
          <div className="nw-result-image-placeholder" aria-hidden="true" />
        )}
      </div>

      <div className="nw-result-body">
        <div className="nw-result-country">{result.country}</div>
        <h3 className="nw-result-name">{result.destinationName}</h3>
        {result.blurb && <p className="nw-result-blurb">{result.blurb}</p>}
        {result.friction && (
          <p className="nw-result-friction">
            <span className="nw-result-friction-label">Let op: </span>
            {result.friction}
          </p>
        )}
        <div className="nw-result-meta">
          {result.departureDate && (
            <span className="nw-result-date">
              {new Date(result.departureDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
            </span>
          )}
          {result.accommodationName && (
            <span className="nw-result-hotel">{result.accommodationName}</span>
          )}
          {result.transportType && (
            <span className="nw-result-transport">{result.transportType}</span>
          )}
        </div>
        <div className="nw-result-footer">
          <span className="nw-result-price">
            Vanaf {formatPrice(result.cheapestCents)}
          </span>
          <a
            href={result.deeplink}
            className="nw-result-cta"
            target="_blank"
            rel="noopener noreferrer"
            data-track="match_result_click"
            data-offer-id={result.offerId}
            data-destination-id={result.destinationId}
            onClick={() => onDeeplinkClick?.(result)}
          >
            Bekijk aanbieding →
          </a>
        </div>
      </div>
    </div>
  );
}

export function MatchWidget({ apiBase, brand, onDeeplinkClick }: MatchWidgetProps) {
  const [step, setStep]       = useState<QuestionStep>('month');
  const [profile, setProfile] = useState<Partial<UserProfile>>({});
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const stepIndex    = STEPS.indexOf(step);
  const totalSteps   = STEPS.length - 1; // 'results' is not a question

  const toggle = useCallback(<T,>(arr: T[] | undefined, val: T): T[] => {
    const cur = arr ?? [];
    return cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
  }, []);

  async function submitProfile(finalProfile: UserProfile) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalProfile),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { results: MatchResult[] };
      setResults(data.results);
      setStep('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setStep('month');
    setProfile({});
    setResults([]);
    setError(null);
  }

  return (
    <div
      className="nw-widget"
      data-step={step}
      style={{ '--nw-primary': brand?.primaryColor ?? '#17BEBB' } as React.CSSProperties}
    >
      {/* Progress bar — only during questions */}
      {step !== 'results' && (
        <div className="nw-progress" role="progressbar" aria-valuenow={stepIndex} aria-valuemax={totalSteps}>
          <div className="nw-progress-bar" style={{ width: `${(stepIndex / totalSteps) * 100}%` }} />
        </div>
      )}

      {/* ── Step: month ── */}
      {step === 'month' && (
        <div className="nw-step" data-step="month">
          <h2 className="nw-step-title">Wanneer wil je op vakantie?</h2>
          <div className="nw-grid nw-grid-3">
            {MONTHS.map((name, i) => (
              <button
                key={i}
                className={`nw-chip ${profile.month === i + 1 ? 'nw-chip--active' : ''}`}
                onClick={() => {
                  const next = { ...profile, month: i + 1 };
                  setProfile(next);
                  setStep('budget');
                }}
              >{name}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step: budget ── */}
      {step === 'budget' && (
        <div className="nw-step" data-step="budget">
          <h2 className="nw-step-title">Wat is je maximale budget per persoon?</h2>
          <div className="nw-grid nw-grid-2">
            {BUDGET_STEPS.map(({ cents, label }) => (
              <button
                key={cents}
                className={`nw-chip ${profile.budgetCents === cents ? 'nw-chip--active' : ''}`}
                onClick={() => {
                  const next = { ...profile, budgetCents: cents };
                  setProfile(next);
                  setStep('transport');
                }}
              >{label}</button>
            ))}
          </div>
          <button className="nw-back" onClick={() => setStep('month')}>← Terug</button>
        </div>
      )}

      {/* ── Step: transport ── */}
      {step === 'transport' && (
        <div className="nw-step" data-step="transport">
          <h2 className="nw-step-title">Hoe wil je reizen?</h2>
          <p className="nw-step-sub">Meerdere opties mogelijk</p>
          <div className="nw-grid nw-grid-2">
            {TRANSPORT_OPTS.map(({ value, label }) => (
              <button
                key={value}
                className={`nw-chip ${profile.transport?.includes(value) ? 'nw-chip--active' : ''}`}
                onClick={() => setProfile(p => ({ ...p, transport: toggle(p.transport, value) }))}
              >{label}</button>
            ))}
          </div>
          <div className="nw-actions">
            <button className="nw-back" onClick={() => setStep('budget')}>← Terug</button>
            <button
              className="nw-next"
              onClick={() => setStep('audience')}
              disabled={(profile.transport?.length ?? 0) === 0}
            >Volgende →</button>
          </div>
        </div>
      )}

      {/* ── Step: audience ── */}
      {step === 'audience' && (
        <div className="nw-step" data-step="audience">
          <h2 className="nw-step-title">Met wie ga je?</h2>
          <div className="nw-grid nw-grid-2">
            {AUDIENCE_OPTS.map(({ value, label }) => (
              <button
                key={value}
                className={`nw-chip ${profile.audiences?.includes(value) ? 'nw-chip--active' : ''}`}
                onClick={() => setProfile(p => ({ ...p, audiences: toggle(p.audiences, value) }))}
              >{label}</button>
            ))}
          </div>
          <div className="nw-actions">
            <button className="nw-back" onClick={() => setStep('transport')}>← Terug</button>
            <button
              className="nw-next"
              onClick={() => setStep('motives')}
              disabled={(profile.audiences?.length ?? 0) === 0}
            >Volgende →</button>
          </div>
        </div>
      )}

      {/* ── Step: motives ── */}
      {step === 'motives' && (
        <div className="nw-step" data-step="motives">
          <h2 className="nw-step-title">Wat wil je er van maken?</h2>
          <p className="nw-step-sub">Kies wat bij je past</p>
          <div className="nw-grid nw-grid-2">
            {MOTIVE_OPTS.map(({ value, label }) => (
              <button
                key={value}
                className={`nw-chip ${profile.motives?.includes(value) ? 'nw-chip--active' : ''}`}
                onClick={() => setProfile(p => ({ ...p, motives: toggle(p.motives, value) }))}
              >{label}</button>
            ))}
          </div>
          <div className="nw-actions">
            <button className="nw-back" onClick={() => setStep('audience')}>← Terug</button>
            <button
              className="nw-next"
              disabled={(profile.motives?.length ?? 0) === 0 || loading}
              onClick={() => {
                const full: UserProfile = {
                  month:       profile.month!,
                  budgetCents: profile.budgetCents!,
                  transport:   profile.transport ?? [],
                  audiences:   profile.audiences ?? [],
                  motives:     profile.motives ?? [],
                };
                void submitProfile(full);
              }}
            >{loading ? 'Berekenen…' : 'Zoek mijn match →'}</button>
          </div>
        </div>
      )}

      {/* ── Step: results ── */}
      {step === 'results' && (
        <div className="nw-step nw-results" data-step="results">
          {error ? (
            <div className="nw-error">
              <p>Er ging iets mis: {error}</p>
              <button className="nw-back" onClick={restart}>Opnieuw proberen</button>
            </div>
          ) : results.length === 0 ? (
            <div className="nw-no-results">
              <p>We hebben geen passende bestemmingen gevonden voor deze combinatie.</p>
              <button className="nw-back" onClick={restart}>Andere voorkeuren</button>
            </div>
          ) : (
            <>
              <h2 className="nw-results-title">Jouw beste matches</h2>
              <div className="nw-results-grid">
                {results.map(r => (
                  <ResultCard key={r.offerId} result={r} onDeeplinkClick={onDeeplinkClick} />
                ))}
              </div>
              <button className="nw-restart" onClick={restart}>Opnieuw beginnen</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
