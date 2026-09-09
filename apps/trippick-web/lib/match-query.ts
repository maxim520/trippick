/**
 * Server-side wrapper around the match_offers SQL function.
 * Called from the /api/match route handler.
 */
import { createServerClient } from './supabase';
import type { MatchResult } from 'navago-widget';

interface MatchParams {
  month:       number;
  budgetCents: number;
  transport:   string[];
  audiences:   string[];
  motives:     string[];
}

// Row shape returned by the SQL function
interface MatchRow {
  destination_id:     string;
  destination_name:   string;
  country:            string;
  blurb:              string | null;
  friction:           string | null;
  score:              number;
  cheapest_cents:     number;
  offer_id:           number;
  image_url:          string | null;
  image_is_fallback:  boolean;
  departure_date:     string | null;
  accommodation_name: string | null;
  transport_type:     string | null;
  deeplink:           string;
  provider:           string | null;
}

export async function queryMatch(params: MatchParams): Promise<MatchResult[]> {
  const db = createServerClient();

  const { data, error } = await db.rpc('match_offers', {
    p_month:        params.month,
    p_budget_cents: params.budgetCents,
    p_transport:    params.transport,
    p_audiences:    params.audiences,
    p_motives:      params.motives,
  });

  if (error) {
    console.error('[match-query] RPC error:', error);
    throw new Error(`match_offers failed: ${error.message}`);
  }

  return ((data as MatchRow[]) ?? []).map(r => ({
    destinationId:    r.destination_id,
    destinationName:  r.destination_name,
    country:          r.country,
    blurb:            r.blurb,
    friction:         r.friction,
    score:            r.score,
    cheapestCents:    r.cheapest_cents,
    offerId:          r.offer_id,
    imageUrl:         r.image_url,
    imageIsFallback:  r.image_is_fallback,
    departureDate:    r.departure_date,
    accommodationName: r.accommodation_name,
    transportType:    r.transport_type,
    deeplink:         r.deeplink,
    provider:         r.provider,
  }));
}
