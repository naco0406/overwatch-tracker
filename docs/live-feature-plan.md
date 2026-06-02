# LIVE Feature Plan

## 목표

LIVE는 오버워치 클라이언트 화면을 사용자가 직접 공유하도록 요청하고, 공유된 화면에서 프레임을 주기적으로 샘플링해 한 경기의 맥락을 누적하는 기능이다. 최종 목표는 게임 위에 HUD를 띄우는 것이 아니라, 웹서비스 안에서 맵 선택 화면의 추천과 경기 종료 후 결과 기록 후보를 제공하는 것이다.

## 브라우저 제약

- 웹앱은 `navigator.mediaDevices.getDisplayMedia()`로 사용자가 선택한 화면, 창, 탭을 `MediaStream`으로 받을 수 있다. 이 스트림은 `video`에 연결하고 `canvas`로 프레임을 복사해 분석할 수 있다.
- 사용자는 매번 브라우저 선택 UI에서 공유 대상을 직접 골라야 한다. 권한은 지속 저장되지 않고, 호출은 버튼 클릭 같은 사용자 액션 안에서 시작되어야 한다.
- 웹앱은 특정 앱/창을 자동으로 찾아 선택할 수 없다. Chrome 문서도 특정 창을 미리 지정하지 못하는 것이 의도된 설계라고 설명한다.
- `displaySurface: "window"` 같은 옵션은 창 공유 탭을 더 앞에 보여달라는 힌트일 뿐, 사용자의 선택지를 강제로 제한하지 않는다.
- 창이 가려지거나 전체화면/OS 캡처 정책 영향을 받으면 프레임 품질이 달라질 수 있다. 따라서 LIVE 저장은 자동 확정이 아니라 사용자 확인을 거쳐야 한다.
- 순수 웹 v1은 인게임 HUD/오버레이를 만들지 않는다. 추천과 결과 후보는 오버워치 클라이언트 위가 아니라 웹앱의 LIVE 화면에 표시한다.

참고:

- MDN `getDisplayMedia()`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
- MDN Screen Capture API guide: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture
- Chrome screen sharing controls: https://developer.chrome.com/docs/web-platform/screen-sharing-controls

## 제품 플로우

1. 데스크톱 GNB 하단에 `LIVE` 메뉴와 `화면 공유` 버튼을 항상 표시한다.
2. 사용자가 `LIVE` 메뉴로 대기 화면을 열거나, `화면 공유` 버튼으로 오버워치 창 또는 화면을 선택한다.
3. 화면 공유 스트림이 실제로 연결되면 같은 GNB 영역이 빨간 LIVE 상태로 바뀐다.
4. 공유 상태에 따라 버튼은 `화면 공유`, `연결 중`, `다시 공유`, `공유 종료`로 바뀐다.
5. 모바일에서는 LIVE 시작 트리거와 LIVE 메뉴를 표시하지 않는다. 이 기능은 오버워치 클라이언트를 띄운 PC 환경 전용이다.
6. 앱은 `MediaStream`을 숨겨진 비디오에 연결하고, 주기적으로 캔버스에 프레임을 그린다.
7. 각 프레임은 가벼운 분석부터 수행한다.
   - 해상도, 프레임 수, 샘플 시간
   - 평균 밝기, 대비, 프레임 읽힘 여부
   - 이후 화면 상태 분류: 맵 선택, 로딩/진행 중, 점수판, 결과/진척도
8. 화면 상태별로 추출 가능한 정보를 증거로 저장한다.
   - 맵 선택 화면: 선택 후보 맵 또는 모드별 전체 맵 랭킹을 기준으로 추천
   - 결과/점수판 화면: 맵, 모드, 스코어, 승패 후보를 누적해 저장 초안 생성
9. 같은 매치 컨텍스트 안에서 증거를 누적하고, 신뢰도가 충분해지면 저장 후보를 제안한다.
10. 사용자가 저장 후보를 확인하면 기존 경기 기록 API로 저장한다.

## 매치 증거 모델

단일 OCR 결과를 바로 저장하지 않고, 아래 구조로 누적한다.

```ts
interface LiveEvidence {
  id: string;
  observedAt: string;
  source: 'screen-capture' | 'ocr' | 'image-match' | 'user-confirmed';
  kind: 'map' | 'mode' | 'score' | 'result' | 'screen-state' | 'hero';
  value: string | number | null;
  confidence: number;
  frameIndex: number;
}

interface LiveMatchContext {
  startedAt: string;
  lastObservedAt: string;
  status: 'idle' | 'collecting' | 'candidate' | 'saved';
  evidence: LiveEvidence[];
  candidate: {
    mapId?: string;
    modeId?: string;
    teamScore?: number;
    enemyScore?: number;
    result?: 'win' | 'loss' | 'draw';
  };
}
```

초기 MVP에서는 이 모델을 문서화하고, 실제 코드는 프레임 샘플과 진단 로그부터 쌓는다. 이후 OCR/이미지 매칭을 연결할 때 이 모델을 기준으로 확장한다.

## 단계별 구현

### 1단계: 캡처 MVP

- LIVE 라우트와 데스크톱 GNB 하단 상시 LIVE 메뉴 추가
- 화면 공유 상태에 따라 LIVE 메뉴의 색상, 상태 라벨, 버튼 액션 전환
- 화면 공유 시작/중지
- 선택된 스트림을 숨겨진 `video`와 표시용 `canvas`에 연결
- 기본 5초 간격으로 캔버스 프레임 샘플링과 미리보기 갱신
- 프레임 해상도, 샘플 수, 밝기/대비, 스트림 트랙 설정 표시
- 공유 종료 이벤트 감지

성공 기준:

- 사용자가 브라우저 화면 공유 UI에서 앱/화면을 고를 수 있다.
- LIVE 페이지에 선택된 화면이 캔버스로 보인다.
- 프레임 샘플 카운터와 진단 값이 갱신된다.

### 2단계: 화면 상태 분류

- 빠른 저비용 분류기를 먼저 둔다.
- 후보 상태:
  - `map-select`: 맵 선택 또는 대기 화면
  - `active-match`: 경기 진행 중으로 보이는 화면. v1에서는 무거운 분석을 쉬고 컨텍스트만 유지한다.
  - `scoreboard`: 탭 점수판
  - `result`: 승패/경쟁전 진척도/상세 결과
  - `unknown`
- ROI는 해상도 비율 기반으로 정의한다.

### 3단계: 기존 비전 파이프라인 연결

- 결과 화면 또는 점수판으로 분류된 프레임만 OCR/이미지 매칭을 실행한다.
- 매 프레임 OCR은 하지 않는다. 비용과 성능상 위험하고, 화면 전환 노이즈가 많다.
- `sample2` 같은 점수판 화면은 맵/모드/영웅 증거로, `sample3` 같은 진척도 화면은 결과/영웅 증거로 취급한다.

### 4단계: 추천과 저장 후보

- 맵 선택 화면으로 판단되면 실제 후보 맵 안에서 우선 추천하고, 후보 인식이 불확실하면 현재 모드 또는 전체 기준 맵별 승률을 추천한다.
- 한 매치 안에서 `map`, `mode`, `score`, `result` 증거가 충분히 모이면 저장 후보를 만든다.
- 저장은 자동으로 확정하지 않고 사용자 확인을 받는다.

### 5단계: 성능/품질

- 분석 주기는 화면 상태에 따라 동적으로 조절한다.
  - 기본 프레임 진단: 5초 간격
  - 화면 상태 변화 감지: 3~5초 간격
  - OCR/이미지 매칭: 상태 변화 또는 결과 화면 후보에서만
- 무거운 분석은 Web Worker로 이동한다.
- 장시간 사용 시 메모리 누수 방지를 위해 스트림 트랙, RAF, 타이머, 캔버스 참조를 정리한다.

## 테스트 전략

- 브라우저 수동 테스트:
  - 일반 브라우저 창 공유
  - 오버워치 창 공유
  - 전체 화면 공유
  - 공유 중지 버튼/브라우저 공유 중지 버튼
- 샘플 프레임 리플레이:
  - `samples/vision` 이미지를 캔버스에 주입하는 테스트 도구 추가
  - 실제 `getDisplayMedia()` 없이 화면 상태 분류와 증거 누적을 검증
- 회귀 테스트:
  - 기존 `vision:sample` 기대값 유지
  - LIVE 캡처 유틸은 캔버스 이미지 입력 기반 함수로 분리해 단위 테스트 가능하게 설계
