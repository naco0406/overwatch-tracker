# Community and friends PRD

작성일: 2026-06-05

## Goal

이메일/비밀번호로 가입한 사용자에게 고유 닉네임을 부여하고, 닉네임 기반 친구 신청/수락/거절 흐름을 만든다. 친구가 된 사용자끼리는 원본 경기 데이터를 공유하지 않고, 제한된 요약 통계만 열람할 수 있게 한다.

커뮤니티 v1은 게시판이나 채팅이 아니라 "친구 기반 통계 공유"가 핵심이다.

## Product principles

- 친구가 되어도 `matches` 원본 row는 직접 공유하지 않는다.
- 친구에게 노출되는 데이터는 서버에서 집계한 summary DTO만 허용한다.
- 이메일, battle tag, 메모, 태그, 세부 경기 목록은 기본 비공개다.
- 닉네임은 유저 검색과 친구 요청의 공개 식별자로 사용한다.
- 커뮤니티 기능은 기존 기록/통계 플로우를 방해하지 않는 보조 영역이어야 한다.

## V1 Scope

### Profile

- 사용자는 닉네임을 설정해야 한다.
- 닉네임은 중복 불가다.
- 닉네임 검색을 위해 normalized nickname을 별도 저장한다.
- 닉네임 정책:
  - 2-16자
  - 한글, 영문, 숫자, underscore 허용
  - 앞뒤 공백 제거
  - 대소문자/공백 차이로 중복 회피 불가

### Friend Requests

- 닉네임으로 사용자를 검색한다.
- 자기 자신에게는 요청할 수 없다.
- 이미 친구인 사용자에게는 요청할 수 없다.
- pending 요청이 있으면 중복 요청할 수 없다.
- 보낸 요청은 취소할 수 있다.
- 받은 요청은 수락 또는 거절할 수 있다.
- 수락 시 양방향 친구 관계를 생성한다.

### Friends

- 친구 목록을 볼 수 있다.
- 친구 목록에서 닉네임, 최근 활동 요약, 제한된 통계 preview를 볼 수 있다.
- 친구 상세 화면에서 더 자세한 요약 통계를 본다.

### Friend Stats

친구에게 공개 가능한 v1 통계:

- 총 경기 수
- 전체 승률
- 최근 20경기 승률
- 모드별 승률 요약
- 많이 플레이한 모드
- 많이 플레이한 전장
- 최고 승률 모드
- 최고 승률 전장
- 최근 플레이 일자

친구에게 공개하지 않는 v1 데이터:

- 개별 경기 목록
- 플레이한 정확한 시간대별 상세 row
- 메모
- 태그
- 계정별 전체 데이터
- battle tag
- OCR confidence
- raw screenshot/live frame

## V1 Information Architecture

GNB에 `커뮤니티`를 추가한다.

```txt
홈
기록
세션
통계
커뮤니티
마스터
설정
LIVE
```

라우트:

```txt
/community
/community/friends/:userId
```

커뮤니티 v1 내부 영역:

- 내 프로필
- 친구 찾기
- 받은 요청
- 보낸 요청
- 친구 목록
- 친구 통계 preview

## V1 Data Model

### user_profiles

```sql
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  nickname_normalized text not null,
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  stats_visibility text not null default 'friends',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nickname_normalized)
);
```

### friend_requests

```sql
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  message text not null default '',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);
```

### friendships

```sql
create table public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id),
  check (user_id <> friend_user_id)
);
```

수락 시 `friendships`에는 양방향 row를 넣는다.

```txt
A accepts B
=> (A, B)
=> (B, A)
```

## V1 Backend Contract

친구 관련 변경은 클라이언트가 테이블을 직접 조작하기보다 RPC를 우선한다.

```sql
public.set_my_profile(nickname text, display_name text, bio text)
public.search_profiles(query text)
public.send_friend_request(target_nickname text)
public.cancel_friend_request(request_id uuid)
public.decline_friend_request(request_id uuid)
public.accept_friend_request(request_id uuid)
public.remove_friend(friend_user_id uuid)
public.get_friend_stats(friend_user_id uuid)
```

`get_friend_stats`는 내부에서 친구 관계를 확인하고, 원본 경기 row가 아니라 요약 DTO만 반환한다.

```ts
interface FriendStatsSummary {
  userId: string;
  nickname: string;
  totalMatches: number;
  winRate: number | null;
  recentWinRate: number | null;
  mostPlayedMode: string | null;
  mostPlayedMap: string | null;
  bestMode: {
    modeId: string;
    total: number;
    winRate: number;
  } | null;
  bestMap: {
    mapId: string;
    total: number;
    winRate: number;
  } | null;
  recentPlayedAt: string | null;
}
```

## V1 RLS Policy

### user_profiles

- authenticated 사용자는 검색을 위해 제한된 profile row를 select할 수 있다.
- 사용자는 자기 profile만 insert/update할 수 있다.
- 이메일은 profile에 저장하지 않는다.

### friend_requests

- requester 또는 addressee만 select 가능하다.
- requester만 pending 요청을 만들고 취소할 수 있다.
- addressee만 수락/거절할 수 있다.

### friendships

- `user_id = auth.uid()`인 row만 select 가능하다.
- 직접 insert/update/delete는 금지한다.
- RPC 함수에서만 생성/삭제한다.

### matches

- 기존 own-only RLS를 유지한다.
- 친구가 `matches`를 직접 select할 수 있게 열지 않는다.
- 친구 통계는 security definer RPC 또는 안전한 aggregate endpoint를 통해서만 제공한다.

## V1 Frontend Plan

추가 파일 후보:

```txt
src/pages/CommunityPage.tsx
src/pages/FriendProfilePage.tsx

src/hooks/useUserProfile.ts
src/hooks/useFriends.ts
src/hooks/useFriendRequests.ts
src/hooks/useFriendStats.ts

src/supabase/userProfiles.ts
src/supabase/friends.ts
src/supabase/friendStats.ts
```

UI 원칙:

- 친구/요청/검색은 목록 중심으로 만든다.
- 통계 preview는 작은 카드 남발보다 행/패널 중심으로 구성한다.
- 친구 상세는 원본 경기 로그처럼 보이면 안 된다. summary analytics page처럼 보여야 한다.
- 모바일에서는 검색, 요청, 친구 목록이 세로로 자연스럽게 이어져야 한다.

## V1 Implementation Phases

1. DB migration
   - `user_profiles`, `friend_requests`, `friendships`
   - RLS
   - RPC

2. 타입 갱신
   - `database.types.ts`

3. 프로필 설정
   - 닉네임 설정/수정
   - 중복 체크

4. 친구 요청
   - 검색
   - 요청 보내기/취소
   - 받은 요청 수락/거절

5. 친구 목록
   - 목록
   - 상태별 empty/loading/error
   - 친구 삭제

6. 친구 통계
   - `get_friend_stats`
   - 친구 상세 페이지
   - 요약 통계 preview

7. 커뮤니티 페이지 통합
   - GNB 추가
   - `/community`
   - `/community/friends/:userId`

8. 권한 검증
   - 비친구 통계 접근 불가
   - 친구라도 원본 `matches` 접근 불가
   - 자기 요청이 아닌 요청 조작 불가

## V1.5 Backlog

v1.5는 v1의 친구/프로필/RLS가 안정화된 뒤 확장한다. v1 구현 중에는 아래 기능을 넣지 않는다.

### Friend Activity Feed

친구의 원본 경기 기록이 아니라 이벤트성 요약만 보여준다.

예시:

- `LUXY 님이 오늘 8경기를 기록했습니다.`
- `LUXY 님의 최근 20경기 승률이 58%가 되었습니다.`
- `LUXY 님의 이번 주 최고 승률 전장은 일리오스입니다.`

필요 데이터:

```txt
friend_activity_events
- id
- user_id
- event_type
- payload jsonb
- visibility
- created_at
```

주의:

- 개별 경기 row를 피드에 그대로 노출하지 않는다.
- 사용자가 activity sharing을 끌 수 있어야 한다.
- 너무 잦은 이벤트 생성을 막기 위해 daily/weekly digest 중심으로 시작한다.

### Lightweight Posts

친구끼리만 볼 수 있는 짧은 게시글을 검토한다.

범위:

- 텍스트 280자 내외
- 친구 공개만 지원
- 이미지 첨부 없음
- 댓글 없음
- 삭제 가능

비범위:

- 공개 게시판
- 익명 게시글
- 추천 알고리즘
- 신고/차단 고도화가 필요한 대규모 커뮤니티

### Reactions

친구 activity나 lightweight post에 간단한 반응을 남긴다.

범위:

- `nice`, `gg`, `wow` 같은 제한된 reaction set
- 한 사용자당 한 이벤트/게시글에 하나의 reaction

비범위:

- 자유 이모지
- 댓글 스레드
- 실시간 반응

### Compare With Friend

친구와 나의 summary stat을 나란히 비교한다.

예시:

- 전체 승률
- 최근 20경기 승률
- 모드별 승률
- 공통으로 많이 플레이한 맵
- 서로 강한 맵/약한 맵

주의:

- 상대의 원본 경기 데이터는 여전히 노출하지 않는다.
- 비교는 aggregate끼리만 한다.

### Privacy Controls

통계 공개 범위를 세분화한다.

옵션:

- 친구에게 전체 summary 공개
- 친구에게 최근 폼만 공개
- 친구에게 모드/맵 통계 비공개
- 모든 친구 통계 비공개

v1에서는 `friends` 단일 공개 범위로 시작하고, v1.5에서 세분화한다.

## Later Ideas

v1.5 이후 후보:

- 친구 그룹
- 차단 기능
- 신고 기능
- 커뮤니티 공개 랭킹
- 공개 프로필 링크
- 팀/파티 단위 통계 공유
- 실시간 채팅 또는 presence

이 항목들은 moderation, privacy, abuse 대응이 필요하므로 초기 커뮤니티 범위에 넣지 않는다.
