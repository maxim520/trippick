// ============================================================
// Shared types across all ingest stages
// ============================================================

export type ProductType = 'package' | 'accommodation';

export type TransportType = 'Flight' | 'Bus' | 'By own means' | null;

export interface StagingOffer {
  batch_id: number;
  raw: Record<string, unknown>;
  product_type: ProductType | null;
  destination_str: string | null;
  destination_country_raw: string | null;
  destination_country: string | null;    // ISO-2 after normalisation
  price_cents: number | null;
  departure_date: string | null;         // ISO date string 'YYYY-MM-DD'
  transport_type: TransportType;
  accommodation_name: string | null;
  lat: number | null;
  lon: number | null;
  image_url: string | null;
  provider: string | null;
  deeplink: string | null;
}

export interface ResolvedOffer extends StagingOffer {
  destination_id: string;
}

export interface SourceMeta {
  id: string;
  network: string;
  has_coordinates: boolean;
  has_departure_date: boolean;
  has_transport_type: boolean;
  photo_coverage_pct: number | null;
  last_ingest_at: string | null;
}

export interface BatchStats {
  source_id: string;
  batch_id: number;
  total_parsed: number;
  resolved: number;
  unresolved: number;
  invalid_price: number;
  invalid_date: number;
  published: number;
}

// Field paths per source — extend as new sources are onboarded
export interface FieldMap {
  destinationStr:    string;   // dot-path into raw record
  countryRaw:        string;
  pricePath:         string;
  departureDatePath: string | null;
  transportPath:     string | null;
  accommodationName: string | null;
  latPath:           string | null;
  lonPath:           string | null;
  imagePath:         string | null;
  providerPath:      string | null;
  deeplinkPath:      string;
}

export const SOURCE_FIELD_MAPS: Record<string, FieldMap> = {
  'daisycon-prijsvrij': {
    destinationStr:    'city',
    countryRaw:        'country',
    pricePath:         'price',
    departureDatePath: 'departureDate',
    transportPath:     null,
    accommodationName: 'name',
    latPath:           null,
    lonPath:           null,
    imagePath:         'image',
    providerPath:      'brand',
    deeplinkPath:      'deeplink',
  },
  'daisycon-dutchflyguys': {
    destinationStr:    'destination',
    countryRaw:        'country',
    pricePath:         'price',
    departureDatePath: 'departure_date',
    transportPath:     'transport',
    accommodationName: 'hotel',
    latPath:           null,
    lonPath:           null,
    imagePath:         null,           // DutchFlyGuys: no images in full feed
    providerPath:      'provider',
    deeplinkPath:      'url',
  },
  'tradetracker-bungalownet': {
    destinationStr:    'city',
    countryRaw:        'country',
    pricePath:         'price',
    departureDatePath: null,           // accommodation: no fixed date
    transportPath:     null,
    accommodationName: 'name',
    latPath:           'lat',
    lonPath:           'lon',
    imagePath:         'image',
    providerPath:      'brand',
    deeplinkPath:      'deeplink',
  },
  'daisycon-solmar': {
    destinationStr:    'destination',
    countryRaw:        'country',
    pricePath:         'price',
    departureDatePath: 'departureDate',
    transportPath:     'transport_type',
    accommodationName: 'resort',
    latPath:           null,
    lonPath:           null,
    imagePath:         null,
    providerPath:      'brand',
    deeplinkPath:      'bookingUrl',
  },
};
