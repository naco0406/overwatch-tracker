# Overwatch Tracker

개인용 오버워치 전적 트래커입니다. v1 목표는 스코어보드 스크린샷 OCR 입력, 수기 입력 폴백, 세션/통계 조회입니다.

## 개발 명령어

```bash
npm install
npm run dev
npm run build
npm run lint
npm run format
```

## 환경 변수

Supabase 연동은 M1에서 붙입니다. 실제 값은 `.env.local`에 넣고, 저장소에는 `.env.example`만 유지합니다.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## Supabase 세팅 요약

1. Supabase 프로젝트를 생성합니다.
2. Project URL과 publishable key를 `.env.local`에 넣습니다.
3. Authentication > Users에서 개인 계정을 수동 생성합니다.
4. `PRD.md`의 Supabase schema/RLS SQL을 SQL Editor에서 실행합니다.
5. 앱에는 `@supabase/supabase-js` client, Auth helper, Match CRUD 순서로 붙입니다.

자세한 절차는 `PRD.md`의 `14. Supabase 세팅 가이드`를 기준으로 합니다.

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
NODE_VERSION=22.16.0
```

`main`에 push되면 production 배포가 실행됩니다. 다른 브랜치/PR은 preview deployment로 확인합니다.

`public/_redirects`는 React Router deep link 새로고침을 위해 유지합니다. `.node-version`은 Cloudflare Pages 빌드 Node 버전을 Vite 요구사항에 맞춰 고정합니다.

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
