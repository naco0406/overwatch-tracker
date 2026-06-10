# Community Feed and Stories Plan

작성일: 2026-06-10

## Goal

친구 관계를 기반으로 나와 내 친구들끼리만 볼 수 있는 커뮤니티 피드를 만든다. 사용자는 리치텍스트 본문과 이미지를 포함한 게시글을 작성할 수 있고, 모든 게시글은 작성 후 24시간 동안 자동으로 스토리 영역에도 노출된다.

이 기능은 DM, 공개 탐색, 팔로우, 댓글 중심 커뮤니티가 아니라 "가볍게 현재 상태를 공유하는 친구 전용 피드"가 목적이다.

## Product Decisions

- `/community`는 실제 커뮤니티 피드 페이지로 사용한다.
- 기존 `/friends`는 친구 관리와 친구 통계 페이지로 유지한다.
- 게시글 작성 경험은 하나만 둔다. 별도의 "스토리 작성" 기능은 만들지 않는다.
- 게시글은 피드에 계속 남고, 작성 후 24시간 동안만 스토리 트레이에도 보인다.
- 게시글 공개 범위는 v1에서 `friends` 단일 정책으로 고정한다.
- 게시글은 나와 내 친구만 볼 수 있다.
- 이미지는 Cloudflare R2 public URL로 서빙한다.
- 이미지 원본 URL을 아는 사람이 직접 접근하는 수준까지는 막지 않는다.
- 서비스 UI/API에서는 게시글 단위 권한 체크를 통해 이미지 URL을 권한 있는 사용자에게만 내려준다.
- 이미지 object key는 UUID를 포함해 추측하기 어렵게 만든다.
- 댓글, 좋아요, DM, 멘션, 해시태그, 공개 공유 링크는 v1 범위에서 제외한다.

## Privacy Model

v1의 보안 경계는 게시글 조회 API다.

허용:

- 작성자는 자기 게시글을 볼 수 있다.
- 작성자의 친구는 작성자의 게시글을 볼 수 있다.
- 게시글을 조회할 수 있는 사용자에게만 이미지 URL을 반환한다.

허용하지 않음:

- 친구가 아닌 사용자는 피드/스토리 API에서 게시글을 받을 수 없다.
- 삭제된 게시글은 작성자 외에도 기본적으로 노출하지 않는다.

명시적 tradeoff:

- R2 이미지 URL은 public asset URL이다.
- URL이 외부로 유출되면 원본 이미지는 직접 열릴 수 있다.
- 이 문제를 막기 위한 Worker 기반 이미지 조회 권한 검증은 v1에서 구현하지 않는다.

권장 object key:

```txt
community/{userId}/{postId}/{imageId}.webp
```

예시 public URL:

```txt
https://assets-ow.naco.kr/community/{userId}/{postId}/{imageId}.webp
```

## Information Architecture

```txt
/community
```

페이지 구성:

- 상단 스토리 트레이
- 게시글 작성 버튼
- 무한스크롤 피드
- 게시글 작성/수정 모달
- 스토리 뷰어 모달

기존 친구 관련 라우트:

```txt
/friends
/friends/:friendId
```

기존 `/community -> /friends` redirect는 제거한다.

## UX Plan

### Community Page

첫 화면은 랜딩이 아니라 바로 사용 가능한 피드 화면으로 구성한다.

상단:

- 페이지 제목 `커뮤니티`
- 보조 텍스트는 최소화한다.
- `새 게시글` 버튼을 우측에 둔다.

스토리 트레이:

- 가로 스크롤 avatar ring 형태
- 내 24시간 게시글이 있으면 첫 슬롯에 표시한다.
- 친구별 최신 24시간 게시글을 묶어서 표시한다.
- 안 본 스토리는 primary ring, 모두 본 스토리는 muted ring으로 표시한다.
- 클릭하면 해당 작성자의 24시간 게시글을 오래된 순서 또는 최신 순서로 넘겨본다.

피드:

- 최신 게시글부터 표시한다.
- `created_at desc, id desc` 커서 기반 무한스크롤을 사용한다.
- 게시글 카드는 작성자 프로필, 작성 시간, 이미지, 본문, 액션 메뉴로 구성한다.
- 내 글에는 삭제 액션을 제공한다.
- 친구 글에는 별도 액션 없이 읽기 중심으로 둔다.

빈 상태:

- 친구가 없으면 친구 페이지로 유도한다.
- 친구는 있지만 게시글이 없으면 첫 게시글 작성을 유도한다.
- 닉네임이 없으면 설정 페이지에서 프로필 설정을 먼저 하도록 유도한다.

### Composer

게시글 작성은 모달로 처리한다.

지원:

- TipTap 기반 리치텍스트
- bold
- italic
- underline
- bullet list
- ordered list
- 이미지 첨부
- 이미지 미리보기
- 이미지 삭제
- 최대 이미지 수 제한

권장 제한:

- 이미지 최대 8장
- 원본 이미지 최대 8MB
- 변환 후 이미지 최대 2MB
- 본문 plain text 최대 2,000자
- 저장 HTML 최대 20,000자

본문과 이미지는 둘 중 하나 이상 있어야 게시할 수 있다.

이미지는 본문 내부 embed가 아니라 게시글 첨부 캐러셀로 관리한다. 이렇게 해야 sanitizer, 레이아웃, 삭제, 업로드 실패 처리가 단순해진다.

### Story Viewer

스토리 뷰어는 모달로 처리한다.

구성:

- 상단 작성자 정보
- 진행 indicator
- 이미지가 있으면 이미지 우선 표시
- 본문은 이미지 아래 또는 이미지가 없을 때 중앙 영역에 표시
- 이전/다음 버튼
- 닫기 버튼

스토리 뷰어에서 본 게시글은 `community_story_views`에 기록한다.

자동 재생은 v1에서 선택 사항이다. 우선 수동 이전/다음만 구현해도 충분하다.

## Data Model

### community_posts

```sql
create table public.community_posts (
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
```

인덱스:

```sql
create index community_posts_feed_idx
on public.community_posts (created_at desc, id desc)
where deleted_at is null;

create index community_posts_user_created_idx
on public.community_posts (user_id, created_at desc)
where deleted_at is null;

create index community_posts_story_idx
on public.community_posts (story_expires_at desc, created_at desc)
where deleted_at is null;
```

### community_post_images

```sql
create table public.community_post_images (
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
  check (mime_type in ('image/webp', 'image/jpeg', 'image/png'))
);
```

인덱스:

```sql
create index community_post_images_post_sort_idx
on public.community_post_images (post_id, sort_order asc, created_at asc);

create unique index community_post_images_object_key_key
on public.community_post_images (object_key);
```

### community_story_views

```sql
create table public.community_story_views (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);
```

## RLS Policy

### community_posts

Select:

- `auth.uid() = user_id`
- 또는 `public.are_friends(auth.uid(), user_id) = true`
- 그리고 `deleted_at is null`

Insert:

- `auth.uid() = user_id`

Update:

- 작성자만 가능
- v1에서는 본문 수정은 선택 사항이다.
- 삭제는 직접 delete보다 RPC soft delete를 권장한다.

Delete:

- 직접 delete는 막고 `delete_community_post` RPC에서 `deleted_at`을 설정한다.

### community_post_images

Select:

- 연결된 post를 볼 수 있는 사용자만 가능

Insert:

- 작성자만 가능
- `post.user_id = auth.uid()`
- `image.user_id = auth.uid()`

Delete:

- 직접 delete는 막고 post soft delete와 R2 cleanup worker로 처리한다.

### community_story_views

Select:

- `viewer_id = auth.uid()`

Insert/update:

- `viewer_id = auth.uid()`
- 연결된 post를 볼 수 있는 사용자만 가능

## RPC Contract

클라이언트는 피드/스토리 조회와 쓰기 작업에서 RPC를 우선 사용한다.

### list_community_feed

```sql
public.list_community_feed(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 20
)
```

반환 DTO:

```ts
interface CommunityPostDto {
  id: string;
  author: {
    userId: string;
    nickname: string;
    avatarUrl: string | null;
  };
  bodyHtml: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
  storyExpiresAt: string;
  viewerHasSeenStory: boolean;
  images: CommunityPostImageDto[];
}

interface CommunityPostImageDto {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  sortOrder: number;
}
```

정렬:

```sql
order by created_at desc, id desc
```

커서 조건:

```sql
where
  p_cursor_created_at is null
  or (created_at, id) < (p_cursor_created_at, p_cursor_id)
```

### list_community_stories

```sql
public.list_community_stories()
```

반환은 작성자별 그룹핑이 쉬운 flat row 또는 json aggregate 중 하나를 선택한다.

권장 DTO:

```ts
interface CommunityStoryGroupDto {
  author: {
    userId: string;
    nickname: string;
    avatarUrl: string | null;
  };
  hasUnseen: boolean;
  posts: CommunityStoryPostDto[];
}
```

조건:

- `story_expires_at > now()`
- 나 또는 친구의 게시글
- `deleted_at is null`

### create_community_post

```sql
public.create_community_post(
  p_body_html text,
  p_body_text text,
  p_images jsonb
)
```

`p_images` 예시:

```json
[
  {
    "objectKey": "community/user/post/image.webp",
    "imageUrl": "https://assets-ow.naco.kr/community/user/post/image.webp",
    "width": 1440,
    "height": 1080,
    "mimeType": "image/webp",
    "sizeBytes": 412000,
    "sortOrder": 0
  }
]
```

검증:

- 로그인 필수
- 본문 또는 이미지 중 하나 이상 필수
- 이미지 최대 8장
- HTML/body text 길이 제한
- URL은 `https://`만 허용
- `objectKey`는 현재 사용자 prefix로 시작해야 한다.

### delete_community_post

```sql
public.delete_community_post(p_post_id uuid)
```

동작:

- 작성자만 가능
- `deleted_at = now()` 설정
- R2 object는 즉시 삭제하지 않는다.
- 추후 cleanup worker에서 `deleted_at`이 오래된 이미지 object를 정리한다.

### mark_community_story_viewed

```sql
public.mark_community_story_viewed(p_post_id uuid)
```

동작:

- 게시글을 볼 수 있는 사용자만 가능
- upsert로 `viewed_at` 갱신

## Cloudflare R2 Upload Plan

기존 avatar upload Worker 패턴을 확장한다.

환경 변수:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
R2_PUBLIC_BASE_URL=https://assets-ow.naco.kr
ALLOWED_ORIGINS=https://ow.naco.kr,http://localhost:5173
```

R2 binding:

```txt
ASSETS_BUCKET=overwatch-tracker-assets
```

Upload API:

```txt
PUT /community/images/upload
```

요청:

```txt
Authorization: Bearer {supabaseAccessToken}
Content-Type: image/webp
X-Post-Draft-Id: {uuid}
X-Image-Id: {uuid}
```

응답:

```json
{
  "objectKey": "community/{userId}/{draftId}/{imageId}.webp",
  "imageUrl": "https://assets-ow.naco.kr/community/{userId}/{draftId}/{imageId}.webp",
  "width": 1440,
  "height": 1080,
  "mimeType": "image/webp",
  "sizeBytes": 412000
}
```

Worker 책임:

- Supabase access token 검증
- 로그인 사용자 ID 확인
- MIME type 검증
- 최대 byte 검증
- R2 object 저장
- public URL 반환

Worker가 하지 않는 것:

- 이미지 조회 시 친구 권한 검증
- signed URL 발급
- 게시글 생성

게시글 생성은 Supabase RPC가 담당한다.

## Frontend Modules

예상 추가 파일:

```txt
src/pages/CommunityPage.tsx
src/components/community/CommunityComposerDialog.tsx
src/components/community/CommunityImageCarousel.tsx
src/components/community/CommunityPostCard.tsx
src/components/community/CommunityStoryTray.tsx
src/components/community/CommunityStoryViewer.tsx
src/components/editor/RichTextEditor.tsx
src/hooks/useCommunityPosts.ts
src/lib/communityImageUpload.ts
src/lib/richTextHtml.ts
src/supabase/communityPosts.ts
src/types/communityPost.ts
supabase/migrations/{timestamp}_community_posts.sql
```

예상 변경 파일:

```txt
src/routes.tsx
src/components/common/AppLayout.tsx
src/supabase/database.types.ts
```

## Rich Editor Plan

스티커 메모에서 사용 중인 TipTap 기반 에디터를 공통 컴포넌트로 분리한다.

공통 컴포넌트:

```txt
src/components/editor/RichTextEditor.tsx
```

공통 sanitizer:

```txt
src/lib/richTextHtml.ts
```

커뮤니티는 친구에게 표시되는 콘텐츠이므로 스티커 메모보다 sanitizer를 더 엄격히 가져간다.

권장 허용 태그:

```txt
p, br, strong, em, u, ul, ol, li, a
```

링크를 지원할 경우:

- `https://`만 허용
- `target="_blank"`
- `rel="noreferrer noopener"`

링크는 v1에서 제외해도 된다. 제외하면 구현과 보안 검토가 단순해진다.

## Client Upload Flow

1. 사용자가 이미지 선택
2. 브라우저에서 이미지 로드
3. 긴 변 기준 1600px 이하로 resize
4. WebP 변환
5. 최대 2MB 이하가 되도록 quality 조정
6. Worker에 업로드
7. Worker 응답의 `imageUrl`, `objectKey`, dimensions를 composer state에 저장
8. 사용자가 게시 버튼 클릭
9. `create_community_post` RPC에 본문과 image metadata 전달
10. 생성 성공 시 feed/stories query invalidation

업로드 실패 처리:

- 해당 이미지만 실패 상태로 표시
- 게시 버튼은 실패 이미지가 있으면 비활성화
- 사용자가 실패 이미지를 제거하거나 재시도할 수 있게 한다.

## React Query Plan

Query keys:

```ts
export const communityPostsQueryKey = ['community-posts'] as const;
export const communityFeedQueryKey = [...communityPostsQueryKey, 'feed'] as const;
export const communityStoriesQueryKey = [...communityPostsQueryKey, 'stories'] as const;
```

Hooks:

```ts
useCommunityFeed();
useCommunityStories();
useCreateCommunityPost();
useDeleteCommunityPost();
useMarkCommunityStoryViewed();
```

무한스크롤:

- `useInfiniteQuery` 사용
- 마지막 item의 `createdAt`, `id`를 다음 cursor로 사용
- IntersectionObserver sentinel로 다음 페이지 로드

Mutation success:

- create/delete 후 feed, stories invalidate
- story viewed 후 stories query만 invalidate하거나 optimistic update

## Implementation Phases

### Phase 1. Database and API

- `community_posts` migration 작성
- `community_post_images` migration 작성
- `community_story_views` migration 작성
- RLS 작성
- `list_community_feed` RPC 작성
- `list_community_stories` RPC 작성
- `create_community_post` RPC 작성
- `delete_community_post` RPC 작성
- `mark_community_story_viewed` RPC 작성
- `database.types.ts` 갱신

### Phase 2. Worker Upload

- avatar upload Worker 패턴을 참고해 community image upload 추가
- `/community/images/upload` 구현
- R2 key prefix 검증
- local/prod origin 허용
- frontend env 정리

### Phase 3. Shared Rich Editor

- 현재 `StickyNoteEditorDialog`의 TipTap editor/toolbar를 공통화
- 스티커 메모가 새 공통 editor를 사용하도록 변경
- 커뮤니티 composer가 같은 editor를 사용하도록 준비
- sanitizer 분리

### Phase 4. Community UI

- `CommunityPage` 추가
- route에서 `/community` redirect 제거
- story tray 구현
- story viewer 구현
- post card 구현
- composer dialog 구현
- image carousel 구현
- empty/loading/error state 구현

### Phase 5. QA

- 나만 게시글 작성 가능
- 내 게시글은 피드에 보임
- 친구 게시글은 피드에 보임
- 친구가 아닌 사용자의 게시글은 피드에 안 보임
- 친구가 끊긴 후 기존 게시글도 안 보임
- 24시간 지난 게시글은 피드에는 남고 스토리에서는 사라짐
- 삭제된 게시글은 피드와 스토리에서 사라짐
- 이미지 첨부 게시글 생성 가능
- 이미지 없는 텍스트 게시글 생성 가능
- 본문 없는 이미지 게시글 생성 가능
- 본문과 이미지가 모두 없으면 게시 불가
- 무한스크롤 cursor 중복 없음
- mobile viewport에서 story tray와 composer가 깨지지 않음

## Migration Execution Notes

Supabase SQL Editor에서 직접 실행할 경우 순서는 다음이 안전하다.

1. 기존 친구 기능 migration이 이미 적용되어 있어야 한다.
2. `community_posts` 관련 신규 migration을 실행한다.
3. `database.types.ts`는 로컬 타입 파일이므로 SQL Editor에서 실행할 것은 아니다.

선행 의존성:

- `user_profiles`
- `friendships`
- `public.are_friends(uuid, uuid)`

이미 존재하는 migration:

```txt
supabase/migrations/20260605010000_community_friends.sql
```

## Risks

- public R2 URL은 링크 유출 시 직접 접근 가능하다.
- 이미지 업로드 후 게시글 생성을 취소하면 orphan object가 남을 수 있다.
- 리치텍스트 HTML sanitizer가 느슨하면 XSS 위험이 있다.
- 피드 RPC가 json aggregate를 과하게 쓰면 페이지 크기가 커질 수 있다.
- 친구 관계 기반 RLS/RPC는 성능을 위해 index와 `are_friends` 사용 방식 검토가 필요하다.

완화:

- UUID object key 사용
- 추후 cleanup worker로 orphan image 정리
- sanitizer allowlist 유지
- feed limit 기본 20개
- 이미지 최대 8장 제한

## Deferred

- private image serving
- signed URL
- 댓글
- 좋아요
- DM
- 멘션
- 해시태그
- 게시글 수정 이력
- 신고/차단
- 공개 프로필 feed
- 알림
- 자동 story playback
