export interface PixelImage {
  height: number;
  pixels: Uint8ClampedArray;
  width: number;
}

export interface PixelRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface RelativeRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface ImageDimensions {
  height: number;
  width: number;
}

export interface PixelAverage {
  blue: number;
  green: number;
  luma: number;
  red: number;
}

export interface VisionLayout {
  confidence: number;
  diagnostics: {
    mapCard?: RelativeRect;
    rowDetection: ScoreboardRowDetection;
  };
  regions: VisionRegionSet;
  rowPitch: number;
}

export interface ScoreboardRowDetection {
  confidence: number;
  deltaTop: number;
  rows: {
    average: PixelAverage;
    row: number;
    score: number;
  }[];
  selectedRow: number;
  source: 'detected' | 'fallback';
}

export interface FeatureVectorOptions {
  background?: [number, number, number];
  includeColor?: boolean;
  normalize?: boolean;
}

export interface OcrParseResult {
  enemyScore?: number;
  modeId?: 'clash' | 'control' | 'escort' | 'flashpoint' | 'hybrid' | 'push';
  playedAtLocal?: string;
  result?: 'draw' | 'loss' | 'win';
  teamScore?: number;
}

export interface HeroTemplate<THeroId extends string = string> {
  heroId: THeroId;
  image: PixelImage;
  role?: HeroRole | null;
}

export interface HeroScore<THeroId extends string = string> {
  centralColor: number;
  confidence: number;
  heroId: THeroId;
  histogram: number;
  layout: number;
  perceptualHash: number;
  role?: HeroRole | null;
}

export interface RankedCandidate {
  confidence: number;
}

export type HeroRole = 'damage' | 'support' | 'tank';

export const visionRegions = {
  blueHero: {
    height: 0.0585,
    left: 0.152,
    top: 0.303,
    width: 0.0325,
  },
  blueRoleIcon: {
    height: 0.0315,
    left: 0.1355,
    top: 0.315,
    width: 0.0177,
  },
  blueRowProbe: {
    height: 0.046,
    left: 0.326,
    top: 0.309,
    width: 0.235,
  },
  mapCard: {
    height: 0.315,
    left: 0.592,
    top: 0.273,
    width: 0.271,
  },
  resultPanel: {
    height: 0.2,
    left: 0.592,
    top: 0.595,
    width: 0.31,
  },
} satisfies Record<string, RelativeRect>;

export type VisionRegionKey = keyof typeof visionRegions;
export type VisionRegionSet = Record<VisionRegionKey, RelativeRect>;

export const blueTeamRowPitch = 0.0589;
export const heroMatchSize = {
  height: 64,
  width: 64,
} as const;
export const mapMatchSize = {
  height: 60,
  width: 96,
} as const;
export const reliableMapConfidence = 0.9;
export const reliableMapMargin = 0.025;
export const reliableHeroConfidence = 0.58;
export const reliableHeroMargin = 0.008;

const modeLabels = [
  { label: '쟁탈', value: 'control' },
  { label: '혼합', value: 'hybrid' },
  { label: '밀기', value: 'push' },
  { label: '호위', value: 'escort' },
  { label: '플래시포인트', value: 'flashpoint' },
  { label: '격돌', value: 'clash' },
] as const;

const cloneVisionRegions = (): VisionRegionSet => ({
  blueHero: { ...visionRegions.blueHero },
  blueRoleIcon: { ...visionRegions.blueRoleIcon },
  blueRowProbe: { ...visionRegions.blueRowProbe },
  mapCard: { ...visionRegions.mapCard },
  resultPanel: { ...visionRegions.resultPanel },
});

const clampRelativeRect = (rect: RelativeRect): RelativeRect => {
  const width = Math.max(0.001, Math.min(1, rect.width));
  const height = Math.max(0.001, Math.min(1, rect.height));

  return {
    height,
    left: Math.max(0, Math.min(1 - width, rect.left)),
    top: Math.max(0, Math.min(1 - height, rect.top)),
    width,
  };
};

export const pixelRectToRelativeRect = (
  dimensions: ImageDimensions,
  rect: PixelRect,
): RelativeRect =>
  clampRelativeRect({
    height: rect.height / dimensions.height,
    left: rect.left / dimensions.width,
    top: rect.top / dimensions.height,
    width: rect.width / dimensions.width,
  });

export const getRelativeRect = (dimensions: ImageDimensions, rect: RelativeRect): PixelRect => ({
  height: Math.round(dimensions.height * rect.height),
  left: Math.round(dimensions.width * rect.left),
  top: Math.round(dimensions.height * rect.top),
  width: Math.round(dimensions.width * rect.width),
});

export const offsetRelativeRect = (
  rect: RelativeRect,
  rowIndex: number,
  rowPitch = blueTeamRowPitch,
): RelativeRect => ({
  ...rect,
  top: rect.top + rowIndex * rowPitch,
});

export const getResultPanelRegionFromMapCard = (mapCard: RelativeRect): RelativeRect => {
  const scale = mapCard.height / visionRegions.mapCard.height;
  const gap =
    visionRegions.resultPanel.top - visionRegions.mapCard.top - visionRegions.mapCard.height;
  const widthDelta = visionRegions.resultPanel.width - visionRegions.mapCard.width;

  return clampRelativeRect({
    height: visionRegions.resultPanel.height * scale,
    left: mapCard.left,
    top: mapCard.top + mapCard.height + gap * scale,
    width: mapCard.width + widthDelta * scale,
  });
};

export const createMapCardSearchRegions = (base: RelativeRect = visionRegions.mapCard) => {
  const horizontalOffsets = [-0.035, -0.022, -0.011, 0, 0.011, 0.022, 0.035];
  const verticalOffsets = [-0.045, -0.028, -0.014, 0, 0.014, 0.028, 0.045];
  const scales = [0.94, 1, 1.06];
  const regions = new Map<string, RelativeRect>();

  for (const scale of scales) {
    const width = base.width * scale;
    const height = base.height * scale;

    for (const horizontalOffset of horizontalOffsets) {
      for (const verticalOffset of verticalOffsets) {
        const rect = clampRelativeRect({
          height,
          left: base.left + horizontalOffset + (base.width - width) / 2,
          top: base.top + verticalOffset + (base.height - height) / 2,
          width,
        });
        const key = [
          rect.left.toFixed(4),
          rect.top.toFixed(4),
          rect.width.toFixed(4),
          rect.height.toFixed(4),
        ].join(':');

        regions.set(key, rect);
      }
    }
  }

  return [...regions.values()];
};

export const getBlueHeroRect = (dimensions: ImageDimensions, row: number, layout?: VisionLayout) =>
  getRelativeRect(
    dimensions,
    offsetRelativeRect(
      (layout?.regions ?? visionRegions).blueHero,
      row - 1,
      layout?.rowPitch ?? blueTeamRowPitch,
    ),
  );

export const getBlueRoleIconRect = (
  dimensions: ImageDimensions,
  row: number,
  layout?: VisionLayout,
) =>
  getRelativeRect(
    dimensions,
    offsetRelativeRect(
      (layout?.regions ?? visionRegions).blueRoleIcon,
      row - 1,
      layout?.rowPitch ?? blueTeamRowPitch,
    ),
  );

export const getBlueRowProbeRect = (
  dimensions: ImageDimensions,
  row: number,
  layout?: VisionLayout,
) =>
  getRelativeRect(
    dimensions,
    offsetRelativeRect(
      (layout?.regions ?? visionRegions).blueRowProbe,
      row - 1,
      layout?.rowPitch ?? blueTeamRowPitch,
    ),
  );

export const parseOcrText = (text: string): OcrParseResult => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const compact = normalized.replace(/\s/g, '');
  const resultCompact = compact.replace(/(?:승리|패배|무승부)시/g, '');
  const result: OcrParseResult = {};

  const hasAnyResultLabel = (labels: string[]) =>
    labels.some((label) => resultCompact.includes(label));

  if (hasAnyResultLabel(['무승부'])) {
    result.result = 'draw';
  } else if (hasAnyResultLabel(['패배', '바저', '바제', '패저', '패버'])) {
    result.result = 'loss';
  } else if (hasAnyResultLabel(['승리'])) {
    result.result = 'win';
  }

  const scoreMatch =
    compact.match(/(?:최종점수|점수)[:：]?(\d{1,2})(?:VS|V5|Y5|\\5?|\/5|대|:|-)(\d{1,2})/i) ??
    compact.match(/(\d{1,2})(?:VS|V5|Y5|\\5?|\/5|대)(\d{1,2})/i);

  if (scoreMatch) {
    result.teamScore = Number(scoreMatch[1]);
    result.enemyScore = Number(scoreMatch[2]);
  }

  const dateMatch = compact.match(
    /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})[-–—](\d{1,2})[:：](\d{2})/,
  );

  if (dateMatch) {
    const [, month, day, rawYear, hour, minute] = dateMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

    result.playedAtLocal = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(
      2,
      '0',
    )}:${minute}`;
  }

  const modeMatch = modeLabels.find((mode) => compact.includes(mode.label));

  if (modeMatch) {
    result.modeId = modeMatch.value;
  }

  if (
    !result.result &&
    typeof result.teamScore === 'number' &&
    typeof result.enemyScore === 'number'
  ) {
    if (result.teamScore > result.enemyScore) result.result = 'win';
    else if (result.teamScore < result.enemyScore) result.result = 'loss';
    else result.result = 'draw';
  }

  return result;
};

export const getPixel = (
  image: PixelImage,
  x: number,
  y: number,
  background: [number, number, number] = [20, 34, 53],
) => {
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const offset = (clampedY * image.width + clampedX) * 4;
  const alpha = image.pixels[offset + 3] / 255;

  return [
    image.pixels[offset] * alpha + background[0] * (1 - alpha),
    image.pixels[offset + 1] * alpha + background[1] * (1 - alpha),
    image.pixels[offset + 2] * alpha + background[2] * (1 - alpha),
  ] as const;
};

export const getAlpha = (image: PixelImage, x: number, y: number) => {
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const offset = (clampedY * image.width + clampedX) * 4;

  return image.pixels[offset + 3] / 255;
};

const getLumaAt = (image: PixelImage, x: number, y: number) => {
  const [red, green, blue] = getPixel(image, x, y);

  return (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
};

const getGradientAt = (image: PixelImage, x: number, y: number) => {
  const left = getLumaAt(image, x - 1, y);
  const right = getLumaAt(image, x + 1, y);
  const up = getLumaAt(image, x, y - 1);
  const down = getLumaAt(image, x, y + 1);

  return Math.hypot(right - left, down - up);
};

export const averageRegion = (image: PixelImage, rect: PixelRect): PixelAverage => {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let y = rect.top; y < rect.top + rect.height; y += 1) {
    for (let x = rect.left; x < rect.left + rect.width; x += 1) {
      const [pixelRed, pixelGreen, pixelBlue] = getPixel(image, x, y);

      red += pixelRed;
      green += pixelGreen;
      blue += pixelBlue;
      count += 1;
    }
  }

  return {
    blue: blue / count,
    green: green / count,
    luma: (red * 0.299 + green * 0.587 + blue * 0.114) / count,
    red: red / count,
  };
};

const interpolatePixel = (
  image: PixelImage,
  sourceX: number,
  sourceY: number,
  background?: [number, number, number],
) => {
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const xWeight = sourceX - x0;
  const yWeight = sourceY - y0;
  const topLeft = getPixel(image, x0, y0, background);
  const topRight = getPixel(image, x1, y0, background);
  const bottomLeft = getPixel(image, x0, y1, background);
  const bottomRight = getPixel(image, x1, y1, background);

  return [0, 1, 2].map((channel) => {
    const top = topLeft[channel] * (1 - xWeight) + topRight[channel] * xWeight;
    const bottom = bottomLeft[channel] * (1 - xWeight) + bottomRight[channel] * xWeight;

    return top * (1 - yWeight) + bottom * yWeight;
  }) as [number, number, number];
};

export const resizePixelImage = (
  image: PixelImage,
  rect: PixelRect,
  size: { height: number; width: number },
  options: { background?: [number, number, number] } = {},
): PixelImage => {
  const pixels = new Uint8ClampedArray(size.width * size.height * 4);
  const sourceWidth = Math.max(1, rect.width);
  const sourceHeight = Math.max(1, rect.height);

  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const sourceX = rect.left + ((x + 0.5) / size.width) * sourceWidth - 0.5;
      const sourceY = rect.top + ((y + 0.5) / size.height) * sourceHeight - 0.5;
      const [red, green, blue] = interpolatePixel(image, sourceX, sourceY, options.background);
      const offset = (y * size.width + x) * 4;

      pixels[offset] = Math.round(red);
      pixels[offset + 1] = Math.round(green);
      pixels[offset + 2] = Math.round(blue);
      pixels[offset + 3] = 255;
    }
  }

  return {
    height: size.height,
    pixels,
    width: size.width,
  };
};

const getMedian = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

export const detectScoreboardRowLayout = (image: PixelImage): ScoreboardRowDetection => {
  const baseProbe = visionRegions.blueRowProbe;
  const baseTopPixels = image.height * baseProbe.top;
  const searchRadius = Math.round(image.height * 0.16);
  const step = Math.max(2, Math.round(image.height * 0.002));
  let best:
    | {
        deltaTop: number;
        rows: ScoreboardRowDetection['rows'];
        score: number;
        selectedRow: number;
      }
    | undefined;

  for (let deltaPixels = -searchRadius; deltaPixels <= searchRadius; deltaPixels += step) {
    const firstTop = (baseTopPixels + deltaPixels) / image.height;

    if (firstTop < 0 || firstTop + blueTeamRowPitch * 4 + baseProbe.height > 1) {
      continue;
    }

    const rows = Array.from({ length: 5 }, (_, index) => {
      const row = index + 1;
      const average = averageRegion(
        image,
        getRelativeRect(image, {
          ...baseProbe,
          top: firstTop + index * blueTeamRowPitch,
        }),
      );

      return {
        average,
        row,
        score:
          average.green + average.blue + average.luma + Math.max(0, average.blue - average.red),
      };
    });
    const rankedRows = [...rows].sort((left, right) => right.score - left.score);
    const selected = rankedRows[0];
    const second = rankedRows[1];
    const medianScore = getMedian(rows.map((row) => row.score));
    const contrast = selected.score - Math.max(second?.score ?? 0, medianScore);
    const distancePenalty = (Math.abs(deltaPixels) / Math.max(1, searchRadius)) * 25;
    const score = contrast * 1.7 + selected.score * 0.08 - distancePenalty;

    if (!best || score > best.score) {
      best = {
        deltaTop: deltaPixels / image.height,
        rows,
        score,
        selectedRow: selected.row,
      };
    }
  }

  if (!best) {
    return {
      confidence: 0,
      deltaTop: 0,
      rows: detectSelfBlueRow(image),
      selectedRow: 1,
      source: 'fallback',
    };
  }

  const rankedRows = [...best.rows].sort((left, right) => right.score - left.score);
  const confidence = Math.max(
    0,
    Math.min(1, (rankedRows[0].score - (rankedRows[1]?.score ?? 0)) / 95),
  );

  if (confidence < 0.18) {
    return {
      confidence,
      deltaTop: 0,
      rows: detectSelfBlueRow(image),
      selectedRow: rankedRows[0].row,
      source: 'fallback',
    };
  }

  return {
    confidence,
    deltaTop: best.deltaTop,
    rows: best.rows.sort((left, right) => right.score - left.score),
    selectedRow: best.selectedRow,
    source: 'detected',
  };
};

export const createDetectedVisionLayout = (
  image: PixelImage,
  options: { mapCard?: RelativeRect } = {},
): VisionLayout => {
  const regions = cloneVisionRegions();
  const rowDetection = detectScoreboardRowLayout(image);

  if (rowDetection.source === 'detected') {
    const heroDeltaTop = Math.abs(rowDetection.deltaTop) >= 0.012 ? rowDetection.deltaTop : 0;

    regions.blueHero = clampRelativeRect({
      ...regions.blueHero,
      top: regions.blueHero.top + heroDeltaTop,
    });
    regions.blueRoleIcon = clampRelativeRect({
      ...regions.blueRoleIcon,
      top: regions.blueRoleIcon.top + heroDeltaTop,
    });
    regions.blueRowProbe = clampRelativeRect({
      ...regions.blueRowProbe,
      top: regions.blueRowProbe.top + rowDetection.deltaTop,
    });
  }

  if (options.mapCard) {
    regions.mapCard = clampRelativeRect(options.mapCard);
    regions.resultPanel = getResultPanelRegionFromMapCard(regions.mapCard);
  }

  return {
    confidence: Math.max(rowDetection.confidence, options.mapCard ? 0.65 : 0),
    diagnostics: {
      mapCard: options.mapCard,
      rowDetection,
    },
    regions,
    rowPitch: blueTeamRowPitch,
  };
};

export const createFeatureVector = (image: PixelImage, options: FeatureVectorOptions = {}) => {
  const vector: number[] = [];
  const includeColor = options.includeColor !== false;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [red255, green255, blue255] = getPixel(image, x, y, options.background);
      const red = red255 / 255;
      const green = green255 / 255;
      const blue = blue255 / 255;
      const luma = red * 0.299 + green * 0.587 + blue * 0.114;

      if (includeColor) {
        vector.push(red - luma, green - luma, blue - luma, luma);
      } else {
        vector.push(luma);
      }
    }
  }

  return options.normalize ? normalizeVector(vector) : vector;
};

export const cosineSimilarity = (left: number[], right: number[]) => {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude) || 1);
};

export const confidenceFromSimilarity = (similarity: number) =>
  Math.max(0, Math.min(1, (similarity + 1) / 2));

export const getCandidateMargin = (candidates: RankedCandidate[]) =>
  candidates[0] && candidates[1]
    ? candidates[0].confidence - candidates[1].confidence
    : (candidates[0]?.confidence ?? 0);

export const isReliableMapCandidate = (candidates: RankedCandidate[]) =>
  Boolean(
    candidates[0] &&
    candidates[0].confidence >= reliableMapConfidence &&
    getCandidateMargin(candidates) >= reliableMapMargin,
  );

export const isReliableHeroCandidate = (candidates: RankedCandidate[]) =>
  Boolean(
    candidates[0] &&
    candidates[0].confidence >= reliableHeroConfidence &&
    getCandidateMargin(candidates) >= reliableHeroMargin,
  );

const normalizeVector = (vector: number[]) => {
  const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length;
  const variance = vector.reduce((sum, value) => sum + (value - mean) ** 2, 0) / vector.length;
  const deviation = Math.sqrt(variance) || 1;

  return vector.map((value) => (value - mean) / deviation);
};

const maskedCosine = (left: number[], right: number[]) => {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return -1;
  }

  return cosineSimilarity(normalizeVector(left), normalizeVector(right));
};

const heroLayoutSimilarity = (sampleHero: PixelImage, heroImage: PixelImage) => {
  const sampleLuma: number[] = [];
  const heroLuma: number[] = [];
  const sampleColor: number[] = [];
  const heroColor: number[] = [];
  const sampleEdges: number[] = [];
  const heroEdges: number[] = [];

  for (let y = 1; y < heroImage.height - 1; y += 1) {
    for (let x = 1; x < heroImage.width - 1; x += 1) {
      if (getAlpha(heroImage, x, y) < 0.12) {
        continue;
      }

      const [sampleRed, sampleGreen, sampleBlue] = getPixel(sampleHero, x, y);
      const [heroRed, heroGreen, heroBlue] = getPixel(heroImage, x, y);
      const samplePixelLuma = (sampleRed * 0.299 + sampleGreen * 0.587 + sampleBlue * 0.114) / 255;
      const heroPixelLuma = (heroRed * 0.299 + heroGreen * 0.587 + heroBlue * 0.114) / 255;

      sampleLuma.push(samplePixelLuma);
      heroLuma.push(heroPixelLuma);
      sampleColor.push(
        sampleRed / 255 - samplePixelLuma,
        sampleGreen / 255 - samplePixelLuma,
        sampleBlue / 255 - samplePixelLuma,
      );
      heroColor.push(
        heroRed / 255 - heroPixelLuma,
        heroGreen / 255 - heroPixelLuma,
        heroBlue / 255 - heroPixelLuma,
      );
      sampleEdges.push(getGradientAt(sampleHero, x, y));
      heroEdges.push(getGradientAt(heroImage, x, y));
    }
  }

  const luma = maskedCosine(sampleLuma, heroLuma);
  const color = maskedCosine(sampleColor, heroColor);
  const edges = maskedCosine(sampleEdges, heroEdges);

  return luma * 0.35 + color * 0.4 + edges * 0.25;
};

const isBlueScoreboardBackground = ([red, green, blue]: readonly number[]) =>
  red < 90 && green > 85 && blue > 115 && blue > red * 1.8;

const createColorHistogram = (
  image: PixelImage,
  options: { excludeBlueBackground?: boolean; requireAlpha?: boolean } = {},
) => {
  const binsPerChannel = 8;
  const histogram = new Array<number>(binsPerChannel ** 3).fill(0);
  let count = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (options.requireAlpha && getAlpha(image, x, y) < 0.12) {
        continue;
      }

      const pixel = getPixel(image, x, y);

      if (options.excludeBlueBackground && isBlueScoreboardBackground(pixel)) {
        continue;
      }

      const redBin = Math.min(binsPerChannel - 1, Math.floor(pixel[0] / 32));
      const greenBin = Math.min(binsPerChannel - 1, Math.floor(pixel[1] / 32));
      const blueBin = Math.min(binsPerChannel - 1, Math.floor(pixel[2] / 32));
      const index = redBin * binsPerChannel * binsPerChannel + greenBin * binsPerChannel + blueBin;

      histogram[index] += 1;
      count += 1;
    }
  }

  return count === 0 ? histogram : histogram.map((value) => value / count);
};

const heroHistogramSimilarity = (sampleHero: PixelImage, heroImage: PixelImage) =>
  cosineSimilarity(
    createColorHistogram(sampleHero, {
      excludeBlueBackground: true,
    }),
    createColorHistogram(heroImage, {
      requireAlpha: true,
    }),
  );

const getCentralColorSignature = (
  image: PixelImage,
  options: { excludeBlueBackground?: boolean; requireAlpha?: boolean } = {},
) => {
  let red = 0;
  let green = 0;
  let blue = 0;
  let saturation = 0;
  let brightMetal = 0;
  let count = 0;
  let warmDark = 0;

  const left = Math.round(image.width * 0.2);
  const right = Math.round(image.width * 0.86);
  const top = Math.round(image.height * 0.05);
  const bottom = Math.round(image.height * 0.82);

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (options.requireAlpha && getAlpha(image, x, y) < 0.12) {
        continue;
      }

      const pixel = getPixel(image, x, y);

      if (options.excludeBlueBackground && isBlueScoreboardBackground(pixel)) {
        continue;
      }

      const max = Math.max(...pixel);
      const min = Math.min(...pixel);
      const luma = pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114;
      const pixelSaturation = max - min;

      if (luma > 235 || pixelSaturation < 18) {
        continue;
      }

      red += pixel[0] / 255;
      green += pixel[1] / 255;
      blue += pixel[2] / 255;
      saturation += pixelSaturation / 255;
      if (luma > 145 && pixelSaturation < 85) brightMetal += 1;
      if (luma < 150 && pixel[0] > pixel[1] * 0.9 && pixel[1] > pixel[2] * 0.8) {
        warmDark += 1;
      }
      count += 1;
    }
  }

  if (count === 0) {
    return [0, 0, 0, 0, 0, 0];
  }

  return [
    red / count,
    green / count,
    blue / count,
    saturation / count,
    brightMetal / count,
    warmDark / count,
  ];
};

const centralColorConfidence = (sampleHero: PixelImage, heroImage: PixelImage) => {
  const sample = getCentralColorSignature(sampleHero, {
    excludeBlueBackground: true,
  });
  const hero = getCentralColorSignature(heroImage, {
    requireAlpha: true,
  });
  const distance = Math.hypot(
    sample[0] - hero[0],
    sample[1] - hero[1],
    sample[2] - hero[2],
    (sample[3] - hero[3]) * 0.6,
    (sample[4] - hero[4]) * 1.8,
    (sample[5] - hero[5]) * 1.8,
  );

  return Math.max(0, 1 - distance / 1.6);
};

const getScaledLuma = (image: PixelImage, x: number, y: number, width: number, height: number) => {
  const sourceX = Math.min(image.width - 1, Math.floor((x / width) * image.width));
  const sourceY = Math.min(image.height - 1, Math.floor((y / height) * image.height));

  return getLumaAt(image, sourceX, sourceY);
};

const createDifferenceHash = (image: PixelImage) => {
  const width = 9;
  const height = 8;
  const bits: boolean[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      bits.push(
        getScaledLuma(image, x, y, width, height) > getScaledLuma(image, x + 1, y, width, height),
      );
    }
  }

  return bits;
};

const createAverageHash = (image: PixelImage) => {
  const size = 8;
  const values: number[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      values.push(getScaledLuma(image, x, y, size, size));
    }
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  return values.map((value) => value > mean);
};

const hashConfidence = (left: boolean[], right: boolean[]) => {
  let distance = 0;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }

  return 1 - distance / left.length;
};

const perceptualHashConfidence = (sampleHero: PixelImage, heroImage: PixelImage) =>
  hashConfidence(createDifferenceHash(sampleHero), createDifferenceHash(heroImage)) * 0.55 +
  hashConfidence(createAverageHash(sampleHero), createAverageHash(heroImage)) * 0.45;

export const scoreHeroTemplate = <THeroId extends string>(
  sampleHero: PixelImage,
  template: HeroTemplate<THeroId>,
): HeroScore<THeroId> => {
  const histogram = confidenceFromSimilarity(heroHistogramSimilarity(sampleHero, template.image));
  const layout = confidenceFromSimilarity(heroLayoutSimilarity(sampleHero, template.image));
  const centralColor = centralColorConfidence(sampleHero, template.image);
  const perceptualHash = perceptualHashConfidence(sampleHero, template.image);

  return {
    centralColor,
    confidence: perceptualHash * 0.45 + centralColor * 0.25 + layout * 0.2 + histogram * 0.1,
    heroId: template.heroId,
    histogram,
    layout,
    perceptualHash,
    role: template.role,
  };
};

export const rankHeroTemplates = <THeroId extends string>(
  sampleHero: PixelImage,
  templates: HeroTemplate<THeroId>[],
  role?: HeroRole | null,
) =>
  templates
    .map((template) => scoreHeroTemplate(sampleHero, template))
    .filter((score) => !role || score.role === role)
    .sort((left, right) => right.confidence - left.confidence);

export const detectSelfBlueRow = (image: PixelImage, layout?: VisionLayout) =>
  Array.from({ length: 5 }, (_, index) => {
    const row = index + 1;
    const average = averageRegion(image, getBlueRowProbeRect(image, row, layout));

    return {
      average,
      row,
      score: average.green + average.blue + average.luma,
    };
  }).sort((left, right) => right.score - left.score);

const brightMask = (image: PixelImage) => {
  const mask: boolean[] = [];

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [red, green, blue] = getPixel(image, x, y);
      const luma = red * 0.299 + green * 0.587 + blue * 0.114;

      mask.push(luma > 190 && Math.max(red, green, blue) - Math.min(red, green, blue) < 70);
    }
  }

  return mask;
};

export const detectRoleFromIcon = (icon: PixelImage): HeroRole => {
  const mask = brightMask(icon);
  const isBright = (x: number, y: number) => mask[y * icon.width + x];
  let brightCount = 0;
  let centerColumnCount = 0;
  let centerRowCount = 0;
  let maxX = 0;
  let maxY = 0;
  let minX = icon.width - 1;
  let minY = icon.height - 1;
  const verticalThirdCounts = [0, 0, 0];

  for (let y = 0; y < icon.height; y += 1) {
    for (let x = 0; x < icon.width; x += 1) {
      if (!isBright(x, y)) {
        continue;
      }

      brightCount += 1;
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      if (Math.abs(x - icon.width / 2) <= icon.width * 0.13) centerColumnCount += 1;
      if (Math.abs(y - icon.height / 2) <= icon.height * 0.13) centerRowCount += 1;
      verticalThirdCounts[Math.min(2, Math.floor((x / icon.width) * 3))] += 1;
    }
  }

  const bboxHeight = Math.max(1, maxY - minY + 1);
  const bboxWidth = Math.max(1, maxX - minX + 1);
  const topBandMaxY = minY + Math.floor(bboxHeight * 0.25);
  let topBandMinX = icon.width;
  let topBandMaxX = 0;

  for (let y = minY; y <= topBandMaxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (isBright(x, y)) {
        topBandMinX = Math.min(topBandMinX, x);
        topBandMaxX = Math.max(topBandMaxX, x);
      }
    }
  }

  const topBandWidthRatio =
    topBandMaxX >= topBandMinX ? (topBandMaxX - topBandMinX + 1) / bboxWidth : 0;
  const crossScore = (centerColumnCount + centerRowCount) / Math.max(1, brightCount);
  const minThird = Math.min(...verticalThirdCounts);
  const maxThird = Math.max(...verticalThirdCounts);
  const threeBarScore = minThird / Math.max(1, maxThird);

  if (crossScore > 0.7 && topBandWidthRatio < 0.55) {
    return 'support';
  }

  if (threeBarScore > 0.45) {
    return 'damage';
  }

  return 'tank';
};

export const scoreMapImages = (sampleMap: PixelImage, mapImage: PixelImage) =>
  confidenceFromSimilarity(
    cosineSimilarity(createFeatureVector(sampleMap), createFeatureVector(mapImage)),
  );
