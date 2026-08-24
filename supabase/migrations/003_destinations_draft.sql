-- ============================================================
-- destinations_draft — staging area for operator review
-- Populated by scripts/ingest/generate-destination-drafts.ts
-- Promoted to destinations only after manual approval.
-- ============================================================

create table if not exists destinations_draft (
  destination_str   text primary key,   -- raw string from feeds (e.g. "Kreta - Heraklion")
  suggested_id      text,               -- proposed slug (e.g. "kreta")
  suggested_name    text,               -- proposed display name
  suggested_country text,               -- ISO-2
  suggested_months  text[],             -- e.g. '{"Apr","May","Jun","Jul","Aug","Sep","Oct"}'
  suggested_audiences text[],
  suggested_motives   text[],
  suggested_friction  text,
  suggested_photo_url text,
  occurrence_count  int,               -- how often this string appeared in the batch
  approved          boolean default false,
  approved_at       timestamptz,
  notes             text,              -- operator can annotate before approve
  created_at        timestamptz default now()
);

comment on table destinations_draft is
  'Operator review staging for new destinations. '
  'Approve rows here before inserting into destinations.';
