create temporary table service_account_may_match_seed (
  seed_order integer primary key,
  play_date date not null,
  day_match_no integer not null,
  session_id text not null,
  mode_id public.mode_id not null,
  map_id text not null,
  team_score smallint not null,
  enemy_score smallint not null,
  result public.match_result not null
) on commit drop;

insert into service_account_may_match_seed (
  seed_order,
  play_date,
  day_match_no,
  session_id,
  mode_id,
  map_id,
  team_score,
  enemy_score,
  result
)
values
  (1, '2026-05-21', 1, 'session_20260520150000_seed0521', 'push', 'colosseo', 0, 1, 'loss'),
  (2, '2026-05-21', 2, 'session_20260520150000_seed0521', 'hybrid', 'eichenwalde', 3, 2, 'win'),
  (3, '2026-05-21', 3, 'session_20260520150000_seed0521', 'hybrid', 'blizzard-world', 3, 0, 'win'),
  (4, '2026-05-21', 4, 'session_20260520150000_seed0521', 'flashpoint', 'new-junk-city', 1, 3, 'loss'),
  (5, '2026-05-21', 5, 'session_20260520150000_seed0521', 'control', 'busan', 0, 2, 'loss'),
  (6, '2026-05-21', 6, 'session_20260520150000_seed0521', 'control', 'samoa', 2, 0, 'win'),
  (7, '2026-05-23', 1, 'session_20260522150000_seed0523', 'hybrid', 'kings-row', 4, 5, 'loss'),
  (8, '2026-05-23', 2, 'session_20260522150000_seed0523', 'control', 'busan', 0, 2, 'loss'),
  (9, '2026-05-23', 3, 'session_20260522150000_seed0523', 'push', 'runasapi', 0, 1, 'loss'),
  (10, '2026-05-23', 4, 'session_20260522150000_seed0523', 'control', 'ilios', 2, 0, 'win'),
  (11, '2026-05-23', 5, 'session_20260522150000_seed0523', 'flashpoint', 'new-junk-city', 3, 2, 'win'),
  (12, '2026-05-23', 6, 'session_20260522150000_seed0523', 'control', 'oasis', 0, 2, 'loss'),
  (13, '2026-05-23', 7, 'session_20260522150000_seed0523', 'push', 'colosseo', 1, 0, 'win'),
  (14, '2026-05-23', 8, 'session_20260522150000_seed0523', 'escort', 'shambali-monastery', 3, 0, 'win');

do $$
declare
  target_user_id constant uuid := '529b1b50-adf5-4cac-9728-d3fd6dfd74b4';
  target_account_id constant uuid := 'de2ae1b2-1d82-400b-a2c3-97d27a5caabf';
begin
  if not exists (
    select 1
    from public.player_accounts
    where id = target_account_id
      and user_id = target_user_id
  ) then
    raise exception
      'Player account % does not belong to user %.',
      target_account_id,
      target_user_id;
  end if;
end $$;

with seed_rows as (
  select
    md5(
      concat_ws(
        ':',
        'overwatch-tracker-service-account-match-seed-v1',
        '529b1b50-adf5-4cac-9728-d3fd6dfd74b4',
        'de2ae1b2-1d82-400b-a2c3-97d27a5caabf',
        seed_order::text
      )
    )::uuid as id
  from service_account_may_match_seed
)
delete from public.match_heroes
using seed_rows
where match_heroes.match_id = seed_rows.id
  and match_heroes.user_id = '529b1b50-adf5-4cac-9728-d3fd6dfd74b4';

with target_account as (
  select
    player_accounts.id,
    player_accounts.user_id,
    case
      when player_accounts.is_main then 'main'::public.account_type
      else 'sub'::public.account_type
    end as account_type,
    coalesce(user_settings.default_match_role, 'damage'::public.match_role) as match_role
  from public.player_accounts
  left join public.user_settings
    on user_settings.user_id = player_accounts.user_id
  where player_accounts.id = 'de2ae1b2-1d82-400b-a2c3-97d27a5caabf'
    and player_accounts.user_id = '529b1b50-adf5-4cac-9728-d3fd6dfd74b4'
),
seed_rows as (
  select
    md5(
      concat_ws(
        ':',
        'overwatch-tracker-service-account-match-seed-v1',
        '529b1b50-adf5-4cac-9728-d3fd6dfd74b4',
        'de2ae1b2-1d82-400b-a2c3-97d27a5caabf',
        seed_order::text
      )
    )::uuid as id,
    (play_date::timestamp at time zone 'Asia/Seoul')
      + ((day_match_no - 1) * interval '20 minutes') as played_at,
    session_id,
    mode_id,
    map_id,
    team_score,
    enemy_score,
    result
  from service_account_may_match_seed
)
insert into public.matches (
  id,
  user_id,
  played_at,
  session_id,
  mode_id,
  map_id,
  result,
  team_score,
  enemy_score,
  account,
  account_id,
  queue_type,
  match_role,
  team_comp,
  tags,
  memo,
  source,
  ocr_confidence
)
select
  seed_rows.id,
  target_account.user_id,
  seed_rows.played_at,
  seed_rows.session_id,
  seed_rows.mode_id,
  seed_rows.map_id,
  seed_rows.result,
  seed_rows.team_score,
  seed_rows.enemy_score,
  target_account.account_type,
  target_account.id,
  'solo'::public.queue_type,
  target_account.match_role,
  null::jsonb,
  '{}'::text[],
  '',
  'manual'::public.match_source,
  null::jsonb
from seed_rows
cross join target_account
on conflict (id) do update
set
  user_id = excluded.user_id,
  played_at = excluded.played_at,
  session_id = excluded.session_id,
  mode_id = excluded.mode_id,
  map_id = excluded.map_id,
  result = excluded.result,
  team_score = excluded.team_score,
  enemy_score = excluded.enemy_score,
  account = excluded.account,
  account_id = excluded.account_id,
  queue_type = excluded.queue_type,
  match_role = excluded.match_role,
  team_comp = excluded.team_comp,
  tags = excluded.tags,
  memo = excluded.memo,
  source = excluded.source,
  ocr_confidence = excluded.ocr_confidence;

drop table service_account_may_match_seed;
