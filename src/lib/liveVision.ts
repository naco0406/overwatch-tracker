import { mapOptions, type MapOption } from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import {
  detectMapSelection,
  detectVisionScreenType,
  findVisionTextOption,
  getCoverSourceRect,
  getRelativeRect,
  mapSelectionCardRegions,
  mapSelectionLabelRegions,
  mapSelectionMatchSize,
  refineMapSelectionWithTextEvidence,
  type MapSelectionDetection,
  type MapSelectionTextEvidence,
  type MapTemplate,
  type PixelImage,
  type PixelRect,
  type RelativeRect,
  type VisionScreenDetection,
  type VisionTextOption,
} from '@/lib/visionPipelineCore';

export interface LiveVisionProbe {
  analyzedAt: string;
  cardScores: {
    score: number;
    slot: MapSelectionDetection<MapOption['value']>['candidates'][number]['slot'];
  }[];
  confidence: number;
  evidence: string[];
  screenCandidate: VisionScreenDetection<MapOption['value']>['screenType'];
}

export interface LiveVisionAnalysis {
  analyzedAt: string;
  mapSelection?: MapSelectionDetection<MapOption['value']>;
  screen: VisionScreenDetection<MapOption['value']>;
}

type TesseractModule = typeof import('tesseract.js');
type LabelOcrWorker = Awaited<ReturnType<TesseractModule['createWorker']>>;

const liveVisionFrameSize = {
  width: 960,
} as const;
const liveProbeFrameSize = {
  width: 320,
} as const;
const ocrCachePath = 'overwatch-tracker-live-ocr-v1';
const ocrLanguages = ['kor', 'eng'];
const loadedMapSelectionTemplates = new Map<
  MapOption['value'],
  Promise<MapTemplate<MapOption['value']>>
>();
let labelOcrWorker: Promise<LabelOcrWorker> | null = null;

const mapModeById = new Map(mapOptions.map((map) => [map.value, map.modeId] as const));

const getCanvasContext = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error('캔버스 분석 컨텍스트를 초기화하지 못했습니다.');
  }

  return context;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const mapSelectionTitleRegion = {
  height: 0.12,
  left: 0.38,
  top: 0.12,
  width: 0.24,
} satisfies RelativeRect;

const mapSelectionRandomRegion = {
  height: 0.1,
  left: 0.3,
  top: 0.77,
  width: 0.4,
} satisfies RelativeRect;

const readCanvasRegionStats = (canvas: HTMLCanvasElement, region: RelativeRect) => {
  const context = getCanvasContext(canvas);
  const rect = getRelativeRect(canvas, region);
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const data = context.getImageData(rect.left, rect.top, width, height).data;
  const pixelCount = data.length / 4;
  let brightPixels = 0;
  let cyanPixels = 0;
  let lumaSquares = 0;
  let lumaTotal = 0;
  let saturationTotal = 0;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luma = red * 0.299 + green * 0.587 + blue * 0.114;
    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

    lumaTotal += luma;
    lumaSquares += luma * luma;
    saturationTotal += saturation;

    if (luma >= 185) {
      brightPixels += 1;
    }

    if (green > 130 && blue > 130 && red < 80) {
      cyanPixels += 1;
    }
  }

  const brightness = lumaTotal / Math.max(1, pixelCount);
  const variance = Math.max(0, lumaSquares / Math.max(1, pixelCount) - brightness * brightness);

  return {
    brightness,
    brightRatio: brightPixels / Math.max(1, pixelCount),
    contrast: Math.sqrt(variance),
    cyanRatio: cyanPixels / Math.max(1, pixelCount),
    saturation: saturationTotal / Math.max(1, pixelCount),
  };
};

const scoreMapSelectionCardRegion = (canvas: HTMLCanvasElement, region: RelativeRect) => {
  const stats = readCanvasRegionStats(canvas, region);
  const brightnessScore = stats.brightness > 28 && stats.brightness < 190 ? 1 : 0.25;
  const contrastScore = clamp01((stats.contrast - 18) / 42);
  const saturationScore = clamp01((stats.saturation - 0.12) / 0.28);

  return clamp01(contrastScore * 0.52 + saturationScore * 0.32 + brightnessScore * 0.16);
};

export const drawLiveProbeFrame = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement | null => {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (width <= 0 || height <= 0) {
    return null;
  }

  const frameWidth = Math.min(liveProbeFrameSize.width, width);
  const frameHeight = Math.max(1, Math.round((height / width) * frameWidth));
  const context = getCanvasContext(canvas);

  if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
    canvas.width = frameWidth;
    canvas.height = frameHeight;
  }

  context.drawImage(video, 0, 0, frameWidth, frameHeight);

  return canvas;
};

export const probeLiveVisionCanvas = (canvas: HTMLCanvasElement): LiveVisionProbe => {
  const cardScores = mapSelectionCardRegions.map(({ region, slot }) => ({
    score: scoreMapSelectionCardRegion(canvas, region),
    slot,
  }));
  const titleStats = readCanvasRegionStats(canvas, mapSelectionTitleRegion);
  const randomStats = readCanvasRegionStats(canvas, mapSelectionRandomRegion);
  const strongCardCount = cardScores.filter((card) => card.score >= 0.46).length;
  const cardAverage =
    cardScores.reduce((sum, card) => sum + card.score, 0) / Math.max(1, cardScores.length);
  const titleScore = clamp01(titleStats.brightRatio * 14 + (titleStats.contrast - 24) / 48);
  const randomScore = clamp01(
    randomStats.cyanRatio * 8 + (randomStats.contrast - 16) / 48 + randomStats.brightRatio * 4,
  );
  const rawConfidence = clamp01(
    strongCardCount * 0.15 + cardAverage * 0.42 + titleScore * 0.18 + randomScore * 0.2,
  );
  const hasMapSelectionStructure = strongCardCount >= 2 && cardAverage >= 0.42;
  const confidence = hasMapSelectionStructure ? rawConfidence : Math.min(rawConfidence, 0.42);
  const screenCandidate =
    hasMapSelectionStructure && confidence >= 0.58 ? 'map_selection' : 'unknown';
  const evidence = [
    `${strongCardCount}/3 card-like regions`,
    `${Math.round(cardAverage * 100)} card score`,
    `${Math.round(randomScore * 100)} random row score`,
  ];

  return {
    analyzedAt: new Date().toISOString(),
    cardScores,
    confidence,
    evidence,
    screenCandidate,
  };
};

const loadHtmlImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = 'anonymous';
    image.addEventListener('error', () =>
      reject(new Error(`이미지를 불러오지 못했습니다: ${source}`)),
    );
    image.addEventListener('load', () => resolve(image));
    image.src = source;
  });

const createPixelImageFromCanvas = (
  canvas: HTMLCanvasElement,
  sourceRect: PixelRect | undefined,
  size: { height: number; width: number },
): PixelImage => {
  const workingCanvas = document.createElement('canvas');
  const context = getCanvasContext(workingCanvas);

  workingCanvas.width = size.width;
  workingCanvas.height = size.height;
  context.drawImage(
    canvas,
    sourceRect?.left ?? 0,
    sourceRect?.top ?? 0,
    sourceRect?.width ?? canvas.width,
    sourceRect?.height ?? canvas.height,
    0,
    0,
    size.width,
    size.height,
  );

  return {
    height: size.height,
    pixels: context.getImageData(0, 0, size.width, size.height).data,
    width: size.width,
  };
};

const createPixelImageFromImage = (
  image: HTMLImageElement,
  sourceRect: PixelRect,
  size: { height: number; width: number },
): PixelImage => {
  const canvas = document.createElement('canvas');
  const context = getCanvasContext(canvas);

  canvas.width = size.width;
  canvas.height = size.height;
  context.drawImage(
    image,
    sourceRect.left,
    sourceRect.top,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    size.width,
    size.height,
  );

  return {
    height: size.height,
    pixels: context.getImageData(0, 0, size.width, size.height).data,
    width: size.width,
  };
};

const loadMapSelectionTemplate = (map: MapOption) => {
  const cached = loadedMapSelectionTemplates.get(map.value);

  if (cached) {
    return cached;
  }

  const promise = loadHtmlImage(getMapScreenshotPath(map.value)).then((image) => ({
    image: createPixelImageFromImage(
      image,
      getCoverSourceRect(
        {
          height: image.naturalHeight,
          width: image.naturalWidth,
        },
        mapSelectionMatchSize,
      ),
      mapSelectionMatchSize,
    ),
    mapId: map.value,
    modeId: map.modeId,
  }));

  loadedMapSelectionTemplates.set(map.value, promise);
  return promise;
};

const loadMapSelectionTemplates = async () =>
  Promise.all(mapOptions.map((map) => loadMapSelectionTemplate(map)));

const getMapTextOptions = (): VisionTextOption<MapOption['value']>[] =>
  mapOptions.map((map) => ({
    aliases:
      map.value === 'runasapi'
        ? ['나사피', '루나 사피']
        : map.value === 'paraiso'
          ? ['파라이소', '파라이스']
          : undefined,
    label: map.label,
    value: map.value,
  }));

const createOcrCropCanvas = (sourceCanvas: HTMLCanvasElement, rect: PixelRect) => {
  const scale = 4;
  const cropCanvas = document.createElement('canvas');
  const context = getCanvasContext(cropCanvas);

  cropCanvas.width = rect.width * scale;
  cropCanvas.height = rect.height * scale;
  context.drawImage(
    sourceCanvas,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height,
  );

  return cropCanvas;
};

const getLabelOcrWorker = async () => {
  if (labelOcrWorker) {
    return labelOcrWorker;
  }

  labelOcrWorker = (async () => {
    const { OEM, PSM, createWorker } = await import('tesseract.js');
    const worker = await createWorker(ocrLanguages, OEM.LSTM_ONLY, {
      cacheMethod: 'write',
      cachePath: ocrCachePath,
    });

    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });

    return worker;
  })();

  return labelOcrWorker;
};

export const terminateLiveVisionOcr = async () => {
  if (!labelOcrWorker) {
    return;
  }

  const worker = await labelOcrWorker;
  labelOcrWorker = null;
  await worker.terminate();
};

const runMapSelectionLabelOcr = async (
  canvas: HTMLCanvasElement,
): Promise<MapSelectionTextEvidence<MapOption['value']>[]> => {
  const worker = await getLabelOcrWorker();
  const textOptions = getMapTextOptions();
  const evidence: MapSelectionTextEvidence<MapOption['value']>[] = [];

  for (const labelRegion of mapSelectionLabelRegions) {
    const rect = getRelativeRect(canvas, labelRegion.region);
    const cropCanvas = createOcrCropCanvas(canvas, rect);
    const result = await worker.recognize(cropCanvas);
    const rawText = result.data.text.trim();
    const option = findVisionTextOption(rawText, textOptions);

    evidence.push({
      confidence: option
        ? Math.max(0.9, result.data.confidence / 100)
        : result.data.confidence / 100,
      mapId: option?.value,
      modeId: option ? mapModeById.get(option.value) : undefined,
      rawText,
      slot: labelRegion.slot,
    });
  }

  return evidence;
};

export const drawLiveVisionFrame = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement | null => {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (width <= 0 || height <= 0) {
    return null;
  }

  const frameWidth = Math.min(liveVisionFrameSize.width, width);
  const frameHeight = Math.max(1, Math.round((height / width) * frameWidth));
  const context = getCanvasContext(canvas);

  if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
    canvas.width = frameWidth;
    canvas.height = frameHeight;
  }

  context.drawImage(video, 0, 0, frameWidth, frameHeight);

  return canvas;
};

export const analyzeLiveVisionCanvas = async (
  canvas: HTMLCanvasElement,
  options: { includeOcr?: boolean } = {},
): Promise<LiveVisionAnalysis> => {
  const pixelImage = createPixelImageFromCanvas(canvas, undefined, {
    height: canvas.height,
    width: canvas.width,
  });
  const templates = await loadMapSelectionTemplates();
  let mapSelection = detectMapSelection(pixelImage, templates);
  const uniqueVisualMapCount = new Set(mapSelection.candidates.map((candidate) => candidate.mapId))
    .size;

  if ((options.includeOcr ?? true) && mapSelection.confidence >= 0.6 && uniqueVisualMapCount >= 3) {
    const textEvidence = await runMapSelectionLabelOcr(canvas);

    mapSelection = refineMapSelectionWithTextEvidence(mapSelection, textEvidence);
  }

  const screen = detectVisionScreenType({
    mapSelection,
  });

  return {
    analyzedAt: new Date().toISOString(),
    mapSelection: screen.screenType === 'map_selection' ? mapSelection : undefined,
    screen,
  };
};
