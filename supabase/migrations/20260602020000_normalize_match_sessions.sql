-- Rebuild stored session ids with the current 1-hour continuation policy.
-- A new session starts when the previous match by the same user is more than 1 hour away.
with ordered_matches as (
  select
    id,
    user_id,
    session_id,
    played_at,
    created_at,
    lag(played_at) over (
      partition by user_id
      order by played_at asc, created_at asc, id asc
    ) as previous_played_at
  from public.matches
),
session_marks as (
  select
    *,
    case
      when previous_played_at is null then 1
      when played_at - previous_played_at > interval '1 hour' then 1
      else 0
    end as starts_new_session
  from ordered_matches
),
session_groups as (
  select
    *,
    sum(starts_new_session) over (
      partition by user_id
      order by played_at asc, created_at asc, id asc
      rows between unbounded preceding and current row
    ) as session_group
  from session_marks
),
normalized_sessions as (
  select
    id,
    first_value(session_id) over (
      partition by user_id, session_group
      order by played_at asc, created_at asc, id asc
      rows between unbounded preceding and unbounded following
    ) as normalized_session_id
  from session_groups
)
update public.matches
set session_id = normalized_sessions.normalized_session_id
from normalized_sessions
where matches.id = normalized_sessions.id
  and matches.session_id <> normalized_sessions.normalized_session_id;
