create table if not exists public.external_sources (
  id text primary key,
  display_name text not null,
  base_url text not null,
  source_type text not null,
  is_enabled boolean not null default true,
  is_official boolean not null default false,
  default_ttl_seconds integer not null default 3600,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id ~ '^[a-z0-9_]+$'),
  check (base_url ~ '^https://'),
  check (source_type in ('official_api', 'official_web', 'third_party_api', 'third_party_web')),
  check (default_ttl_seconds >= 60)
);

drop trigger if exists set_external_sources_updated_at on public.external_sources;
create trigger set_external_sources_updated_at
before update on public.external_sources
for each row execute function public.set_updated_at();

create table if not exists public.external_fetch_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.external_sources(id),
  job_key text not null,
  request_url text not null default '',
  status text not null,
  http_status integer,
  cache_status text not null default 'miss',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  check (status in ('success', 'stale', 'not_found', 'rate_limited', 'source_error', 'parse_error', 'blocked')),
  check (cache_status in ('hit', 'miss', 'stale', 'refresh')),
  check (http_status is null or (http_status >= 100 and http_status <= 599))
);

create index if not exists external_fetch_runs_source_started_idx
on public.external_fetch_runs (source_id, started_at desc);

create index if not exists external_fetch_runs_job_started_idx
on public.external_fetch_runs (job_key, started_at desc);

create table if not exists public.external_player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.player_accounts(id) on delete cascade,
  source_id text not null references public.external_sources(id),
  external_player_id text not null,
  public_name text not null default '',
  avatar_url text,
  namecard_url text,
  title text,
  is_public boolean,
  platform text,
  region text,
  competitive_ranks jsonb not null default '{}'::jsonb,
  raw_summary jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, source_id),
  check (avatar_url is null or avatar_url ~ '^https://'),
  check (namecard_url is null or namecard_url ~ '^https://'),
  check (platform is null or platform in ('pc', 'console', 'unknown')),
  check (region is null or region in ('americas', 'asia', 'europe', 'global', 'unknown'))
);

create index if not exists external_player_profiles_user_idx
on public.external_player_profiles (user_id, fetched_at desc);

create index if not exists external_player_profiles_external_player_idx
on public.external_player_profiles (source_id, external_player_id);

drop trigger if exists set_external_player_profiles_updated_at on public.external_player_profiles;
create trigger set_external_player_profiles_updated_at
before update on public.external_player_profiles
for each row execute function public.set_updated_at();

create table if not exists public.external_player_stats_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.player_accounts(id) on delete cascade,
  source_id text not null references public.external_sources(id),
  platform text not null default 'pc',
  gamemode text not null default 'competitive',
  general jsonb not null default '{}'::jsonb,
  roles jsonb not null default '{}'::jsonb,
  heroes jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  check (platform in ('pc', 'console', 'unknown')),
  check (gamemode in ('competitive', 'quickplay', 'all'))
);

create index if not exists external_player_stats_snapshots_account_idx
on public.external_player_stats_snapshots (user_id, account_id, source_id, fetched_at desc);

create table if not exists public.global_hero_rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.external_sources(id),
  patch_label text not null default '',
  region text not null default 'all',
  input_method text not null default 'mouse_keyboard',
  gamemode text not null default 'competitive',
  tier text not null default 'all',
  map_id text not null default 'all',
  role text not null default 'all',
  hero_id text not null,
  pick_rate numeric,
  win_rate numeric,
  sample_state text not null default 'available',
  fetched_at timestamptz not null default now(),
  check (pick_rate is null or (pick_rate >= 0 and pick_rate <= 100)),
  check (win_rate is null or (win_rate >= 0 and win_rate <= 100)),
  check (sample_state in ('available', 'low_sample', 'unavailable'))
);

create index if not exists global_hero_rate_snapshots_lookup_idx
on public.global_hero_rate_snapshots (
  source_id,
  region,
  input_method,
  gamemode,
  tier,
  map_id,
  role,
  fetched_at desc
);

create index if not exists global_hero_rate_snapshots_hero_idx
on public.global_hero_rate_snapshots (hero_id, fetched_at desc);

create table if not exists public.external_esports_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.external_sources(id),
  external_event_id text not null,
  series text not null default '',
  tournament text not null default '',
  stage text not null default '',
  region text not null default '',
  status text not null default 'scheduled',
  starts_at timestamptz,
  team_a text not null default '',
  team_b text not null default '',
  score_a integer,
  score_b integer,
  watch_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (source_id, external_event_id),
  check (status in ('scheduled', 'live', 'completed', 'postponed', 'canceled')),
  check (score_a is null or score_a >= 0),
  check (score_b is null or score_b >= 0)
);

create index if not exists external_esports_events_starts_idx
on public.external_esports_events (starts_at asc)
where starts_at is not null;

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
values
  (
    'blizzard_hero_rates',
    'Blizzard Hero Statistics',
    'https://overwatch.blizzard.com/en-us/rates/',
    'official_web',
    true,
    true,
    21600,
    'Official hero rate page. Use as low-frequency global meta source.'
  ),
  (
    'blizzard_heroes',
    'Blizzard Hero Pages',
    'https://overwatch.blizzard.com/en-us/heroes/',
    'official_web',
    true,
    true,
    86400,
    'Official roster source. Use for reviewed master-data diff only.'
  ),
  (
    'overfast',
    'OverFast API',
    'https://overfast-api.tekrop.fr',
    'third_party_api',
    true,
    false,
    3600,
    'Unofficial normalized Overwatch API. Use with cache and graceful degradation.'
  ),
  (
    'official_esports',
    'Official Overwatch Esports',
    'https://esports.overwatch.com',
    'official_web',
    true,
    true,
    21600,
    'Official esports schedule and broadcast reference.'
  ),
  (
    'owtics',
    'OWTICS.GG',
    'https://owtics.gg',
    'third_party_web',
    false,
    false,
    21600,
    'Supplemental esports/meta reference. Do not make core dependency without permission/API confirmation.'
  ),
  (
    'tracker_gg',
    'Tracker.gg',
    'https://tracker.gg',
    'third_party_api',
    false,
    false,
    86400,
    'Requires approved API key before use. Do not crawl.'
  )
on conflict (id) do update
set
  display_name = excluded.display_name,
  base_url = excluded.base_url,
  source_type = excluded.source_type,
  is_enabled = excluded.is_enabled,
  is_official = excluded.is_official,
  default_ttl_seconds = excluded.default_ttl_seconds,
  notes = excluded.notes,
  updated_at = now();

alter table public.external_sources enable row level security;
alter table public.external_fetch_runs enable row level security;
alter table public.external_player_profiles enable row level security;
alter table public.external_player_stats_snapshots enable row level security;
alter table public.global_hero_rate_snapshots enable row level security;
alter table public.external_esports_events enable row level security;

grant select
on public.external_sources, public.global_hero_rate_snapshots, public.external_esports_events
to anon, authenticated;

grant select, insert, update, delete
on public.external_player_profiles, public.external_player_stats_snapshots
to authenticated;

drop policy if exists "external_sources_select_enabled" on public.external_sources;
create policy "external_sources_select_enabled"
on public.external_sources for select
to anon, authenticated
using (is_enabled);

drop policy if exists "global_hero_rate_snapshots_select_available" on public.global_hero_rate_snapshots;
create policy "global_hero_rate_snapshots_select_available"
on public.global_hero_rate_snapshots for select
to anon, authenticated
using (
  exists (
    select 1
    from public.external_sources
    where external_sources.id = global_hero_rate_snapshots.source_id
      and external_sources.is_enabled
  )
);

drop policy if exists "external_esports_events_select_enabled" on public.external_esports_events;
create policy "external_esports_events_select_enabled"
on public.external_esports_events for select
to anon, authenticated
using (
  exists (
    select 1
    from public.external_sources
    where external_sources.id = external_esports_events.source_id
      and external_sources.is_enabled
  )
);

drop policy if exists "external_player_profiles_select_own" on public.external_player_profiles;
create policy "external_player_profiles_select_own"
on public.external_player_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "external_player_profiles_insert_own" on public.external_player_profiles;
create policy "external_player_profiles_insert_own"
on public.external_player_profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "external_player_profiles_update_own" on public.external_player_profiles;
create policy "external_player_profiles_update_own"
on public.external_player_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "external_player_profiles_delete_own" on public.external_player_profiles;
create policy "external_player_profiles_delete_own"
on public.external_player_profiles for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "external_player_stats_snapshots_select_own" on public.external_player_stats_snapshots;
create policy "external_player_stats_snapshots_select_own"
on public.external_player_stats_snapshots for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "external_player_stats_snapshots_insert_own" on public.external_player_stats_snapshots;
create policy "external_player_stats_snapshots_insert_own"
on public.external_player_stats_snapshots for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "external_player_stats_snapshots_update_own" on public.external_player_stats_snapshots;
create policy "external_player_stats_snapshots_update_own"
on public.external_player_stats_snapshots for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "external_player_stats_snapshots_delete_own" on public.external_player_stats_snapshots;
create policy "external_player_stats_snapshots_delete_own"
on public.external_player_stats_snapshots for delete
to authenticated
using ((select auth.uid()) = user_id);
