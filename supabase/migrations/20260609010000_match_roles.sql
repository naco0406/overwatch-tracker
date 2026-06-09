do $$
begin
  create type public.match_role as enum ('tank', 'damage', 'support');
exception
  when duplicate_object then null;
end $$;

alter table public.matches
add column if not exists match_role public.match_role;

alter table public.user_settings
add column if not exists default_match_role public.match_role not null default 'damage'::public.match_role;

alter table public.user_settings
add column if not exists default_player_account_id uuid references public.player_accounts(id) on delete set null;

do $$
begin
  if exists (
    with migration_targets(
      user_id,
      default_player_account_id,
      default_queue_type,
      default_match_role,
      match_backfill_role
    ) as (
      values
        (
          '7efd22bb-5d58-4bcc-9a7f-c1eeef208546'::uuid,
          'f22920ac-5903-4eff-975e-5fd627712650'::uuid,
          'duo'::public.queue_type,
          'support'::public.match_role,
          'support'::public.match_role
        ),
        (
          '36c16551-b680-40ad-b259-7f30afb64790'::uuid,
          'd0c268a0-dfea-469f-b1f3-62f649c3aa45'::uuid,
          'solo'::public.queue_type,
          'damage'::public.match_role,
          'damage'::public.match_role
        ),
        (
          '529b1b50-adf5-4cac-9728-d3fd6dfd74b4'::uuid,
          'de2ae1b2-1d82-400b-a2c3-97d27a5caabf'::uuid,
          'solo'::public.queue_type,
          'support'::public.match_role,
          'support'::public.match_role
        )
    )
    select 1
    from migration_targets
    left join public.player_accounts
      on player_accounts.id = migration_targets.default_player_account_id
      and player_accounts.user_id = migration_targets.user_id
    where player_accounts.id is null
  ) then
    raise exception 'Invalid default player account mapping in explicit match role migration.';
  end if;
end $$;

with migration_targets(
  user_id,
  default_player_account_id,
  default_queue_type,
  default_match_role,
  match_backfill_role
) as (
  values
    (
      '7efd22bb-5d58-4bcc-9a7f-c1eeef208546'::uuid,
      'f22920ac-5903-4eff-975e-5fd627712650'::uuid,
      'duo'::public.queue_type,
      'support'::public.match_role,
      'support'::public.match_role
    ),
    (
      '36c16551-b680-40ad-b259-7f30afb64790'::uuid,
      'd0c268a0-dfea-469f-b1f3-62f649c3aa45'::uuid,
      'solo'::public.queue_type,
      'damage'::public.match_role,
      'damage'::public.match_role
    ),
    (
      '529b1b50-adf5-4cac-9728-d3fd6dfd74b4'::uuid,
      'de2ae1b2-1d82-400b-a2c3-97d27a5caabf'::uuid,
      'solo'::public.queue_type,
      'support'::public.match_role,
      'support'::public.match_role
    )
)
update public.matches
set match_role = migration_targets.match_backfill_role
from migration_targets
where matches.user_id = migration_targets.user_id;

with migration_targets(
  user_id,
  default_player_account_id,
  default_queue_type,
  default_match_role,
  match_backfill_role
) as (
  values
    (
      '7efd22bb-5d58-4bcc-9a7f-c1eeef208546'::uuid,
      'f22920ac-5903-4eff-975e-5fd627712650'::uuid,
      'duo'::public.queue_type,
      'support'::public.match_role,
      'support'::public.match_role
    ),
    (
      '36c16551-b680-40ad-b259-7f30afb64790'::uuid,
      'd0c268a0-dfea-469f-b1f3-62f649c3aa45'::uuid,
      'solo'::public.queue_type,
      'damage'::public.match_role,
      'damage'::public.match_role
    ),
    (
      '529b1b50-adf5-4cac-9728-d3fd6dfd74b4'::uuid,
      'de2ae1b2-1d82-400b-a2c3-97d27a5caabf'::uuid,
      'solo'::public.queue_type,
      'support'::public.match_role,
      'support'::public.match_role
    )
)
insert into public.user_settings (
  user_id,
  default_player_account_id,
  default_queue_type,
  default_match_role
)
select
  user_id,
  default_player_account_id,
  default_queue_type,
  default_match_role
from migration_targets
on conflict (user_id) do update
set
  default_player_account_id = excluded.default_player_account_id,
  default_queue_type = excluded.default_queue_type,
  default_match_role = excluded.default_match_role;

do $$
begin
  if exists (
    select 1
    from public.matches
    where match_role is null
  ) then
    raise exception 'Unmapped matches remain after explicit match role migration.';
  end if;
end $$;

alter table public.matches
alter column match_role set default 'damage'::public.match_role,
alter column match_role set not null;

create index if not exists matches_user_match_role_played_at_idx
on public.matches (user_id, match_role, played_at desc);
