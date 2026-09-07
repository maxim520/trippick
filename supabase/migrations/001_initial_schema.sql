-- ============================================================
-- TripPick × Navago  –  initial schema
-- Run order: 001 → 002
-- ============================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ------------------------------------------------------------------ destinations
create table destinations (
  id            text primary key,
  name          text not null,
  country       text not null,          -- always ISO-2, normalised on insert
  region        text,
  lat           numeric,
  lon           numeric,
  months        text[],                  -- authoritative for product_type='accommodation'
  audiences     text[],                  -- 'family'|'couple'|'solo'|'friends'|'seniors'
  motives       text[],                  -- 'beach'|'city'|'nature'|'culture'|'active'
  transport     text[],                  -- 'flight'|'car'|'train'|'bus'
  drive_hours   numeric,
  flight_hours  numeric,
  price_level   int check (price_level between 1 and 5),
  friction      text,                    -- short human note on what might go wrong
  blurb         text,
  photo_url     text,                    -- mandatory before going live; widget fallback
  active        boolean default true
);

create index destinations_country_idx on destinations(country);
create index destinations_months_idx  on destinations using gin(months);
create index destinations_audiences_idx on destinations using gin(audiences);
create index destinations_motives_idx on destinations using gin(motives);

-- ------------------------------------------------------------------ destination_aliases
create table destination_aliases (
  alias        text primary key,
  destination  text references destinations(id),
  source       text,                     -- which feed this alias came from
  confidence   numeric check (confidence between 0 and 1)
);

create index aliases_destination_idx on destination_aliases(destination);

-- ------------------------------------------------------------------ country_code_map
create table country_code_map (
  raw_value    text primary key,         -- 'Spanje', 'ES', 'spain', 'Italie', 'IT', …
  iso2         text not null
);

create index country_code_map_iso2_idx on country_code_map(iso2);

-- ------------------------------------------------------------------ sources
create table sources (
  id                      text primary key,
  network                 text not null,  -- 'daisycon'|'tradetracker'|'awin'
  feed_url                text,           -- stored encrypted or via env; nullable here
  has_coordinates         boolean default false,
  has_departure_date      boolean default false,
  has_transport_type      boolean default false,
  photo_coverage_pct      numeric,        -- updated after each publish run
  last_ingest_at          timestamptz
);

-- ------------------------------------------------------------------ raw_feeds  (one row per fetch attempt)
create table raw_feeds (
  id          bigserial primary key,
  source_id   text references sources(id),
  fetched_at  timestamptz default now(),
  file_hash   text not null,
  raw_path    text not null              -- relative path to saved XML on disk / object store
);

create index raw_feeds_source_idx on raw_feeds(source_id, fetched_at desc);

-- ------------------------------------------------------------------ staging_offers
create table staging_offers (
  id                      bigserial primary key,
  batch_id                bigint references raw_feeds(id) on delete cascade,
  raw                     jsonb not null,
  product_type            text check (product_type in ('package','accommodation')),
  destination_str         text,
  destination_country_raw text,           -- pre-normalisation value, kept for debugging
  destination_country     text,           -- ISO-2 after normalisation, null if unknown
  price_cents             int,
  departure_date          date,
  transport_type          text,           -- 'Flight'|'Bus'|'By own means'|null
  accommodation_name      text,
  lat                     numeric,
  lon                     numeric,
  image_url               text,
  provider                text,
  deeplink                text
);

create index staging_batch_idx on staging_offers(batch_id);

-- ------------------------------------------------------------------ offers  (live, resolved)
create table offers (
  id                  bigserial primary key,
  source_id           text references sources(id),
  destination_id      text references destinations(id),
  product_type        text not null check (product_type in ('package','accommodation')),
  accommodation_name  text,
  price_cents         int not null,
  departure_date      date,
  transport_type      text,
  provider            text,
  deeplink            text not null,
  image_url           text,              -- null → widget falls back to destinations.photo_url
  last_seen_at        timestamptz default now()
);

create index offers_destination_idx    on offers(destination_id);
create index offers_price_idx          on offers(price_cents);
create index offers_departure_idx      on offers(departure_date);
create index offers_source_idx         on offers(source_id);
create index offers_product_type_idx   on offers(product_type);

-- ------------------------------------------------------------------ unresolved
create table unresolved (
  destination_str  text,
  source_id        text references sources(id),
  occurrences      int default 1,
  first_seen_at    timestamptz default now(),
  sample_batch_id  bigint references raw_feeds(id),
  primary key (destination_str, source_id)
);

-- ------------------------------------------------------------------ clicks
create table clicks (
  id              bigserial primary key,
  session_id      text,
  destination_id  text references destinations(id),
  offer_id        bigint references offers(id),
  provider        text,
  clicked_at      timestamptz default now()
);

create index clicks_destination_idx on clicks(destination_id);
create index clicks_offer_idx       on clicks(offer_id);

-- ================================================================
-- MATCHING FUNCTION
-- Called from the API route; returns up to 3 scored destinations
-- with their cheapest valid offer.
--
-- Scoring weights (total ≤ 100):
--   season     30
--   audience   25
--   budget     20
--   transport  16
--   motive     20  (capped at 20; each matching motive = +7)
-- ================================================================
create or replace function match_offers(
  p_month          int,          -- 1..12; the month the user wants to travel
  p_budget_cents   int,          -- user's max budget
  p_transport      text[],       -- e.g. ['flight','car']
  p_audiences      text[],       -- e.g. ['family','couple']
  p_motives        text[]        -- e.g. ['beach','nature']
)
returns table (
  destination_id    text,
  destination_name  text,
  country           text,
  blurb             text,
  friction          text,
  score             numeric,
  cheapest_cents    int,
  offer_id          bigint,
  image_url         text,
  image_is_fallback boolean,
  departure_date    date,
  accommodation_name text,
  transport_type    text,
  deeplink          text,
  provider          text
)
language sql
stable
as $$
  with

  -- 1. Best offer per destination (cheapest within budget, valid dates)
  best_offers as (
    select distinct on (o.destination_id)
      o.id                as offer_id,
      o.destination_id,
      o.price_cents,
      o.departure_date,
      o.transport_type,
      o.accommodation_name,
      o.deeplink,
      o.provider,
      o.image_url,
      o.product_type,
      o.source_id
    from offers o
    where o.price_cents between 5000 and p_budget_cents
      and (
        (o.product_type = 'package'
          and o.departure_date is not null
          and date_part('month', o.departure_date) = p_month
          and o.departure_date between current_date and current_date + interval '18 months')
        or
        (o.product_type = 'accommodation')
      )
    order by o.destination_id, o.price_cents
  ),

  -- 2. For accommodation type: check month against destinations.months
  accommodation_month_ok as (
    select bo.destination_id
    from best_offers bo
    join destinations d on d.id = bo.destination_id
    where bo.product_type = 'accommodation'
      and to_char(make_date(2000, p_month, 1), 'Mon') = any(
        -- normalise months array to 3-char abbreviations for comparison
        select upper(left(m, 3)) from unnest(d.months) m
      )
  ),

  -- 3. Score each destination
  scored as (
    select
      d.id,
      d.name,
      d.country,
      d.blurb,
      d.friction,
      bo.offer_id,
      bo.price_cents,
      bo.departure_date,
      bo.transport_type    as offer_transport,
      bo.accommodation_name,
      bo.deeplink,
      bo.provider,
      bo.image_url         as offer_image,
      bo.product_type,

      -- season score (30 pts): package uses departure_date month (already filtered),
      -- accommodation uses destinations.months
      case
        when bo.product_type = 'package' then 30
        when bo.destination_id in (select destination_id from accommodation_month_ok) then 30
        else 0
      end as score_season,

      -- audience score (25 pts): 25 * (overlap / user_count), min 0
      case
        when array_length(p_audiences, 1) = 0 then 12  -- no preference → neutral
        else least(25, 25 * (
          select count(*)::numeric
          from unnest(p_audiences) ua
          where ua = any(d.audiences)
        ) / greatest(array_length(p_audiences, 1), 1))
      end as score_audience,

      -- budget score (20 pts): cheaper relative to budget = higher score
      case
        when p_budget_cents <= 0 then 0
        else greatest(0, round(20.0 * (1 - bo.price_cents::numeric / p_budget_cents)))
      end as score_budget,

      -- transport score (16 pts)
      case
        when array_length(p_transport, 1) = 0 then 8  -- no preference → neutral
        -- if offer has explicit transport_type, match against it
        when bo.transport_type is not null and
             lower(bo.transport_type) = any(p_transport) then 16
        when bo.transport_type is not null then 0
        -- fallback: match against destinations.transport register
        when exists (
          select 1 from unnest(p_transport) ut
          where ut = any(d.transport)
        ) then 16
        else 0
      end as score_transport,

      -- motive score (up to 20 pts, 7 pts per matching motive)
      least(20, 7 * (
        select count(*)::int
        from unnest(p_motives) um
        where um = any(d.motives)
      )) as score_motive

    from best_offers bo
    join destinations d on d.id = bo.destination_id
    where d.active = true
  ),

  -- 4. Sum scores, filter season=0 (wrong time of year) only when season data is reliable
  ranked as (
    select *,
      (score_season + score_audience + score_budget + score_transport + score_motive)
        as total_score
    from scored
    where score_season > 0   -- must be the right season
    order by total_score desc
    limit 3
  )

  select
    r.id                                    as destination_id,
    r.name                                  as destination_name,
    r.country,
    r.blurb,
    r.friction,
    r.total_score                           as score,
    r.price_cents                           as cheapest_cents,
    r.offer_id,
    coalesce(r.offer_image, d2.photo_url)   as image_url,
    (r.offer_image is null)                 as image_is_fallback,
    r.departure_date,
    r.accommodation_name,
    r.offer_transport                       as transport_type,
    r.deeplink,
    r.provider
  from ranked r
  join destinations d2 on d2.id = r.id
  order by r.total_score desc
$$;

-- ------------------------------------------------------------------ helper: upsert alias
create or replace function upsert_alias(
  p_alias       text,
  p_destination text,
  p_source      text,
  p_confidence  numeric
) returns void language sql as $$
  insert into destination_aliases (alias, destination, source, confidence)
  values (p_alias, p_destination, p_source, p_confidence)
  on conflict (alias) do update
    set confidence = greatest(destination_aliases.confidence, excluded.confidence),
        destination = case
          when excluded.confidence > destination_aliases.confidence
          then excluded.destination
          else destination_aliases.destination
        end;
$$;

-- ------------------------------------------------------------------ helper: update photo coverage
create or replace function update_photo_coverage(p_source_id text)
returns void language sql as $$
  update sources
  set photo_coverage_pct = (
    select round(
      100.0 * count(*) filter (where image_url is not null and image_url <> '')
      / nullif(count(*), 0),
      1
    )
    from offers
    where source_id = p_source_id
  )
  where id = p_source_id;
$$;
