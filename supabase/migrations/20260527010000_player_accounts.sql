create table if not exists public.player_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  battle_tag text not null,
  display_name text not null default '',
  is_main boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, battle_tag)
);

alter table public.matches
add column if not exists account_id uuid references public.player_accounts(id) on delete set null;

create index if not exists player_accounts_user_sort_idx
on public.player_accounts (user_id, is_main desc, sort_order asc, created_at asc);

create index if not exists matches_user_account_played_at_idx
on public.matches (user_id, account_id, played_at desc);

drop trigger if exists set_player_accounts_updated_at on public.player_accounts;
create trigger set_player_accounts_updated_at
before update on public.player_accounts
for each row execute function public.set_updated_at();

create or replace function public.ensure_single_main_player_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_main then
    update public.player_accounts
    set is_main = false,
        updated_at = now()
    where user_id = new.user_id
      and id <> new.id
      and is_main = true;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_single_main_player_account on public.player_accounts;
create trigger ensure_single_main_player_account
before insert or update of is_main on public.player_accounts
for each row execute function public.ensure_single_main_player_account();

alter table public.player_accounts enable row level security;

grant select, insert, update, delete
on public.player_accounts
to authenticated;

drop policy if exists "player_accounts_select_own" on public.player_accounts;
create policy "player_accounts_select_own"
on public.player_accounts for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "player_accounts_insert_own" on public.player_accounts;
create policy "player_accounts_insert_own"
on public.player_accounts for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "player_accounts_update_own" on public.player_accounts;
create policy "player_accounts_update_own"
on public.player_accounts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "player_accounts_delete_own" on public.player_accounts;
create policy "player_accounts_delete_own"
on public.player_accounts for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "matches_insert_own" on public.matches;
create policy "matches_insert_own"
on public.matches for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    account_id is null
    or exists (
      select 1
      from public.player_accounts
      where player_accounts.id = account_id
        and player_accounts.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "matches_update_own" on public.matches;
create policy "matches_update_own"
on public.matches for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    account_id is null
    or exists (
      select 1
      from public.player_accounts
      where player_accounts.id = account_id
        and player_accounts.user_id = (select auth.uid())
    )
  )
);
