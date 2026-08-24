// ============================================================
// Public types shared between navago-widget and trippick-web
// ============================================================

export type ProductType   = 'package' | 'accommodation';
export type TransportMode = 'flight' | 'car' | 'train' | 'bus';
export type Audience      = 'couple' | 'family' | 'solo' | 'friends' | 'seniors';
export type Motive        = 'beach' | 'city' | 'nature' | 'culture' | 'active';

/** The user's answers, as collected by the questionnaire */
export interface UserProfile {
  /** Travel month (1–12) */
  month: number;
  /** Max budget per person in euro-cents */
  budgetCents: number;
  /** Preferred transport modes */
  transport: TransportMode[];
  /** Travel group type */
  audiences: Audience[];
  /** Trip motivations */
  motives: Motive[];
}

/** A single matching result returned by the API / SQL function */
export interface MatchResult {
  destinationId:    string;
  destinationName:  string;
  country:          string;
  blurb:            string | null;
  friction:         string | null;
  score:            number;
  cheapestCents:    number;
  offerId:          number;
  imageUrl:         string | null;
  imageIsFallback:  boolean;
  departureDate:    string | null;  // 'YYYY-MM-DD'
  accommodationName: string | null;
  transportType:    string | null;
  deeplink:         string;
  provider:         string | null;
}

/** Props for the top-level MatchWidget */
export interface MatchWidgetProps {
  /** Base URL of the API (e.g. 'https://trippick.eu') */
  apiBase:   string;
  /** Optional brand overrides */
  brand?: {
    primaryColor?: string;
    logoUrl?:      string;
    siteName?:     string;
  };
  /** Called when user clicks through to a deeplink */
  onDeeplinkClick?: (result: MatchResult) => void;
}

/** Step identifiers for the questionnaire */
export type QuestionStep =
  | 'month'
  | 'budget'
  | 'transport'
  | 'audience'
  | 'motives'
  | 'results';
