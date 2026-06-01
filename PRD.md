# 오버워치 개인 전적 트래커 — PRD v4

> 작성일: 2026-05-27
> 개정일: 2026-06-01
> 버전: v4 (Manual-first 전환)
> 대상: 개인 사용 (단일 사용자)
> v4에서 달라진 점: 메인 입력 플로우를 스크린샷 자동 인식에서 홈 수기 빠른 기록으로 전환. OCR은 삭제하지 않고 보조/고급 입력으로 유지

---

## 1. 핵심 컨셉

**홈에서 한 판을 빠르게 수기 기록한다. OCR은 보조 입력이다.**

게임이 끝나면 홈에서 맵, 스코어, 결과만 입력하고 저장한다. 플레이 시간, 세션, 계정, 큐, 입력 출처는 앱이 자동으로 채운다. 모드는 맵 선택으로 자동 결정한다.

스크린샷 붙여넣기와 자동 인식은 유지하지만, 제품의 기본 성공 경험은 “모달 없이 10초 안에 한 판 저장”이다. 영웅, 태그, 메모, 팀 조합은 분석이 필요할 때만 입력하는 선택 정보다.

---

## 2. 우선순위 (확정)

| 순위 | 가치                               | 구현 위치 |
| ---- | ---------------------------------- | --------- |
| 1    | 홈 빠른 수기 기록                  | v1        |
| 2    | 모드별/맵별 승률 확인              | v1        |
| 3    | 스프레드시트형 전체 기록/벌크 수정 | v1        |
| 4    | OCR 보조 입력                      | v1.1      |
| 5    | 능동적 코칭 신호                   | v2        |

---

## 3. 기술 스택 (확정)

### 프론트엔드

| 영역             | 선택                                         |
| ---------------- | -------------------------------------------- |
| 빌드 도구        | Vite                                         |
| 언어             | TypeScript                                   |
| UI 프레임워크    | React                                        |
| 스타일           | Tailwind CSS                                 |
| 컴포넌트         | shadcn/ui                                    |
| 데이터 페칭/캐싱 | TanStack Query (React Query) v5              |
| 라우팅           | React Router v6                              |
| 상태 관리        | Zustand (UI 상태만, 서버 상태는 React Query) |
| 차트             | Recharts                                     |
| 코드 품질        | ESLint + Prettier + Husky (pre-commit)       |
| 폼               | React Hook Form + Zod (검증)                 |

### OCR

| 영역             | 선택                                               |
| ---------------- | -------------------------------------------------- |
| 텍스트 OCR       | Tesseract.js (한국어 + 영어 trained data)          |
| 영웅 아이콘 인식 | perceptual hashing (`blockhash-js` 또는 직접 구현) |
| 이미지 처리      | Canvas API (영역 크롭, 전처리)                     |
| 파이프라인       | Web Worker (UI 블로킹 방지)                        |

### 백엔드

| 영역      | 선택                                                            |
| --------- | --------------------------------------------------------------- |
| DB        | Supabase Postgres                                               |
| 인증      | Supabase Auth (이메일/비밀번호)                                 |
| API/보안  | `@supabase/supabase-js` + Postgres Row Level Security           |
| 호스팅    | Cloudflare Pages (정적 Vite 앱 배포)                            |
| 자산 저장 | 영웅 아이콘 이미지는 정적 파일로 번들 (Supabase Storage 불필요) |

### 비용

Supabase Free 플랜의 500MB DB, 50,000 MAU, 5GB egress, 1GB Storage 한도 안에서 충분하다. 단일 사용자 기준 경기 수천~수만 건도 500MB에 한참 못 미친다.

주의: Free 프로젝트는 1주 비활성 상태면 pause될 수 있다. 개인 앱이면 허용 가능한 제약이지만, 매일 쓰는 도구로 굳어지면 Pro 전환 여부를 다시 판단한다.

---

## 4. 사용자 흐름

### 4.1 기본 흐름 (빠른 수기 입력)

```
1. 게임 종료
2. 홈에서 맵 선택
3. 우리팀/상대팀 스코어 입력
4. 승리/패배/무승부 선택
5. 저장 → Supabase 저장
```

자동 처리:

- `played_at`: 저장 시각
- `session_id`: 직전 경기와 30분 이내면 같은 세션
- `mode_id`: 선택된 맵의 모드
- `account_id`: 기본 본계, 없으면 미지정
- `queue_type`: 사용자 기본 큐, 없으면 솔로
- `source`: manual

### 4.2 보조 흐름 (OCR 입력)

OCR을 쓰고 싶을 때:

```
1. 홈의 보조 입력 패널에 스크린샷 붙여넣기 또는 파일 선택
2. 이미지 분석
3. 상세 입력 모달에서 결과 확인/수정
4. 저장
```

OCR 실패 시에는 상세 입력 모달 또는 홈 빠른 입력으로 돌아간다.

### 4.3 상세 입력 흐름

계정, 큐, 시간, 영웅, 태그, 메모까지 수정해야 할 때만 상세 입력 모달을 연다. 상세 입력에서도 영웅/태그/메모는 선택 정보다.

### 4.4 조회 흐름

- 입력 후 자동으로 세션 뷰에 새 판이 추가됨
- 통계 뷰에서 모드별/맵별 승률 확인
- 기록 뷰에서 전체 경기 테이블 열람 및 벌크 수정

---

## 5. OCR 파이프라인 상세

> v1의 핵심이므로 상세 설계 명시. 구현 시 가장 큰 리스크 영역.

### 5.1 입력

- 클립보드 paste 이벤트 (`onPaste`)
- 드래그앤드롭 (보조)
- 파일 선택 다이얼로그 (보조)
- 지원 포맷: PNG, JPEG, WebP

### 5.2 전처리

1. 이미지를 Canvas에 그림
2. 해상도 정규화 (가로 1920px 기준으로 리사이즈, 화면비 유지)
3. 사용자 화면비/해상도 메타데이터 기록 (좌표 매핑 보정용)

### 5.3 영역 분할 (Region of Interest)

오버워치 스코어보드는 정형화된 레이아웃을 가진다. 1920×1080 기준 ROI 좌표를 미리 정의:

```typescript
// 좌표는 비율(0~1)로 정의하여 해상도 무관하게 동작
const ROI = {
  result: { x: 0.4, y: 0.05, w: 0.2, h: 0.08 }, // "승리" / "패배" 텍스트
  mode: { x: 0.04, y: 0.04, w: 0.15, h: 0.05 }, // 모드 텍스트
  map: { x: 0.04, y: 0.09, w: 0.15, h: 0.05 }, // 맵 텍스트
  teamScore: { x: 0.45, y: 0.14, w: 0.04, h: 0.06 },
  enemyScore: { x: 0.51, y: 0.14, w: 0.04, h: 0.06 },
  // 본인 팀 영웅 슬롯 5개 (탱1 + 딜2 + 힐2)
  myTeamHeroSlots: [
    { x: 0.05, y: 0.22, w: 0.05, h: 0.05 },
    // ... 5개
  ],
  myRowMarker: {
    /* 본인 행 식별용 영역 - 행이 강조되어있음 */
  },
};
```

**중요**: 실제 좌표는 본인 스크린샷 샘플 10~20장으로 측정해서 보정 필요. v1 개발 1일차에 이 측정부터.

### 5.4 텍스트 OCR (Tesseract.js)

각 텍스트 ROI를 Tesseract에 던져서 결과 받기:

```typescript
const worker = await createWorker(['kor', 'eng']);
await worker.setParameters({
  tessedit_char_whitelist: '...', // ROI별로 다른 화이트리스트
  tessedit_pageseg_mode: PSM.SINGLE_LINE,
});
const {
  data: { text, confidence },
} = await worker.recognize(roiCanvas);
```

**필드별 후처리**:

- `result`: "승리"/"패배"/"무승부" 매칭 (오타 허용 — Levenshtein distance ≤ 1)
- `mode`: 6개 모드명 매칭
- `map`: 마스터 데이터(`maps.json`) 맵명 중 최근접 매칭
- `score`: 숫자만 추출, 0~5 범위 검증

### 5.5 영웅 아이콘 인식 (perceptual hash)

**준비 단계 (개발 시 1회)**:

1. 영웅별 공식 아이콘 이미지 수집 (Liquipedia 등)
2. 표준 사이즈로 리사이즈 (예: 64×64)
3. 각 아이콘에 대해 perceptual hash 계산 → `heroHashes.json` 생성

```json
{
  "tracer": { "hash": "ff0a3b...", "name": "트레이서", "role": "damage" },
  ...
}
```

**런타임**:

1. 본인 행의 영웅 슬롯 ROI 크롭
2. 64×64로 리사이즈
3. perceptual hash 계산
4. `heroHashes.json`의 모든 영웅과 Hamming distance 계산
5. 최소 거리 영웅 반환. 거리 > 임계값이면 "인식 실패"

**스왑 케이스**: 스코어보드는 마지막에 픽한 영웅만 보임. 게임 중 스왑한 영웅은 OCR로 못 잡음. 사용자가 수기로 추가 영웅을 더하는 UI 제공.

### 5.6 신뢰도 표시

각 필드마다 신뢰도 산출:

- 텍스트: Tesseract confidence × 후처리 매칭 점수
- 영웅: 1 - (Hamming distance / 임계값)

UI에서 신뢰도 < 70%인 필드는 노란 테두리, < 40%는 빨간 테두리로 시각화. 사용자 시선이 자연스럽게 의심스러운 곳으로 가도록.

### 5.7 Web Worker

OCR은 메인 스레드 블로킹 우려가 있으므로 Web Worker에서 실행:

```
main thread → postMessage(imageData) → worker
worker → Tesseract + hash → postMessage(parsed result) → main
```

### 5.8 OCR 실패 처리

전체 실패(예: 게임 외 스크린샷)인 경우:

- "스코어보드를 인식하지 못했습니다" 메시지
- 수기 입력 폼으로 자동 전환, 가능한 필드만 미리 채움

### 5.9 학습 루프 (v1.1 이상)

사용자가 OCR 결과를 수정한 케이스를 (선택적으로) 로컬 또는 본인 Supabase DB에 누적해두면, 향후 ROI 좌표나 후처리 매핑 개선의 근거가 됨.

---

## 6. 데이터 모델 (5v5 확정)

DB에는 한국어 표시명 대신 안정적인 영문 ID를 저장한다. 한국어 이름은 `src/data/*.json` 마스터 데이터에서 매핑한다.

### 6.1 TypeScript 도메인 타입

```typescript
interface Match {
  id: string; // Supabase uuid
  userId: string; // auth.users.id
  playedAt: string; // timestamptz ISO string. 입력 시각 (수정 가능)
  sessionId: string; // 자동 그룹핑
  modeId: ModeId;
  mapId: string;
  result: 'win' | 'loss' | 'draw';
  teamScore: number;
  enemyScore: number;
  account: 'main' | 'sub';
  queueType: 'solo' | 'duo' | 'trio' | 'quad' | 'five';
  myHeroes: string[]; // 선택. 영웅 ID 0~여러 개
  teamComp?: {
    // 선택, 5v5
    tank?: string;
    dps: [string?, string?];
    support: [string?, string?];
  };
  tags: string[];
  memo: string;
  source: 'ocr' | 'manual' | 'mixed'; // 입력 출처 추적
  ocrConfidence?: Record<string, number>; // 필드별 신뢰도
  createdAt: string;
  updatedAt: string;
}

type ModeId = 'control' | 'hybrid' | 'push' | 'escort' | 'flashpoint' | 'clash';
```

### 6.2 Supabase/Postgres 구조

테이블:

- `matches`: 경기 1판의 핵심 정보
- `match_heroes`: 경기별 본인 픽 영웅. OCR로 잡힌 마지막 영웅 + 사용자가 수기로 추가한 스왑 영웅
- `user_settings`: 계정/큐 기본값, OCR ROI 보정값 등 사용자 설정
- `heroes`, `maps`, `modes`: v1에서는 DB 테이블이 아니라 정적 JSON 번들로 관리

초기 SQL:

```sql
create extension if not exists pgcrypto;

create type public.match_result as enum ('win', 'loss', 'draw');
create type public.match_source as enum ('ocr', 'manual', 'mixed');
create type public.queue_type as enum ('solo', 'duo', 'trio', 'quad', 'five');
create type public.account_type as enum ('main', 'sub');
create type public.mode_id as enum ('control', 'hybrid', 'push', 'escort', 'flashpoint', 'clash');

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  played_at timestamptz not null default now(),
  session_id text not null,
  mode_id public.mode_id not null,
  map_id text not null,
  result public.match_result not null,
  team_score smallint not null check (team_score >= 0 and team_score <= 10),
  enemy_score smallint not null check (enemy_score >= 0 and enemy_score <= 10),
  account public.account_type not null default 'main',
  queue_type public.queue_type not null default 'solo',
  team_comp jsonb,
  tags text[] not null default '{}',
  memo text not null default '',
  source public.match_source not null default 'manual',
  ocr_confidence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.match_heroes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  user_id uuid not null,
  hero_id text not null,
  order_index smallint not null default 0,
  source public.match_source not null default 'manual',
  created_at timestamptz not null default now(),
  foreign key (match_id, user_id)
    references public.matches(id, user_id)
    on delete cascade,
  unique (match_id, hero_id)
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_account public.account_type not null default 'main',
  default_queue_type public.queue_type not null default 'solo',
  roi_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_user_played_at_idx on public.matches (user_id, played_at desc);
create index matches_user_mode_played_at_idx on public.matches (user_id, mode_id, played_at desc);
create index matches_user_map_played_at_idx on public.matches (user_id, map_id, played_at desc);
create index match_heroes_user_hero_idx on public.match_heroes (user_id, hero_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_matches_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();
```

세션은 별도 테이블 없이 `matches`의 `played_at`과 `session_id`로 파생. 새 판 입력 시 직전 매치의 `played_at`과 비교해 30분 이상 차이면 새 `session_id` 생성, 아니면 직전 `session_id` 재사용.

### 6.3 Row Level Security

브라우저에 노출되는 publishable key는 비밀값이 아니다. 실제 데이터 보호는 Supabase Auth 세션과 RLS 정책으로 한다. `secret` key 또는 legacy `service_role` key는 절대 프론트엔드에 넣지 않는다.

```sql
alter table public.matches enable row level security;
alter table public.match_heroes enable row level security;
alter table public.user_settings enable row level security;

grant select, insert, update, delete
on public.matches, public.match_heroes, public.user_settings
to authenticated;

create policy "matches_select_own"
on public.matches for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "matches_insert_own"
on public.matches for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "matches_update_own"
on public.matches for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "matches_delete_own"
on public.matches for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "match_heroes_select_own"
on public.match_heroes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "match_heroes_insert_own"
on public.match_heroes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "match_heroes_update_own"
on public.match_heroes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "match_heroes_delete_own"
on public.match_heroes for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "user_settings_select_own"
on public.user_settings for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "user_settings_insert_own"
on public.user_settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "user_settings_update_own"
on public.user_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "user_settings_delete_own"
on public.user_settings for delete
to authenticated
using ((select auth.uid()) = user_id);
```

본인만 본인 데이터에 접근한다. 기준 ID는 Supabase Auth의 `auth.users.id`이며, RLS에서는 `auth.uid()`로 비교한다.

### 6.4 게임 계정 관리 정책

전적의 계정 정보는 단순 표시값이 아니라 통계 필터의 축이므로, 삭제 정책은 기록 보존을 우선한다.

- 활성 게임 계정이 0개여도 앱은 동작한다. 이 경우 경기 입력 폼은 `미지정` 계정으로 저장할 수 있다.
- 활성 게임 계정이 1개 이상이면 반드시 1개만 본계가 된다.
- 첫 게임 계정은 자동으로 본계가 된다.
- 본계가 아닌 계정을 삭제하면 입력 폼 선택지에서만 제거된다.
- 본계를 삭제할 때 다른 활성 계정이 있으면 남은 계정 중 가장 오래된 계정을 자동으로 본계로 승격한다.
- 마지막 활성 계정을 삭제하면 활성 본계가 없는 상태가 되며, 앱은 다시 `미지정` 계정 상태로 돌아간다.
- 계정 삭제는 hard delete가 아니라 soft delete다. 과거 경기의 `account_id`와 표시 라벨을 유지하기 위해 `player_accounts.is_active = false`로 비활성화한다.
- 비활성 계정은 경기 입력 선택지에서 제외하고, 설정 화면에서 복원할 수 있다.
- 같은 배틀태그를 다시 쓰고 싶으면 새로 추가하지 않고 비활성 계정을 복원한다.

---

## 7. 인증 흐름

1. 최초 진입 시 로그인 화면
2. Supabase Auth 이메일/비밀번호로 로그인 (`signInWithPassword`)
3. 회원가입은 앱 안의 로그인 화면에서 이메일/비밀번호 방식으로 제공 (`signUp`)
4. 현재 Supabase 설정은 Confirm email을 끈 상태로 사용한다. 따라서 가입 직후 세션이 생성되면 바로 앱으로 진입한다
5. 로그인 상태는 supabase-js가 브라우저 storage에 유지
6. 로그아웃 버튼은 설정 화면과 사이드바에 제공한다

비밀번호 재설정은 v1 범위 밖. 필요해지면 Supabase Auth의 reset password flow를 붙인다. 공개 회원가입으로 확장할 때는 스팸 방지, custom SMTP, 이메일 인증 여부를 다시 결정한다.

---

## 8. 화면 정의

### 8.1 메인 화면 (빠른 입력 + 오늘 상태)

기본 라우트 `/`. 한 화면에서 입력과 즉시 확인이 가능하도록:

```
┌─────────────────────────────────────────────────┐
│ [상단] 오늘 N판 · 승률 X% · 현재 N연승/연패        │
├──────────────────────┬──────────────────────────┤
│ 빠른 기록            │ 오늘 세션 타임라인          │
│ [맵 선택]            │ ┌──┬──┬──┬──┐            │
│ [우리 : 상대]        │ │승│패│패│승│ ...        │
│ [승/패/무] [저장]    │ └──┴──┴──┴──┘            │
│                      │ 보조: 이미지 분석          │
└──────────────────────┴──────────────────────────┘
```

### 8.2 OCR 결과 확인 모달

붙여넣기 직후 모달:

```
┌─ 스크린샷 분석 결과 ──────────────────────┐
│ [원본 썸네일]                              │
│                                            │
│ 모드:   [혼합        ▼]  ●높음            │
│ 맵:     [왕의 길     ▼]  ●높음            │
│ 결과:   ● 승  ○ 패  ○ 무                 │
│ 스코어: 본인팀 [3] : [2] 상대팀  ●높음    │
│ 영웅:   [트레이서 ×] [+ 추가]  ⚠ 중간     │
│                                            │
│ 계정:   ● 본계  ○ 부계 (이전값)            │
│ 큐:     [솔 ▼] (이전값)                   │
│                                            │
│ 메모:   [_____________________________]   │
│                                            │
│        [취소]            [저장 (Enter)]   │
└────────────────────────────────────────────┘
```

신뢰도 색상: 녹색(80+) / 노랑(50-80) / 빨강(<50). 빨강 필드는 저장 전 한 번 더 확인 요청.

### 8.3 세션 뷰

`/sessions` — 날짜별 세션 카드 리스트. 각 세션 펼치면 판 리스트.

### 8.4 기록 뷰

`/records` — 전체 경기 테이블. 기존 스프레드시트 데이터를 웹에서 검토/정리하는 화면.

- 필터: 검색, 기간, 모드, 결과, 계정
- 데스크톱: 테이블
- 모바일: 카드형 행
- 행 선택
- 벌크 수정: 결과, 맵, 계정
- 벌크 삭제: 확인 후 실행

### 8.5 통계 뷰

`/stats` — 4번 섹션 PRD v1과 동일:

- 상단: 필터 바 (기간/모드/맵/계정/큐/영웅)
- 탭: 모드별 / 맵별 / 영웅별 / 시간대별 / 세션 내 순서별

### 8.6 설정 뷰

`/settings`:

- 영웅 마스터 데이터 편집
- 맵 마스터 데이터 편집
- OCR ROI 보정 (고급 — 본인 스크린샷 업로드 → 직접 영역 지정)
- export / import (JSON)
- 로그아웃

---

## 9. 폴더 구조

```
overwatch-tracker/
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui 생성 컴포넌트
│   │   ├── input/               # 입력 폼, OCR 확인 모달
│   │   ├── session/             # 세션 타임라인, 카드
│   │   ├── stats/               # 차트, 필터바
│   │   └── common/
│   ├── ocr/
│   │   ├── pipeline.ts          # 메인 OCR 파이프라인
│   │   ├── tesseract.worker.ts  # Tesseract Web Worker
│   │   ├── heroMatcher.ts       # perceptual hash 매칭
│   │   ├── regions.ts           # ROI 좌표 정의
│   │   ├── postprocess.ts       # 필드별 정규화/매칭
│   │   └── heroHashes.json      # 영웅 아이콘 해시 마스터
│   ├── data/
│   │   ├── heroes.json          # 영웅 마스터
│   │   ├── maps.json            # 맵-모드 매핑
│   │   └── modes.json
│   ├── supabase/
│   │   ├── client.ts            # Supabase client 초기화
│   │   ├── database.types.ts    # Supabase CLI로 생성한 DB 타입
│   │   ├── auth.ts              # 인증 헬퍼
│   │   └── matches.ts           # Match CRUD
│   ├── hooks/
│   │   ├── useMatches.ts        # React Query 훅
│   │   ├── useAuth.ts
│   │   └── useOCR.ts
│   ├── store/
│   │   └── filterStore.ts       # Zustand (UI 상태만)
│   ├── lib/
│   │   ├── stats.ts             # 집계 함수
│   │   ├── session.ts           # 세션 그룹핑
│   │   └── utils.ts             # shadcn cn() 등
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── SessionPage.tsx
│   │   ├── StatsPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── LoginPage.tsx
│   ├── routes.tsx
│   └── App.tsx
├── public/
│   └── heroes/                  # 영웅 아이콘 이미지 (정적)
├── .eslintrc.cjs
├── .prettierrc
├── tailwind.config.ts
├── components.json              # shadcn 설정
├── supabase/
│   └── migrations/              # DB schema/RLS 변경 이력
└── package.json
```

---

## 10. 마일스톤

| 단계 | 범위                                                                       | 예상  |
| ---- | -------------------------------------------------------------------------- | ----- |
| M0   | Vite + TS + Tailwind + shadcn 셋업, ESLint/Prettier, 기본 라우트/Auth 화면 | 1일   |
| M1   | Supabase 프로젝트, Postgres schema/RLS, Match CRUD, React Query 훅         | 1일   |
| M2   | 홈 빠른 수기 입력 (맵/스코어/결과)                                         | 1일   |
| M3   | 세션 자동 그룹핑, 세션 타임라인 뷰                                         | 1일   |
| M4   | 전체 기록 테이블 + 벌크 수정/삭제                                          | 1일   |
| M5   | 통계 뷰 (필터바, 모드/맵/영웅/시간대별) + Recharts                         | 2일   |
| M6   | OCR 보조 입력 유지 및 상세 입력 모달 연결                                  | 1일   |
| M7   | 기존 시트 import + JSON export/import                                      | 0.5일 |
| M8   | 폴리싱, 모바일 조회 최적화, 배포                                           | 1일   |

총 ≈ 8.5일

OCR은 핵심 입력 경로에서 제외한다. 정확도 개선은 보조 플로우의 품질 과제로 유지한다.

---

## 11. v2 이후

- 능동적 코칭 알림 (연패 임계치, 약점 맵 경고)
- 저장된 필터 프리셋
- A vs B 비교 뷰
- 가설 검증 노트
- 6v6 모드 지원 (필요 시)
- VLM으로 OCR 정확도 한 단계 업그레이드 (Transformers.js + 경량 비전 모델)

---

## 12. 비범위 (v1 명시적 제외)

- 6v6 모드
- 멀티 사용자 / 친구 공유
- 클라우드 OCR API
- 실시간 게임 상태 감지 (오버레이 등)
- 영상 분석

---

## 13. 위험 & 결정 필요

### 결정 필요

- [ ] OCR ROI 측정용 샘플 스크린샷 10~20장 준비 (해상도·화면비별)
- [ ] 영웅 아이콘 이미지 라이선스 (Liquipedia? 공식 미디어킷?) — 개인 사용이라 큰 문제는 아니나 정리
- [ ] 본인 행을 어떻게 식별할 것인가? (강조된 배경색? 닉네임 OCR?)
- [ ] 기존 86판 데이터 마이그레이션 여부

### 위험

- **R1 (High) OCR 정확도** — 영웅 아이콘 해시는 패치로 아이콘 디자인 바뀌면 갱신 필요. 본인 식별이 의외로 까다로울 수 있음. 첫 주에 정확도 검증하고 안 되면 클라우드 API 폴백 검토
- **R2 (Med) 화면 해상도/UI 변화** — 블리자드가 UI 리뉴얼하면 ROI 좌표 전부 무용. 설정에서 사용자가 직접 ROI 조정할 수 있는 UI 필수
- **R3 (Low) Supabase Free 한도/pausing** — 단일 사용자라 DB/egress/MAU 한도는 충분하나, 무료 프로젝트는 1주 비활성 시 pause될 수 있음. 개인 사용에는 허용 가능하되 매일 쓰는 도구가 되면 Pro 전환 여부 재검토
- **R4 (Med) 본인이 안 씀** — 한 판 끝나고 기록하는 행동 자체가 마찰. 홈 입력을 10초 이내로 유지하고 dogfooding 1주일 후 행동 형성 여부 점검

---

## 14. Supabase 세팅 가이드

### 14.1 Supabase 프로젝트 생성

1. Supabase Dashboard에서 새 프로젝트를 만든다.
2. region은 사용 위치와 가까운 Asia Pacific 리전을 고른다. 제공 옵션 중 Seoul/Tokyo/Singapore 등 가장 가까운 리전을 선택한다.
3. Project Settings 또는 Connect dialog에서 다음 값을 확인한다.
   - Project URL
   - Publishable key (`sb_publishable_...`)
4. Secret key 또는 legacy `service_role` key는 서버 전용이다. Vite 환경 변수나 프론트엔드 코드에 넣지 않는다.

### 14.2 Auth 설정

1. Authentication > Providers에서 Email provider가 켜져 있는지 확인한다.
2. v1은 개인 사용이므로 앱에는 회원가입 화면을 만들지 않는다.
3. Authentication > Users에서 본인 계정을 수동 생성한다.
4. 배포 전 Authentication > URL Configuration에 Site URL과 Redirect URLs를 넣는다.
   - 로컬: `http://localhost:5173`
   - 배포: Cloudflare Pages 배포 URL 또는 custom domain
5. 이메일 확인/비밀번호 재설정 메일을 적극적으로 쓸 경우 custom SMTP를 검토한다. 기본 이메일 발송은 rate limit이 낮다.

### 14.3 DB schema/RLS 적용

1. Supabase Dashboard > SQL Editor를 연다.
2. 6.2의 초기 SQL을 실행한다.
3. 6.3의 RLS SQL을 실행한다.
4. Table Editor에서 `matches`, `match_heroes`, `user_settings`의 RLS가 enabled인지 확인한다.
5. 앱에서 본인 계정으로 로그인한 뒤 insert/select가 되는지 검증한다.

### 14.4 로컬 환경 변수

`.env.local`:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`.env.local`은 커밋하지 않는다. 저장소에는 `.env.example`만 유지한다.

### 14.5 패키지 설치와 클라이언트 파일

```bash
npm install @supabase/supabase-js @tanstack/react-query
npm install -D supabase
```

`src/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey);
```

### 14.6 TypeScript 타입 생성

원격 프로젝트 기준:

```bash
npx supabase login
npx supabase init
npx supabase gen types typescript --project-id "$PROJECT_REF" --schema public > src/supabase/database.types.ts
```

로컬 Supabase stack을 쓸 경우:

```bash
npx supabase start
npx supabase gen types typescript --local > src/supabase/database.types.ts
```

로컬 stack은 Docker 호환 런타임이 필요하다. 단순 개인 앱이면 초반에는 hosted Supabase + `.env.local`만으로 시작해도 된다.

### 14.7 구현 순서

1. `src/supabase/client.ts` 생성
2. `src/supabase/auth.ts`에 `signInWithPassword`, `signOut`, `getSession`, `onAuthStateChange` 래핑
3. `src/supabase/matches.ts`에 `listMatches`, `createMatch`, `updateMatch`, `deleteMatch` 작성
4. `src/hooks/useAuth.ts`, `src/hooks/useMatches.ts`에서 React Query와 연결
5. 로그인 보호 라우트 추가
6. 수기 입력 폼부터 Supabase 저장 검증
7. OCR 확인 모달은 같은 `createMatch` 경로를 재사용

### 14.8 Cloudflare Pages 배포

Cloudflare Pages는 Vite 빌드 결과물인 `dist`를 정적 파일로 서빙한다.

Cloudflare Pages GitHub 연동 설정:

```text
Framework preset: Vite
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
```

배포 방식:

1. Cloudflare Dashboard > Workers & Pages > Pages에서 GitHub 저장소를 연결한다.
2. production branch는 `main`으로 둔다.
3. `main`에 push되면 production 배포가 자동 실행된다.
4. 다른 브랜치나 PR은 preview deployment로 확인한다.
5. 빌드가 실패하면 Cloudflare Pages의 deployment log에서 TypeScript/Vite 오류를 확인한다.

환경 변수는 Cloudflare Pages 프로젝트 설정의 Variables and Secrets에 넣는다. Vite 앱은 빌드 시점에 `VITE_` 변수를 번들에 주입하므로 Production과 Preview 환경에 같은 값을 등록한다.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
NODE_VERSION=22.16.0
```

React Router의 `BrowserRouter`를 사용하므로 SPA fallback이 필요하다. `public/_redirects`에 다음 규칙을 둔다. Vite가 `public` 파일을 `dist`로 복사하고, Cloudflare Pages가 이 규칙으로 `/sessions`, `/stats`, `/settings` 새로고침을 `index.html`로 돌린다.

```text
/* /index.html 200
```

배포 후 Supabase Dashboard > Authentication > URL Configuration에 Cloudflare Pages production URL과 필요한 preview/custom domain URL을 등록한다.

참고 공식 문서:

- Supabase React quickstart: https://supabase.com/docs/guides/getting-started/tutorials/with-react
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase password auth: https://supabase.com/docs/guides/auth/passwords
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase local development: https://supabase.com/docs/guides/local-development
- Cloudflare Pages Vite deploy: https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/
- Cloudflare Pages redirects: https://developers.cloudflare.com/pages/configuration/redirects/

---

## 부록 A. 핵심 의존성 버전 (작성 시점)

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.x",
    "@tanstack/react-query": "^5.x",
    "@tanstack/react-query-persist-client": "^5.x",
    "@supabase/supabase-js": "^2.x",
    "zustand": "^4.x",
    "recharts": "^2.x",
    "tesseract.js": "^5.x",
    "react-hook-form": "^7.x",
    "zod": "^3.x",
    "lucide-react": "latest",
    "tailwindcss": "^3.x"
  },
  "devDependencies": {
    "supabase": "latest"
  }
}
```

shadcn/ui는 `npx shadcn-ui@latest init` 후 필요한 컴포넌트만 `add`.

## 부록 B. 환경 변수

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## 부록 C. 영웅·맵 데이터 형식

`heroes.json`:

```json
{
  "version": "2026-05",
  "heroes": [{ "id": "tracer", "name": "트레이서", "role": "damage" }]
}
```

`maps.json`:

```json
{
  "version": "2026-05",
  "maps": [{ "id": "ilios", "name": "일리오스", "mode": "쟁탈" }]
}
```

신영웅·신맵 추가 시 version만 올리면 됨. 코드 변경 불필요.
