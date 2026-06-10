create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body_html text not null default '',
  body_text text not null default '',
  visibility text not null default 'friends',
  story_expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (visibility in ('friends')),
  check (char_length(body_text) <= 2000),
  check (char_length(body_html) <= 20000)
);

create index if not exists community_posts_feed_idx
on public.community_posts (created_at desc, id desc)
where deleted_at is null;

create index if not exists community_posts_user_created_idx
on public.community_posts (user_id, created_at desc)
where deleted_at is null;

create index if not exists community_posts_story_idx
on public.community_posts (story_expires_at desc, created_at desc)
where deleted_at is null;

create table if not exists public.community_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_key text not null,
  image_url text not null,
  width int not null,
  height int not null,
  mime_type text not null,
  size_bytes int not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  check (width > 0),
  check (height > 0),
  check (size_bytes > 0),
  check (mime_type in ('image/webp', 'image/jpeg', 'image/png')),
  check (image_url ~ '^https://')
);

create index if not exists community_post_images_post_sort_idx
on public.community_post_images (post_id, sort_order asc, created_at asc);

create unique index if not exists community_post_images_object_key_key
on public.community_post_images (object_key);

create table if not exists public.community_story_views (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);

create index if not exists community_story_views_viewer_idx
on public.community_story_views (viewer_id, viewed_at desc);

drop trigger if exists set_community_posts_updated_at on public.community_posts;
create trigger set_community_posts_updated_at
before update on public.community_posts
for each row execute function public.set_updated_at();

alter table public.community_posts enable row level security;
alter table public.community_post_images enable row level security;
alter table public.community_story_views enable row level security;

grant select, insert, update
on public.community_posts, public.community_post_images, public.community_story_views
to authenticated;

drop function if exists public.can_view_community_post(uuid, uuid);
create or replace function public.can_view_community_post(p_post_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.community_posts
      where community_posts.id = p_post_id
        and community_posts.deleted_at is null
        and (
          community_posts.user_id = p_user_id
          or public.are_friends(p_user_id, community_posts.user_id)
        )
    );
$$;

drop policy if exists "community_posts_select_visible" on public.community_posts;
create policy "community_posts_select_visible"
on public.community_posts for select
to authenticated
using (
  deleted_at is null
  and (
    (select auth.uid()) = user_id
    or public.are_friends((select auth.uid()), user_id)
  )
);

drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own"
on public.community_posts for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "community_posts_update_own" on public.community_posts;
create policy "community_posts_update_own"
on public.community_posts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "community_post_images_select_visible" on public.community_post_images;
create policy "community_post_images_select_visible"
on public.community_post_images for select
to authenticated
using (public.can_view_community_post(post_id, (select auth.uid())));

drop policy if exists "community_post_images_insert_own" on public.community_post_images;
create policy "community_post_images_insert_own"
on public.community_post_images for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.community_posts
    where community_posts.id = post_id
      and community_posts.user_id = (select auth.uid())
  )
);

drop policy if exists "community_post_images_update_own" on public.community_post_images;
create policy "community_post_images_update_own"
on public.community_post_images for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "community_story_views_select_own" on public.community_story_views;
create policy "community_story_views_select_own"
on public.community_story_views for select
to authenticated
using ((select auth.uid()) = viewer_id);

drop policy if exists "community_story_views_insert_own" on public.community_story_views;
create policy "community_story_views_insert_own"
on public.community_story_views for insert
to authenticated
with check (
  (select auth.uid()) = viewer_id
  and public.can_view_community_post(post_id, (select auth.uid()))
);

drop policy if exists "community_story_views_update_own" on public.community_story_views;
create policy "community_story_views_update_own"
on public.community_story_views for update
to authenticated
using ((select auth.uid()) = viewer_id)
with check (
  (select auth.uid()) = viewer_id
  and public.can_view_community_post(post_id, (select auth.uid()))
);

drop function if exists public.list_community_feed(timestamptz, uuid, int);
create or replace function public.list_community_feed(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 20
)
returns table (
  post_id uuid,
  author_user_id uuid,
  author_nickname text,
  author_avatar_url text,
  body_html text,
  body_text text,
  created_at timestamptz,
  updated_at timestamptz,
  story_expires_at timestamptz,
  viewer_has_seen_story boolean,
  images jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  return query
  select
    community_posts.id as post_id,
    user_profiles.user_id as author_user_id,
    user_profiles.nickname as author_nickname,
    user_profiles.avatar_url as author_avatar_url,
    community_posts.body_html,
    community_posts.body_text,
    community_posts.created_at,
    community_posts.updated_at,
    community_posts.story_expires_at,
    community_story_views.post_id is not null as viewer_has_seen_story,
    coalesce(post_images.images, '[]'::jsonb) as images
  from public.community_posts
  join public.user_profiles
    on user_profiles.user_id = community_posts.user_id
  left join public.community_story_views
    on community_story_views.post_id = community_posts.id
   and community_story_views.viewer_id = v_user_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', community_post_images.id,
        'imageUrl', community_post_images.image_url,
        'width', community_post_images.width,
        'height', community_post_images.height,
        'sortOrder', community_post_images.sort_order
      )
      order by community_post_images.sort_order asc, community_post_images.created_at asc
    ) as images
    from public.community_post_images
    where community_post_images.post_id = community_posts.id
  ) as post_images on true
  where community_posts.deleted_at is null
    and (
      community_posts.user_id = v_user_id
      or public.are_friends(v_user_id, community_posts.user_id)
    )
    and (
      p_cursor_created_at is null
      or p_cursor_id is null
      or (community_posts.created_at, community_posts.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by community_posts.created_at desc, community_posts.id desc
  limit v_limit;
end;
$$;

drop function if exists public.list_community_stories();
create or replace function public.list_community_stories()
returns table (
  author_user_id uuid,
  author_nickname text,
  author_avatar_url text,
  has_unseen boolean,
  posts jsonb
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
  with visible_posts as (
    select
      community_posts.id,
      community_posts.user_id,
      community_posts.body_html,
      community_posts.body_text,
      community_posts.created_at,
      community_posts.updated_at,
      community_posts.story_expires_at
    from public.community_posts
    where community_posts.deleted_at is null
      and community_posts.story_expires_at > now()
      and (
        community_posts.user_id = v_user_id
        or public.are_friends(v_user_id, community_posts.user_id)
      )
  ),
  post_rows as (
    select
      user_profiles.user_id as author_user_id,
      user_profiles.nickname as author_nickname,
      user_profiles.avatar_url as author_avatar_url,
      visible_posts.created_at,
      not exists (
        select 1
        from public.community_story_views
        where community_story_views.post_id = visible_posts.id
          and community_story_views.viewer_id = v_user_id
      ) as is_unseen,
      jsonb_build_object(
        'id', visible_posts.id,
        'bodyHtml', visible_posts.body_html,
        'bodyText', visible_posts.body_text,
        'createdAt', visible_posts.created_at,
        'updatedAt', visible_posts.updated_at,
        'storyExpiresAt', visible_posts.story_expires_at,
        'viewerHasSeenStory', exists (
          select 1
          from public.community_story_views
          where community_story_views.post_id = visible_posts.id
            and community_story_views.viewer_id = v_user_id
        ),
        'images', coalesce(post_images.images, '[]'::jsonb)
      ) as post_json
    from visible_posts
    join public.user_profiles
      on user_profiles.user_id = visible_posts.user_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', community_post_images.id,
          'imageUrl', community_post_images.image_url,
          'width', community_post_images.width,
          'height', community_post_images.height,
          'sortOrder', community_post_images.sort_order
        )
        order by community_post_images.sort_order asc, community_post_images.created_at asc
      ) as images
      from public.community_post_images
      where community_post_images.post_id = visible_posts.id
    ) as post_images on true
  )
  select
    post_rows.author_user_id,
    post_rows.author_nickname,
    post_rows.author_avatar_url,
    bool_or(post_rows.is_unseen) as has_unseen,
    jsonb_agg(post_rows.post_json order by post_rows.created_at asc) as posts
  from post_rows
  group by
    post_rows.author_user_id,
    post_rows.author_nickname,
    post_rows.author_avatar_url
  order by max(post_rows.created_at) desc;
end;
$$;

drop function if exists public.create_community_post(text, text, jsonb);
create or replace function public.create_community_post(
  p_body_html text,
  p_body_text text,
  p_images jsonb default '[]'::jsonb
)
returns table (post_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
  v_images jsonb := coalesce(p_images, '[]'::jsonb);
  v_image jsonb;
  v_image_count int;
  v_object_key text;
  v_image_url text;
  v_width int;
  v_height int;
  v_mime_type text;
  v_size_bytes int;
  v_sort_order int;
  v_index int := 0;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if jsonb_typeof(v_images) <> 'array' then
    raise exception '이미지 목록을 확인할 수 없습니다.';
  end if;

  v_image_count := jsonb_array_length(v_images);

  if v_image_count > 8 then
    raise exception '이미지는 최대 8장까지 첨부할 수 있습니다.';
  end if;

  p_body_html := trim(coalesce(p_body_html, ''));
  p_body_text := trim(coalesce(p_body_text, ''));

  if p_body_text = '' and v_image_count = 0 then
    raise exception '본문이나 이미지를 추가하세요.';
  end if;

  if char_length(p_body_text) > 2000 then
    raise exception '본문은 2000자 이하로 입력하세요.';
  end if;

  if char_length(p_body_html) > 20000 then
    raise exception '본문 HTML이 너무 깁니다.';
  end if;

  insert into public.community_posts (user_id, body_html, body_text)
  values (v_user_id, p_body_html, p_body_text)
  returning id into v_post_id;

  for v_image in select value from jsonb_array_elements(v_images)
  loop
    v_object_key := v_image->>'objectKey';
    v_image_url := v_image->>'imageUrl';
    v_width := (v_image->>'width')::int;
    v_height := (v_image->>'height')::int;
    v_mime_type := v_image->>'mimeType';
    v_size_bytes := (v_image->>'sizeBytes')::int;
    v_sort_order := coalesce((v_image->>'sortOrder')::int, v_index);

    if v_object_key is null
      or v_object_key not like ('community/' || v_user_id::text || '/%') then
      raise exception '이미지 경로를 확인할 수 없습니다.';
    end if;

    if v_image_url is null or v_image_url !~ '^https://' then
      raise exception '이미지 URL을 확인할 수 없습니다.';
    end if;

    if v_width <= 0 or v_height <= 0 or v_size_bytes <= 0 then
      raise exception '이미지 정보를 확인할 수 없습니다.';
    end if;

    if v_mime_type not in ('image/webp', 'image/jpeg', 'image/png') then
      raise exception '지원하지 않는 이미지 형식입니다.';
    end if;

    insert into public.community_post_images (
      post_id,
      user_id,
      object_key,
      image_url,
      width,
      height,
      mime_type,
      size_bytes,
      sort_order
    )
    values (
      v_post_id,
      v_user_id,
      v_object_key,
      v_image_url,
      v_width,
      v_height,
      v_mime_type,
      v_size_bytes,
      v_sort_order
    );

    v_index := v_index + 1;
  end loop;

  return query select v_post_id;
end;
$$;

drop function if exists public.delete_community_post(uuid);
create or replace function public.delete_community_post(p_post_id uuid)
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

  update public.community_posts
  set deleted_at = now()
  where id = p_post_id
    and user_id = v_user_id
    and deleted_at is null;

  if not found then
    raise exception '삭제할 게시글을 찾을 수 없습니다.';
  end if;
end;
$$;

drop function if exists public.mark_community_story_viewed(uuid);
create or replace function public.mark_community_story_viewed(p_post_id uuid)
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

  if not public.can_view_community_post(p_post_id, v_user_id) then
    raise exception '게시글을 볼 수 없습니다.';
  end if;

  insert into public.community_story_views (post_id, viewer_id)
  values (p_post_id, v_user_id)
  on conflict (post_id, viewer_id)
  do update set viewed_at = excluded.viewed_at;
end;
$$;

grant execute on function public.can_view_community_post(uuid, uuid) to authenticated;
grant execute on function public.list_community_feed(timestamptz, uuid, int) to authenticated;
grant execute on function public.list_community_stories() to authenticated;
grant execute on function public.create_community_post(text, text, jsonb) to authenticated;
grant execute on function public.delete_community_post(uuid) to authenticated;
grant execute on function public.mark_community_story_viewed(uuid) to authenticated;
