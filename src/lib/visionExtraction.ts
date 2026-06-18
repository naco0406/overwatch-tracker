import {
  heroOptions,
  mapOptions,
  resultOptions,
  type HeroOption,
  type MapOption,
} from '@/data/matchOptions';
import { getHeroPortraitPath, getMapScreenshotPath } from '@/data/masterAssets';
import {
  createDetectedVisionLayout,
  createMapCardSearchRegions,
  detectMapSelection,
  detectVisionScreenType,
  detectRoleFromIcon,
  detectSelfBlueRow,
  getBlueRoleIconRect,
  getCoverSourceRect,
  getRelativeRect,
  heroMatchSize,
  isReliableHeroCandidate,
  isReliableMapCandidate,
  mapSelectionMatchSize,
  mapMatchSize,
  parseOcrText,
  rankHeroTemplates,
  resizePixelImage,
  scoreMapImages,
  visionRegions,
  type HeroRole,
  type ImageDimensions,
  type OcrParseResult,
  type PixelImage,
  type PixelRect as Rect,
  type RelativeRect,
  type VisionLayout,
  type VisionScreenDetection,
} from '@/lib/visionPipelineCore';
import type { MatchCreateInput, MatchResult, MatchRole, ModeId } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';

export interface VisionExtractionConfig {
  enableOcr?: boolean;
  enableVisualHeroMatch?: boolean;
  enableVisualMapMatch?: boolean;
}

export interface VisionExtractionProgress {
  file?: string;
  loaded?: number;
  message: string;
  progress?: number;
  stage: 'hero' | 'layout' | 'map' | 'normalizing' | 'ocr' | 'ocr-assets' | 'preparing';
  total?: number;
}

export interface VisionExtractionResult {
  draft: Partial<MatchCreateInput>;
  heroCandidates: VisionHeroCandidate[];
  mapCandidates: VisionMapCandidate[];
  ocrText?: string;
  raw: string;
  screen: VisionScreenDetection<MapOption['value']>;
  warnings: string[];
}

interface VisionMapCandidate {
  confidence: number;
  mapId: string;
}

interface VisionMapMatchResult {
  candidates: VisionMapCandidate[];
  mapCardRegion?: RelativeRect;
  searchCandidates: number;
}

interface VisionHeroAlternative {
  confidence: number;
  heroId: string;
}

interface VisionHeroCandidate {
  alternatives: VisionHeroAlternative[];
  confidence: number;
  heroId: string;
  isSelfRow?: boolean;
  margin: number;
  rect?: Rect;
  role?: HeroRole;
  row: number;
  source: 'featured-hero' | 'scoreboard-slot';
  team: 'blue' | 'red';
}

interface VisionTextEvidence {
  heroId?: HeroOption['value'];
  mapId?: MapOption['value'];
  modeId?: ModeId;
  result?: MatchResult;
}

type VisionExtractionProgressHandler = (progress: VisionExtractionProgress) => void;

type VisionLogLevel = 'debug' | 'error' | 'info' | 'warn';

interface VisionLogger {
  end: (step: string, payload?: Record<string, unknown>) => void;
  error: (message: string, payload?: Record<string, unknown>) => void;
  event: (message: string, payload?: Record<string, unknown>) => void;
  start: (step: string, payload?: Record<string, unknown>) => void;
  warn: (message: string, payload?: Record<string, unknown>) => void;
}

let loadedHeroTemplates:
  | Promise<
      {
        heroId: HeroOption['value'];
        image: PixelImage;
        role: HeroRole;
      }[]
    >
  | undefined;
const loadedMapVectors = new Map<MapOption['value'], Promise<PixelImage>>();
const loadedMapSelectionVectors = new Map<MapOption['value'], Promise<PixelImage>>();

const mapById = new Map(mapOptions.map((map) => [map.value, map] as const));
const heroRoleById = new Map(heroOptions.map((hero) => [hero.value, hero.role]));
const visionLogPrefix = '[Overwatch Vision]';
const ocrLanguages = ['kor', 'eng'];
const ocrCachePath = 'overwatch-tracker-ocr-v1';

const getTimestamp = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const formatDuration = (durationMs: number) => `${Math.round(durationMs)}ms`;

const getErrorPayload = (error: unknown): Record<string, unknown> =>
  error instanceof Error
    ? {
        message: error.message,
        name: error.name,
        stack: error.stack,
      }
    : {
        message: String(error),
      };

const writeVisionLog = (
  level: VisionLogLevel,
  message: string,
  payload?: Record<string, unknown>,
) => {
  if (payload) {
    console[level](message, payload);
    return;
  }

  console[level](message);
};

const createVisionLogger = (): VisionLogger => {
  const startedAt = getTimestamp();
  const sessionId = Math.random().toString(36).slice(2, 8);
  const stepStartedAt = new Map<string, number>();
  const withPrefix = (message: string) =>
    `${visionLogPrefix} ${sessionId} +${formatDuration(getTimestamp() - startedAt)} ${message}`;

  return {
    end: (step, payload) => {
      const stepStarted = stepStartedAt.get(step);
      stepStartedAt.delete(step);

      writeVisionLog('info', withPrefix(`${step}:end`), {
        duration: stepStarted ? formatDuration(getTimestamp() - stepStarted) : 'unknown',
        ...payload,
      });
    },
    error: (message, payload) => writeVisionLog('error', withPrefix(message), payload),
    event: (message, payload) => writeVisionLog('debug', withPrefix(message), payload),
    start: (step, payload) => {
      stepStartedAt.set(step, getTimestamp());
      writeVisionLog('info', withPrefix(`${step}:start`), payload);
    },
    warn: (message, payload) => writeVisionLog('warn', withPrefix(message), payload),
  };
};

const loadHtmlImage = (source: Blob | string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = typeof source === 'string' ? undefined : URL.createObjectURL(source);

    image.crossOrigin = 'anonymous';
    image.addEventListener('error', () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      reject(new Error('이미지를 불러오지 못했습니다.'));
    });
    image.addEventListener('load', () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(image);
    });
    if (objectUrl) {
      image.src = objectUrl;
    } else {
      image.src = source as string;
    }
  });

const isMapId = (value: string | null | undefined): value is MapOption['value'] =>
  mapOptions.some((map) => map.value === value);

const supplementalOcrRegions = [
  {
    name: 'summary-map-title',
    region: {
      height: 0.085,
      left: 0.665,
      top: 0.17,
      width: 0.22,
    },
  },
  {
    name: 'top-status',
    region: {
      height: 0.14,
      left: 0.24,
      top: 0.01,
      width: 0.52,
    },
  },
  {
    name: 'top-right-map',
    region: {
      height: 0.18,
      left: 0.68,
      top: 0.02,
      width: 0.3,
    },
  },
  {
    name: 'rank-result',
    region: {
      height: 0.22,
      left: 0.04,
      top: 0.06,
      width: 0.38,
    },
  },
  {
    name: 'rank-outcome-marker',
    region: {
      height: 0.08,
      left: 0.46,
      top: 0.795,
      width: 0.16,
    },
  },
  {
    name: 'center-status',
    region: {
      height: 0.42,
      left: 0.22,
      top: 0.12,
      width: 0.56,
    },
  },
  {
    name: 'scoreboard',
    region: {
      height: 0.62,
      left: 0.06,
      top: 0.18,
      width: 0.62,
    },
  },
  {
    name: 'right-detail-panel',
    region: {
      height: 0.72,
      left: 0.62,
      top: 0.14,
      width: 0.31,
    },
  },
  {
    name: 'right-rank-heroes',
    region: {
      height: 0.34,
      left: 0.78,
      top: 0.34,
      width: 0.2,
    },
  },
] as const;

const compactVisionText = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_:/\\|()[\]{}.,'"`~!@#$%^&*+=?<>·•]+/g, '');

const findOptionInText = <TOption extends { label: string; value: string }>(
  compactText: string,
  options: TOption[],
): TOption | undefined => {
  const matches = options
    .flatMap((option) => {
      const aliases = [option.label, option.value];

      return aliases
        .map((alias) => ({
          option,
          position: compactText.indexOf(compactVisionText(alias)),
        }))
        .filter((match) => match.position >= 0);
    })
    .sort((left, right) => left.position - right.position);

  return matches[0]?.option;
};

const extractTextEvidence = (text: string): VisionTextEvidence => {
  const compact = compactVisionText(text);
  const resultCompact = compact.replace(/(?:승리|패배|무승부)시/g, '');
  const map = findOptionInText(compact, mapOptions);
  const hero = findOptionInText(compact, heroOptions);
  const result =
    resultOptions.find(
      (option) =>
        resultCompact.includes(compactVisionText(option.label)) ||
        resultCompact.includes(compactVisionText(option.value)),
    ) ??
    (['바저', '바제', '패저', '패버'].some((label) => resultCompact.includes(label))
      ? ({ value: 'loss' } as const)
      : undefined);

  return {
    heroId: hero?.value,
    mapId: map?.value,
    modeId: map?.modeId,
    result: result?.value,
  };
};

const hasCoreOcrFields = (parse: OcrParseResult) =>
  Boolean(
    parse.result ||
    parse.modeId ||
    parse.playedAtLocal ||
    (typeof parse.teamScore === 'number' && typeof parse.enemyScore === 'number'),
  );

const runRightPanelOcr = async ({
  dimensions,
  file,
  layout,
  logger,
  onProgress,
}: {
  dimensions: ImageDimensions;
  file: File;
  layout: VisionLayout;
  logger: VisionLogger;
  onProgress?: VisionExtractionProgressHandler;
}) => {
  logger.start('ocr');
  onProgress?.({
    message: '브라우저 OCR로 결과 텍스트를 읽는 중',
    stage: 'ocr',
  });

  logger.start('ocr:import-tesseract');
  const { OEM, PSM, createWorker } = await import('tesseract.js');
  logger.end('ocr:import-tesseract');

  const ocrRegions = [
    {
      name: 'result-panel',
      region: layout.regions.resultPanel,
    },
    ...supplementalOcrRegions,
  ];

  logger.event('ocr:regions', {
    layoutConfidence: layout.confidence,
    regions: ocrRegions,
  });
  logger.start('ocr:create-worker', {
    cachePath: ocrCachePath,
    languages: ocrLanguages,
  });
  const worker = await createWorker(ocrLanguages, OEM.LSTM_ONLY, {
    cacheMethod: 'write',
    cachePath: ocrCachePath,
    errorHandler: (error) => {
      logger.error('ocr:worker-error', {
        error,
      });
    },
    logger: (progress) => {
      logger.event('ocr:worker-progress', {
        progress: progress.progress,
        status: progress.status,
      });
      if (progress.status === 'recognizing text') {
        onProgress?.({
          message: '브라우저 OCR로 결과 텍스트를 읽는 중',
          progress: Math.round(progress.progress * 100),
          stage: 'ocr',
        });
      } else if (progress.status === 'loading language traineddata') {
        onProgress?.({
          message: 'OCR 한국어/영어 학습 데이터를 준비하는 중',
          progress:
            typeof progress.progress === 'number' ? Math.round(progress.progress * 100) : undefined,
          stage: 'ocr-assets',
        });
      } else if (progress.status) {
        onProgress?.({
          message: `OCR 엔진 초기화 중: ${progress.status}`,
          progress:
            typeof progress.progress === 'number' ? Math.round(progress.progress * 100) : undefined,
          stage: 'ocr-assets',
        });
      }
    },
  });
  logger.end('ocr:create-worker');

  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  });
  logger.event('ocr:parameters-set', {
    pagesegMode: PSM.SPARSE_TEXT,
  });

  try {
    const recognized: {
      confidence: number;
      name: string;
      rectangle: Rect;
      text: string;
    }[] = [];

    for (const [index, ocrRegion] of ocrRegions.entries()) {
      const rectangle = getRelativeRect(dimensions, ocrRegion.region);

      logger.start(`ocr:recognize:${ocrRegion.name}`);
      const result = await worker.recognize(file, { rectangle });
      const text = result.data.text.trim();

      recognized.push({
        confidence: result.data.confidence,
        name: ocrRegion.name,
        rectangle,
        text,
      });
      logger.end(`ocr:recognize:${ocrRegion.name}`, {
        confidence: result.data.confidence,
        rectangle,
        text,
        textLength: text.length,
      });

      if (index >= 1 && hasCoreOcrFields(parseOcrText(recognized[0]?.text ?? ''))) {
        logger.event('ocr:supplemental-skipped', {
          reason: 'result-panel-contained-core-fields',
        });
        break;
      }
    }

    const text = recognized
      .filter((result) => result.text)
      .map((result) => `[${result.name}]\n${result.text}`)
      .join('\n\n');

    logger.end('ocr', {
      recognized,
      text,
      textLength: text.length,
    });

    return text;
  } finally {
    logger.start('ocr:terminate-worker');
    await worker.terminate();
    logger.end('ocr:terminate-worker');
  }
};

const getCanvasContext = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error('브라우저 캔버스를 초기화하지 못했습니다.');
  }

  return context;
};

const createPixelImage = (
  image: HTMLImageElement,
  sourceRect: Rect | undefined,
  options: {
    fillStyle?: string;
    height: number;
    width: number;
  },
): PixelImage => {
  const width = options.width ?? 32;
  const height = options.height ?? 18;
  const canvas = document.createElement('canvas');
  const context = getCanvasContext(canvas);

  canvas.width = width;
  canvas.height = height;

  if (options.fillStyle) {
    context.fillStyle = options.fillStyle;
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(
    image,
    sourceRect?.left ?? 0,
    sourceRect?.top ?? 0,
    sourceRect?.width ?? image.naturalWidth,
    sourceRect?.height ?? image.naturalHeight,
    0,
    0,
    width,
    height,
  );

  const imageData = context.getImageData(0, 0, width, height);

  return {
    height,
    pixels: imageData.data,
    width,
  };
};

const loadMapFeatureVector = (mapId: MapOption['value']) => {
  const cached = loadedMapVectors.get(mapId);

  if (cached) {
    return cached;
  }

  const promise = loadHtmlImage(getMapScreenshotPath(mapId)).then((mapImage) =>
    createPixelImage(mapImage, undefined, mapMatchSize),
  );

  loadedMapVectors.set(mapId, promise);
  return promise;
};

const loadMapSelectionFeatureVector = (mapId: MapOption['value']) => {
  const cached = loadedMapSelectionVectors.get(mapId);

  if (cached) {
    return cached;
  }

  const promise = loadHtmlImage(getMapScreenshotPath(mapId)).then((mapImage) =>
    createPixelImage(
      mapImage,
      getCoverSourceRect(
        {
          height: mapImage.naturalHeight,
          width: mapImage.naturalWidth,
        },
        mapSelectionMatchSize,
      ),
      mapSelectionMatchSize,
    ),
  );

  loadedMapSelectionVectors.set(mapId, promise);
  return promise;
};

const loadHeroTemplates = (logger: VisionLogger) => {
  if (loadedHeroTemplates) {
    logger.event('hero-match:template-cache-hit');
    return loadedHeroTemplates;
  }

  loadedHeroTemplates = Promise.all(
    heroOptions.map(async (hero) => {
      try {
        const heroImage = await loadHtmlImage(getHeroPortraitPath(hero.value));

        return {
          heroId: hero.value,
          image: createPixelImage(heroImage, undefined, {
            ...heroMatchSize,
            fillStyle: '#142235',
          }),
          role: hero.role,
        };
      } catch (error) {
        logger.warn('hero-match:template-missing', {
          error: error instanceof Error ? error.message : String(error),
          heroId: hero.value,
        });

        return null;
      }
    }),
  ).then((templates) =>
    templates.filter((template): template is NonNullable<typeof template> => template !== null),
  );

  return loadedHeroTemplates;
};

const runMapSelectionDetection = async ({
  logger,
  screenshotPixels,
}: {
  logger: VisionLogger;
  screenshotPixels: PixelImage;
}) => {
  logger.start('screen:map-selection');
  const mapTemplates = (
    await Promise.all(
      mapOptions.map(async (map) => {
        try {
          return {
            image: await loadMapSelectionFeatureVector(map.value),
            mapId: map.value,
            modeId: map.modeId,
          };
        } catch (error) {
          logger.warn('screen:map-selection-template-missing', {
            error: error instanceof Error ? error.message : String(error),
            mapId: map.value,
          });

          return null;
        }
      }),
    )
  ).filter((template): template is NonNullable<typeof template> => template !== null);
  const detection = detectMapSelection(screenshotPixels, mapTemplates);

  logger.end('screen:map-selection', {
    candidates: detection.candidates,
    confidence: detection.confidence,
    evidence: detection.evidence,
  });

  return detection;
};

const runVisualMapMatch = async ({
  dimensions,
  logger,
  modeId,
  onProgress,
  screenshotPixels,
}: {
  dimensions: ImageDimensions;
  logger: VisionLogger;
  modeId?: ModeId;
  onProgress?: VisionExtractionProgressHandler;
  screenshotPixels: PixelImage;
}): Promise<VisionMapMatchResult> => {
  logger.start('map-match', {
    modeId: modeId ?? null,
  });
  onProgress?.({
    message: '전장 카드 위치를 탐지하고 정적 이미지와 비교하는 중',
    stage: 'map',
  });

  const candidateMaps = modeId ? mapOptions.filter((map) => map.modeId === modeId) : mapOptions;
  const mapImages = await Promise.all(
    candidateMaps.map(async (map) => ({
      image: await loadMapFeatureVector(map.value),
      mapId: map.value,
    })),
  );
  const searchRegions = createMapCardSearchRegions();

  logger.event('map-match:candidates-loaded', {
    candidateCount: candidateMaps.length,
    searchRegionCount: searchRegions.length,
  });

  let bestMatch:
    | {
        candidates: VisionMapCandidate[];
        mapCardRegion: RelativeRect;
        score: number;
      }
    | undefined;

  for (const searchRegion of searchRegions) {
    const mapPreviewRect = getRelativeRect(dimensions, searchRegion);
    const screenshotMap = resizePixelImage(screenshotPixels, mapPreviewRect, mapMatchSize);
    const candidates = mapImages
      .map((map) => ({
        confidence: scoreMapImages(screenshotMap, map.image),
        mapId: map.mapId,
      }))
      .sort((left, right) => right.confidence - left.confidence);
    const bestCandidate = candidates[0];
    const secondCandidate = candidates[1];
    const margin =
      bestCandidate && secondCandidate
        ? bestCandidate.confidence - secondCandidate.confidence
        : (bestCandidate?.confidence ?? 0);
    const offsetPenalty =
      Math.hypot(
        searchRegion.left - visionRegions.mapCard.left,
        searchRegion.top - visionRegions.mapCard.top,
      ) * 0.35;
    const score = (bestCandidate?.confidence ?? 0) + margin * 0.4 - offsetPenalty;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        candidates,
        mapCardRegion: searchRegion,
        score,
      };
    }
  }

  const topCandidates = bestMatch?.candidates.slice(0, 5) ?? [];
  const mapCardRegion = bestMatch?.mapCardRegion;

  logger.end('map-match', {
    detectedRegion: mapCardRegion
      ? {
          pixel: getRelativeRect(dimensions, mapCardRegion),
          relative: mapCardRegion,
        }
      : null,
    searchCandidates: searchRegions.length,
    topCandidates,
  });

  return {
    candidates: topCandidates,
    mapCardRegion,
    searchCandidates: searchRegions.length,
  };
};

const getHeroSlotRects = (dimensions: ImageDimensions, layout: VisionLayout) => {
  const verticalDelta = layout.regions.blueHero.top - visionRegions.blueHero.top;
  const slotLayouts = [
    {
      firstTop: layout.regions.blueHero.top,
      team: 'blue',
    },
    {
      firstTop: 0.673 + verticalDelta,
      team: 'red',
    },
  ] as const;

  return slotLayouts.flatMap((slotLayout) =>
    Array.from({ length: 5 }, (_, index) => ({
      rect: getRelativeRect(dimensions, {
        height: layout.regions.blueHero.height,
        left: layout.regions.blueHero.left,
        top: slotLayout.firstTop + index * layout.rowPitch,
        width: layout.regions.blueHero.width,
      }),
      row: index + 1,
      team: slotLayout.team,
    })),
  );
};

const featuredHeroRegions = [
  {
    name: 'right-detail-large',
    region: {
      height: 0.17,
      left: 0.632,
      top: 0.145,
      width: 0.095,
    },
  },
  {
    name: 'right-detail-large-tight',
    region: {
      height: 0.15,
      left: 0.644,
      top: 0.155,
      width: 0.078,
    },
  },
  {
    name: 'rank-top-portrait',
    region: {
      height: 0.09,
      left: 0.913,
      top: 0.408,
      width: 0.052,
    },
  },
  {
    name: 'rank-top-portrait-wide',
    region: {
      height: 0.105,
      left: 0.905,
      top: 0.398,
      width: 0.064,
    },
  },
] as const;

const runVisualHeroMatch = async ({
  dimensions,
  layout,
  logger,
  onProgress,
  screenshotImage,
  screenshotPixels,
}: {
  dimensions: ImageDimensions;
  layout: VisionLayout;
  logger: VisionLogger;
  onProgress?: VisionExtractionProgressHandler;
  screenshotImage: HTMLImageElement;
  screenshotPixels: PixelImage;
}): Promise<VisionHeroCandidate[]> => {
  logger.start('hero-match', {
    heroCount: heroOptions.length,
  });
  onProgress?.({
    message: '영웅 초상화와 스코어보드 행을 비교하는 중',
    stage: 'hero',
  });

  const selfRows = detectSelfBlueRow(screenshotPixels, layout);
  const roleByBlueRow = new Map<number, HeroRole>();

  for (let row = 1; row <= 5; row += 1) {
    const roleIcon = createPixelImage(
      screenshotImage,
      getBlueRoleIconRect(dimensions, row, layout),
      {
        height: 34,
        width: 34,
      },
    );

    roleByBlueRow.set(row, detectRoleFromIcon(roleIcon));
  }

  logger.event('hero-match:blue-row-policy', {
    layout: layout.diagnostics.rowDetection,
    roles: Array.from(roleByBlueRow.entries()),
    selfRows,
  });
  logger.start('hero-match:load-templates');
  const heroTemplates = await loadHeroTemplates(logger);
  logger.end('hero-match:load-templates', {
    heroCount: heroTemplates.length,
  });

  const canUseScoreboardSlots =
    layout.diagnostics.rowDetection.source === 'detected' &&
    layout.diagnostics.rowDetection.confidence >= 0.22 &&
    Math.abs(layout.diagnostics.rowDetection.deltaTop) < 0.025;
  const slotRects = canUseScoreboardSlots ? getHeroSlotRects(dimensions, layout) : [];
  const selfRow = selfRows[0]?.row;
  logger.event('hero-match:slot-rects', {
    canUseScoreboardSlots,
    slots: slotRects,
  });

  const createCandidate = ({
    isSelfRow,
    rect,
    role,
    row,
    source,
    team,
  }: {
    isSelfRow?: boolean;
    rect: Rect;
    role?: HeroRole;
    row: number;
    source: VisionHeroCandidate['source'];
    team: VisionHeroCandidate['team'];
  }): VisionHeroCandidate => {
    const screenshotHero = resizePixelImage(screenshotPixels, rect, heroMatchSize, {
      background: [20, 34, 53],
    });
    const alternatives = rankHeroTemplates(screenshotHero, heroTemplates, role)
      .slice(0, 3)
      .map((candidate) => ({
        confidence: candidate.confidence,
        heroId: candidate.heroId,
      }));
    const best = alternatives[0];
    const second = alternatives[1];

    return {
      alternatives,
      confidence: best?.confidence ?? 0,
      heroId: best?.heroId ?? '',
      isSelfRow,
      margin: best && second ? best.confidence - second.confidence : (best?.confidence ?? 0),
      rect,
      role,
      row,
      source,
      team,
    };
  };

  const slotCandidates = slotRects.map((slot) =>
    createCandidate({
      isSelfRow: slot.team === 'blue' && slot.row === selfRow,
      rect: slot.rect,
      role: slot.team === 'blue' ? roleByBlueRow.get(slot.row) : undefined,
      row: slot.row,
      source: 'scoreboard-slot',
      team: slot.team,
    }),
  );
  const featuredCandidates = featuredHeroRegions.map((featured, index) =>
    createCandidate({
      isSelfRow: !canUseScoreboardSlots && index === 0,
      rect: getRelativeRect(dimensions, featured.region),
      row: index + 1,
      source: 'featured-hero',
      team: 'blue',
    }),
  );
  const candidates = [...slotCandidates, ...featuredCandidates].filter(
    (candidate) => candidate.heroId && candidate.confidence >= 0.55,
  );

  logger.end('hero-match', {
    candidates,
    featuredRegions: featuredHeroRegions,
  });

  return candidates;
};

const normalizeExtractionResult = ({
  fallback,
  heroCandidates,
  mapCandidates,
  ocrParse,
  ocrText,
}: {
  fallback: Partial<MatchCreateInput>;
  heroCandidates: VisionHeroCandidate[];
  mapCandidates: VisionMapCandidate[];
  ocrParse?: OcrParseResult;
  ocrText?: string;
}) => {
  const warnings: string[] = [];
  const textEvidence = extractTextEvidence(ocrText ?? '');
  const draft: Partial<MatchCreateInput> = {
    ...fallback,
    source: 'mixed',
  };

  if (ocrParse?.result || textEvidence.result)
    draft.result = ocrParse?.result ?? textEvidence.result;
  if (typeof ocrParse?.teamScore === 'number') draft.teamScore = ocrParse.teamScore;
  if (typeof ocrParse?.enemyScore === 'number') draft.enemyScore = ocrParse.enemyScore;
  if (ocrParse?.modeId || textEvidence.modeId)
    draft.modeId = ocrParse?.modeId ?? textEvidence.modeId;
  if (ocrParse?.playedAtLocal) draft.playedAt = ocrParse.playedAtLocal;

  const selfHeroCandidate = heroCandidates.find(
    (candidate) =>
      candidate.isSelfRow &&
      candidate.source === 'scoreboard-slot' &&
      isReliableHeroCandidate([candidate, ...candidate.alternatives.slice(1)]),
  );
  const featuredHeroCandidate = heroCandidates
    .filter(
      (candidate) =>
        candidate.source === 'featured-hero' &&
        isReliableHeroCandidate([candidate, ...candidate.alternatives.slice(1)]),
    )
    .sort((left, right) => right.confidence - left.confidence)[0];

  if (selfHeroCandidate) {
    draft.myHeroes = [selfHeroCandidate.heroId];
  } else if (textEvidence.heroId) {
    draft.myHeroes = [textEvidence.heroId];
  } else if (featuredHeroCandidate) {
    draft.myHeroes = [featuredHeroCandidate.heroId];
  }

  const inferredMatchRole =
    selfHeroCandidate?.role ??
    draft.myHeroes
      ?.map((heroId) => heroRoleById.get(heroId))
      .find((role): role is MatchRole => Boolean(role));

  if (inferredMatchRole && !draft.matchRole) {
    draft.matchRole = inferredMatchRole;
  }

  const bestMapCandidate = mapCandidates[0];
  if (textEvidence.mapId) {
    draft.mapId = textEvidence.mapId;
  } else if (bestMapCandidate && isReliableMapCandidate(mapCandidates)) {
    draft.mapId = bestMapCandidate.mapId;
  }

  if (draft.mapId && isMapId(draft.mapId)) {
    const map = mapById.get(draft.mapId);

    if (map && (!draft.modeId || map.modeId !== draft.modeId)) {
      draft.modeId = map.modeId;
    }
  }

  if (bestMapCandidate && !isReliableMapCandidate(mapCandidates) && !textEvidence.mapId) {
    warnings.push('전장 이미지는 후보 간 차이가 작아 확인이 필요합니다.');
  }

  const uncertainSelfHero = heroCandidates.find((candidate) => candidate.isSelfRow);

  if (uncertainSelfHero && !draft.myHeroes?.length) {
    warnings.push('영웅 초상화는 후보 간 차이가 작아 확인이 필요합니다.');
  }

  return {
    draft,
    textEvidence,
    warnings,
  };
};

export const extractMatchFromScreenshot = async ({
  accounts,
  config = {},
  file,
  onProgress,
}: {
  accounts: PlayerAccount[];
  config?: VisionExtractionConfig;
  file: File;
  onProgress?: VisionExtractionProgressHandler;
}): Promise<VisionExtractionResult> => {
  const logger = createVisionLogger();

  logger.start('analysis', {
    accountCount: accounts.length,
    accounts: accounts.map((account) => ({
      battleTag: account.battleTag,
      displayName: account.displayName,
      id: account.id,
      isActive: account.isActive,
      isMain: account.isMain,
    })),
    config,
    file: {
      lastModified: file.lastModified,
      name: file.name,
      size: file.size,
      type: file.type,
    },
  });
  onProgress?.({
    message: '스크린샷 분석을 준비하는 중',
    stage: 'preparing',
  });

  logger.event('config:resolved', {
    config,
    pipeline: 'layout-detection-ocr-image-matching',
  });
  const screenshotImage = await loadHtmlImage(file);
  const dimensions = {
    height: screenshotImage.naturalHeight,
    width: screenshotImage.naturalWidth,
  };
  logger.event('image:dimensions', {
    ...dimensions,
  });
  const screenshotPixels = createPixelImage(screenshotImage, undefined, dimensions);
  const warnings: string[] = [];
  let mapSelectionDetection: Awaited<ReturnType<typeof runMapSelectionDetection>> | undefined;

  if (config.enableVisualMapMatch !== false) {
    try {
      mapSelectionDetection = await runMapSelectionDetection({
        logger,
        screenshotPixels,
      });
    } catch (error) {
      logger.warn('screen:map-selection:error', getErrorPayload(error));
    }
  }

  const earlyScreen = mapSelectionDetection
    ? detectVisionScreenType({
        mapSelection: mapSelectionDetection,
      })
    : undefined;

  if (earlyScreen?.screenType === 'map_selection' && mapSelectionDetection) {
    const screen = earlyScreen;
    const result = {
      draft: {
        accountId: accounts.find((account) => account.isMain)?.id ?? accounts[0]?.id,
        playedAt: new Date(),
        source: 'mixed',
      },
      heroCandidates: [],
      mapCandidates: mapSelectionDetection.candidates.map((candidate) => ({
        confidence: candidate.confidence,
        mapId: candidate.mapId,
      })),
      ocrText: '',
      raw: JSON.stringify(
        {
          mapSelection: mapSelectionDetection,
          pipeline: 'screen-type-map-selection',
          screen,
        },
        null,
        2,
      ),
      screen,
      warnings: ['맵 선택 화면으로 감지되어 경기 결과 입력값은 만들지 않았습니다.'],
    } satisfies VisionExtractionResult;

    logger.end('analysis', {
      draft: result.draft,
      mapSelection: mapSelectionDetection,
      screen,
      warnings: result.warnings,
    });

    return result;
  }

  let mapCandidates: VisionMapCandidate[] = [];
  let mapMatchResult: VisionMapMatchResult | undefined;

  if (config.enableVisualMapMatch !== false) {
    try {
      mapMatchResult = await runVisualMapMatch({
        dimensions,
        logger,
        modeId: undefined,
        onProgress,
        screenshotPixels,
      });
      mapCandidates = mapMatchResult.candidates;
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `전장 이미지 비교 실패: ${error.message}`
          : '전장 이미지 비교를 실행하지 못했습니다.',
      );
      logger.error('map-match:error', getErrorPayload(error));
    }
  } else {
    logger.event('map-match:skipped');
  }

  onProgress?.({
    message: '스크린샷 UI 영역을 탐지하는 중',
    stage: 'layout',
  });
  const layout = createDetectedVisionLayout(screenshotPixels, {
    mapCard: isReliableMapCandidate(mapCandidates) ? mapMatchResult?.mapCardRegion : undefined,
  });

  logger.event('layout:resolved', {
    layout,
    mapSearchCandidates: mapMatchResult?.searchCandidates ?? 0,
  });

  let ocrText = '';
  let ocrParse: OcrParseResult | undefined;

  if (config.enableOcr !== false) {
    try {
      ocrText = await runRightPanelOcr({
        dimensions,
        file,
        layout,
        logger,
        onProgress,
      });
      ocrParse = parseOcrText(ocrText);
      logger.event('ocr:parsed', {
        ocrParse,
        ocrText,
      });
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `브라우저 OCR 실패: ${error.message}`
          : '브라우저 OCR을 실행하지 못했습니다.',
      );
      logger.error('ocr:error', getErrorPayload(error));
    }
  } else {
    logger.event('ocr:skipped');
  }

  let heroCandidates: VisionHeroCandidate[] = [];

  if (config.enableVisualHeroMatch !== false) {
    try {
      heroCandidates = await runVisualHeroMatch({
        dimensions,
        layout,
        logger,
        onProgress,
        screenshotImage,
        screenshotPixels,
      });
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `영웅 초상화 비교 실패: ${error.message}`
          : '영웅 초상화 비교를 실행하지 못했습니다.',
      );
      logger.error('hero-match:error', getErrorPayload(error));
    }
  } else {
    logger.event('hero-match:skipped');
  }

  onProgress?.({
    message: '분석 결과를 입력폼 값으로 정리하는 중',
    stage: 'normalizing',
  });

  logger.start('normalizing');
  const screen = detectVisionScreenType({
    layout,
    mapSelection: mapSelectionDetection,
    ocrText,
  });
  const normalized = normalizeExtractionResult({
    fallback: {
      accountId: accounts.find((account) => account.isMain)?.id ?? accounts[0]?.id,
      playedAt: new Date(),
    },
    heroCandidates,
    mapCandidates,
    ocrParse,
    ocrText,
  });
  const result = {
    draft: normalized.draft,
    heroCandidates,
    mapCandidates,
    ocrText,
    raw: JSON.stringify(
      {
        heroCandidates,
        layout,
        mapCandidates,
        mapSelection: mapSelectionDetection,
        ocrText,
        pipeline: 'layout-detection-ocr-image-matching',
        screen,
        textEvidence: normalized.textEvidence,
      },
      null,
      2,
    ),
    screen,
    warnings: [...warnings, ...normalized.warnings],
  };

  logger.end('normalizing', {
    draft: result.draft,
    textEvidence: normalized.textEvidence,
    warnings: result.warnings,
  });
  logger.end('analysis', {
    draft: result.draft,
    heroCandidates: result.heroCandidates,
    layout,
    mapCandidates: result.mapCandidates,
    ocrText: result.ocrText,
    screen,
    warnings: result.warnings,
  });

  return result;
};
