-- Ontbrekende landcodes gesignaleerd tijdens eerste Corendon-ingest
insert into country_code_map (raw_value, iso2) values
  ('Kaapverdië',  'CV'),
  ('Kaapverdie',  'CV'),
  ('Gambia',      'GM'),
  ('Argentinië',  'AR'),
  ('Argentinie',  'AR'),
  ('Bonaire',     'BQ')
on conflict (raw_value) do nothing;
