alter table public.competitive_seasons
alter column ends_at drop not null;

alter table public.competitive_seasons
drop constraint if exists competitive_seasons_check;

alter table public.competitive_seasons
drop constraint if exists competitive_seasons_valid_range;

alter table public.competitive_seasons
add constraint competitive_seasons_valid_range
check (ends_at is null or starts_at < ends_at);

insert into public.competitive_seasons (
  id,
  year,
  season_number,
  display_name,
  starts_at,
  ends_at
)
values
  -- 2026-06-17 03:00 KST. End date is unknown until Blizzard announces it.
  (
    '2026-s3',
    2026,
    3,
    '2026년 3시즌',
    '2026-06-16 18:00:00+00',
    null
  )
on conflict (id) do update
set
  year = excluded.year,
  season_number = excluded.season_number,
  display_name = excluded.display_name,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  updated_at = now();

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
    and (
      competitive_seasons.ends_at is null
      or p_played_at < competitive_seasons.ends_at
    )
  order by competitive_seasons.starts_at desc
  limit 1;
$$;

update public.matches
set competitive_season_id = public.resolve_competitive_season_id(played_at)
where competitive_season_id is distinct from public.resolve_competitive_season_id(played_at);
