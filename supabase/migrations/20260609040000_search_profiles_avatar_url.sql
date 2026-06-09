drop function if exists public.search_user_profiles(text, int);

create or replace function public.search_user_profiles(p_query text, p_limit int default 8)
returns table (
  user_id uuid,
  nickname text,
  avatar_url text,
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
      user_profiles.avatar_url,
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
    candidates.avatar_url,
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

grant execute on function public.search_user_profiles(text, int) to authenticated;
