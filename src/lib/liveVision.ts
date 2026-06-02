import { mapOptions, type MapOption } from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import {
  detectMapSelection,
  detectVisionScreenType,
  findVisionTextOption,
  getCoverSourceRect,
  getRelativeRect,
  mapSelectionLabelRegions,
  mapSelectionMatchSize,
  refineMapSelectionWithTextEvidence,
  type MapSelectionDetection,
  type MapSelectionTextEvidence,
  type MapTemplate,
  type PixelImage,
  type PixelRect,
  type VisionScreenDetection,
  type VisionTextOption,
} from '@/lib/visionPipelineCore';

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
): Promise<LiveVisionAnalysis> => {
  const pixelImage = createPixelImageFromCanvas(canvas, undefined, {
    height: canvas.height,
    width: canvas.width,
  });
  const templates = await loadMapSelectionTemplates();
  let mapSelection = detectMapSelection(pixelImage, templates);
  const uniqueVisualMapCount = new Set(mapSelection.candidates.map((candidate) => candidate.mapId))
    .size;

  if (mapSelection.confidence >= 0.6 && uniqueVisualMapCount >= 3) {
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
