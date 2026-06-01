# Stats scaling design

작성일: 2026-06-01

## Display rule

통계 화면은 데이터가 있는 축만 보여준다.

- 모드별 통계: 기록이 1개 이상 있는 모드만 표시한다.
- 맵별 통계: 기록이 1개 이상 있는 맵만 표시한다.
- 영웅별 통계: 영웅이 기록된 경기만 해당 영웅 통계에 반영한다. 영웅 미지정 경기는 모드/맵/전체 승률에는 포함한다.
- 시간대별 통계: 기록이 1개 이상 있는 시간대만 표시한다.
- 세션 순서별 통계: 해당 순서의 경기가 실제로 있는 경우만 표시한다.

빈 축을 보여주지 않는 이유는 이 제품의 핵심 질문이 "어디에서 이기고 지는가"이지, 전체 마스터 데이터의 완전성을 검토하는 것이 아니기 때문이다.

## Current architecture

현재 v1은 `matches`를 클라이언트로 가져와서 브라우저에서 필터링/집계한다.

이 방식은 다음 범위까지 단순하고 비용 효율적이다.

- 개인 사용
- 수천 건 규모의 경기 기록
- 단일 사용자가 한 번에 본인 데이터만 조회
- 필터 조건이 기간/모드/맵/계정/큐/영웅 수준

React Query 캐시가 같은 세션의 반복 탐색 비용을 줄이고, Supabase RLS는 사용자별 데이터 접근을 제한한다.

## Scaling thresholds

아래 중 하나라도 해당하면 서버 집계로 이전한다.

- 단일 사용자의 기록이 10,000건 이상
- 통계 화면 초기 로드가 1초를 자주 넘김
- `matches` 전체 조회 응답이 1MB를 자주 넘김
- 모바일에서 통계 탭 전환이 눈에 띄게 끊김
- 기간 필터가 아닌 전체 조회를 자주 사용

## Server aggregation path

### Phase 1: paged record queries

전체 기록 페이지는 최신순 페이지네이션으로 전환한다.

- `/records`: `range(from, to)` 또는 cursor 기반 조회
- 상세 검색은 필요한 필드에 인덱스를 추가한다.
- 통계 페이지는 여전히 기존 클라이언트 집계를 유지한다.

### Phase 2: Supabase RPC aggregation

통계 화면은 raw match row 대신 집계 결과를 받는다.

예상 RPC:

```sql
create or replace function public.get_match_stats(
  p_user_id uuid,
  p_played_from timestamptz default null,
  p_played_to timestamptz default null,
  p_mode_id public.mode_id default null,
  p_account_id uuid default null,
  p_queue_type public.queue_type default null,
  p_hero_id text default null
)
returns jsonb
language sql
security invoker
as $$
  -- mode/map/hour/order buckets only for rows that exist
$$;
```

RPC는 `auth.uid()`와 RLS를 전제로 security invoker로 둔다. 프론트엔드는 `useStatsSummary(filters)` 같은 훅으로 교체해 호출부를 분리한다.

### Phase 3: daily aggregate table

기록이 더 커지고 전체 기간 통계를 자주 보면 일별 집계 테이블을 둔다.

후보 테이블:

- `match_stat_daily_mode`
- `match_stat_daily_map`
- `match_stat_daily_hour`
- `match_stat_daily_hero`

키:

- `user_id`
- `stat_date`
- 선택 축: `mode_id`, `map_id`, `hour`, `hero_id`, `account_id`, `queue_type`

값:

- `matches`
- `wins`
- `losses`
- `draws`

업데이트 방식:

- 초기에는 경기 저장/수정/삭제 후 RPC로 해당 날짜만 재계산한다.
- 더 많은 쓰기량이 필요해지면 Postgres trigger 또는 scheduled job으로 옮긴다.

## Frontend boundary

프론트엔드는 통계 원천을 다음 경계로 캡슐화한다.

- 현재: `useMatches()` + `summarizeResults()`
- 다음: `useStatsSummary(filters)` + 서버 집계 DTO

화면 컴포넌트는 "이미 집계된 bucket 배열"을 받는 구조를 유지해야 한다. 이렇게 하면 raw row 집계에서 RPC/aggregate table로 넘어갈 때 UI 변경 없이 데이터 훅만 바꿀 수 있다.

## Index strategy

현재 인덱스:

- `(user_id, played_at desc)`
- `(user_id, mode_id, played_at desc)`
- `(user_id, map_id, played_at desc)`
- `match_heroes(user_id, hero_id)`

기록/통계 성능이 떨어지면 추가 후보:

- `(user_id, result, played_at desc)`
- `(user_id, account_id, played_at desc)`
- `(user_id, queue_type, played_at desc)`
- `(user_id, played_at desc, id)` for stable cursor pagination

인덱스는 쓰기 비용도 올리므로, 실제 쿼리 패턴이 확인된 뒤 추가한다.
