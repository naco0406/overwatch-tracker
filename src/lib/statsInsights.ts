import {
  getHeroLabel,
  getModeLabel,
  heroOptions,
  mapOptions,
  modeOptions,
  roleLabels,
} from '@/data/matchOptions';
import {
  compareMatchesByTimelineDesc,
  formatWinRate,
  summarizeResults,
  type ResultSummary,
} from '@/lib/matchStats';
import { groupMatchesBySession } from '@/lib/session';
import type { Match, ModeId } from '@/types/match';

export const QWEN_STATS_INSIGHT_MODEL = 'onnx-community/Qwen3.5-2B-ONNX-OPT';

export type StatsInsightTone = 'neutral' | 'positive' | 'warning';

const statsInsightToneLabels = {
  neutral: '관찰',
  positive: '강점',
  warning: '주의',
} satisfies Record<StatsInsightTone, string>;

export interface StatsInsightCandidate {
  description: string;
  details: Array<{ label: string; value: string }>;
  id: string;
  promptLine: string;
  score: number;
  title: string;
  tone: StatsInsightTone;
}

export interface StatsInsightPack {
  baselineWinRate: number | null;
  candidates: StatsInsightCandidate[];
  fallbackText: string;
  prompt: string;
  signature: string;
  summary: ResultSummary;
}

interface NamedStat extends ResultSummary {
  label: string;
  pickRate: number;
  value: string;
}

interface MapStat extends NamedStat {
  modeId: ModeId;
}

interface HeroStat extends NamedStat {
  role: keyof typeof roleLabels;
}

interface MapHeroStat extends ResultSummary {
  heroLabel: string;
  heroRole: keyof typeof roleLabels;
  label: string;
  mapLabel: string;
  modeLabel: string;
  pickRate: number;
  value: string;
}

interface StatsInsightOutputItem {
  candidateId?: string;
  text: string;
  title: string;
  tone: StatsInsightTone;
}

const mapById = new Map(mapOptions.map((map) => [map.value, map]));
const heroById = new Map(heroOptions.map((hero) => [hero.value, hero]));
const modeLabelById = new Map<string, string>(modeOptions.map((mode) => [mode.value, mode.label]));

const pushGrouped = <TKey, TValue>(groups: Map<TKey, TValue[]>, key: TKey, value: TValue) => {
  const current = groups.get(key);

  if (current) {
    current.push(value);
    return;
  }

  groups.set(key, [value]);
};

const getShare = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 100);

const getMinimumSample = (totalMatches: number) => {
  if (totalMatches >= 60) {
    return 6;
  }

  if (totalMatches >= 30) {
    return 4;
  }

  if (totalMatches >= 12) {
    return 3;
  }

  return 2;
};

const formatRecord = (summary: Pick<ResultSummary, 'draws' | 'losses' | 'wins'>) =>
  `${summary.wins}승 ${summary.losses}패 ${summary.draws}무`;

const getTopicParticle = (value: string) => {
  const lastCharacter = value.trim().at(-1);

  if (!lastCharacter) {
    return '은';
  }

  const code = lastCharacter.charCodeAt(0);
  const hangulStart = '가'.charCodeAt(0);
  const hangulEnd = '힣'.charCodeAt(0);

  if (code < hangulStart || code > hangulEnd) {
    return '은';
  }

  return (code - hangulStart) % 28 === 0 ? '는' : '은';
};

const withTopicParticle = (value: string) => `${value}${getTopicParticle(value)}`;

const getBaseline = (summary: ResultSummary) => summary.winRate ?? 50;

const getStatDelta = (winRate: number | null, baseline: number) =>
  winRate === null ? 0 : winRate - baseline;

const isPopular = <TStat extends { pickRate: number; value: string }>(
  stat: TStat,
  rankedStats: TStat[],
  threshold = 18,
) =>
  stat.pickRate >= threshold || rankedStats.slice(0, 3).some((item) => item.value === stat.value);

const getBestCandidate = (candidates: StatsInsightCandidate[]) =>
  candidates.sort((left, right) => right.score - left.score)[0] ?? null;

const createStatDetail = (stat: NamedStat | MapHeroStat) => [
  { label: '승률', value: formatWinRate(stat.winRate) },
  { label: '표본', value: `${stat.total}경기` },
  { label: '전적', value: formatRecord(stat) },
];

const createSignature = (summary: ResultSummary, candidates: StatsInsightCandidate[]) =>
  JSON.stringify({
    candidates: candidates.map((candidate) => ({
      description: candidate.description,
      id: candidate.id,
      score: candidate.score,
    })),
    summary,
  });

const buildInsightOutputText = (insights: StatsInsightOutputItem[]) =>
  JSON.stringify({
    insights,
  });

const buildFallbackText = (summary: ResultSummary, candidates: StatsInsightCandidate[]) => {
  if (summary.total === 0) {
    return buildInsightOutputText([
      {
        text: '아직 요약할 경기 기록이 없습니다.',
        title: '표본 대기',
        tone: 'neutral',
      },
    ]);
  }

  if (candidates.length === 0) {
    return buildInsightOutputText([
      {
        text: `현재 필터는 ${summary.total}경기 승률 ${formatWinRate(summary.winRate)}입니다.`,
        title: '전체 흐름',
        tone: 'neutral',
      },
      {
        text: '표본이 더 쌓이면 전장, 영웅, 모드 조합을 더 뚜렷하게 볼 수 있습니다.',
        title: '표본 대기',
        tone: 'neutral',
      },
    ]);
  }

  return buildInsightOutputText(
    candidates.slice(0, 4).map((candidate) => ({
      candidateId: candidate.id,
      text: candidate.description,
      title: candidate.title,
      tone: candidate.tone,
    })),
  );
};

const buildPrompt = (summary: ResultSummary, candidates: StatsInsightCandidate[]) => {
  const candidateLines = candidates
    .slice(0, 5)
    .map((candidate, index) => {
      const details = candidate.details
        .map((detail) => `${detail.label} ${detail.value}`)
        .join(', ');

      return `${index + 1}. id=${candidate.id}; tone=${statsInsightToneLabels[candidate.tone]}; title=${candidate.title}; facts=${candidate.description}; details=${details}`;
    })
    .join('\n');

  return [
    '오버워치 경쟁전 통계 후보 중 요약에 넣을 후보 ID만 JSON으로 선택해주세요. /no_think',
    '',
    '출력 스키마:',
    '{"insights":[{"candidateId":"후보 id"}]}',
    '',
    '스키마 규칙:',
    '- 루트 객체는 insights 배열만 포함해주세요.',
    '- 각 insight는 candidateId 하나만 포함해주세요.',
    '- candidateId는 아래 후보의 id 값을 그대로 사용해주세요.',
    '- title, text, tone 등 다른 필드는 생성하지 마세요.',
    '',
    '내용 규칙:',
    '- 제공된 숫자와 후보 안에서만 말하고, 원인을 추측하지 마세요.',
    '- 3개에서 5개의 insight만 작성해주세요.',
    '- 후보 우선순위와 표본 크기를 보고 중요한 후보를 고르세요.',
    '- 별도 문장, 결론, 설명은 쓰지 마세요.',
    '- 마크다운, 코드블록, <think> 블록은 출력하지 마세요.',
    '',
    `전체 표본: ${summary.total}경기, ${formatRecord(summary)}, 승률 ${formatWinRate(summary.winRate)}`,
    '',
    '후보:',
    candidateLines || '표본 부족으로 뚜렷한 후보 없음.',
  ].join('\n');
};

const createCandidate = ({
  description,
  details,
  id,
  promptLine,
  score,
  title,
  tone,
}: StatsInsightCandidate): StatsInsightCandidate => ({
  description,
  details,
  id,
  promptLine,
  score,
  title,
  tone,
});

const buildMapStats = (matches: Match[]) => {
  const groups = new Map<string, Match[]>();

  for (const match of matches) {
    pushGrouped(groups, match.mapId, match);
  }

  return Array.from(groups.entries()).map(([mapId, mapMatches]): MapStat => {
    const map = mapById.get(mapId);
    const summary = summarizeResults(mapMatches);

    return {
      ...summary,
      label: map?.label ?? mapId,
      modeId: map?.modeId ?? mapMatches[0]?.modeId ?? 'control',
      pickRate: getShare(mapMatches.length, matches.length),
      value: mapId,
    };
  });
};

const buildModeStats = (matches: Match[]) => {
  const groups = new Map<ModeId, Match[]>();

  for (const match of matches) {
    pushGrouped(groups, match.modeId, match);
  }

  return Array.from(groups.entries()).map(([modeId, modeMatches]): NamedStat => {
    const summary = summarizeResults(modeMatches);

    return {
      ...summary,
      label: modeLabelById.get(modeId) ?? getModeLabel(modeId),
      pickRate: getShare(modeMatches.length, matches.length),
      value: modeId,
    };
  });
};

const buildHeroStats = (matches: Match[]) => {
  const groups = new Map<string, Match[]>();

  for (const match of matches) {
    for (const heroId of new Set(match.myHeroes)) {
      pushGrouped(groups, heroId, match);
    }
  }

  return Array.from(groups.entries()).map(([heroId, heroMatches]): HeroStat => {
    const hero = heroById.get(heroId);
    const summary = summarizeResults(heroMatches);

    return {
      ...summary,
      label: hero?.label ?? getHeroLabel(heroId),
      pickRate: getShare(heroMatches.length, matches.length),
      role: hero?.role ?? 'damage',
      value: heroId,
    };
  });
};

const buildMapHeroStats = (matches: Match[]) => {
  const groups = new Map<string, Match[]>();

  for (const match of matches) {
    for (const heroId of new Set(match.myHeroes)) {
      pushGrouped(groups, `${match.mapId}::${heroId}`, match);
    }
  }

  return Array.from(groups.entries()).map(([value, comboMatches]): MapHeroStat => {
    const [mapId, heroId] = value.split('::');
    const map = mapById.get(mapId);
    const hero = heroById.get(heroId);
    const summary = summarizeResults(comboMatches);
    const mapLabel = map?.label ?? mapId;
    const heroLabel = hero?.label ?? getHeroLabel(heroId);

    return {
      ...summary,
      heroLabel,
      heroRole: hero?.role ?? 'damage',
      label: `${mapLabel} · ${heroLabel}`,
      mapLabel,
      modeLabel: map?.modeId ? getModeLabel(map.modeId) : getModeLabel(comboMatches[0]?.modeId),
      pickRate: getShare(comboMatches.length, matches.length),
      value,
    };
  });
};

const buildHourStats = (matches: Match[]) => {
  const groups = new Map<number, Match[]>();

  for (const match of matches) {
    pushGrouped(groups, new Date(match.playedAt).getHours(), match);
  }

  return Array.from(groups.entries()).map(([hour, hourMatches]) => ({
    ...summarizeResults(hourMatches),
    label: `${String(hour).padStart(2, '0')}:00`,
    pickRate: getShare(hourMatches.length, matches.length),
    value: String(hour),
  }));
};

const buildOrderStats = (matches: Match[]) => {
  const groups = new Map<number, Match[]>();

  for (const session of groupMatchesBySession(matches)) {
    session.matches.forEach((match, index) => {
      pushGrouped(groups, index + 1, match);
    });
  }

  return Array.from(groups.entries()).map(([order, orderMatches]) => ({
    ...summarizeResults(orderMatches),
    label: `${order}번째 경기`,
    pickRate: getShare(orderMatches.length, matches.length),
    value: String(order),
  }));
};

export const buildStatsInsightPack = (matches: Match[]): StatsInsightPack => {
  const summary = summarizeResults(matches);
  const baseline = getBaseline(summary);
  const minimumSample = getMinimumSample(matches.length);
  const comboMinimumSample = Math.max(2, Math.min(4, minimumSample));
  const recentMatches = [...matches].sort(compareMatchesByTimelineDesc).slice(0, 10);
  const recentSummary = summarizeResults(recentMatches);

  const mapStats = buildMapStats(matches);
  const modeStats = buildModeStats(matches);
  const heroStats = buildHeroStats(matches);
  const mapHeroStats = buildMapHeroStats(matches);
  const hourStats = buildHourStats(matches);
  const orderStats = buildOrderStats(matches);

  const rankedMaps = [...mapStats].sort((left, right) => right.total - left.total);
  const rankedModes = [...modeStats].sort((left, right) => right.total - left.total);
  const rankedHeroes = [...heroStats].sort((left, right) => right.total - left.total);

  const candidates = [
    getBestCandidate(
      mapStats
        .filter(
          (stat) =>
            stat.total >= minimumSample &&
            stat.winRate !== null &&
            stat.winRate >= baseline + 7 &&
            isPopular(stat, rankedMaps),
        )
        .map((stat) =>
          createCandidate({
            description: `${withTopicParticle(stat.label)} 선택률 ${stat.pickRate}%에 승률 ${formatWinRate(stat.winRate)}로 함께 높게 나타납니다.`,
            details: [
              ...createStatDetail(stat),
              { label: '선택률', value: `${stat.pickRate}%` },
              { label: '모드', value: getModeLabel(stat.modeId) },
            ],
            id: `strong-map:${stat.value}`,
            promptLine: `[강점 전장] ${stat.label}: 선택률 ${stat.pickRate}%, ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}`,
            score: getStatDelta(stat.winRate, baseline) * 2 + stat.pickRate + stat.total,
            title: '픽률과 승률이 함께 높은 전장',
            tone: 'positive',
          }),
        ),
    ),
    getBestCandidate(
      mapStats
        .filter(
          (stat) =>
            stat.total >= minimumSample &&
            stat.winRate !== null &&
            stat.winRate <= baseline - 8 &&
            isPopular(stat, rankedMaps),
        )
        .map((stat) =>
          createCandidate({
            description: `${withTopicParticle(stat.label)} 선택률 ${stat.pickRate}%로 자주 나오지만 승률은 ${formatWinRate(stat.winRate)}로 낮게 잡힙니다.`,
            details: [
              ...createStatDetail(stat),
              { label: '선택률', value: `${stat.pickRate}%` },
              { label: '모드', value: getModeLabel(stat.modeId) },
            ],
            id: `weak-popular-map:${stat.value}`,
            promptLine: `[주의 전장] ${stat.label}: 선택률 ${stat.pickRate}%, ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}`,
            score: Math.abs(getStatDelta(stat.winRate, baseline)) * 2 + stat.pickRate + stat.total,
            title: '자주 나오지만 성적이 낮은 전장',
            tone: 'warning',
          }),
        ),
    ),
    getBestCandidate(
      modeStats
        .filter(
          (stat) =>
            stat.total >= minimumSample && stat.winRate !== null && stat.winRate >= baseline + 6,
        )
        .map((stat) =>
          createCandidate({
            description: `${stat.label} 모드는 ${stat.total}경기 승률 ${formatWinRate(stat.winRate)}로 좋은 흐름입니다.`,
            details: [...createStatDetail(stat), { label: '선택률', value: `${stat.pickRate}%` }],
            id: `strong-mode:${stat.value}`,
            promptLine: `[강점 모드] ${stat.label}: 선택률 ${stat.pickRate}%, ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}`,
            score: getStatDelta(stat.winRate, baseline) * 2 + stat.pickRate + stat.total,
            title: '잘 풀리는 모드',
            tone: 'positive',
          }),
        ),
    ),
    getBestCandidate(
      modeStats
        .filter(
          (stat) =>
            stat.total >= minimumSample &&
            stat.winRate !== null &&
            stat.winRate <= baseline - 8 &&
            isPopular(stat, rankedModes, 22),
        )
        .map((stat) =>
          createCandidate({
            description: `${stat.label} 모드는 비중 ${stat.pickRate}%에 비해 승률이 ${formatWinRate(stat.winRate)}로 낮게 잡힙니다.`,
            details: [...createStatDetail(stat), { label: '비중', value: `${stat.pickRate}%` }],
            id: `weak-mode:${stat.value}`,
            promptLine: `[주의 모드] ${stat.label}: 비중 ${stat.pickRate}%, ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}`,
            score: Math.abs(getStatDelta(stat.winRate, baseline)) * 2 + stat.pickRate + stat.total,
            title: '비중 대비 성적이 낮은 모드',
            tone: 'warning',
          }),
        ),
    ),
    getBestCandidate(
      heroStats
        .filter(
          (stat) =>
            stat.total >= minimumSample && stat.winRate !== null && stat.winRate >= baseline + 8,
        )
        .map((stat) =>
          createCandidate({
            description: `${withTopicParticle(stat.label)} ${roleLabels[stat.role]} 영웅 중 ${stat.total}경기 승률 ${formatWinRate(stat.winRate)}로 좋은 흐름입니다.`,
            details: [
              ...createStatDetail(stat),
              { label: '등장률', value: `${stat.pickRate}%` },
              { label: '역할', value: roleLabels[stat.role] },
            ],
            id: `strong-hero:${stat.value}`,
            promptLine: `[강점 영웅] ${stat.label}: 등장률 ${stat.pickRate}%, ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}, 역할 ${roleLabels[stat.role]}`,
            score: getStatDelta(stat.winRate, baseline) * 2 + stat.pickRate + stat.total,
            title: '성적이 좋은 영웅',
            tone: 'positive',
          }),
        ),
    ),
    getBestCandidate(
      heroStats
        .filter(
          (stat) =>
            stat.total >= minimumSample &&
            stat.winRate !== null &&
            stat.winRate <= baseline - 9 &&
            isPopular(stat, rankedHeroes, 16),
        )
        .map((stat) =>
          createCandidate({
            description: `${withTopicParticle(stat.label)} 등장률 ${stat.pickRate}%로 자주 쓰지만 승률은 ${formatWinRate(stat.winRate)}입니다.`,
            details: [
              ...createStatDetail(stat),
              { label: '등장률', value: `${stat.pickRate}%` },
              { label: '역할', value: roleLabels[stat.role] },
            ],
            id: `weak-popular-hero:${stat.value}`,
            promptLine: `[주의 영웅] ${stat.label}: 등장률 ${stat.pickRate}%, ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}, 역할 ${roleLabels[stat.role]}`,
            score: Math.abs(getStatDelta(stat.winRate, baseline)) * 2 + stat.pickRate + stat.total,
            title: '많이 쓰지만 성적이 낮은 영웅',
            tone: 'warning',
          }),
        ),
    ),
    getBestCandidate(
      mapHeroStats
        .filter(
          (stat) =>
            stat.total >= comboMinimumSample &&
            stat.winRate !== null &&
            stat.winRate >= baseline + 12,
        )
        .map((stat) =>
          createCandidate({
            description: `${stat.mapLabel}에서 ${stat.heroLabel} 조합은 ${stat.total}경기 승률 ${formatWinRate(stat.winRate)}로 눈에 띕니다.`,
            details: [
              ...createStatDetail(stat),
              { label: '모드', value: stat.modeLabel },
              { label: '역할', value: roleLabels[stat.heroRole] },
            ],
            id: `strong-map-hero:${stat.value}`,
            promptLine: `[강점 조합] ${stat.mapLabel} + ${stat.heroLabel}: ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}, 모드 ${stat.modeLabel}, 역할 ${roleLabels[stat.heroRole]}`,
            score: getStatDelta(stat.winRate, baseline) * 2 + stat.total * 2,
            title: '전장과 영웅 조합 강점',
            tone: 'positive',
          }),
        ),
    ),
    getBestCandidate(
      mapHeroStats
        .filter(
          (stat) =>
            stat.total >= comboMinimumSample &&
            stat.winRate !== null &&
            stat.winRate <= baseline - 14,
        )
        .map((stat) =>
          createCandidate({
            description: `${stat.mapLabel}에서 ${withTopicParticle(stat.heroLabel)} ${stat.total}경기 승률 ${formatWinRate(stat.winRate)}라 조합 점검이 필요합니다.`,
            details: [
              ...createStatDetail(stat),
              { label: '모드', value: stat.modeLabel },
              { label: '역할', value: roleLabels[stat.heroRole] },
            ],
            id: `weak-map-hero:${stat.value}`,
            promptLine: `[주의 조합] ${stat.mapLabel} + ${stat.heroLabel}: ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}, 모드 ${stat.modeLabel}, 역할 ${roleLabels[stat.heroRole]}`,
            score: Math.abs(getStatDelta(stat.winRate, baseline)) * 2 + stat.total * 2,
            title: '전장과 영웅 조합 주의',
            tone: 'warning',
          }),
        ),
    ),
    getBestCandidate(
      hourStats
        .filter(
          (stat) =>
            stat.total >= minimumSample && stat.winRate !== null && stat.winRate >= baseline + 8,
        )
        .map((stat) =>
          createCandidate({
            description: `${stat.label} 시간대는 ${stat.total}경기 승률 ${formatWinRate(stat.winRate)}로 좋은 흐름입니다.`,
            details: [...createStatDetail(stat), { label: '비중', value: `${stat.pickRate}%` }],
            id: `strong-hour:${stat.value}`,
            promptLine: `[강점 시간대] ${stat.label}: 비중 ${stat.pickRate}%, ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}`,
            score: getStatDelta(stat.winRate, baseline) * 2 + stat.pickRate + stat.total,
            title: '승률이 좋은 시간대',
            tone: 'positive',
          }),
        ),
    ),
    getBestCandidate(
      orderStats
        .filter(
          (stat) =>
            stat.total >= minimumSample && stat.winRate !== null && stat.winRate <= baseline - 10,
        )
        .map((stat) =>
          createCandidate({
            description: `세션 ${stat.label} 구간은 ${stat.total}경기 승률 ${formatWinRate(stat.winRate)}로 가장 흔들리는 구간입니다.`,
            details: [...createStatDetail(stat), { label: '비중', value: `${stat.pickRate}%` }],
            id: `weak-order:${stat.value}`,
            promptLine: `[주의 순서] 세션 ${stat.label}: 비중 ${stat.pickRate}%, ${formatRecord(stat)}, 승률 ${formatWinRate(stat.winRate)}`,
            score: Math.abs(getStatDelta(stat.winRate, baseline)) * 2 + stat.pickRate + stat.total,
            title: '흔들리는 세션 구간',
            tone: 'warning',
          }),
        ),
    ),
  ].filter((candidate): candidate is StatsInsightCandidate => candidate !== null);

  if (
    recentSummary.total >= minimumSample &&
    recentSummary.winRate !== null &&
    summary.winRate !== null
  ) {
    const recentDelta = recentSummary.winRate - summary.winRate;

    if (Math.abs(recentDelta) >= 12) {
      candidates.push(
        createCandidate({
          description: `최근 ${recentSummary.total}경기 승률은 ${formatWinRate(recentSummary.winRate)}로 ${recentDelta > 0 ? '상승 흐름' : '하락 흐름'}입니다.`,
          details: [
            { label: '최근 승률', value: formatWinRate(recentSummary.winRate) },
            { label: '최근 전적', value: formatRecord(recentSummary) },
          ],
          id: 'recent-form',
          promptLine: `[최근 흐름] 최근 ${recentSummary.total}경기 ${formatRecord(recentSummary)}, 승률 ${formatWinRate(recentSummary.winRate)}`,
          score: Math.abs(recentDelta) * 2 + recentSummary.total,
          title: recentDelta > 0 ? '최근 흐름 상승' : '최근 흐름 하락',
          tone: recentDelta > 0 ? 'positive' : 'warning',
        }),
      );
    }
  }

  const sortedCandidates = candidates.sort((left, right) => right.score - left.score).slice(0, 6);
  const fallbackText = buildFallbackText(summary, sortedCandidates);

  return {
    baselineWinRate: summary.winRate,
    candidates: sortedCandidates,
    fallbackText,
    prompt: buildPrompt(summary, sortedCandidates),
    signature: createSignature(summary, sortedCandidates),
    summary,
  };
};
