# Live capture OCR plan

작성일: 2026-06-01

## Goal

브라우저에서 사용자가 직접 선택한 오버워치 클라이언트 화면을 캡처하고, 기존 스크린샷 OCR/이미지 매칭 파이프라인을 실시간에 가깝게 재사용해 다음 두 가지를 지원한다.

- 맵 선택 화면으로 판단되면, 내 기록 기준으로 승률 기대값이 가장 좋은 맵을 추천한다.
- 경기 종료/스코어보드 화면으로 판단되면, 기존 스크린샷 OCR과 유사하게 결과 초안을 추출하고 사용자가 확인 후 저장한다.

이 기능은 홈의 빠른 수기 기록을 대체하지 않는다. 메인 입력 플로우는 계속 빠른 수기 기록이고, Live는 게임 중 보조 분석과 경기 종료 후 기록 보조를 담당한다.

## Non-goals

- 오버워치 프로세스나 창을 웹앱이 자동 탐색해 무단 캡처하지 않는다.
- 게임 입력, 자동 클릭, 자동 맵 선택, 매크로, 메모리 리딩, 패킷 분석은 하지 않는다.
- 인게임 오버레이를 만들지 않는다. v1은 브라우저 화면 안에서만 상태와 추천을 보여준다.
- OCR 결과를 자동 저장하지 않는다. 저장 전에는 반드시 사용자가 확인한다.
- 모든 프레임을 OCR하지 않는다. 화면 상태 감지와 ROI 기반 샘플링으로 비용을 제한한다.

## Web feasibility review

### Browser capture

순수 웹 MVP는 가능하다. `navigator.mediaDevices.getDisplayMedia()`는 사용자에게 화면/창/탭 선택 UI를 띄우고, 선택된 표시 영역을 `MediaStream`으로 반환한다. 앱은 이 스트림을 숨겨진 `video`에 연결하고, 필요한 시점에 `canvas`로 프레임을 복사해 분석할 수 있다.

중요 제약은 제품 요구사항에 직접 영향을 준다.

- HTTPS 또는 localhost 같은 secure context가 필요하다.
- 사용자의 클릭 같은 transient activation이 필요하다.
- 권한은 재사용 가능한 영구 권한으로 저장되지 않는다. 시작할 때마다 브라우저 선택 UI가 뜬다.
- 앱이 오버워치 창만 골라 보이도록 선택지를 제한할 수 없다. 브라우저는 사용자가 매번 공유 대상을 직접 고르게 해야 한다.
- 공유 중인 창이 닫히거나 최소화되면 트랙이 mute/end 상태가 될 수 있다.
- `Permissions-Policy: display-capture`가 막혀 있으면 `getDisplayMedia()`가 실패한다. 현재 Vite 로컬/일반 SPA 배포에서는 기본값 `self`면 문제없지만, iframe 임베딩은 별도 정책 확인이 필요하다.

결론: 사용자가 GNB 하단의 Live 시작 버튼을 누르고 브라우저 화면 공유 선택창에서 오버워치 창/모니터를 직접 선택하는 흐름이면 웹만으로 시작할 수 있다. 자동 창 탐색, 백그라운드 무단 추적, 안정적인 전체화면 독점 캡처가 필요해지는 시점에만 Electron/네이티브 앱을 재검토한다.

### Frame analysis

프레임은 다음 순서로 처리한다.

1. `MediaStream`을 `<video>`에 연결한다.
2. 분석 주기에 맞춰 현재 프레임을 `canvas` 또는 `OffscreenCanvas`로 복사한다.
3. 전체 프레임이 아니라 상태별 ROI만 잘라 `PixelImage`로 변환한다.
4. 저비용 화면 상태 감지부터 실행한다.
5. 상태가 맵 선택/결과 화면일 때만 이미지 매칭 또는 Tesseract OCR을 실행한다.

`OffscreenCanvas`는 Worker 안에서 Canvas 렌더링을 수행할 수 있으므로, 프레임 crop/리사이즈/간단한 색상 분석을 메인 스레드 밖으로 옮기는 후보로 적합하다. 다만 MVP는 브라우저 호환성과 디버깅 속도를 위해 main thread canvas로 시작하고, 지연이 확인되면 Worker로 분리한다.

### OCR

현재 코드베이스는 이미 `tesseract.js`를 사용한다. Tesseract.js는 브라우저와 Node에서 동작하는 JavaScript OCR 라이브러리이고, 여러 이미지를 인식할 때 Worker를 한 번 만들고 여러 번 `recognize`한 뒤 종료하는 방식을 권장한다.

Live에서는 OCR을 초당 여러 번 돌리지 않는다. 기본 전략은 다음과 같다.

- 화면 상태 감지: 2-5fps
- 이미지 매칭/맵 후보 탐지: 1-2fps
- OCR: 상태 전환 직후 또는 후보가 안정적으로 유지될 때 0.2-1fps
- 결과 화면 감지 시: 2-3초 burst 분석 후 최고 confidence 초안 생성

### Policy and account risk

Blizzard EULA는 비인가 수단으로 게임플레이에 영향을 주거나 이점을 주는 행위를 위험하게 본다. 이 계획은 메모리/패킷/입력 자동화 없이 사용자가 공유한 화면의 픽셀을 읽는 개인용 분석으로 제한하지만, "맵 선택 추천"은 게임플레이 의사결정에 영향을 주는 기능이므로 배포 전 약관 리스크를 별도로 검토해야 한다.

초기 안전 경계는 다음과 같다.

- 개인 로컬 브라우저 분석으로 시작한다.
- 게임 클라이언트에 입력하지 않는다.
- 오버레이를 주입하지 않는다.
- 추천은 "내 기록 기준 참고 정보"로 보여주고 자동 행동으로 연결하지 않는다.
- 프레임/스냅샷은 기본적으로 업로드하지 않는다.

## Product UX

### Navigation model

현재 `AppLayout`은 좌측 GNB와 모바일 하단 내비게이션을 가진다. Live는 항상 보이지 않고, 캡처가 시작되면 상단 주요 메뉴에 `LIVE`가 나타나는 조건부 내비게이션으로 설계한다.

- 데스크톱: 좌측 GNB 하단 계정 영역 위에 `Live 시작` 버튼을 둔다.
- 모바일: 하단 내비게이션 위 또는 헤더 우측에 작고 명확한 `Live` 시작 버튼을 둔다.
- 캡처 시작 성공 후: 주요 메뉴 최상단에 `LIVE` 탭을 노출하고 `/live`로 이동한다.
- 캡처 중단 후: `LIVE` 탭은 세션 종료 상태를 잠깐 유지한 뒤 숨기거나, 사용자가 페이지를 떠나면 숨긴다.

### Live page states

`/live`는 세션 상태를 중심으로 단순하게 구성한다.

- `idle`: Live 시작 버튼과 짧은 개인정보/권한 안내.
- `selecting`: 브라우저 공유 선택창이 열리는 중임을 표시.
- `running`: 감지 상태, 현재 맵/화면, 추천, 결과 초안을 표시.
- `degraded`: 프레임이 멈췄거나 창이 최소화/닫힘/muted 상태일 때 복구 안내.
- `stopped`: 마지막 감지 결과와 다시 시작 버튼.
- `error`: `NotAllowedError`, `NotReadableError`, unsupported 등 원인별 대응.

### Running layout

데스크톱은 게임 중 PC에서 빠르게 훑는 상황을 우선한다.

- 상단 얇은 상태 바: LIVE, 공유 대상 타입, 분석 fps, 마지막 감지 시각.
- 좌측 메인: 현재 화면 상태와 추천 카드.
- 우측 보조: 최근 감지 로그, confidence, 후보 evidence.
- 하단: 결과 초안이 있을 때만 저장 확인 패널.

모바일은 세로 단일 흐름으로 줄인다.

- 상태 바
- 현재 인식 상태
- 추천 또는 결과 초안
- 최근 감지 로그는 접힘 영역

### Map selection recommendation

맵 선택 화면에서 사용자가 실제로 선택할 수 있는 후보 맵을 인식할 수 있으면, 후보 안에서만 추천한다. 후보 인식이 불확실하면 해당 모드의 전체 맵 랭킹을 보여준다.

추천 점수는 단순 승률만 쓰지 않는다. 표본이 적은 맵이 과대평가되지 않도록 다음 순서로 정렬한다.

1. 확정 경기 수가 충분한 맵의 보정 승률
2. 일반 승률
3. 최근 성과
4. 기록 수
5. 이름

보정 승률은 MVP에서 간단한 prior를 둔다.

```ts
adjustedWinRate = (wins + 1) / (wins + losses + 2);
```

무승부는 승률 분모에서 제외하되, 표본 수와 신뢰도 표시에는 포함한다. 표본이 부족하면 "기록 부족" 상태를 분명히 보여준다.

### Match result extraction

결과 화면 또는 스코어보드로 판단되면 즉시 저장하지 않고 `LiveMatchDraft`를 만든다.

초안 필드:

- `playedAt`: 감지 시각
- `source`: `live`
- `mapId`
- `modeId`
- `result`
- `teamScore`
- `enemyScore`
- `myHeroes`
- `confidence`
- `evidence`: OCR 텍스트, 이미지 매칭 후보, 감지 화면 타입

사용자는 Live 페이지 또는 기존 `MatchEntryDialog`의 확인 UI에서 수정 후 저장한다. 저장 경로는 기존 `useCreateMatch`를 재사용한다.

## Technical architecture

### Modules

제안 파일 구조:

```txt
src/features/live/
  LiveCaptureProvider.tsx
  LivePage.tsx
  components/
    LiveCaptureButton.tsx
    LiveStatusBar.tsx
    LiveMapRecommendation.tsx
    LiveMatchDraftPanel.tsx
    LiveDetectionLog.tsx
  hooks/
    useLiveCapture.ts
    useLiveDetections.ts
    useLiveRecommendations.ts
  lib/
    liveAnalyzer.ts
    liveCapture.ts
    liveFrameScheduler.ts
    liveRecommendation.ts
    liveStateMachine.ts
    liveTypes.ts
    liveVisionWorker.ts
```

공용화가 필요한 순수 함수는 `src/lib/visionPipelineCore.ts`에 유지한다. 기존 스크린샷 전체 분석 함수인 `extractMatchFromScreenshot`은 파일 입력 중심 API이므로, Live 구현 중 다음 리팩터링을 선행한다.

- `File | Blob | HTMLImageElement`뿐 아니라 `ImageBitmap | PixelImage` 입력을 받는 하위 함수 분리.
- map matching, layout detection, OCR text parsing, hero matching을 독립적으로 호출할 수 있게 export 정리.
- `VisionExtractionResult`를 Live 초안에도 재사용 가능한 evidence 구조로 확장.

### Capture lifecycle

`LiveCaptureProvider`가 앱 최상단에서 세션 생명주기를 가진다.

```ts
type LiveCaptureStatus = 'idle' | 'selecting-source' | 'running' | 'muted' | 'stopped' | 'error';
```

주요 책임:

- `startCapture()`에서 `getDisplayMedia({ video: { frameRate: 30 }, audio: false })` 호출.
- 반환된 `MediaStream`을 video ref에 연결.
- video metadata 로드 후 scheduler 시작.
- track `ended`, `mute`, `unmute` 이벤트 처리.
- stop 시 모든 track을 중지하고 scheduler/worker 정리.

라우터와 GNB는 Provider 상태를 구독한다. `running | muted | stopped` 상태에서만 LIVE 탭을 노출한다.

### Frame scheduler

프레임 스케줄러는 단일 루프에서 모든 분석을 직접 실행하지 않는다. 화면 상태별로 서로 다른 주기를 가진 job을 둔다.

```ts
interface LiveFrameJob {
  intervalMs: number;
  minConfidence?: number;
  name: 'screen-state' | 'map-candidates' | 'result-ocr' | 'debug-snapshot';
}
```

기본 주기:

- `screen-state`: 250-500ms
- `map-candidates`: 맵 선택 후보일 때 500-1000ms
- `result-ocr`: 결과 후보일 때 1000-3000ms
- `debug-snapshot`: 사용자가 켠 경우에만 수동

분석이 아직 끝나지 않았으면 같은 job의 다음 tick은 건너뛴다. 이 방식으로 OCR backlog와 UI 끊김을 막는다.

### Detection state machine

Live 분석은 단발 OCR이 아니라 상태 머신으로 누적 confidence를 관리한다.

```ts
type LiveScreenState =
  | 'unknown'
  | 'menu'
  | 'map-selection'
  | 'loading-map'
  | 'in-match'
  | 'scoreboard'
  | 'match-end'
  | 'post-match';
```

상태 전환 규칙:

- 동일 상태가 2-3회 연속 감지되면 stable 상태로 본다.
- stable 상태가 바뀌면 burst 분석을 실행한다.
- 낮은 confidence 결과는 UI에 "추정"으로만 보여주고 저장 초안에는 반영하지 않는다.
- 결과 초안은 같은 필드가 여러 프레임에서 일치할 때 confidence를 올린다.

### Reuse of current vision pipeline

현재 재사용 가능한 자산:

- `visionPipelineCore.ts`
  - `PixelImage`
  - `RelativeRect`
  - `createDetectedVisionLayout`
  - `createMapCardSearchRegions`
  - `resizePixelImage`
  - `scoreMapImages`
  - `parseOcrText`
  - hero/map matching primitives
- `visionExtraction.ts`
  - Tesseract.js worker 초기화 흐름
  - 한국어/영어 OCR 설정
  - map/hero template loading
  - screenshot result draft normalize 로직
- `matchStats.ts`
  - `summarizeResults`
  - win rate formatting
- `matchOptions.ts`, `masterAssets.ts`
  - 맵/모드/이미지 메타데이터

Live 구현 전 리팩터링 목표는 OCR 품질 개선이 아니라 입력 어댑터 분리다. "파일 하나를 분석한다"와 "비디오 프레임 ROI를 분석한다"를 같은 핵심 함수가 처리하도록 만든다.

### Recommendation engine

`useLiveRecommendations`는 기존 `useMatches` 결과를 기반으로 클라이언트에서 계산한다. 통계 스케일링 문서의 경계를 유지해, 나중에 `useStatsSummary(filters)`로 바뀌어도 Live UI는 집계 bucket만 받도록 둔다.

```ts
interface LiveMapRecommendation {
  adjustedWinRate: number | null;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  decisive: number;
  draws: number;
  losses: number;
  mapId: string;
  modeId: string;
  rank: number;
  reason: string;
  total: number;
  winRate: number | null;
  wins: number;
}
```

추천 후보의 source:

- `visible-candidates`: Live가 맵 선택 화면에서 감지한 후보 맵.
- `mode-ranking`: 현재 모드만 알 때 해당 모드 전체 맵.
- `global-ranking`: 모드도 불확실할 때 전체 맵. 이 경우 추천 강도는 낮게 표시한다.

### Data persistence

Live 세션 자체는 기본적으로 영속화하지 않는다.

영속화하는 데이터:

- 사용자가 확인한 경기 기록만 `matches`에 저장.
- 필요하면 추후 `live_detection_feedback` 같은 opt-in 디버그 테이블을 추가.

저장하지 않는 데이터:

- 원본 프레임
- 연속 비디오
- 사용자가 허용하지 않은 디버그 스냅샷

## Implementation phases

### Phase 0: browser capture spike

목표: 이 브라우저/OS/오버워치 조합에서 캡처가 실제로 되는지 검증한다.

- `getDisplayMedia` 시작/중단 버튼.
- 숨겨진 video와 작은 preview.
- 1fps frame grab.
- track ended/mute/unmute 로그.
- 전체화면/창모드/테두리 없는 창모드별 동작 메모.

완료 기준:

- 사용자가 오버워치 창 또는 모니터를 선택할 수 있다.
- 프레임 크기와 aspect ratio를 읽을 수 있다.
- 창 닫힘/공유 중단이 UI에 반영된다.

### Phase 1: Live shell and navigation

목표: 제품 안에 Live 흐름을 자연스럽게 넣는다.

- `LiveCaptureProvider` 추가.
- GNB 하단 `Live 시작` 버튼 추가.
- 캡처 성공 후 `LIVE` 탭 조건부 노출.
- `/live` 라우트와 상태별 기본 화면 추가.
- 모바일에서 시작/중단 컨트롤이 하단 내비게이션과 충돌하지 않게 배치.

완료 기준:

- Live 시작/중단이 어느 페이지에서든 가능하다.
- 캡처 중에는 `/live`로 이동해 현재 상태를 볼 수 있다.
- 캡처 중단 시 리소스가 정리된다.

### Phase 2: passive screen state detection

목표: 무거운 OCR 없이 화면 상태를 구분한다.

- ROI 기반 색상/밝기/구조 feature 추출.
- `unknown`, `map-selection`, `scoreboard`, `match-end` 우선 구분.
- 감지 로그와 confidence 표시.
- 수동 debug snapshot 저장 기능은 로컬 Blob 다운로드 또는 console 로그 수준으로 제한.

완료 기준:

- 맵 선택/결과 화면 후보를 안정적으로 감지한다.
- 일반 게임 플레이 중에는 OCR이 실행되지 않는다.

### Phase 3: map recommendation

목표: 맵 선택 화면에서 내 데이터 기준 추천을 보여준다.

- 현재 모드 추정.
- visible map candidate 탐지 시 후보 내 추천.
- 후보 탐지가 안 되면 mode ranking fallback.
- 승률, 표본 수, 보정 승률, 최근 기록 reason 표시.
- 데이터 부족 상태 설계.

완료 기준:

- 맵 선택 화면으로 판단되면 1초 안에 추천 영역이 갱신된다.
- 승률이 높은데 표본이 적은 맵은 낮은 confidence로 표시된다.

### Phase 4: match result extraction

목표: 경기 종료/스코어보드에서 저장 가능한 초안을 만든다.

- 기존 `extractMatchFromScreenshot` 하위 로직을 frame/ROI 입력으로 재사용.
- map/result/score/mode OCR과 image matching evidence 병합.
- `LiveMatchDraftPanel`에서 수정 후 저장.
- 저장 성공 후 Live 초안 clear.

완료 기준:

- 기존 스크린샷 OCR과 같은 수준의 필드 초안이 만들어진다.
- 자동 저장 없이 사용자 확인 후 기존 create match 경로로 저장된다.

### Phase 5: performance and robustness

목표: 실제 게임 중 켜두어도 UI가 버벅이지 않게 한다.

- `OffscreenCanvas`/Worker로 crop/resize/color feature 이전.
- Tesseract worker lifecycle 최적화.
- OCR job cancellation/backpressure.
- resolution별 ROI calibration.
- 분석 fps, OCR latency, confidence 히스토리 계측.

완료 기준:

- 통계/홈 화면 탐색 중에도 Live 분석이 눈에 띄는 렌더링 지연을 만들지 않는다.
- 분석 실패가 사용자에게 명확한 degraded 상태로 표시된다.

## Quality bar

- Live 시작 전에는 GNB를 복잡하게 만들지 않는다.
- 실행 중에도 화면은 "현재 상태 + 추천/초안" 중심으로 단순하게 둔다.
- confidence와 evidence는 숨기지 않되, 기본 화면을 어지럽히지 않도록 접힘 영역에 둔다.
- 모바일은 세로 1열, 데스크톱은 상태/추천/로그가 분리된 분석 워크스페이스로 둔다.
- 디자인 시스템의 밝은 분석실 톤, 8px 이하 radius, border/divider 중심 계층, 과한 카드 클러스터 회피를 지킨다.
- 스냅샷/프레임 업로드가 있다면 반드시 명시적 opt-in이 필요하다.

## Open risks

- 브라우저가 오버워치 전체화면 독점 모드를 안정적으로 캡처하지 못할 수 있다.
- 캡처 창이 최소화되면 mute/end 처리가 브라우저별로 다를 수 있다.
- 백그라운드 탭에서 분석 루프가 throttle될 수 있다.
- 오버워치 UI 패치로 ROI와 template matching 품질이 떨어질 수 있다.
- 맵 선택 추천은 게임플레이 의사결정 보조로 해석될 수 있으므로 약관 리스크가 있다.
- OCR은 한국어/영어 UI, 해상도, 렌더 스케일, 그래픽 옵션에 따라 정확도 편차가 크다.

## Decision log

- v1은 Electron이 아니라 browser-only `getDisplayMedia`로 시작한다.
- 사용자가 직접 공유 대상을 선택하는 UX를 제품 전제로 삼는다.
- Live는 자동 저장 기능이 아니라 추천과 초안 생성 기능이다.
- OCR은 상태 기반으로 제한 실행한다.
- 기존 screenshot vision pipeline을 폐기하지 않고 입력 어댑터를 확장한다.
- 통계 계산은 현재 클라이언트 집계를 사용하되, UI는 향후 서버 집계 DTO로 교체 가능한 bucket 기반으로 설계한다.

## Source links

- MDN: [`MediaDevices.getDisplayMedia()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- W3C: [Screen Capture specification](https://www.w3.org/TR/screen-capture/)
- MDN: [`Permissions-Policy: display-capture`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/display-capture)
- MDN: [`OffscreenCanvas`](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- GitHub: [`naptha/tesseract.js`](https://github.com/naptha/tesseract.js)
- Blizzard: [End User License Agreement](https://www.blizzard.com/en-us/legal/08b946df-660a-40e4-a072-1fbde65173b1/blizzard-end-user-license-agreement)
