drop function if exists public.list_friends();
drop function if exists public.get_friend_stats(uuid);

create or replace function public.list_friends()
returns table (
  friend_id uuid,
  nickname text,
  avatar_url text,
  friends_since timestamptz,
  total_matches int,
  wins int,
  losses int,
  draws int,
  win_rate numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  return query
  with friend_rows as (
    select
      case
        when friendships.user_low_id = v_user_id then friendships.user_high_id
        else friendships.user_low_id
      end as friend_id,
      friendships.created_at as friends_since
    from public.friendships
    where v_user_id in (friendships.user_low_id, friendships.user_high_id)
  )
  select
    friend_rows.friend_id,
    user_profiles.nickname,
    user_profiles.avatar_url,
    friend_rows.friends_since,
    count(matches.id)::int as total_matches,
    count(matches.id) filter (where matches.result = 'win')::int as wins,
    count(matches.id) filter (where matches.result = 'loss')::int as losses,
    count(matches.id) filter (where matches.result = 'draw')::int as draws,
    coalesce(
      round(
        100.0 * count(matches.id) filter (where matches.result = 'win')
        / nullif(count(matches.id), 0),
        1
      ),
      0
    ) as win_rate
  from friend_rows
  join public.user_profiles
    on user_profiles.user_id = friend_rows.friend_id
  left join public.matches
    on matches.user_id = friend_rows.friend_id
  group by
    friend_rows.friend_id,
    user_profiles.nickname,
    user_profiles.avatar_url,
    friend_rows.friends_since
  order by friend_rows.friends_since desc;
end;
$$;

create or replace function public.get_friend_stats(p_friend_id uuid)
returns table (
  profile jsonb,
  summary jsonb,
  modes jsonb,
  maps jsonb,
  heroes jsonb,
  recent_form jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_friend_id <> v_user_id and not public.are_friends(v_user_id, p_friend_id) then
    raise exception '친구의 요약 통계만 볼 수 있습니다.';
  end if;

  return query
  with base_matches as (
    select *
    from public.matches
    where matches.user_id = p_friend_id
  ),
  totals as (
    select
      count(*)::int as total_matches,
      count(*) filter (where result = 'win')::int as wins,
      count(*) filter (where result = 'loss')::int as losses,
      count(*) filter (where result = 'draw')::int as draws,
      coalesce(round(100.0 * count(*) filter (where result = 'win') / nullif(count(*), 0), 1), 0) as win_rate
    from base_matches
  ),
  mode_rows as (
    select
      mode_id::text as mode_id,
      count(*)::int as total_matches,
      count(*) filter (where result = 'win')::int as wins,
      count(*) filter (where result = 'loss')::int as losses,
      count(*) filter (where result = 'draw')::int as draws,
      coalesce(round(100.0 * count(*) filter (where result = 'win') / nullif(count(*), 0), 1), 0) as win_rate
    from base_matches
    group by mode_id
  ),
  map_rows as (
    select
      map_id,
      mode_id::text as mode_id,
      count(*)::int as total_matches,
      count(*) filter (where result = 'win')::int as wins,
      count(*) filter (where result = 'loss')::int as losses,
      count(*) filter (where result = 'draw')::int as draws,
      coalesce(round(100.0 * count(*) filter (where result = 'win') / nullif(count(*), 0), 1), 0) as win_rate
    from base_matches
    group by map_id, mode_id
  ),
  hero_rows as (
    select
      match_heroes.hero_id,
      count(*)::int as total_matches,
      count(*) filter (where base_matches.result = 'win')::int as wins,
      count(*) filter (where base_matches.result = 'loss')::int as losses,
      count(*) filter (where base_matches.result = 'draw')::int as draws,
      coalesce(round(100.0 * count(*) filter (where base_matches.result = 'win') / nullif(count(*), 0), 1), 0) as win_rate
    from base_matches
    join public.match_heroes
      on match_heroes.match_id = base_matches.id
      and match_heroes.user_id = base_matches.user_id
    group by match_heroes.hero_id
  ),
  recent_rows as (
    select
      base_matches.id,
      base_matches.created_at,
      base_matches.map_id,
      base_matches.mode_id::text as mode_id,
      base_matches.played_at,
      base_matches.result::text as result,
      coalesce(
        (
          select jsonb_agg(match_heroes.hero_id order by match_heroes.order_index asc, match_heroes.hero_id asc)
          from public.match_heroes
          where match_heroes.match_id = base_matches.id
            and match_heroes.user_id = base_matches.user_id
        ),
        '[]'::jsonb
      ) as hero_ids
    from base_matches
    order by played_at desc, created_at desc, id desc
    limit 12
  )
  select
    jsonb_build_object(
      'userId', user_profiles.user_id,
      'nickname', user_profiles.nickname,
      'avatarUrl', user_profiles.avatar_url
    ) as profile,
    jsonb_build_object(
      'totalMatches', totals.total_matches,
      'wins', totals.wins,
      'losses', totals.losses,
      'draws', totals.draws,
      'winRate', totals.win_rate,
      'bestModeId', (
        select mode_rows.mode_id
        from mode_rows
        order by mode_rows.win_rate desc, mode_rows.total_matches desc, mode_rows.mode_id asc
        limit 1
      ),
      'bestMapId', (
        select map_rows.map_id
        from map_rows
        order by map_rows.win_rate desc, map_rows.total_matches desc, map_rows.map_id asc
        limit 1
      ),
      'bestHeroId', (
        select hero_rows.hero_id
        from hero_rows
        order by hero_rows.total_matches desc, hero_rows.win_rate desc, hero_rows.hero_id asc
        limit 1
      )
    ) as summary,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'modeId', mode_rows.mode_id,
            'totalMatches', mode_rows.total_matches,
            'wins', mode_rows.wins,
            'losses', mode_rows.losses,
            'draws', mode_rows.draws,
            'winRate', mode_rows.win_rate
          )
          order by mode_rows.win_rate desc, mode_rows.total_matches desc, mode_rows.mode_id asc
        )
        from mode_rows
      ),
      '[]'::jsonb
    ) as modes,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'mapId', map_rows.map_id,
            'modeId', map_rows.mode_id,
            'totalMatches', map_rows.total_matches,
            'wins', map_rows.wins,
            'losses', map_rows.losses,
            'draws', map_rows.draws,
            'winRate', map_rows.win_rate
          )
          order by map_rows.win_rate desc, map_rows.total_matches desc, map_rows.map_id asc
        )
        from (
          select *
          from map_rows
          order by win_rate desc, total_matches desc, map_id asc
          limit 12
        ) as map_rows
      ),
      '[]'::jsonb
    ) as maps,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'heroId', hero_rows.hero_id,
            'totalMatches', hero_rows.total_matches,
            'wins', hero_rows.wins,
            'losses', hero_rows.losses,
            'draws', hero_rows.draws,
            'winRate', hero_rows.win_rate
          )
          order by hero_rows.total_matches desc, hero_rows.win_rate desc, hero_rows.hero_id asc
        )
        from (
          select *
          from hero_rows
          order by total_matches desc, win_rate desc, hero_id asc
          limit 12
        ) as hero_rows
      ),
      '[]'::jsonb
    ) as heroes,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'heroIds', recent_rows.hero_ids,
            'mapId', recent_rows.map_id,
            'modeId', recent_rows.mode_id,
            'playedAt', recent_rows.played_at,
            'result', recent_rows.result
          )
          order by recent_rows.played_at desc, recent_rows.created_at desc, recent_rows.id desc
        )
        from recent_rows
      ),
      '[]'::jsonb
    ) as recent_form
  from public.user_profiles
  cross join totals
  where user_profiles.user_id = p_friend_id
    and user_profiles.nickname is not null;
end;
$$;

grant execute on function public.list_friends() to authenticated;
grant execute on function public.get_friend_stats(uuid) to authenticated;
