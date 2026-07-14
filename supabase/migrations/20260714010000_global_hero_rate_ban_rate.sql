alter table public.global_hero_rate_snapshots
add column if not exists ban_rate numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'global_hero_rate_snapshots_ban_rate_check'
  ) then
    alter table public.global_hero_rate_snapshots
    add constraint global_hero_rate_snapshots_ban_rate_check
    check (ban_rate is null or (ban_rate >= 0 and ban_rate <= 100));
  end if;
end $$;
