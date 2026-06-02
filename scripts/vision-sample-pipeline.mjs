#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import {
  createDetectedVisionLayout,
  createMapCardSearchRegions,
  confidenceFromSimilarity,
  cosineSimilarity,
  detectMapSelection,
  detectVisionScreenType,
  detectRoleFromIcon,
  detectSelfBlueRow,
  getAlpha,
  getBlueHeroRect,
  getBlueRoleIconRect,
  getCandidateMargin,
  getCoverSourceRect,
  getPixel,
  getRelativeRect,
  heroMatchSize,
  isReliableHeroCandidate,
  isReliableMapCandidate,
  findVisionTextOption,
  mapSelectionLabelRegions,
  mapSelectionMatchSize,
  mapMatchSize,
  parseOcrText,
  rankHeroTemplates,
  refineMapSelectionWithTextEvidence,
  resizePixelImage,
  scoreMapImages,
  visionRegions,
} from '../src/lib/visionPipelineCore.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSamplePath = resolve(repoRoot, 'samples/vision/sample.png');
const samplePath = resolve(process.argv[2] ?? defaultSamplePath);
const expectationsPath = resolve(repoRoot, 'samples/vision/expectations.json');
const accountName = process.env.OW_SAMPLE_ACCOUNT ?? 'LUXY';
const tesseractCachePath = process.env.OW_TESSERACT_CACHE ?? join(tmpdir(), 'ow-vision-tesseract');
const ocrLanguages = ['kor', 'eng'];

const loadSampleSpecs = () => {
  if (!existsSync(expectationsPath)) {
    return {};
  }

  try {
    const config = JSON.parse(readFileSync(expectationsPath, 'utf8'));
    const samples = Array.isArray(config.samples) ? config.samples : [];

    return Object.fromEntries(
      samples
        .filter((sample) => typeof sample.file === 'string')
        .map((sample) => [sample.file, sample]),
    );
  } catch (error) {
    throw new Error(
      `Failed to read ${expectationsPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const sampleSpecsByName = loadSampleSpecs();
const sampleSpec = sampleSpecsByName[basename(samplePath)] ?? null;
const expected = sampleSpec?.assertions ?? null;
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
];

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
];

const timers = new Map();

const logStep = (message, payload) => {
  if (payload === undefined) {
    console.log(`[vision-sample] ${message}`);
    return;
  }

  console.log(`[vision-sample] ${message}`, payload);
};

const debugVision = process.env.OW_DEBUG_VISION === '1';

const start = (step, payload) => {
  timers.set(step, performance.now());
  logStep(`${step}:start`, payload);
};

const end = (step, payload) => {
  const startedAt = timers.get(step);
  timers.delete(step);
  logStep(`${step}:end`, {
    durationMs: startedAt ? Math.round(performance.now() - startedAt) : null,
    ...payload,
  });
};

const hasCoreOcrFields = (parse) =>
  Boolean(
    parse.result ||
      parse.modeId ||
      parse.playedAtLocal ||
      (typeof parse.teamScore === 'number' && typeof parse.enemyScore === 'number'),
  );

const runSips = (args) => {
  execFileSync('sips', args, {
    stdio: 'ignore',
  });
};

const cropResizeToPng = ({ image, inputPath, name, rect, resize, tempDir }) => {
  const cropPath = join(tempDir, `${name}-crop.png`);
  const outputPath = join(tempDir, `${name}.png`);

  runSips([
    '-s',
    'format',
    'png',
    '-c',
    String(rect.height),
    String(rect.width),
    '--cropOffset',
    String(rect.top),
    String(rect.left),
    inputPath,
    '--out',
    cropPath,
  ]);

  if (!resize) {
    return cropPath;
  }

  runSips([
    '-s',
    'format',
    'png',
    '-z',
    String(resize.height),
    String(resize.width),
    cropPath,
    '--out',
    outputPath,
  ]);
  return outputPath;
};

const resizeToPng = ({ inputPath, name, resize, tempDir }) => {
  const outputPath = join(tempDir, `${name}.png`);

  runSips([
    '-s',
    'format',
    'png',
    '-z',
    String(resize.height),
    String(resize.width),
    inputPath,
    '--out',
    outputPath,
  ]);
  return outputPath;
};

const readPng = (path) => {
  const data = readFileSync(path);
  const signature = data.subarray(0, 8);

  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`${path} is not a PNG file.`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('ascii');
    const chunk = data.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') {
      break;
    }

    offset += length + 12;
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const raw = Buffer.alloc(height * stride);
  let inputOffset = 0;
  let outputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;

    for (let x = 0; x < stride; x += 1) {
      const value = inflated[inputOffset + x];
      const left = x >= channels ? raw[outputOffset + x - channels] : 0;
      const up = y > 0 ? raw[outputOffset + x - stride] : 0;
      const upLeft = y > 0 && x >= channels ? raw[outputOffset + x - stride - channels] : 0;
      let unfiltered = value;

      if (filter === 1) {
        unfiltered = value + left;
      } else if (filter === 2) {
        unfiltered = value + up;
      } else if (filter === 3) {
        unfiltered = value + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        unfiltered = value + paeth(left, up, upLeft);
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }

      raw[outputOffset + x] = unfiltered & 255;
    }

    inputOffset += stride;
    outputOffset += stride;
  }

  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let input = 0, output = 0; input < raw.length; input += channels, output += 4) {
    pixels[output] = raw[input];
    pixels[output + 1] = raw[input + 1];
    pixels[output + 2] = raw[input + 2];
    pixels[output + 3] = channels === 4 ? raw[input + 3] : 255;
  }

  return {
    height,
    pixels,
    width,
  };
};

const paeth = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);

  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  if (distanceUp <= distanceUpLeft) return up;
  return upLeft;
};

const loadMapOptions = () => {
  const source = readFileSync(resolve(repoRoot, 'src/data/matchOptions.ts'), 'utf8');
  const optionRegex =
    /\{\s*label:\s*'([^']+)',\s*modeId:\s*'([^']+)',\s*value:\s*'([^']+)'\s*\}/g;

  return [...source.matchAll(optionRegex)].map((match) => ({
    label: match[1],
    modeId: match[2],
    value: match[3],
  }));
};

const loadMapModes = () => new Map(loadMapOptions().map((map) => [map.value, map.modeId]));

const loadMapSelectionTemplates = ({ tempDir }) => {
  start('screen:map-selection:templates');
  const mapDir = resolve(repoRoot, 'public/assets/overwatch/maps');
  const templates = loadMapOptions()
    .filter((map) => existsSync(join(mapDir, `${map.value}.jpg`)))
    .map((map) => {
      const mapImage = readPng(
        resizeToPng({
          inputPath: join(mapDir, `${map.value}.jpg`),
          name: `map-selection-source-${map.value}`,
          resize: {
            height: 360,
            width: 640,
          },
          tempDir,
        }),
      );

      return {
        image: resizePixelImage(
          mapImage,
          getCoverSourceRect(mapImage, mapSelectionMatchSize),
          mapSelectionMatchSize,
        ),
        mapId: map.value,
        modeId: map.modeId,
      };
    });

  end('screen:map-selection:templates', {
    templateCount: templates.length,
  });

  return templates;
};

const loadHeroOptions = () => {
  const source = readFileSync(resolve(repoRoot, 'src/data/matchOptions.ts'), 'utf8');
  const optionRegex =
    /\{\s*label:\s*'([^']+)',\s*role:\s*'([^']+)',\s*value:\s*'([^']+)'\s*\}/g;

  return [...source.matchAll(optionRegex)].map((match) => ({
    label: match[1],
    role: match[2],
    value: match[3],
  }));
};

const loadHeroRoles = () => new Map(loadHeroOptions().map((hero) => [hero.value, hero.role]));

const compactVisionText = (text) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_:/\\|()[\]{}.,'"`~!@#$%^&*+=?<>·•]+/g, '');

const findOptionInText = (compactText, options) => {
  const matches = options
    .flatMap((option) =>
      [option.label, option.value]
        .map((alias) => ({
          option,
          position: compactText.indexOf(compactVisionText(alias)),
        }))
        .filter((match) => match.position >= 0),
    )
    .sort((left, right) => left.position - right.position);

  return matches[0]?.option ?? null;
};

const extractTextEvidence = (text) => {
  const compact = compactVisionText(text);
  const resultCompact = compact.replace(/(?:승리|패배|무승부)시/g, '');
  const map = findOptionInText(compact, loadMapOptions());
  const hero = findOptionInText(compact, loadHeroOptions());
  const resultOptions = [
    { label: '승리', value: 'win' },
    { label: '패배', value: 'loss' },
    { label: '무승부', value: 'draw' },
  ];
  const result =
    resultOptions.find(
      (option) =>
        resultCompact.includes(compactVisionText(option.label)) ||
        resultCompact.includes(compactVisionText(option.value)),
    ) ??
    (['바저', '바제', '패저', '패버'].some((label) => resultCompact.includes(label))
      ? { value: 'loss' }
      : null);

  return {
    heroId: hero?.value ?? null,
    mapId: map?.value ?? null,
    modeId: map?.modeId ?? null,
    result: result?.value ?? null,
  };
};

const matchMap = ({ sampleImage, tempDir }) => {
  start('map-match');
  const mapModes = loadMapModes();
  const mapDir = resolve(repoRoot, 'public/assets/overwatch/maps');
  const mapTemplates = [...mapModes.keys()]
    .filter((mapId) => existsSync(join(mapDir, `${mapId}.jpg`)))
    .map((mapId) => {
      const resizedPath = resizeToPng({
        inputPath: join(mapDir, `${mapId}.jpg`),
        name: `map-${mapId}`,
        resize: mapMatchSize,
        tempDir,
      });
      const mapImage = readPng(resizedPath);

      return {
        image: mapImage,
        mapId,
        modeId: mapModes.get(mapId),
      };
    });
  const searchRegions = createMapCardSearchRegions();
  let bestMatch = null;

  for (const searchRegion of searchRegions) {
    const mapRect = getRelativeRect(sampleImage, searchRegion);
    const sampleMap = resizePixelImage(sampleImage, mapRect, mapMatchSize);
    const candidates = mapTemplates
      .map((map) => ({
        confidence: scoreMapImages(sampleMap, map.image),
        mapId: map.mapId,
        modeId: map.modeId,
      }))
      .sort((left, right) => right.confidence - left.confidence);
    const margin = getCandidateMargin(candidates);
    const offsetPenalty =
      Math.hypot(
        searchRegion.left - visionRegions.mapCard.left,
        searchRegion.top - visionRegions.mapCard.top,
      ) * 0.35;
    const score = (candidates[0]?.confidence ?? 0) + margin * 0.4 - offsetPenalty;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        candidates,
        mapCardRegion: searchRegion,
        score,
      };
    }
  }

  const candidates = bestMatch?.candidates.slice(0, 5) ?? [];
  const mapCardRegion = bestMatch?.mapCardRegion ?? visionRegions.mapCard;

  end('map-match', {
    crop: getRelativeRect(sampleImage, mapCardRegion),
    relativeCrop: mapCardRegion,
    searchCandidates: searchRegions.length,
    top: candidates,
  });
  return {
    candidates,
    mapCardRegion,
    searchCandidates: searchRegions.length,
  };
};

const getMapTextAliases = (mapId) => {
  if (mapId === 'runasapi') {
    return ['나사피', '루나 사피'];
  }

  if (mapId === 'oasis') {
    return ['오마시스', '오이시스'];
  }

  if (mapId === 'kings-row') {
    return ['왕의 실', '왕의길', '왕의실'];
  }

  if (mapId === 'paraiso') {
    return ['파라이소', '파라이스'];
  }

  return undefined;
};

const getMapTextOptions = () =>
  loadMapOptions().map((map) => ({
    aliases: getMapTextAliases(map.value),
    label: map.label,
    value: map.value,
  }));

const runMapSelectionLabelOcr = async ({ sampleImage, tempDir }) => {
  start('screen:map-selection:label-ocr');
  const mapModes = loadMapModes();

  try {
    const { OEM, PSM, createWorker } = await import('tesseract.js');
    mkdirSync(tesseractCachePath, {
      recursive: true,
    });
    const worker = await createWorker(ocrLanguages, OEM.LSTM_ONLY, {
      cacheMethod: 'write',
      cachePath: tesseractCachePath,
      errorHandler: (error) => {
        logStep('screen:map-selection:label-ocr:worker-error', {
          error,
        });
      },
    });

    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });

    const textOptions = getMapTextOptions();
    const evidence = [];

    for (const labelRegion of mapSelectionLabelRegions) {
      const rect = getRelativeRect(sampleImage, labelRegion.region);
      const cropPath = cropResizeToPng({
        image: sampleImage,
        inputPath: samplePath,
        name: `sample-map-selection-label-${labelRegion.slot}`,
        rect,
        resize: {
          height: rect.height * 4,
          width: rect.width * 4,
        },
        tempDir,
      });
      const result = await worker.recognize(cropPath);
      const rawText = result.data.text.trim();
      const option = findVisionTextOption(rawText, textOptions);

      evidence.push({
        confidence: option ? Math.max(0.9, result.data.confidence / 100) : result.data.confidence / 100,
        mapId: option?.value,
        modeId: option ? mapModes.get(option.value) : undefined,
        rawText,
        slot: labelRegion.slot,
      });
    }

    await worker.terminate();
    end('screen:map-selection:label-ocr', {
      evidence,
    });

    return evidence;
  } catch (error) {
    end('screen:map-selection:label-ocr', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
};

const findSelfBlueRow = (sampleImage, layout) => {
  start('self-row-detect');
  const rows = detectSelfBlueRow(sampleImage, layout);

  end('self-row-detect', {
    layout: layout.diagnostics.rowDetection,
    rows,
    selected: rows[0],
  });
  return rows[0].row;
};

const loadHeroTemplates = ({ tempDir }) => {
  start('hero-match', {
    stage: 'load-templates',
  });
  const heroRoles = loadHeroRoles();
  const heroDir = resolve(repoRoot, 'public/assets/overwatch/heroes');
  const heroFiles = execFileSync('find', [heroDir, '-maxdepth', '1', '-type', 'f', '-name', '*.png'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
  const templates = heroFiles.map((heroPath) => {
    const heroId = basename(heroPath, extname(heroPath));
    const resizedPath = resizeToPng({
      inputPath: heroPath,
      name: `hero-${heroId}`,
      resize: heroMatchSize,
      tempDir,
    });

    return {
      heroId,
      image: readPng(resizedPath),
      role: heroRoles.get(heroId) ?? null,
    };
  });

  end('hero-match', {
    heroCount: templates.length,
    stage: 'load-templates',
  });
  return templates;
};

const matchHero = ({ heroTemplates, layout, sampleImage, selfRow, tempDir }) => {
  start('hero-match:self-row', {
    selfRow,
  });
  const roleRect = getBlueRoleIconRect(sampleImage, selfRow, layout);
  const roleCropPath = cropResizeToPng({
    image: sampleImage,
    inputPath: samplePath,
    name: 'sample-role',
    rect: roleRect,
    resize: {
      height: 34,
      width: 34,
    },
    tempDir,
  });
  const detectedRole = detectRoleFromIcon(readPng(roleCropPath));
  const heroRect = getBlueHeroRect(sampleImage, selfRow, layout);
  const sampleHero = resizePixelImage(sampleImage, heroRect, heroMatchSize, {
    background: [20, 34, 53],
  });
  const candidates = rankHeroTemplates(sampleHero, heroTemplates, detectedRole).slice(0, 5);

  end('hero-match:self-row', {
    crop: heroRect,
    detectedRole,
    roleCrop: roleRect,
    top: candidates,
  });
  return candidates;
};

const matchFeaturedHero = ({ heroTemplates, sampleImage }) => {
  start('hero-match:featured');
  const candidates = featuredHeroRegions
    .map((featured) => {
      const rect = getRelativeRect(sampleImage, featured.region);
      const sampleHero = resizePixelImage(sampleImage, rect, heroMatchSize, {
        background: [20, 34, 53],
      });
      const top = rankHeroTemplates(sampleHero, heroTemplates).slice(0, 5);

      return {
        confidence: top[0]?.confidence ?? 0,
        heroId: top[0]?.heroId ?? null,
        margin: getCandidateMargin(top),
        name: featured.name,
        rect,
        reliable: isReliableHeroCandidate(top),
        top,
      };
    })
    .sort((left, right) => right.confidence - left.confidence);

  end('hero-match:featured', {
    candidates,
  });
  return candidates;
};

const runOcr = async ({ layout, sampleImage, tempDir }) => {
  start('result-ocr');
  const regions = [
    {
      name: 'result-panel',
      region: layout.regions.resultPanel,
    },
    ...supplementalOcrRegions,
  ];

  try {
    const { OEM, PSM, createWorker } = await import('tesseract.js');
    mkdirSync(tesseractCachePath, {
      recursive: true,
    });
    const worker = await createWorker(ocrLanguages, OEM.LSTM_ONLY, {
      cacheMethod: 'write',
      cachePath: tesseractCachePath,
      errorHandler: (error) => {
        logStep('result-ocr:worker-error', {
          error,
        });
      },
      logger: (progress) => {
        logStep('result-ocr:progress', {
          progress:
            typeof progress.progress === 'number'
              ? Math.round(progress.progress * 100)
              : null,
          status: progress.status,
        });
      },
    });

    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });

    const recognized = [];

    for (const [index, region] of regions.entries()) {
      const rect = getRelativeRect(sampleImage, region.region);
      const cropPath = cropResizeToPng({
        image: sampleImage,
        inputPath: samplePath,
        name: `sample-${region.name}`,
        rect,
        resize: {
          height: rect.height * 2,
          width: rect.width * 2,
        },
        tempDir,
      });
      const result = await worker.recognize(cropPath);
      const text = result.data.text.trim();

      recognized.push({
        confidence: result.data.confidence,
        name: region.name,
        rect,
        text,
      });

      if (index >= 1 && hasCoreOcrFields(parseOcrText(recognized[0]?.text ?? ''))) {
        break;
      }
    }

    await worker.terminate();
    const text = recognized
      .filter((item) => item.text)
      .map((item) => `[${item.name}]\n${item.text}`)
      .join('\n\n');
    const parsed = parseOcrText(text);
    const score =
      typeof parsed.teamScore === 'number' && typeof parsed.enemyScore === 'number'
        ? {
            enemyScore: parsed.enemyScore,
            teamScore: parsed.teamScore,
          }
        : null;

    end('result-ocr', {
      recognized,
      parsed,
      score,
      text,
    });
    return {
      parsed,
      score,
      text,
    };
  } catch (error) {
    end('result-ocr', {
      regions,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      parsed: {},
      score: null,
      text: '',
    };
  }
};

const bulkRowConfigs = {
  competitive_progress: {
    heroRole: 'damage',
    heroSlots: [
      { height: 0.048, left: 0.431, top: 0.006, width: 0.027 },
      { height: 0.048, left: 0.463, top: 0.006, width: 0.027 },
      { height: 0.048, left: 0.495, top: 0.006, width: 0.027 },
    ],
    mapImageRegion: { height: 0.063, left: 0.378, top: 0, width: 0.145 },
    mapRegion: { height: 0.046, left: 0.315, top: 0.012, width: 0.12 },
    playlist: 'competitive',
    rowCount: 8,
    rowHeight: 0.063,
    rowPitch: 0.0685,
    rowTop: 0.357,
    scoreRegion: { height: 0.042, left: 0.846, top: 0.018, width: 0.04 },
    screenType: 'competitive_progress',
  },
  match_history: {
    mapOcrMode: 'single_line',
    mapImageRegion: { height: 0.063, left: 0.38, top: 0, width: 0.145 },
    mapRegion: { height: 0.056, left: 0.255, top: 0.006, width: 0.16 },
    playlistColorRegion: { height: 0.063, left: 0.224, top: 0, width: 0.006 },
    playlistRegion: { height: 0.06, left: 0.57, top: 0.005, width: 0.13 },
    rowCount: 7,
    rowHeight: 0.063,
    rowPitch: 0.068,
    rowTop: 0.343,
    scoreRegion: { height: 0.042, left: 0.914, top: 0.017, width: 0.033 },
    screenType: 'match_history',
  },
};

const getRelativeRowRegion = (config, rowIndex, region) => ({
  height: region.height,
  left: region.left,
  top: config.rowTop + rowIndex * config.rowPitch + region.top,
  width: region.width,
});

const parseBulkScore = (text) => {
  const compact = text.replace(/\s+/g, '').replace(/[oO]/g, '0');
  const match = compact.match(/(\d{1,2})\s*[-–—:]\s*(\d{1,2})/) ?? compact.match(/(\d)(\d)/);

  if (!match) {
    return null;
  }

  return {
    enemy: Number(match[2]),
    team: Number(match[1]),
  };
};

const getResultFromScore = (score) => {
  if (!score) return null;
  if (score.team > score.enemy) return 'win';
  if (score.team < score.enemy) return 'loss';
  return 'draw';
};

const getPlaylistFromText = (text, fallback) => {
  const compact = compactVisionText(text);

  if (compact.includes(compactVisionText('일반전')) || compact.includes(compactVisionText('빠른 대전'))) {
    return 'quick_play';
  }

  if (compact.includes(compactVisionText('경쟁전')) || compact.includes(compactVisionText('역할 고정'))) {
    return 'competitive';
  }

  return fallback;
};

const getPlaylistFromColor = ({ config, rowIndex, sampleImage }) => {
  if (!config.playlistColorRegion) {
    return null;
  }

  const rect = getRelativeRect(
    sampleImage,
    getRelativeRowRegion(config, rowIndex, config.playlistColorRegion),
  );
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let y = rect.top; y < rect.top + rect.height; y += 1) {
    for (let x = rect.left; x < rect.left + rect.width; x += 1) {
      const pixel = getPixel(sampleImage, x, y);

      red += pixel[0];
      green += pixel[1];
      blue += pixel[2];
      count += 1;
    }
  }

  const averageRed = red / Math.max(1, count);
  const averageGreen = green / Math.max(1, count);
  const averageBlue = blue / Math.max(1, count);

  if (averageRed > averageBlue * 1.15 && averageRed > averageGreen * 1.15) {
    return 'competitive';
  }

  if (averageBlue > averageRed * 1.15 && averageBlue > averageGreen * 1.15) {
    return 'quick_play';
  }

  return null;
};

const recognizeBulkRegion = async ({ name, parameters, region, sampleImage, tempDir, worker }) => {
  if (parameters) {
    await worker.setParameters(parameters);
  }

  const rect = getRelativeRect(sampleImage, region);
  const cropPath = cropResizeToPng({
    image: sampleImage,
    inputPath: samplePath,
    name,
    rect,
    resize: {
      height: rect.height * 4,
      width: rect.width * 4,
    },
    tempDir,
  });
  const result = await worker.recognize(cropPath);

  return {
    confidence: result.data.confidence,
    rect,
    text: result.data.text.trim(),
  };
};

const normalizeScoreVector = (vector) => {
  const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length;
  const variance = vector.reduce((sum, value) => sum + (value - mean) ** 2, 0) / vector.length;
  const deviation = Math.sqrt(variance) || 1;

  return vector.map((value) => (value - mean) / deviation);
};

const scoreCircularHeroIcon = (sampleHero, templateHero) => {
  const sampleLuma = [];
  const templateLuma = [];
  const sampleColor = [];
  const templateColor = [];
  const centerX = (heroMatchSize.width - 1) / 2;
  const centerY = (heroMatchSize.height - 1) / 2;
  const radius = Math.min(heroMatchSize.width, heroMatchSize.height) * 0.43;

  for (let y = 0; y < heroMatchSize.height; y += 1) {
    for (let x = 0; x < heroMatchSize.width; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);

      if (distance > radius || getAlpha(templateHero, x, y) < 0.12) {
        continue;
      }

      const [sampleRed, sampleGreen, sampleBlue] = getPixel(sampleHero, x, y);
      const [templateRed, templateGreen, templateBlue] = getPixel(templateHero, x, y);
      const samplePixelLuma = (sampleRed * 0.299 + sampleGreen * 0.587 + sampleBlue * 0.114) / 255;
      const templatePixelLuma =
        (templateRed * 0.299 + templateGreen * 0.587 + templateBlue * 0.114) / 255;

      sampleLuma.push(samplePixelLuma);
      templateLuma.push(templatePixelLuma);
      sampleColor.push(
        sampleRed / 255 - samplePixelLuma,
        sampleGreen / 255 - samplePixelLuma,
        sampleBlue / 255 - samplePixelLuma,
      );
      templateColor.push(
        templateRed / 255 - templatePixelLuma,
        templateGreen / 255 - templatePixelLuma,
        templateBlue / 255 - templatePixelLuma,
      );
    }
  }

  return (
    confidenceFromSimilarity(
      cosineSimilarity(normalizeScoreVector(sampleLuma), normalizeScoreVector(templateLuma)),
    ) *
      0.56 +
    confidenceFromSimilarity(
      cosineSimilarity(normalizeScoreVector(sampleColor), normalizeScoreVector(templateColor)),
    ) *
      0.44
  );
};

const rankBulkHeroTemplates = (sampleHero, heroTemplates, role) =>
  heroTemplates
    .filter((template) => !role || template.role === role)
    .map((template) => ({
      confidence: scoreCircularHeroIcon(sampleHero, template.image),
      heroId: template.heroId,
      role: template.role,
    }))
    .sort((left, right) => right.confidence - left.confidence);

const rankCombinedBulkHeroTemplates = (sampleHero, heroTemplates, role) => {
  const layoutScores = rankHeroTemplates(sampleHero, heroTemplates, role);
  const circularScores = rankBulkHeroTemplates(sampleHero, heroTemplates, role);
  const circularScoresByHero = new Map(
    circularScores.map((candidate) => [candidate.heroId, candidate]),
  );

  return layoutScores
    .map((layoutCandidate) => {
      const circularCandidate = circularScoresByHero.get(layoutCandidate.heroId);
      const circularConfidence = circularCandidate?.confidence ?? 0;

      return {
        confidence: layoutCandidate.confidence * 0.62 + circularConfidence * 0.38,
        circularConfidence,
        heroId: layoutCandidate.heroId,
        layoutConfidence: layoutCandidate.confidence,
        role: layoutCandidate.role,
      };
    })
    .sort((left, right) => right.confidence - left.confidence);
};

const isReliableBulkHeroCandidate = (candidates) =>
  Boolean(
    candidates[0] &&
      candidates[0].confidence >= 0.73 &&
      getCandidateMargin(candidates) >= 0.012,
  );

const matchBulkHeroSlots = ({ config, heroTemplates, rowIndex, sampleImage }) => {
  if (!config.heroSlots) {
    return [];
  }

  const slots = config.heroSlots.map((slot) => {
    const rect = getRelativeRect(sampleImage, getRelativeRowRegion(config, rowIndex, slot));
    const sampleHero = resizePixelImage(sampleImage, rect, heroMatchSize, {
      background: [20, 34, 53],
    });
    const candidates = rankCombinedBulkHeroTemplates(
      sampleHero,
      heroTemplates,
      config.heroRole,
    ).slice(0, 5);
    const best = candidates[0];

    return {
      candidates: debugVision ? candidates : undefined,
      confidence: best?.confidence ?? 0,
      heroId: best?.heroId ?? null,
      margin: getCandidateMargin(candidates),
      rect,
      reliable: isReliableBulkHeroCandidate(candidates),
    };
  });

  if (debugVision) {
    logStep(
      'bulk-match-extract:hero-slots',
      JSON.stringify(
        {
          row: rowIndex + 1,
          slots,
        },
        null,
        2,
      ),
    );
  }

  return slots
    .filter((candidate) => candidate.heroId && candidate.reliable)
    .map((candidate) => candidate.heroId);
};

const bulkMapMatchSize = {
  height: 64,
  width: 144,
};

const loadBulkMapTemplates = ({ tempDir }) => {
  const mapDir = resolve(repoRoot, 'public/assets/overwatch/maps');

  return loadMapOptions()
    .filter((map) => existsSync(join(mapDir, `${map.value}.jpg`)))
    .map((map) => {
      const mapImage = readPng(
        resizeToPng({
          inputPath: join(mapDir, `${map.value}.jpg`),
          name: `bulk-map-source-${map.value}`,
          resize: {
            height: 360,
            width: 640,
          },
          tempDir,
        }),
      );

      return {
        image: resizePixelImage(
          mapImage,
          getCoverSourceRect(mapImage, bulkMapMatchSize),
          bulkMapMatchSize,
        ),
        mapId: map.value,
        modeId: map.modeId,
      };
    });
};

const matchBulkMapThumbnail = ({ config, mapTemplates, rowIndex, sampleImage }) => {
  if (!config.mapImageRegion) {
    return null;
  }

  const rect = getRelativeRect(
    sampleImage,
    getRelativeRowRegion(config, rowIndex, config.mapImageRegion),
  );
  const sampleMap = resizePixelImage(sampleImage, rect, bulkMapMatchSize);
  const candidates = mapTemplates
    .map((map) => ({
      confidence: scoreMapImages(sampleMap, map.image),
      mapId: map.mapId,
      modeId: map.modeId,
    }))
    .sort((left, right) => right.confidence - left.confidence);

  if (
    !candidates[0] ||
    candidates[0].confidence < 0.82 ||
    getCandidateMargin(candidates) < 0.012
  ) {
    return null;
  }

  return candidates[0];
};

const getBulkAssertion = (sampleSpec) => {
  if (!sampleSpec?.expected?.matches) {
    return null;
  }

  const requiredMatchFields = (sampleSpec.requiredFields ?? [])
    .filter((field) => field.startsWith('matches[].'))
    .map((field) => field.replace('matches[].', ''));
  const matches =
    requiredMatchFields.length > 0
      ? sampleSpec.expected.matches.map((match) =>
          projectObjectFields(match, ['visibleOrder', ...requiredMatchFields]),
        )
      : sampleSpec.expected.matches;

  return {
    matches,
    screenType: sampleSpec.screenType,
  };
};

const getObjectPathValue = (source, path) =>
  path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), source);

const setObjectPathValue = (target, path, value) => {
  const keys = path.split('.');
  let cursor = target;

  for (const key of keys.slice(0, -1)) {
    cursor[key] ??= {};
    cursor = cursor[key];
  }

  cursor[keys.at(-1)] = value;
};

const projectObjectFields = (source, fields) => {
  const target = {};

  for (const field of fields) {
    const value = getObjectPathValue(source, field);

    if (value !== undefined) {
      setObjectPathValue(target, field, value);
    }
  }

  return target;
};

const runBulkMatchExtraction = async ({ sampleImage, sampleSpec, tempDir }) => {
  const config = bulkRowConfigs[sampleSpec?.screenType];

  if (!config) {
    return null;
  }

  start('bulk-match-extract', {
    rowCount: config.rowCount,
    screenType: config.screenType,
  });

  const { OEM, PSM, createWorker } = await import('tesseract.js');
  mkdirSync(tesseractCachePath, {
    recursive: true,
  });
  const worker = await createWorker(ocrLanguages, OEM.LSTM_ONLY, {
    cacheMethod: 'write',
    cachePath: tesseractCachePath,
    errorHandler: (error) => {
      logStep('bulk-match-extract:worker-error', {
        error,
      });
    },
  });

  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  });

  const mapOptionsForText = getMapTextOptions();
  const mapModes = loadMapModes();
  const mapTemplates = config.mapImageRegion ? loadBulkMapTemplates({ tempDir }) : [];
  const heroTemplates = config.heroSlots ? loadHeroTemplates({ tempDir }) : [];
  const textOcrParameters = {
    preserve_interword_spaces: '1',
    tessedit_char_whitelist: '',
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  };
  const singleLineTextOcrParameters = {
    preserve_interword_spaces: '1',
    tessedit_char_whitelist: '',
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  };
  const scoreOcrParameters = {
    preserve_interword_spaces: '0',
    tessedit_char_whitelist: '0123456789-–—:',
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  };
  const rows = [];

  try {
    for (let index = 0; index < config.rowCount; index += 1) {
      const mapEvidence = await recognizeBulkRegion({
        name: `bulk-${config.screenType}-map-${index + 1}`,
        parameters:
          config.mapOcrMode === 'single_line' ? singleLineTextOcrParameters : textOcrParameters,
        region: getRelativeRowRegion(config, index, config.mapRegion),
        sampleImage,
        tempDir,
        worker,
      });
      const scoreEvidence = await recognizeBulkRegion({
        name: `bulk-${config.screenType}-score-${index + 1}`,
        parameters: scoreOcrParameters,
        region: getRelativeRowRegion(config, index, config.scoreRegion),
        sampleImage,
        tempDir,
        worker,
      });
      const playlistEvidence = config.playlistRegion
        ? await recognizeBulkRegion({
            name: `bulk-${config.screenType}-playlist-${index + 1}`,
            parameters: textOcrParameters,
            region: getRelativeRowRegion(config, index, config.playlistRegion),
            sampleImage,
            tempDir,
            worker,
          })
        : null;
      const mapFromText = findVisionTextOption(mapEvidence.text, mapOptionsForText);
      const mapFromThumbnail = matchBulkMapThumbnail({
        config,
        mapTemplates,
        rowIndex: index,
        sampleImage,
      });
      const map = mapFromText
        ? {
            modeId: mapModes.get(mapFromText.value),
            value: mapFromText.value,
          }
        : mapFromThumbnail
          ? {
              modeId: mapFromThumbnail.modeId,
              value: mapFromThumbnail.mapId,
            }
          : null;
      const score = parseBulkScore(scoreEvidence.text);
      const playlistFromColor = getPlaylistFromColor({
        config,
        rowIndex: index,
        sampleImage,
      });
      const heroIds = matchBulkHeroSlots({
        config,
        heroTemplates,
        rowIndex: index,
        sampleImage,
      });

      if (debugVision) {
        logStep(
          'bulk-match-extract:row-evidence',
          JSON.stringify(
            {
              mapFromThumbnail,
              mapFromText,
              row: index + 1,
              score,
              texts: {
                map: mapEvidence.text,
                playlist: playlistEvidence?.text ?? null,
                score: scoreEvidence.text,
              },
              playlistFromColor,
            },
            null,
            2,
          ),
        );
      }

      rows.push({
        evidence: {
          map: mapEvidence,
          mapThumbnail: mapFromThumbnail,
          playlist: playlistEvidence,
          score: scoreEvidence,
        },
        match: {
          visibleOrder: index + 1,
          mapId: map?.value ?? null,
          modeId: map?.modeId ?? null,
          playlist: getPlaylistFromText(
            playlistEvidence?.text ?? '',
            config.playlist ?? playlistFromColor,
          ),
          ...(config.heroSlots ? { heroIds } : {}),
          result: getResultFromScore(score),
          score,
        },
      });
    }
  } finally {
    await worker.terminate();
  }

  const actual = {
    accountName,
    matches: rows.map((row) => row.match),
    screenType: config.screenType,
  };

  end('bulk-match-extract', {
    actual,
    rows,
  });

  return {
    actual,
    rows,
  };
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isEqualAssertionValue = (received, wanted) => {
  if (Array.isArray(received) || Array.isArray(wanted)) {
    return (
      Array.isArray(received) &&
      Array.isArray(wanted) &&
      received.length === wanted.length &&
      received.every((item, index) => isEqualAssertionValue(item, wanted[index]))
    );
  }

  if (isPlainObject(received) || isPlainObject(wanted)) {
    if (!isPlainObject(received) || !isPlainObject(wanted)) {
      return false;
    }

    const wantedKeys = Object.keys(wanted).sort();

    return wantedKeys.every((key) => isEqualAssertionValue(received[key], wanted[key]));
  }

  return received === wanted;
};

const assertResult = (actual, expectedOverride = expected) => {
  if (!expectedOverride) {
    return null;
  }

  const checks = Object.entries(expectedOverride).map(([field, wanted]) => {
    const received = actual[field];

    return {
      field,
      ok: isEqualAssertionValue(received, wanted),
      received,
      wanted,
    };
  });

  return {
    checks,
    ok: checks.every((check) => check.ok),
  };
};

const main = async () => {
  if (!existsSync(samplePath)) {
    throw new Error(`Sample image not found: ${samplePath}`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ow-vision-sample-'));

  try {
    start('pipeline', {
      expected,
      sampleSpec,
      samplePath,
      tempDir,
    });
    const sampleImage = readPng(samplePath);
    logStep('image:loaded', {
      height: sampleImage.height,
      width: sampleImage.width,
    });

    const bulkResult = await runBulkMatchExtraction({
      sampleImage,
      sampleSpec,
      tempDir,
    });

    if (bulkResult) {
      const bulkExpected = getBulkAssertion(sampleSpec);
      const assertion = assertResult(bulkResult.actual, bulkExpected);

      end('pipeline', {
        actual: bulkResult.actual,
        assertion,
        rows: bulkResult.rows,
      });

      console.log(
        JSON.stringify(
          {
            actual: bulkResult.actual,
            assertion,
            expected: bulkExpected,
            sampleSpec,
          },
          null,
          2,
        ),
      );
      process.exitCode = assertion ? (assertion.ok ? 0 : 1) : 0;
      return;
    }

    const mapSelectionTemplates = loadMapSelectionTemplates({ tempDir });
    let mapSelectionDetection = detectMapSelection(sampleImage, mapSelectionTemplates);
    const uniqueVisualMapCount = new Set(
      mapSelectionDetection.candidates.map((candidate) => candidate.mapId),
    ).size;

    if (
      (mapSelectionDetection.confidence >= 0.6 && uniqueVisualMapCount >= 3) ||
      sampleSpec?.screenType === 'map_selection'
    ) {
      const textEvidence = await runMapSelectionLabelOcr({
        sampleImage,
        tempDir,
      });

      mapSelectionDetection = refineMapSelectionWithTextEvidence(
        mapSelectionDetection,
        textEvidence,
      );
    }

    const earlyScreen = detectVisionScreenType({
      mapSelection: mapSelectionDetection,
    });

    logStep('screen:early', {
      mapSelection: mapSelectionDetection,
      screen: earlyScreen,
    });

    if (earlyScreen.screenType === 'map_selection' && earlyScreen.confidence >= 0.72) {
      const actual = {
        accountName,
        mapCandidateIds: mapSelectionDetection.candidates.map((candidate) => candidate.mapId),
        screenType: earlyScreen.screenType,
      };
      const assertion = assertResult(actual);

      end('pipeline', {
        actual,
        assertion,
        confidence: {
          mapSelection: mapSelectionDetection.confidence,
        },
        mapSelectionDetection,
        screen: earlyScreen,
      });

      console.log(JSON.stringify({ actual, assertion, expected, sampleSpec }, null, 2));
      process.exitCode = assertion ? (assertion.ok ? 0 : 1) : 0;
      return;
    }

    const mapMatchResult = matchMap({ sampleImage, tempDir });
    const layout = createDetectedVisionLayout(sampleImage, {
      mapCard: isReliableMapCandidate(mapMatchResult.candidates)
        ? mapMatchResult.mapCardRegion
        : undefined,
    });

    logStep('layout:resolved', layout);
    const ocrResult = await runOcr({ layout, sampleImage, tempDir });
    const textEvidence = extractTextEvidence(ocrResult.text);
    const canUseScoreboard =
      layout.diagnostics.rowDetection.source === 'detected' &&
      layout.diagnostics.rowDetection.confidence >= 0.22 &&
      Math.abs(layout.diagnostics.rowDetection.deltaTop) < 0.025;
    const selfRow = canUseScoreboard ? findSelfBlueRow(sampleImage, layout) : null;
    const heroTemplates = loadHeroTemplates({ tempDir });
    const heroCandidates = selfRow
      ? matchHero({ heroTemplates, layout, sampleImage, selfRow, tempDir })
      : [];
    const featuredHeroCandidates = matchFeaturedHero({ heroTemplates, sampleImage });
    const mapCandidates = mapMatchResult.candidates;
    const reliableMap = isReliableMapCandidate(mapCandidates);
    const reliableHero = isReliableHeroCandidate(heroCandidates);
    const reliableFeaturedHero = featuredHeroCandidates.find((candidate) => candidate.reliable);
    const score = ocrResult.score;
    const screen = detectVisionScreenType({
      layout,
      mapSelection: mapSelectionDetection,
      ocrText: ocrResult.text,
    });
    const actual = {
      accountName,
      enemyScore: score?.enemyScore ?? null,
      mapId: textEvidence.mapId ?? (reliableMap ? (mapCandidates[0]?.mapId ?? null) : null),
      modeId:
        textEvidence.modeId ??
        (reliableMap ? (mapCandidates[0]?.modeId ?? null) : (ocrResult.parsed.modeId ?? null)),
      myHero:
        (reliableHero ? (heroCandidates[0]?.heroId ?? null) : null) ??
        textEvidence.heroId ??
        reliableFeaturedHero?.heroId ??
        null,
      playedAtLocal: ocrResult.parsed.playedAtLocal ?? null,
      result: ocrResult.parsed.result ?? textEvidence.result ?? null,
      screenType: screen.screenType,
      selfRow,
      teamScore: score?.teamScore ?? null,
    };
    const assertion = assertResult(actual);

    end('pipeline', {
      actual,
      assertion,
      confidence: {
        heroMargin: getCandidateMargin(heroCandidates),
        mapMargin: getCandidateMargin(mapCandidates),
        reliableFeaturedHero: Boolean(reliableFeaturedHero),
        reliableHero,
        reliableMap,
      },
      featuredHeroCandidates,
      heroCandidates,
      mapCandidates,
      mapSelectionDetection,
      ocrText: ocrResult.text,
      screen,
      textEvidence,
    });

    console.log(JSON.stringify({ actual, assertion, expected, sampleSpec }, null, 2));
    process.exitCode = assertion ? (assertion.ok ? 0 : 1) : 0;
  } finally {
    if (process.env.OW_KEEP_VISION_TMP !== '1') {
      rmSync(tempDir, {
        force: true,
        recursive: true,
      });
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
