# External data integration plan

작성일: 2026-06-10

## Product position

외부 오버워치 데이터는 이 서비스의 원본 전적이 아니다. 사용자가 직접 저장한 `matches`와 OCR/LIVE 증거가 제품의 기준 데이터이고, 외부 데이터는 아래 목적의 보조 지표로만 사용한다.

- 계정 프로필 보강: 공개 BattleTag의 아바타, 이름표, 공개 여부, 경쟁전 랭크
- 글로벌 메타 비교: 영웅별 픽률/승률, 역할/티어/지역/맵별 경향
- 마스터 데이터 보강: 신규 영웅, 신규 전장, 이미지 URL, 역할/서브역할
- 커뮤니티 보조 정보: OWCS/OWWC 일정, 공식 방송 링크, 대회 맵풀
- 입력 보조: LIVE/수기 입력 화면에서 맵 또는 영웅 추천 신호 제공

외부 데이터로 다음을 하지 않는다.

- 외부 사이트의 누적 통계를 `matches` row로 역산하거나 생성하지 않는다.
- 개별 경기 기록을 가져온 것처럼 표시하지 않는다.
- 비공개 프로필, 로그인 세션, 토큰, 쿠키를 프록시하지 않는다.
- 차단 회피, 우회 헤더, 과도한 병렬 요청을 사용하지 않는다.
- 소스가 불명확한 값을 사용자 기록보다 더 신뢰도 높게 취급하지 않는다.

## Source inventory

### Blizzard official hero statistics

용도:

- 영웅별 글로벌 픽률/승률
- 필터별 비교 데이터: 역할, 입력 장치, 게임 모드, 티어, 맵, 지역
- "내 영웅 승률 vs 글로벌 메타" 카드
- LIVE 맵 선택 화면에서 추천 신호

특징:

- 공식 웹 페이지다.
- 최근 패치 기준 데이터이며 새 패치 반영에는 지연이 있을 수 있다.
- 공개 API 문서가 아니라 웹 페이지 데이터이므로 Worker에서 낮은 빈도로 수집하고 캐시한다.

Reference:

- https://overwatch.blizzard.com/en-us/rates/

### Blizzard official hero pages

용도:

- 영웅 roster 감지
- 역할, 출신지, 생일, 능력, Stadium powers 등 마스터 데이터 보강
- 마스터 데이터 화면의 영웅 상세 정보

특징:

- 공식성이 가장 높다.
- 텍스트와 asset 구조가 바뀔 수 있으므로 자동 반영보다 "diff 생성 후 검토"를 기본으로 한다.

Reference:

- https://overwatch.blizzard.com/en-us/heroes/

### OverFast API

용도:

- 영웅, 역할, 전장, 게임모드의 정규화된 JSON
- 공개 플레이어 검색
- 공개 플레이어 summary, 아바타, 이름표, 랭크
- 공개 플레이어 커리어/영웅 통계 snapshot
- 글로벌 영웅 통계 API fallback 또는 보강

특징:

- 비공식 API다.
- 자체 설명상 Blizzard 페이지를 scraping해 제공한다.
- OpenAPI 문서와 rate limit/caching 설명이 있다.
- 라이브 인스턴스에 과도하게 의존하지 않고, 필요하면 self-host 경로를 열어 둔다.

Reference:

- https://overfast-api.tekrop.fr/openapi.json
- https://github.com/TeKrop/overfast-api

### OWTICS.GG

용도 후보:

- 영웅 메타, 맵 메타, ICHI rating
- OWCS/OWWC 토너먼트, 일정, 결과, 팀/선수, 대회 맵풀
- 커뮤니티 화면의 대회 캘린더와 "프로 맵풀" 참고

특징:

- 공개 웹 페이지는 풍부하지만 공개 API 문서는 확인되지 않았다.
- "Not affiliated with Blizzard Entertainment"를 명시한다.
- 서비스 기능의 핵심 의존성으로 두지 않는다.
- 공개 API 또는 사용 허가가 확인되기 전에는 낮은 빈도 공개 페이지 수집만 검토한다.

Reference:

- https://owtics.gg/
- https://owtics.gg/en-US/hero
- https://owtics.gg/en-US/esports/tournament

### Official Overwatch Esports

용도:

- OWCS/OWWC 공식 일정
- 공식 방송 링크
- 공식 뉴스, viewer guide, 규정/자격 정보
- 홈 또는 커뮤니티의 "오늘/이번 주 경기" 위젯

특징:

- 공식성이 높다.
- 개인 전적과 직접 연결되지는 않으므로 v2 이후 보조 커뮤니티 기능으로 둔다.

Reference:

- https://esports.overwatch.com/
- https://esports.overwatch.com/en-us/schedule

### Tracker.gg

용도 후보:

- 글로벌 리더보드
- 공개 프로필/친구/스트리머 비교

특징:

- 개발자 API가 있으나 앱 등록과 `TRN-Api-Key`가 필요하다.
- Overwatch가 개발자 API에서 사용 가능한지와 약관을 별도로 확인해야 한다.
- 무단 크롤링 대상에서 제외한다.

Reference:

- https://tracker.gg/overwatch
- https://tracker.gg/developers/docs

### Deprecated or low-priority sources

Overbuff:

- 서비스 종료 상태다.
- 공식 영웅 통계 페이지로 유도하고 있으므로 신규 연동 대상에서 제외한다.

Ow-API:

- Overwatch 1 시절의 레거시 성격이 강하다.
- 최신 Overwatch 2 데이터 구조와 맞지 않을 가능성이 커서 백업 참고 자료로만 둔다.

## Architecture

외부 요청은 모두 Cloudflare Worker를 통과한다.

```text
Cloudflare Pages app
  -> Supabase Auth session
  -> Cloudflare Worker external-data API
  -> external source or Worker cache
  -> Supabase normalized tables
  -> React Query hooks
  -> UI as supplemental indicators
```

프론트엔드는 외부 사이트를 직접 호출하지 않는다.

이유:

- CORS와 rate limit을 Worker에서 통제한다.
- API 키와 source별 설정을 브라우저에 노출하지 않는다.
- 외부 소스 장애가 앱 전체 장애로 번지지 않게 한다.
- 외부 원본 payload를 그대로 UI에 퍼뜨리지 않고 정규화한다.
- 소스별 TTL, retry, backoff, negative cache를 한 곳에서 관리한다.

## Cloudflare-first boundary

현재 서비스는 이미 Cloudflare 중심으로 운영하기 좋다.

- Web app: Cloudflare Pages
- Static images and uploaded avatars: Cloudflare R2
- Image upload API: Cloudflare Worker, currently documented around `api-ow.naco.kr`
- External data proxy/crawler: Cloudflare Worker
- Short-lived cache: Cloudflare Cache API or KV
- Scheduled refresh: Cloudflare Workers Cron Triggers
- Optional dedupe/queueing: Cloudflare Queues or Durable Objects
- Source of truth DB: Supabase Postgres
- Auth/RLS boundary: Supabase Auth and Supabase RLS

따라서 외부 데이터 연동도 Cloudflare 내부에서 최대한 처리한다. Supabase에는 Worker가 검증하고 정규화한 결과만 저장한다.

Cloudflare가 맡는 영역:

- 외부 source 호출
- HTML/JSON parsing
- 요청 제한과 캐시
- stale fallback
- R2 asset 저장이 필요한 경우의 파일 처리
- cron 기반 refresh
- source 장애와 fetch 이력 기록 생성

Supabase가 맡는 영역:

- 사용자 계정과 `player_accounts`
- 내부 원본 전적 `matches`
- 외부 프로필/통계 snapshot의 영구 저장
- 친구 공개 정책과 RLS
- 앱에서 조회할 정규화 DTO의 기준 데이터

Cloudflare KV/Cache에는 재생성 가능한 데이터만 둔다. 사용자가 나중에 다시 봐야 하는 외부 프로필 snapshot, 글로벌 메타 snapshot, esports event row는 Supabase에 저장한다.

## API host and routing

`api-ow.naco.kr`는 이미 이미지 업로드 Worker에서 사용하는 API 호스트로 본다. 외부 데이터 연동은 이 호스트 전체를 새 Worker가 차지한다는 전제로 진행하지 않는다.

권장 경로 prefix:

```text
api-ow.naco.kr/avatars/*   -> existing avatar upload Worker
api-ow.naco.kr/external/*  -> external data Worker
```

구현 시 선택지는 세 가지다.

1. Cloudflare route pattern으로 path별 Worker를 나눈다.
2. 기존 API Worker를 작은 gateway Worker로 확장하고 `/avatars/*`, `/external/*`를 내부에서 분기한다.
3. 충돌이 있으면 별도 호스트를 쓴다. 예: `external-api-ow.naco.kr`

우선순위는 1번이다. 기존 avatar upload 경로를 유지하면서 외부 데이터 경로만 추가할 수 있기 때문이다. 단, 현재 `api-ow.naco.kr`가 Worker custom domain으로 직접 연결되어 있고 같은 host에 다른 Worker를 붙이기 어려운 상태라면, 작업 시점에 route pattern 전환 또는 gateway Worker 방식을 검토한다.

작업 전에는 현재 Cloudflare 설정을 먼저 확인한다.

- `api-ow.naco.kr`가 어떤 Worker 또는 route에 연결되어 있는지
- `/avatars/upload`가 현재 어떤 Worker에서 처리되는지
- Cloudflare zone route pattern을 path 단위로 추가할 수 있는지
- Pages 앱의 `VITE_AVATAR_UPLOAD_URL` 값이 어떤 endpoint를 가리키는지

외부 데이터 작업 중 기존 avatar upload Worker를 overwrite하지 않는다.

## Worker responsibilities

Cloudflare Worker는 다음 책임만 가진다.

- 인증: Supabase JWT 검증이 필요한 endpoint와 공개 cache endpoint 분리
- 요청 정규화: BattleTag, region, platform, gamemode, tier, map key 변환
- source allowlist: 허용된 host와 path만 호출
- rate limit: 사용자별, IP별, source별 제한
- cache: KV 또는 Cache API 기반 TTL 적용
- stale fallback: 외부 source 실패 시 최근 정상 snapshot 반환
- response shaping: 앱 DTO로 변환
- audit logging: source, status, latency, cache status, error class 기록

Worker가 하지 않는 일:

- 사용자 원본 경기 기록 생성
- 비공개 Battle.net/Blizzard 세션 대리 접근
- 외부 HTML 전체 저장
- 큰 이미지/asset 영구 저장
- 장기 통계 집계

## Suggested Worker routes

```text
GET /external/health
GET /external/sources

GET /external/overfast/players/search?name={battleTagOrName}
GET /external/overfast/players/:playerId/summary
POST /external/player-accounts/:accountId/sync

GET /external/meta/heroes
GET /external/meta/maps
POST /external/meta/diff

GET /external/global/hero-rates?region=asia&gamemode=competitive&tier=diamond&map=kings-row
POST /external/global/hero-rates/refresh

GET /external/esports/events?from=2026-06-10&to=2026-06-17
POST /external/esports/events/refresh
```

Public-ish cache endpoints:

- `GET /external/meta/heroes`
- `GET /external/meta/maps`
- `GET /external/global/hero-rates`
- `GET /external/esports/events`

Authenticated endpoints:

- `POST /external/player-accounts/:accountId/sync`
- `POST /external/meta/diff`
- `POST /external/*/refresh`

## Data model

### external_sources

Source별 정책을 DB에서 관리한다.

```sql
create table public.external_sources (
  id text primary key,
  display_name text not null,
  base_url text not null,
  source_type text not null,
  is_enabled boolean not null default true,
  is_official boolean not null default false,
  default_ttl_seconds integer not null default 3600,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

초기 row 후보:

```text
blizzard_hero_rates
blizzard_heroes
overfast
official_esports
owtics
tracker_gg
```

### external_fetch_runs

수집 이력과 장애 판단용 로그를 남긴다.

```sql
create table public.external_fetch_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.external_sources(id),
  job_key text not null,
  request_url text not null default '',
  status text not null,
  http_status integer,
  cache_status text not null default 'miss',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text not null default '',
  metadata jsonb not null default '{}'::jsonb
);
```

### external_player_profiles

사용자 계정과 외부 공개 프로필을 연결한다.

```sql
create table public.external_player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.player_accounts(id) on delete cascade,
  source_id text not null references public.external_sources(id),
  external_player_id text not null,
  public_name text not null default '',
  avatar_url text,
  namecard_url text,
  title text,
  is_public boolean,
  platform text,
  region text,
  competitive_ranks jsonb not null default '{}'::jsonb,
  raw_summary jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (account_id, source_id)
);
```

RLS:

- 사용자는 본인 `user_id` row만 select/insert/update/delete 가능
- 친구에게 공개할 때도 원본 `raw_summary`는 노출하지 않고 요약 DTO만 반환

### external_player_stats_snapshots

공개 프로필의 누적 통계를 snapshot으로 저장한다. 이 값은 `matches`와 합치지 않는다.

```sql
create table public.external_player_stats_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.player_accounts(id) on delete cascade,
  source_id text not null references public.external_sources(id),
  platform text not null default 'pc',
  gamemode text not null default 'competitive',
  general jsonb not null default '{}'::jsonb,
  roles jsonb not null default '{}'::jsonb,
  heroes jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
```

사용처:

- 계정 상세의 "외부 공개 프로필" 탭
- StatsPage의 "내 수기 기록 vs 공개 누적 통계" 참고 카드
- 친구 화면에서는 사용자가 공개 설정을 켠 경우만 요약 노출

### global_hero_rate_snapshots

공식/비공식 글로벌 메타를 필터 조합별로 저장한다.

```sql
create table public.global_hero_rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.external_sources(id),
  patch_label text not null default '',
  region text not null default 'all',
  input_method text not null default 'mouse_keyboard',
  gamemode text not null default 'competitive',
  tier text not null default 'all',
  map_id text not null default 'all',
  role text not null default 'all',
  hero_id text not null,
  pick_rate numeric,
  win_rate numeric,
  sample_state text not null default 'available',
  fetched_at timestamptz not null default now(),
  unique (source_id, region, input_method, gamemode, tier, map_id, role, hero_id, fetched_at)
);
```

조회 최적화가 필요해지면 `fetched_at` 기준 latest view 또는 materialized view를 둔다.

### external_esports_events

공식 esports/OWTICS 일정 데이터를 정규화한다.

```sql
create table public.external_esports_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.external_sources(id),
  external_event_id text not null,
  series text not null default '',
  tournament text not null default '',
  stage text not null default '',
  region text not null default '',
  status text not null default 'scheduled',
  starts_at timestamptz,
  team_a text not null default '',
  team_b text not null default '',
  score_a integer,
  score_b integer,
  watch_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (source_id, external_event_id)
);
```

## Frontend integration

### Settings

계정 설정에 외부 동기화 영역을 추가한다.

- BattleTag 입력값 검증
- 공개 프로필 검색
- 검색 결과 선택
- `player_accounts`와 `external_player_profiles` 연결
- 마지막 동기화 시각 표시
- 동기화 실패 사유 표시: 비공개, 찾을 수 없음, rate limited, source unavailable

### Profile and community

프로필 보강:

- 외부 아바타를 기본값 후보로 제안
- 공개 랭크와 title 표시
- 외부 공개 통계는 "외부 공개 프로필" 라벨을 붙인다.

친구 공개:

- 기본은 비공개
- 사용자가 켠 경우에도 summary만 노출
- `raw_summary`, `raw career stats`, BattleTag 원문은 공개하지 않는다.

### Stats

통계 화면에 글로벌 비교 레이어를 추가한다.

예시 카드:

```text
Ana
내 기록: 12승 8패, 승률 60.0%
글로벌: Asia / Competitive / Diamond+ 승률 46.9%, 픽률 31.2%
차이: +13.1pp
```

표시 규칙:

- 내 기록이 없는 영웅은 기본 통계 화면에 끼워 넣지 않는다.
- 글로벌 데이터는 "비교" 탭 또는 보조 컬럼으로만 표시한다.
- 외부 데이터가 없으면 해당 비교만 숨긴다.
- source와 fetched time을 작게 표시한다.

### LIVE

LIVE 추천에는 외부 글로벌 메타를 낮은 가중치로만 사용한다.

추천 점수 후보:

```text
score =
  my_map_win_rate_weight
  + my_recent_form_weight
  + my_hero_pool_weight
  + global_map_hero_rate_weight
```

글로벌 데이터는 신규 맵/신규 영웅처럼 내 기록이 부족한 경우에만 영향력을 조금 높인다.

## Sync policy

### TTL

권장 초기값:

```text
hero roster: 24h
map roster: 24h
global hero rates: 6h
player search: 10m
player summary: 30m
player stats summary: 1h
esports schedule: 15m during active events, 6h otherwise
negative cache for not found: 1h
```

### Refresh triggers

자동:

- 하루 1회 마스터 데이터 diff
- 6시간마다 자주 쓰는 글로벌 메타 필터 refresh
- esports 일정은 대회 기간에만 더 짧은 TTL

사용자 액션:

- 계정 설정에서 "외부 프로필 동기화"
- 통계 화면에서 "글로벌 비교 새로고침"

백오프:

- 429: `Retry-After` 우선
- 503/504: exponential backoff
- 404 player not found: negative cache
- parse failure: source disabled 후보로 기록하고 최근 정상 snapshot 유지

## Implementation phases

### Phase 0: policy and schema

- 이 문서를 기준으로 외부 데이터 원칙 확정
- Supabase migration 추가
- `external_sources` seed 추가
- RLS 정책 작성
- 외부 데이터 DTO 타입 초안 작성

완료 기준:

- 외부 데이터가 `matches`와 분리된 별도 테이블에 저장된다.
- 친구/커뮤니티 공개 정책이 raw 외부 payload를 노출하지 않는다.

### Phase 1: Cloudflare Worker foundation

- `workers/external-data/index.js` 또는 TypeScript Worker 추가
- source allowlist 추가
- Supabase JWT 검증 유틸 추가
- Cache API/KV cache wrapper 추가
- 공통 fetch wrapper 추가: timeout, retry, status mapping, stale fallback
- `/external/health`, `/external/sources` 구현

완료 기준:

- 프론트가 외부 도메인을 직접 호출하지 않는다.
- Worker 로그로 cache hit/miss와 source 장애를 확인할 수 있다.

### Phase 2: OverFast profile sync

- `GET /external/overfast/players/search`
- `GET /external/overfast/players/:playerId/summary`
- `POST /external/player-accounts/:accountId/sync`
- `player_accounts` 설정 UI에서 동기화 버튼 추가
- `external_player_profiles` 저장

완료 기준:

- 사용자가 BattleTag를 계정과 연결할 수 있다.
- 공개 프로필이면 아바타/이름표/랭크가 계정 카드에 보조 정보로 표시된다.
- 비공개/찾을 수 없음/rate limit이 구분되어 표시된다.

### Phase 3: global hero rate snapshots

- Blizzard official hero statistics 수집 방식을 검증한다.
- 우선은 OverFast `/heroes/stats`를 안정적 JSON fallback으로 둔다.
- `global_hero_rate_snapshots` 저장 job 구현
- StatsPage에 비교 컬럼 또는 비교 탭 추가

완료 기준:

- 내 영웅별 통계 옆에 같은 필터의 글로벌 픽률/승률을 표시한다.
- 외부 데이터가 없으면 UI가 조용히 degrade된다.

### Phase 4: master data diff

- `GET /external/meta/heroes`
- `GET /external/meta/maps`
- 현재 `src/data/matchOptions.ts`와 외부 roster 비교 스크립트 작성
- 신규 영웅/전장 감지 결과를 markdown 또는 JSON diff로 출력
- 이미지 asset 갱신은 수동 승인 기반으로 유지

완료 기준:

- 신규 영웅/맵이 나오면 마스터 데이터 누락을 빠르게 감지한다.
- 자동으로 사용자 입력 옵션을 깨뜨리지 않는다.

### Phase 5: esports events

- 공식 esports schedule 수집
- 필요하면 OWTICS esports 데이터를 보조 source로 추가
- `external_esports_events` 저장
- 커뮤니티 또는 홈에 "이번 주 OWCS/OWWC" 위젯 추가

완료 기준:

- 공식 일정과 방송 링크를 볼 수 있다.
- 대회 데이터는 개인 전적 분석의 핵심 플로우를 방해하지 않는다.

## Risk management

### Legal and terms risk

- 공식 API가 아닌 웹 페이지 수집은 최소 요청, 명확한 cache, attribution을 기본값으로 한다.
- `robots.txt`, 서비스 약관, 공개 API 문서가 있으면 그 기준을 우선한다.
- Tracker.gg는 API key 기반 승인 전에는 크롤링하지 않는다.
- OWTICS는 공개 API 또는 사용 허가 확인 전에는 핵심 기능 의존성을 만들지 않는다.

### Technical risk

- 외부 HTML 구조 변경: parser failure를 정상 장애로 취급하고 stale snapshot을 사용한다.
- source 장애: 앱 통계 화면은 내부 기록만으로 동작해야 한다.
- rate limit: Worker에서 요청 병합과 cache를 우선한다.
- 데이터 불일치: source, fetched time, filter label을 항상 표시한다.
- 개인정보: BattleTag와 외부 공개 프로필은 사용자 본인에게만 기본 노출한다.

## Quality checklist

- 외부 데이터 호출은 모두 Cloudflare Worker를 통한다.
- 외부 데이터는 `matches`를 생성하거나 수정하지 않는다.
- 모든 외부 지표에는 source와 fetched time이 있다.
- Worker에는 source allowlist와 timeout이 있다.
- 429/503/504/404를 사용자에게 구분해 보여준다.
- stale snapshot이 있으면 외부 장애 중에도 UI가 깨지지 않는다.
- RLS는 사용자별 외부 프로필/스냅샷을 보호한다.
- 친구 공개는 summary DTO만 허용한다.
- 새 마스터 데이터는 자동 배포가 아니라 diff 검토 후 반영한다.
- `npm run lint`와 `npm run build`가 통과해야 한다.
