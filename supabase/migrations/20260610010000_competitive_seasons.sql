create table if not exists public.competitive_seasons (
  id text primary key,
  year smallint not null check (year >= 2026),
  season_number smallint not null check (season_number > 0),
  display_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, season_number),
  check (starts_at < ends_at)
);

insert into public.competitive_seasons (
  id,
  year,
  season_number,
  display_name,
  starts_at,
  ends_at
)
values
  -- Boundaries are stored in UTC. These correspond to KST 03:00 season rollovers.
  (
    '2026-s1',
    2026,
    1,
    '2026년 1시즌',
    '2026-02-10 18:00:00+00',
    '2026-04-14 18:00:00+00'
  ),
  (
    '2026-s2',
    2026,
    2,
    '2026년 2시즌',
    '2026-04-14 18:00:00+00',
    '2026-06-16 18:00:00+00'
  )
on conflict (id) do update
set
  year = excluded.year,
  season_number = excluded.season_number,
  display_name = excluded.display_name,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  updated_at = now();

alter table public.matches
add column if not exists competitive_season_id text references public.competitive_seasons(id);

create index if not exists matches_user_competitive_season_played_at_idx
on public.matches (user_id, competitive_season_id, played_at desc);

create or replace function public.resolve_competitive_season_id(p_played_at timestamptz)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select competitive_seasons.id
  from public.competitive_seasons
  where p_played_at >= competitive_seasons.starts_at
    and p_played_at < competitive_seasons.ends_at
  order by competitive_seasons.starts_at desc
  limit 1;
$$;

create or replace function public.set_match_competitive_season_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.competitive_season_id := public.resolve_competitive_season_id(new.played_at);
  elsif new.played_at is distinct from old.played_at
    or new.competitive_season_id is null
  then
    new.competitive_season_id := public.resolve_competitive_season_id(new.played_at);
  end if;

  return new;
end;
$$;

drop trigger if exists set_match_competitive_season_id on public.matches;
create trigger set_match_competitive_season_id
before insert or update of played_at, competitive_season_id on public.matches
for each row execute function public.set_match_competitive_season_id();

update public.matches
set competitive_season_id = public.resolve_competitive_season_id(played_at)
where competitive_season_id is null
  or competitive_season_id is distinct from public.resolve_competitive_season_id(played_at);

drop trigger if exists set_competitive_seasons_updated_at on public.competitive_seasons;
create trigger set_competitive_seasons_updated_at
before update on public.competitive_seasons
for each row execute function public.set_updated_at();

alter table public.competitive_seasons enable row level security;

grant select on public.competitive_seasons to authenticated;
grant execute on function public.resolve_competitive_season_id(timestamptz) to authenticated;

drop policy if exists "competitive_seasons_select_all" on public.competitive_seasons;
create policy "competitive_seasons_select_all"
on public.competitive_seasons for select
to authenticated
using (true);
