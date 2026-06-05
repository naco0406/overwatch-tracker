do $$
begin
  create type public.friend_request_status as enum ('pending', 'accepted', 'declined', 'canceled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  normalized_nickname text generated always as (lower(trim(nickname))) stored,
  is_discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    nickname is null
    or (
      nickname = trim(nickname)
      and char_length(nickname) between 2 and 20
      and nickname ~ '^[A-Za-z0-9가-힣_]+$'
    )
  )
);

create unique index if not exists user_profiles_normalized_nickname_key
on public.user_profiles (normalized_nickname)
where normalized_nickname is not null;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);

create unique index if not exists friend_requests_pending_pair_key
on public.friend_requests (
  least(requester_id, recipient_id),
  greatest(requester_id, recipient_id)
)
where status = 'pending';

create index if not exists friend_requests_recipient_pending_idx
on public.friend_requests (recipient_id, created_at desc)
where status = 'pending';

create index if not exists friend_requests_requester_pending_idx
on public.friend_requests (requester_id, created_at desc)
where status = 'pending';

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references auth.users(id) on delete cascade,
  user_high_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (user_low_id < user_high_id),
  unique (user_low_id, user_high_id)
);

create index if not exists friendships_user_high_idx
on public.friendships (user_high_id, created_at desc);

create index if not exists friendships_user_low_idx
on public.friendships (user_low_id, created_at desc);

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_friend_requests_updated_at on public.friend_requests;
create trigger set_friend_requests_updated_at
before update on public.friend_requests
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

grant select, insert, update
on public.user_profiles
to authenticated;

grant select
on public.friend_requests, public.friendships
to authenticated;

drop policy if exists "user_profiles_select_visible" on public.user_profiles;
create policy "user_profiles_select_visible"
on public.user_profiles for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (is_discoverable = true and nickname is not null)
);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
on public.user_profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
on public.user_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "friend_requests_select_own" on public.friend_requests;
create policy "friend_requests_select_own"
on public.friend_requests for select
to authenticated
using ((select auth.uid()) in (requester_id, recipient_id));

drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own"
on public.friendships for select
to authenticated
using ((select auth.uid()) in (user_low_id, user_high_id));

create or replace function public.are_friends(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_a is not null
    and p_user_b is not null
    and exists (
      select 1
      from public.friendships
      where user_low_id = least(p_user_a, p_user_b)
        and user_high_id = greatest(p_user_a, p_user_b)
    );
$$;

create or replace function public.search_user_profiles(p_query text, p_limit int default 8)
returns table (
  user_id uuid,
  nickname text,
  created_at timestamptz,
  relationship text,
  request_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit int := least(greatest(coalesce(p_limit, 8), 1), 20);
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if char_length(v_query) < 1 then
    return;
  end if;

  return query
  with candidates as (
    select
      user_profiles.user_id,
      user_profiles.nickname,
      user_profiles.created_at
    from public.user_profiles
    where user_profiles.user_id <> v_user_id
      and user_profiles.nickname is not null
      and user_profiles.is_discoverable = true
      and user_profiles.normalized_nickname like '%' || v_query || '%'
    order by
      case when user_profiles.normalized_nickname = v_query then 0 else 1 end,
      user_profiles.normalized_nickname asc
    limit v_limit
  )
  select
    candidates.user_id,
    candidates.nickname,
    candidates.created_at,
    case
      when friendships.id is not null then 'friend'
      when sent_requests.id is not null then 'sent'
      when received_requests.id is not null then 'received'
      else 'none'
    end as relationship,
    coalesce(sent_requests.id, received_requests.id) as request_id
  from candidates
  left join public.friendships
    on friendships.user_low_id = least(v_user_id, candidates.user_id)
   and friendships.user_high_id = greatest(v_user_id, candidates.user_id)
  left join public.friend_requests as sent_requests
    on sent_requests.requester_id = v_user_id
   and sent_requests.recipient_id = candidates.user_id
   and sent_requests.status = 'pending'
  left join public.friend_requests as received_requests
    on received_requests.requester_id = candidates.user_id
   and received_requests.recipient_id = v_user_id
   and received_requests.status = 'pending';
end;
$$;

create or replace function public.list_friend_requests()
returns table (
  request_id uuid,
  direction text,
  user_id uuid,
  nickname text,
  status public.friend_request_status,
  created_at timestamptz,
  responded_at timestamptz
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
  select
    friend_requests.id as request_id,
    case
      when friend_requests.requester_id = v_user_id then 'outgoing'
      else 'incoming'
    end as direction,
    profiles.user_id,
    profiles.nickname,
    friend_requests.status,
    friend_requests.created_at,
    friend_requests.responded_at
  from public.friend_requests
  join public.user_profiles as profiles
    on profiles.user_id = case
      when friend_requests.requester_id = v_user_id then friend_requests.recipient_id
      else friend_requests.requester_id
    end
  where v_user_id in (friend_requests.requester_id, friend_requests.recipient_id)
    and friend_requests.status = 'pending'
  order by friend_requests.created_at desc;
end;
$$;

create or replace function public.list_friends()
returns table (
  friend_id uuid,
  nickname text,
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
  group by friend_rows.friend_id, user_profiles.nickname, friend_rows.friends_since
  order by friend_rows.friends_since desc;
end;
$$;

create or replace function public.send_friend_request(p_recipient_id uuid)
returns table (
  request_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_recipient_id = v_user_id then
    raise exception '자기 자신에게 친구 신청을 보낼 수 없습니다.';
  end if;

  if not exists (
    select 1
    from public.user_profiles
    where user_profiles.user_id = p_recipient_id
      and user_profiles.nickname is not null
      and user_profiles.is_discoverable = true
  ) then
    raise exception '사용자를 찾을 수 없습니다.';
  end if;

  if public.are_friends(v_user_id, p_recipient_id) then
    return query select null::uuid, 'friend'::text;
    return;
  end if;

  select friend_requests.id
  into v_request_id
  from public.friend_requests
  where friend_requests.requester_id = v_user_id
    and friend_requests.recipient_id = p_recipient_id
    and friend_requests.status = 'pending'
  limit 1;

  if v_request_id is not null then
    return query select v_request_id, 'pending'::text;
    return;
  end if;

  select friend_requests.id
  into v_request_id
  from public.friend_requests
  where friend_requests.requester_id = p_recipient_id
    and friend_requests.recipient_id = v_user_id
    and friend_requests.status = 'pending'
  limit 1;

  if v_request_id is not null then
    update public.friend_requests
    set status = 'accepted',
        responded_at = now()
    where friend_requests.id = v_request_id;

    insert into public.friendships (user_low_id, user_high_id, requested_by)
    values (least(v_user_id, p_recipient_id), greatest(v_user_id, p_recipient_id), p_recipient_id)
    on conflict (user_low_id, user_high_id) do nothing;

    return query select v_request_id, 'accepted'::text;
    return;
  end if;

  insert into public.friend_requests (requester_id, recipient_id)
  values (v_user_id, p_recipient_id)
  returning friend_requests.id into v_request_id;

  return query select v_request_id, 'pending'::text;
end;
$$;

create or replace function public.accept_friend_request(p_request_id uuid)
returns table (
  request_id uuid,
  friend_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.friend_requests%rowtype;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  update public.friend_requests
  set status = 'accepted',
      responded_at = now()
  where friend_requests.id = p_request_id
    and friend_requests.recipient_id = v_user_id
    and friend_requests.status = 'pending'
  returning * into v_request;

  if v_request.id is null then
    raise exception '친구 신청을 찾을 수 없습니다.';
  end if;

  insert into public.friendships (user_low_id, user_high_id, requested_by)
  values (
    least(v_request.requester_id, v_request.recipient_id),
    greatest(v_request.requester_id, v_request.recipient_id),
    v_request.requester_id
  )
  on conflict (user_low_id, user_high_id) do nothing;

  return query select v_request.id, v_request.requester_id;
end;
$$;

create or replace function public.decline_friend_request(p_request_id uuid)
returns void
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

  update public.friend_requests
  set status = 'declined',
      responded_at = now()
  where friend_requests.id = p_request_id
    and friend_requests.recipient_id = v_user_id
    and friend_requests.status = 'pending';
end;
$$;

create or replace function public.cancel_friend_request(p_request_id uuid)
returns void
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

  update public.friend_requests
  set status = 'canceled',
      responded_at = now()
  where friend_requests.id = p_request_id
    and friend_requests.requester_id = v_user_id
    and friend_requests.status = 'pending';
end;
$$;

create or replace function public.remove_friend(p_friend_id uuid)
returns void
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

  delete from public.friendships
  where friendships.user_low_id = least(v_user_id, p_friend_id)
    and friendships.user_high_id = greatest(v_user_id, p_friend_id);
end;
$$;

create or replace function public.get_friend_stats(p_friend_id uuid)
returns table (
  profile jsonb,
  summary jsonb,
  modes jsonb,
  maps jsonb,
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
  recent_rows as (
    select
      result::text as result
    from base_matches
    order by played_at desc, created_at desc, id desc
    limit 12
  )
  select
    jsonb_build_object(
      'userId', user_profiles.user_id,
      'nickname', user_profiles.nickname
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
          order by mode_rows.total_matches desc, mode_rows.win_rate desc, mode_rows.mode_id asc
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
          jsonb_build_object('result', recent_rows.result)
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

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.search_user_profiles(text, int) to authenticated;
grant execute on function public.list_friend_requests() to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.get_friend_stats(uuid) to authenticated;
