-- ============================================================
-- Migratie 010 — image_url_cache
--
-- Sla het resultaat van HEAD-checks op zodat elke URL slechts
-- éénmaal per unieke URL wordt gecheckt over meerdere ingest-runs.
-- De check-images stap schrijft hier resultaten naar en leest ze
-- terug bij de volgende run om onnodige hercheck te voorkomen.
-- ============================================================

create table image_url_cache (
  url         text        primary key,
  ok          boolean     not null,
  checked_at  timestamptz not null default now()
);

comment on table image_url_cache is
  'Persistente cache van HEAD-check resultaten per image URL. ok=false betekent dat de URL '
  'hotlink-geblokkeerd, verwijderd of onbereikbaar was en image_url in staging_offers/offers '
  'op NULL is gezet.';

create index image_url_cache_ok_idx on image_url_cache(ok);
