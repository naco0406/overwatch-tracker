drop table if exists pg_temp.service_account_may_match_verification;

create temporary table service_account_may_match_verification as
with params as (
  select
    '529b1b50-adf5-4cac-9728-d3fd6dfd74b4'::uuid as target_user_id,
    'de2ae1b2-1d82-400b-a2c3-97d27a5caabf'::uuid as target_account_id,
    'overwatch-tracker-service-account-match-seed-v1'::text as seed_namespace
),
expected_seed (
  seed_order,
  play_date,
  day_match_no,
  mode_id,
  mode_label,
  map_id,
  map_label,
  team_score,
  enemy_score,
  result
) as (
  values
    (1, '2026-05-21'::date, 1, 'push'::public.mode_id, '밀기', 'colosseo', '콜로세오', 0::smallint, 1::smallint, 'loss'::public.match_result),
    (2, '2026-05-21'::date, 2, 'hybrid'::public.mode_id, '혼합', 'eichenwalde', '아이헨발데', 3::smallint, 2::smallint, 'win'::public.match_result),
    (3, '2026-05-21'::date, 3, 'hybrid'::public.mode_id, '혼합', 'blizzard-world', '블리자드 월드', 3::smallint, 0::smallint, 'win'::public.match_result),
    (4, '2026-05-21'::date, 4, 'flashpoint'::public.mode_id, '플래시 포인트', 'new-junk-city', '뉴 정크 시티', 1::smallint, 3::smallint, 'loss'::public.match_result),
    (5, '2026-05-21'::date, 5, 'control'::public.mode_id, '쟁탈', 'busan', '부산', 0::smallint, 2::smallint, 'loss'::public.match_result),
    (6, '2026-05-21'::date, 6, 'control'::public.mode_id, '쟁탈', 'samoa', '사모아', 2::smallint, 0::smallint, 'win'::public.match_result),
    (7, '2026-05-23'::date, 1, 'hybrid'::public.mode_id, '혼합', 'kings-row', '왕의 길', 4::smallint, 5::smallint, 'loss'::public.match_result),
    (8, '2026-05-23'::date, 2, 'control'::public.mode_id, '쟁탈', 'busan', '부산', 0::smallint, 2::smallint, 'loss'::public.match_result),
    (9, '2026-05-23'::date, 3, 'push'::public.mode_id, '밀기', 'runasapi', '루나사피', 0::smallint, 1::smallint, 'loss'::public.match_result),
    (10, '2026-05-23'::date, 4, 'control'::public.mode_id, '쟁탈', 'ilios', '일리오스', 2::smallint, 0::smallint, 'win'::public.match_result),
    (11, '2026-05-23'::date, 5, 'flashpoint'::public.mode_id, '플래시 포인트', 'new-junk-city', '뉴 정크 시티', 3::smallint, 2::smallint, 'win'::public.match_result),
    (12, '2026-05-23'::date, 6, 'control'::public.mode_id, '쟁탈', 'oasis', '오아시스', 0::smallint, 2::smallint, 'loss'::public.match_result),
    (13, '2026-05-23'::date, 7, 'push'::public.mode_id, '밀기', 'colosseo', '콜로세오', 1::smallint, 0::smallint, 'win'::public.match_result),
    (14, '2026-05-23'::date, 8, 'escort'::public.mode_id, '화물', 'shambali-monastery', '샴발리 수도원', 3::smallint, 0::smallint, 'win'::public.match_result)
),
expected_rows as (
  select
    md5(
      concat_ws(
        ':',
        params.seed_namespace,
        params.target_user_id::text,
        params.target_account_id::text,
        expected_seed.seed_order::text
      )
    )::uuid as expected_match_id,
    params.target_user_id,
    params.target_account_id,
    expected_seed.seed_order,
    expected_seed.play_date,
    expected_seed.day_match_no,
    case
      when expected_seed.play_date = '2026-05-21'::date then 'session_20260520150000_seed0521'
      when expected_seed.play_date = '2026-05-23'::date then 'session_20260522150000_seed0523'
    end as expected_session_id,
    (expected_seed.play_date::timestamp at time zone 'Asia/Seoul')
      + ((expected_seed.day_match_no - 1) * interval '20 minutes') as expected_played_at,
    expected_seed.mode_id,
    expected_seed.mode_label,
    expected_seed.map_id,
    expected_seed.map_label,
    expected_seed.team_score,
    expected_seed.enemy_score,
    expected_seed.result
  from expected_seed
  cross join params
)
select
  expected_rows.seed_order,
  expected_rows.expected_match_id,
  expected_rows.target_user_id,
  user_profiles.nickname,
  expected_rows.target_account_id,
  player_accounts.battle_tag,
  player_accounts.display_name,
  player_accounts.is_main,
  coalesce(user_settings.default_match_role, 'damage'::public.match_role) as expected_match_role,
  expected_rows.play_date,
  expected_rows.day_match_no,
  expected_rows.expected_session_id,
  matches.session_id as actual_session_id,
  expected_rows.expected_played_at,
  matches.played_at as actual_played_at,
  expected_rows.expected_played_at at time zone 'Asia/Seoul' as expected_played_at_kst,
  matches.played_at at time zone 'Asia/Seoul' as actual_played_at_kst,
  expected_rows.mode_label,
  expected_rows.mode_id as expected_mode_id,
  matches.mode_id as actual_mode_id,
  expected_rows.map_label,
  expected_rows.map_id as expected_map_id,
  matches.map_id as actual_map_id,
  expected_rows.team_score as expected_team_score,
  matches.team_score as actual_team_score,
  expected_rows.enemy_score as expected_enemy_score,
  matches.enemy_score as actual_enemy_score,
  expected_rows.result as expected_result,
  matches.result as actual_result,
  'solo'::public.queue_type as expected_queue_type,
  matches.queue_type as actual_queue_type,
  matches.match_role as actual_match_role,
  matches.account_id as actual_account_id,
  matches.account as actual_account_type,
  matches.source as actual_source,
  matches.created_at,
  matches.updated_at,
  case
    when player_accounts.id is null then 'missing_account'
    when matches.id is null then 'missing_match'
    when matches.user_id is distinct from expected_rows.target_user_id then 'wrong_user'
    when matches.account_id is distinct from expected_rows.target_account_id then 'wrong_account'
    when matches.played_at is distinct from expected_rows.expected_played_at then 'wrong_played_at'
    when matches.session_id is distinct from expected_rows.expected_session_id then 'wrong_session'
    when matches.mode_id is distinct from expected_rows.mode_id then 'wrong_mode'
    when matches.map_id is distinct from expected_rows.map_id then 'wrong_map'
    when matches.team_score is distinct from expected_rows.team_score then 'wrong_team_score'
    when matches.enemy_score is distinct from expected_rows.enemy_score then 'wrong_enemy_score'
    when matches.result is distinct from expected_rows.result then 'wrong_result'
    when matches.queue_type is distinct from 'solo'::public.queue_type then 'wrong_queue'
    when matches.match_role is distinct from coalesce(user_settings.default_match_role, 'damage'::public.match_role) then 'wrong_role'
    else 'ok'
  end as verification_status
from expected_rows
left join public.user_profiles
  on user_profiles.user_id = expected_rows.target_user_id
left join public.player_accounts
  on player_accounts.id = expected_rows.target_account_id
  and player_accounts.user_id = expected_rows.target_user_id
left join public.user_settings
  on user_settings.user_id = expected_rows.target_user_id
left join public.matches
  on matches.id = expected_rows.expected_match_id;

select
  nickname,
  target_user_id as user_id,
  target_account_id as account_id,
  battle_tag,
  display_name,
  is_main,
  expected_match_role,
  count(*) as expected_rows,
  count(*) filter (where verification_status = 'ok') as ok_rows,
  count(*) filter (where verification_status <> 'ok') as problem_rows,
  min(actual_played_at_kst) as first_actual_played_at_kst,
  max(actual_played_at_kst) as last_actual_played_at_kst,
  count(distinct actual_session_id) filter (where actual_session_id is not null) as actual_sessions,
  count(*) filter (where actual_result = 'win') as wins,
  count(*) filter (where actual_result = 'loss') as losses,
  count(*) filter (where actual_result = 'draw') as draws,
  jsonb_object_agg(verification_status, status_count order by verification_status) as status_counts
from (
  select
    *,
    count(*) over (partition by verification_status) as status_count
  from service_account_may_match_verification
) verification
group by
  nickname,
  target_user_id,
  target_account_id,
  battle_tag,
  display_name,
  is_main,
  expected_match_role;

select
  seed_order,
  nickname,
  battle_tag,
  display_name,
  play_date,
  day_match_no,
  verification_status,
  actual_played_at_kst,
  actual_session_id,
  mode_label,
  map_label,
  actual_team_score || '-' || actual_enemy_score as actual_score,
  actual_result,
  actual_queue_type,
  actual_match_role,
  expected_match_id
from service_account_may_match_verification
order by seed_order;

drop table service_account_may_match_verification;
