# Overwatch Tracker

개인용 오버워치 전적 트래커입니다. v1 목표는 스코어보드 스크린샷 OCR 입력, 수기 입력 폴백, 세션/통계 조회입니다.

## 개발 명령어

```bash
npm install
npm run dev
npm run dev:pages
npm run build
npm run lint
npm run format
```

## 환경 변수

실제 값은 `.env.local`에 넣고, 저장소에는 `.env.example`만 유지합니다.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_EXTERNAL_DATA_API_URL=
VITE_GOOGLE_MAPS_BROWSER_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
GOOGLE_MAPS_SERVER_KEY=
```

`VITE_`로 시작하는 값은 브라우저 번들에 포함됩니다. `GEMINI_API_KEY`와
`GOOGLE_MAPS_SERVER_KEY`는 Cloudflare Pages Functions/Workers 같은 서버 환경 변수로만
설정하세요.

## Supabase 세팅 요약

1. Supabase 프로젝트를 생성합니다.
2. Project URL과 publishable key를 `.env.local`에 넣습니다.
3. Authentication > Providers에서 Email provider를 켭니다.
4. Authentication > URL Configuration에 로컬/배포 URL을 등록합니다.
5. Supabase Dashboard > SQL Editor에서 `supabase/migrations/20260527000000_initial_schema.sql` 전체를 실행합니다.
6. 앱에서 회원가입/로그인 후 수기 입력 폼 또는 개발 콘솔에서 Match CRUD를 검증합니다.

자세한 절차는 `PRD.md`의 `14. Supabase 세팅 가이드`를 기준으로 합니다.

현재 프론트엔드에는 다음 데이터 계층이 준비되어 있습니다.

- `src/supabase/matches.ts`: 경기 목록/상세/생성/수정/삭제
- `src/hooks/useMatches.ts`: React Query 기반 Match hooks
- `src/supabase/userSettings.ts`: 사용자 기본 계정/큐/ROI 설정
- `src/hooks/useUserSettings.ts`: React Query 기반 Settings hooks

## 배포

Cloudflare Pages에 GitHub 저장소를 연결해서 자동 배포합니다.

```text
Framework preset: Vite
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
```

Cloudflare Pages 환경 변수:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_EXTERNAL_DATA_API_URL=
VITE_GOOGLE_MAPS_BROWSER_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
GOOGLE_MAPS_SERVER_KEY=
NODE_VERSION=22.16.0
```

`main`에 push되면 production 배포가 실행됩니다. 다른 브랜치/PR은 preview deployment로 확인합니다.

`public/_redirects`는 React Router deep link 새로고침을 위해 유지합니다. `.node-version`은 Cloudflare Pages 빌드 Node 버전을 Vite 요구사항에 맞춰 고정합니다.

## 임시 도쿄 여행 페이지

`/tokyo-travel-2026`는 안란방 도쿄 여행용 임시 미니앱입니다. 기존 오버워치
`AppLayout`/인증 라우트 바깥에서 독립 화면으로 렌더링됩니다. 라우팅과 상단 배너는
`src/features/temporaryFeatures.ts`의 플래그로 분리되어 있어, 나중에 페이지 코드는 남겨두고
진입점만 쉽게 끌 수 있습니다.

- 현재 구현: 홈 대시보드, 현위치 주소/정확도 표시, Google Weather 기반 날씨/준비물 판단, 일정 탭, 식사/추천 UI, Places API 주변 검색, 지도 링크, 장소, 숙소/공항 정보, 번역/이미지 해석 UI
- 실제 API 연결: `/api/gemini/*` Cloudflare Pages Functions에서 `GEMINI_API_KEY`로 처리
- Google Maps: `/api/maps/nearby-search`는 `GOOGLE_MAPS_SERVER_KEY`로 Places API Nearby Search를 호출하고, `/api/maps/reverse-geocode`는 같은 서버 키로 현재 좌표를 주소로 변환합니다. Geocoding API가 실패하면 Places API 근처 장소명으로 보완하고, 그래도 실패하면 좌표 기준 위치로 정상 응답합니다. `/api/maps/weather`는 Google Weather API를 먼저 호출하고, Google Weather가 해당 지역을 지원하지 않으면 Open-Meteo 예보로 자동 전환합니다. 길찾기/상세 이동은 Google Maps URL로 연결합니다.

### API 키 설정

Gemini API 키는 Google AI Studio에서 생성하고, Cloudflare Pages 프로젝트의
`Settings > Environment variables`에 `GEMINI_API_KEY`로 등록합니다. 이 값은 서버 전용이며
`VITE_` prefix를 붙이면 안 됩니다. 모델을 바꿀 때만 `GEMINI_MODEL`을 함께 등록합니다.

Google Maps는 브라우저용 키와 서버용 키를 분리합니다.

- `VITE_GOOGLE_MAPS_BROWSER_KEY`: Maps JavaScript API처럼 브라우저에서 호출 가능한 기능용입니다.
  Google Cloud Console에서 HTTP referrer 제한과 API 제한을 설정한 뒤 Cloudflare Pages 환경 변수에
  등록합니다.
- `GOOGLE_MAPS_SERVER_KEY`: Places API, Routes API처럼 서버에서 대리 호출할 기능용입니다.
  브라우저 번들에 포함하지 말고 Cloudflare Pages Functions 환경 변수로만 등록합니다.
  현재 `/api/maps/nearby-search`에서 Places API Nearby Search, `/api/maps/reverse-geocode`에서 Geocoding API와 Places API fallback,
  `/api/maps/weather`에서 Google Weather API를 사용하므로 Google Cloud Console에서 `Places API (New)`,
  `Geocoding API`, `Weather API`를 활성화하고 이 서버 키의 API 제한에도 세 API를 모두 포함합니다. `Geocoding API`가 빠져도 좌표/근처 장소 fallback은 동작하지만 정확한 주소 표시는 제한됩니다. 단, Google Weather API는 일본의 현재/일별 예보를 지원하지 않으므로
  도쿄 날씨는 서버 함수에서 Open-Meteo로 자동 보완합니다.

로컬 Functions 개발 시에는 Cloudflare Pages Functions 런타임으로 실행해야 `functions/api/*`와
서버 환경 변수를 함께 확인할 수 있습니다.

```bash
npm run dev:pages
```

`npm run dev`는 Vite 개발 서버만 실행하므로 `/api/gemini/*`, `/api/maps/*` 같은
Cloudflare Pages Functions 경로는 404가 납니다. API까지 로컬에서 확인할 때는
`npm run dev:pages`로 실행하고 Wrangler가 출력하는 `http://127.0.0.1:8788` 주소를
사용하세요.

Wrangler 로컬 비밀값은 프로젝트 루트의 `.dev.vars` 또는 `.env.local`에 둡니다.
예시는 다음과 같습니다.

```bash
GEMINI_API_KEY=...
GOOGLE_MAPS_SERVER_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
```

## 폴더 구조

```text
src/
  components/
    ui/        shadcn/ui 기반 컴포넌트
    input/     경기 입력, OCR 확인 모달
    session/   세션 타임라인과 경기 카드
    stats/     통계 필터와 차트
    common/    앱 공통 레이아웃
  ocr/         OCR 파이프라인
  data/        영웅, 맵, 모드 마스터 데이터
  supabase/    Supabase client, Auth, Match CRUD, DB 타입
  hooks/       React hooks
  store/       Zustand UI 상태
  lib/         타입, 스키마, 집계, 유틸리티
  pages/       라우트 페이지
```

## 현재 라우트

- `/login`
- `/`
- `/sessions`
- `/stats`
- `/settings`
