alter table public.user_profiles
add column if not exists avatar_url text,
add column if not exists avatar_updated_at timestamptz;

alter table public.user_profiles
drop constraint if exists user_profiles_avatar_url_check;

alter table public.user_profiles
add constraint user_profiles_avatar_url_check
check (
  avatar_url is null
  or (
    avatar_url = trim(avatar_url)
    and char_length(avatar_url) <= 500
    and avatar_url ~ '^https://'
  )
);

notify pgrst, 'reload schema';
