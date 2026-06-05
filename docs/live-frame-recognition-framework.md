# Live frame recognition framework

작성일: 2026-06-05

## Objective

LIVE의 1차 목표는 오버워치 맵 선택 화면을 짧은 노출 시간 안에 감지하고, 화면에 보이는 후보 맵과 `무작위 전장` 중 내 데이터 기준으로 가장 합리적인 선택을 추천하는 것이다.

이 기능은 OCR 중심이 아니라 프레임 인식 런타임으로 다룬다. OCR은 보정 수단이고, 모든 프레임에 실행하지 않는다.

## Runtime pipeline

```txt
getDisplayMedia stream
  -> requestVideoFrameCallback scheduler
  -> low-res probe
  -> scene runtime state machine
  -> heavy vision extractor
  -> temporal map agreement
  -> recommendation ranking
```

### 1. Low-res probe

입력 프레임을 320px 너비로 줄이고, 맵 선택 화면에서 안정적인 구조만 본다.

- 좌/중/우 맵 카드 영역의 대비와 채도
- 상단 `전장 선택` 영역의 밝은 텍스트 밀도
- 하단 `무작위 전장` 투표 영역의 cyan/대비 패턴

이 단계는 템플릿 매칭, OCR, 모델 추론을 실행하지 않는다. 250ms 기본 간격으로 돌려 짧은 5초 화면도 여러 번 잡는다.

### 2. Scene state machine

단일 프레임으로 화면 타입을 확정하지 않는다.

- `observing`: 저비용 감시
- `suspecting-map-selection`: 맵 선택일 가능성이 생김
- `confirming-map-selection`: 최근 프레임들이 맵 선택 쪽으로 모임
- `stable-map-selection`: heavy vision 결과까지 누적되어 추천 가능

맵 선택이 의심될 때만 700ms 수준의 heavy vision을 실행한다. OCR은 안정화 단계에서 1.8초 이상 간격을 두고 실행한다.

### 3. Heavy vision extractor

기존 `detectMapSelection`을 재사용하되, OCR은 옵션으로 분리한다.

- 첫 heavy pass: 이미지 템플릿 후보를 빠르게 만든다.
- 후속 pass: OCR 가능 시 맵 라벨을 보정한다.
- 최근 2-3초 결과를 slot별로 누적해 temporal agreement로 안정 후보를 만든다.

맵 이름 오인식은 단일 best match를 바로 믿지 않고 다음 증거를 합친다.

- top candidate confidence
- 1위와 2위의 margin
- 같은 slot의 여러 프레임 합의
- OCR 라벨 보정

## Custom model path

자체 모델을 붙인다면 첫 모델은 “맵 이름 인식 모델”이 아니라 `screenType classifier`가 가장 효율적이다.

### Model A: screenType classifier

- 입력: 224x126 또는 320x180 축소 프레임
- 출력: `map_selection`, `scoreboard`, `result`, `history`, `in_game`, `unknown`
- 목적: heavy extractor를 켤지 결정
- 장점: 작은 데이터로 효과가 크고 오탐 감소에 직접적이다.

### Model B: map card embedding

맵 후보를 자주 틀린다면 두 번째 모델로 map card embedding을 검토한다.

- 입력: 맵 선택 카드 crop 1장
- 출력: 직접 map class 또는 embedding vector
- 추천 방식: 직접 분류보다 embedding + nearest neighbor가 유지보수에 좋다.
- 이유: 새 맵이 추가될 때 전체 모델 재학습 없이 reference embedding만 추가할 수 있다.

### Synthetic data

맵 선택 화면은 레이아웃이 고정되어 있으므로 합성 데이터가 유용하다.

- 보유 맵 스크린샷으로 카드 3개 배치
- UI scale, 밝기, blur, compression, crop, 해상도 랜덤화
- `무작위 전장` 영역 유무와 투표 수 랜덤화
- negative sample로 scoreboard, summary, history, 일반 플레이 화면 추가

실제 플레이 중 저장한 프레임은 validation/test에 우선 사용한다. 학습셋에만 넣으면 실제 성능을 과대평가하기 쉽다.

## Random battlefield recommendation

맵 선택 화면에는 후보 3개 외에 `무작위 전장`이 있다. 추천 엔진은 다음을 비교한다.

- 화면에 보이는 후보 맵 3개
- 보이지 않는 나머지 경쟁전 맵 풀의 보정 기대값 평균

무작위는 불확실성이 크므로 recommendation score에 작은 penalty를 둔다. 그래도 후보 3개의 보정 기대값이 낮으면 무작위가 1순위가 될 수 있다.

## MVP boundary

이번 MVP에서 구현한 것:

- `requestVideoFrameCallback` 기반 adaptive scheduler
- 320px low-res map selection probe
- scene runtime state machine
- heavy vision OCR 옵션화
- temporal map candidate agreement
- `무작위 전장` 추천 후보

이번 MVP에서 아직 하지 않는 것:

- ONNX/TensorFlow.js 모델 번들 추가
- 프레임 자동 저장 또는 데이터셋 관리 UI
- Worker/OffscreenCanvas 이전
- 결과 화면 자동 초안 생성 고도화

## Next upgrade

1. `samples/vision`과 실제 LIVE 캡처 프레임으로 confusion matrix를 만든다.
2. map selection false positive/false negative를 라벨링한다.
3. screenType classifier를 MobileNet transfer learning 또는 작은 CNN으로 학습한다.
4. 브라우저에서는 ONNX Runtime Web 또는 TensorFlow.js로 classifier만 먼저 실행한다.
5. map card 후보 오인식이 계속 크면 embedding 기반 card matcher를 추가한다.
