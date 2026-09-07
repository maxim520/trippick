-- ============================================================
-- Migratie 004 — Corendon (TradeTracker) als vijfde bron
-- ============================================================

-- Nieuwe bron: coordinates + departure_date aanwezig, geen apart transport-veld
-- (flightIncluded=true/false wordt door de parser vertaald naar transport_type='Flight')
insert into sources (id, network, has_coordinates, has_departure_date, has_transport_type)
values ('tradetracker-corendon', 'tradetracker', true, true, true)
on conflict (id) do nothing;

-- Voeg departure_airport toe aan staging_offers voor audit/debugging.
-- Alleen Corendon vult dit via iataDeparture; overige bronnen laten het null.
alter table staging_offers
  add column if not exists departure_airport text;
