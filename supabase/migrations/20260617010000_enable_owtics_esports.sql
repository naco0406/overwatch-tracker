insert into public.external_sources (
  id,
  display_name,
  base_url,
  source_type,
  is_enabled,
  is_official,
  default_ttl_seconds,
  notes
)
values (
  'owtics',
  'OWTICS.GG',
  'https://owtics.gg',
  'third_party_web',
  true,
  false,
  21600,
  'Supplemental esports schedule and match-detail source for global Overwatch events.'
)
on conflict (id) do update set
  display_name = excluded.display_name,
  base_url = excluded.base_url,
  source_type = excluded.source_type,
  is_enabled = true,
  is_official = excluded.is_official,
  default_ttl_seconds = excluded.default_ttl_seconds,
  notes = excluded.notes,
  updated_at = now();
