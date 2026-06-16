# External data Cloudflare setup

외부 데이터 API는 기존 avatar upload Worker를 덮어쓰지 않고 `/external/*` 경로만 담당한다.

## 1. Supabase 준비

먼저 Supabase SQL Editor에서 아래 migration을 실행한다.

```text
supabase/migrations/20260616010000_external_data_foundation.sql
```

필요한 값:

```text
SUPABASE_URL=https://{project-ref}.supabase.co
SUPABASE_ANON_KEY={publishable key}
SUPABASE_SERVICE_ROLE_KEY={service role key}
```

`SUPABASE_SERVICE_ROLE_KEY`는 Worker secret으로만 넣는다. 브라우저, `.env.local`, Pages public env에는 절대 넣지 않는다.

## 2. Worker 생성

Cloudflare Dashboard에서 Workers & Pages로 이동한다.

권장 Worker 이름:

```text
ow-external-data
```

Worker 코드는 아래 파일을 사용한다.

```text
workers/external-data/index.js
```

Dashboard에서 `ow-external-data -> Edit code`에 파일 내용을 붙여넣고 Deploy 한다.

## 3. Worker 변수와 secret

Worker Settings -> Variables에 추가한다.

일반 environment variables:

```text
SUPABASE_URL=https://{project-ref}.supabase.co
SUPABASE_ANON_KEY={supabase publishable key}
ALLOWED_ORIGINS=https://ow.naco.kr,http://localhost:5173
SOURCES_CACHE_TTL_SECONDS=300
```

Secrets:

```text
SUPABASE_SERVICE_ROLE_KEY={supabase service role key}
```

Cloudflare CLI를 쓴다면:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

개발 중 수동 수집 endpoint는 별도 secret 없이 열어둔다. 운영에서 외부 공개 호출을 막고 싶으면 나중에 collector secret 또는 관리자 인증을 추가한다.

## 4. Route 연결

권장 route:

```text
api-ow.naco.kr/external/*
```

중요:

- 기존 avatar upload Worker가 `api-ow.naco.kr/avatars/*`, `api-ow.naco.kr/community/images/*`를 계속 처리해야 한다.
- `api-ow.naco.kr/*` 전체를 `ow-external-data`에 연결하지 않는다.
- Cloudflare route pattern으로 path별 Worker를 나누는 방식이 1순위다.

권장 routing:

```text
api-ow.naco.kr/avatars/*           -> ow-avatar-upload
api-ow.naco.kr/community/images/*  -> ow-avatar-upload
api-ow.naco.kr/external/*          -> ow-external-data
```

만약 `api-ow.naco.kr`가 Worker custom domain으로 직접 연결되어 path별 route 추가가 어렵다면 선택지는 둘 중 하나다.

1. 기존 Worker를 gateway로 바꾸고 `/avatars/*`, `/community/images/*`, `/external/*`를 내부 분기한다.
2. 별도 호스트를 만든다.

별도 호스트 예시:

```text
external-api-ow.naco.kr/*
```

이 경우 앱 환경 변수도 별도 호스트로 지정한다.

```text
VITE_EXTERNAL_DATA_API_URL=https://external-api-ow.naco.kr
```

## 5. 프론트 환경 변수

Cloudflare Pages 또는 로컬 `.env.local`에 추가한다.

같은 API 호스트를 쓰는 경우:

```text
VITE_EXTERNAL_DATA_API_URL=https://api-ow.naco.kr
```

별도 호스트를 쓰는 경우:

```text
VITE_EXTERNAL_DATA_API_URL=https://external-api-ow.naco.kr
```

## 6. 동작 확인

브라우저 또는 터미널에서 확인한다.

```bash
curl https://api-ow.naco.kr/external/health
curl https://api-ow.naco.kr/external/sources
curl https://api-ow.naco.kr/external/global-hero-rates
curl https://api-ow.naco.kr/external/esports-events
```

개발 중 수동 수집:

```bash
curl -X POST https://api-ow.naco.kr/external/collect/all
curl -X POST https://api-ow.naco.kr/external/collect/global-hero-rates
curl -X POST https://api-ow.naco.kr/external/collect/esports-events
```

수동 수집 후 조회:

```bash
curl https://api-ow.naco.kr/external/global-hero-rates
curl https://api-ow.naco.kr/external/esports-events
```

정상 응답 예:

```json
{
  "ok": true,
  "service": "external-data"
}
```

```json
{
  "sources": [
    {
      "id": "overfast",
      "displayName": "OverFast API",
      "baseUrl": "https://overfast-api.tekrop.fr",
      "sourceType": "third_party_api",
      "isEnabled": true,
      "isOfficial": false,
      "defaultTtlSeconds": 3600,
      "notes": "...",
      "updatedAt": "..."
    }
  ]
}
```

수집 데이터가 아직 없으면 아래 route는 빈 배열을 반환한다.

```json
{
  "heroRates": []
}
```

```json
{
  "esportsEvents": []
}
```

## 7. Cron Trigger

Cloudflare Dashboard에서 Worker에 Cron Trigger를 추가한다.

```text
Workers & Pages
-> ow-external-data
-> Settings
-> Triggers
-> Cron Triggers
-> Add Cron Trigger
```

권장 주기:

```text
0 */6 * * *
```

6시간마다 `scheduled()`가 실행되고 아래 수집을 같이 수행한다.

- Blizzard 공식 Hero Statistics
- OverFast 경쟁전 영웅 통계
- 공식 Overwatch Esports 일정

수집 결과와 실패 이유는 `external_fetch_runs`에 기록된다.

## 8. 다음 구현 순서

1. `GET /external/overfast/players/search`
2. `GET /external/overfast/players/:playerId/summary`
3. `POST /external/player-accounts/:accountId/sync`
4. AI 분석용 `ExternalStatsInsightContext` 생성

AI 분석에 넣을 때는 외부 데이터를 원본 전적으로 섞지 않는다. `matches`에서 계산한 내부 후보를 먼저 만들고, 외부 글로벌 승률/픽률은 보조 비교 문맥으로만 전달한다.
