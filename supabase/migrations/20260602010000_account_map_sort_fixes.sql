-- Aatlis was temporarily recorded as Throne of Anubis while the map was missing.
update public.matches
set map_id = 'aatlis',
    mode_id = 'flashpoint'
where map_id = 'throne-of-anubis'
  and mode_id = 'clash';

-- Users may intentionally have no main account. Keep at most one active main account.
drop trigger if exists ensure_active_main_player_account_exists on public.player_accounts;
drop function if exists public.ensure_active_main_player_account_exists();

with ranked_main_accounts as (
  select
    id,
    row_number() over (
      partition by user_id
      order by sort_order asc, created_at asc, id asc
    ) as rank
  from public.player_accounts
  where is_active = true
    and is_main = true
)
update public.player_accounts
set is_main = false
from ranked_main_accounts
where player_accounts.id = ranked_main_accounts.id
  and ranked_main_accounts.rank > 1;

create unique index if not exists player_accounts_one_active_main_idx
on public.player_accounts (user_id)
where is_active = true
  and is_main = true;

create index if not exists matches_user_played_created_idx
on public.matches (user_id, played_at desc, created_at desc, id desc);
