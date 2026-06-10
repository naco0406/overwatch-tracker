create table if not exists public.sticky_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  color text not null default 'amber',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(body) <= 1000),
  check (color in ('amber', 'sky', 'emerald', 'rose', 'violet'))
);

create index if not exists sticky_notes_user_sort_idx
on public.sticky_notes (user_id, sort_order asc, created_at asc);

drop trigger if exists set_sticky_notes_updated_at on public.sticky_notes;
create trigger set_sticky_notes_updated_at
before update on public.sticky_notes
for each row execute function public.set_updated_at();

alter table public.sticky_notes enable row level security;

grant select, insert, update, delete
on public.sticky_notes
to authenticated;

drop policy if exists "sticky_notes_select_own" on public.sticky_notes;
create policy "sticky_notes_select_own"
on public.sticky_notes for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "sticky_notes_insert_own" on public.sticky_notes;
create policy "sticky_notes_insert_own"
on public.sticky_notes for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "sticky_notes_update_own" on public.sticky_notes;
create policy "sticky_notes_update_own"
on public.sticky_notes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "sticky_notes_delete_own" on public.sticky_notes;
create policy "sticky_notes_delete_own"
on public.sticky_notes for delete
to authenticated
using ((select auth.uid()) = user_id);

