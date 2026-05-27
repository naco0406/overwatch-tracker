create extension if not exists pgcrypto;

do $$
begin
  create type public.match_result as enum ('win', 'loss', 'draw');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_source as enum ('ocr', 'manual', 'mixed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.queue_type as enum ('solo', 'duo', 'trio', 'quad', 'five');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.account_type as enum ('main', 'sub');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.mode_id as enum ('control', 'hybrid', 'push', 'escort', 'flashpoint', 'clash');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  played_at timestamptz not null default now(),
  session_id text not null,
  mode_id public.mode_id not null,
  map_id text not null,
  result public.match_result not null,
  team_score smallint not null check (team_score >= 0 and team_score <= 10),
  enemy_score smallint not null check (enemy_score >= 0 and enemy_score <= 10),
  account public.account_type not null default 'main',
  queue_type public.queue_type not null default 'solo',
  team_comp jsonb,
  tags text[] not null default '{}',
  memo text not null default '',
  source public.match_source not null default 'manual',
  ocr_confidence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.match_heroes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  user_id uuid not null,
  hero_id text not null,
  order_index smallint not null default 0,
  source public.match_source not null default 'manual',
  created_at timestamptz not null default now(),
  foreign key (match_id, user_id)
    references public.matches(id, user_id)
    on delete cascade,
  unique (match_id, hero_id)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_account public.account_type not null default 'main',
  default_queue_type public.queue_type not null default 'solo',
  roi_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists matches_user_played_at_idx
on public.matches (user_id, played_at desc);

create index if not exists matches_user_mode_played_at_idx
on public.matches (user_id, mode_id, played_at desc);

create index if not exists matches_user_map_played_at_idx
on public.matches (user_id, map_id, played_at desc);

create index if not exists match_heroes_user_hero_idx
on public.match_heroes (user_id, hero_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_matches_updated_at on public.matches;
create trigger set_matches_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.matches enable row level security;
alter table public.match_heroes enable row level security;
alter table public.user_settings enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete
on public.matches, public.match_heroes, public.user_settings
to authenticated;

drop policy if exists "matches_select_own" on public.matches;
create policy "matches_select_own"
on public.matches for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "matches_insert_own" on public.matches;
create policy "matches_insert_own"
on public.matches for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "matches_update_own" on public.matches;
create policy "matches_update_own"
on public.matches for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "matches_delete_own" on public.matches;
create policy "matches_delete_own"
on public.matches for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "match_heroes_select_own" on public.match_heroes;
create policy "match_heroes_select_own"
on public.match_heroes for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "match_heroes_insert_own" on public.match_heroes;
create policy "match_heroes_insert_own"
on public.match_heroes for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "match_heroes_update_own" on public.match_heroes;
create policy "match_heroes_update_own"
on public.match_heroes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "match_heroes_delete_own" on public.match_heroes;
create policy "match_heroes_delete_own"
on public.match_heroes for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
on public.user_settings for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
on public.user_settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
on public.user_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_delete_own"
on public.user_settings for delete
to authenticated
using ((select auth.uid()) = user_id);
