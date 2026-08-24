/**
 * Client-side scoring mirror — same weights as the SQL function in 001_initial_schema.sql.
 * Used for instant re-ranking of cached results when the user tweaks preferences,
 * without hitting the API again.
 *
 * Weights:
 *   season    30
 *   audience  25
 *   budget    20
 *   transport 16
 *   motive    20  (7 pts per matching motive, capped at 20)
 */
import type { UserProfile, MatchResult } from './types.js';

interface ScoredResult extends MatchResult {
  breakdown: {
    season:    number;
    audience:  number;
    budget:    number;
    transport: number;
    motive:    number;
    total:     number;
  };
}

function scoreSeason(result: MatchResult, month: number): number {
  if (result.departureDate) {
    // package: departure month must match exactly
    const depMonth = new Date(result.departureDate).getMonth() + 1;
    return depMonth === month ? 30 : 0;
  }
  // accommodation: no direct date, trust SQL filtering
  return 30;
}

function scoreAudience(
  destination_audiences: string[],
  p_audiences: string[],
): number {
  if (p_audiences.length === 0) return 12; // no preference → neutral
  const overlap = p_audiences.filter(a => destination_audiences.includes(a)).length;
  return Math.min(25, Math.round(25 * (overlap / p_audiences.length)));
}

function scoreBudget(priceCents: number, budgetCents: number): number {
  if (budgetCents <= 0) return 0;
  return Math.max(0, Math.round(20 * (1 - priceCents / budgetCents)));
}

function scoreTransport(
  resultTransport: string | null,
  destTransport: string[],
  pTransport: string[],
): number {
  if (pTransport.length === 0) return 8;
  if (resultTransport) {
    return pTransport.includes(resultTransport.toLowerCase()) ? 16 : 0;
  }
  return destTransport.some(t => pTransport.includes(t)) ? 16 : 0;
}

function scoreMotive(destMotives: string[], pMotives: string[]): number {
  const matching = pMotives.filter(m => destMotives.includes(m)).length;
  return Math.min(20, 7 * matching);
}

/**
 * Re-score already-fetched results on the client side.
 * `destMeta` supplies audiences/motives/transport from destinations table,
 * which the API should include in the response for this purpose.
 */
export function rescoreResults(
  results: Array<MatchResult & {
    audiences?:  string[];
    motives?:    string[];
    transport?:  string[];
  }>,
  profile: UserProfile,
): ScoredResult[] {
  return results
    .map(r => {
      const s = scoreSeason(r, profile.month);
      const a = scoreAudience(r.audiences ?? [], profile.audiences);
      const b = scoreBudget(r.cheapestCents, profile.budgetCents);
      const t = scoreTransport(r.transportType, r.transport ?? [], profile.transport);
      const m = scoreMotive(r.motives ?? [], profile.motives);
      const total = s + a + b + t + m;
      return { ...r, score: total, breakdown: { season: s, audience: a, budget: b, transport: t, motive: m, total } };
    })
    .filter(r => r.breakdown.season > 0)  // wrong season → exclude
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export type { ScoredResult };
