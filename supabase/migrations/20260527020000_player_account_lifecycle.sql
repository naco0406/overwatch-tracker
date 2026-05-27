alter table public.player_accounts
add column if not exists is_active boolean not null default true;

alter table public.player_accounts
add column if not exists deactivated_at timestamptz;

create index if not exists player_accounts_user_active_sort_idx
on public.player_accounts (user_id, is_main desc, sort_order asc, created_at asc)
where is_active = true;

create or replace function public.ensure_single_main_player_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active = false then
    new.is_main = false;
    new.deactivated_at = coalesce(new.deactivated_at, now());
  else
    new.deactivated_at = null;
  end if;

  if new.is_active = true and new.is_main = true then
    update public.player_accounts
    set is_main = false,
        updated_at = now()
    where user_id = new.user_id
      and id <> new.id
      and is_active = true
      and is_main = true;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_single_main_player_account on public.player_accounts;
create trigger ensure_single_main_player_account
before insert or update of is_main, is_active on public.player_accounts
for each row execute function public.ensure_single_main_player_account();

create or replace function public.ensure_active_main_player_account_exists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  target_user_id = coalesce(new.user_id, old.user_id);

  if exists (
    select 1
    from public.player_accounts
    where user_id = target_user_id
      and is_active = true
  )
  and not exists (
    select 1
    from public.player_accounts
    where user_id = target_user_id
      and is_active = true
      and is_main = true
  ) then
    update public.player_accounts
    set is_main = true,
        updated_at = now()
    where id = (
      select id
      from public.player_accounts
      where user_id = target_user_id
        and is_active = true
      order by sort_order asc, created_at asc
      limit 1
    );
  end if;

  return null;
end;
$$;

drop trigger if exists ensure_active_main_player_account_exists on public.player_accounts;
create trigger ensure_active_main_player_account_exists
after insert or update of is_main, is_active on public.player_accounts
for each row execute function public.ensure_active_main_player_account_exists();
