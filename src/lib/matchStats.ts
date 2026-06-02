import { mapOptions, type MapOption } from '@/data/matchOptions';
import type { Match } from '@/types/match';

const getMatchSortTime = (value?: string | null) => (value ? new Date(value).getTime() : 0);

export const compareMatchesByTimelineAsc = (a: Match, b: Match) =>
  getMatchSortTime(a.playedAt) - getMatchSortTime(b.playedAt) ||
  getMatchSortTime(a.createdAt) - getMatchSortTime(b.createdAt) ||
  a.id.localeCompare(b.id);

export const compareMatchesByTimelineDesc = (a: Match, b: Match) =>
  getMatchSortTime(b.playedAt) - getMatchSortTime(a.playedAt) ||
  getMatchSortTime(b.createdAt) - getMatchSortTime(a.createdAt) ||
  b.id.localeCompare(a.id);

export interface ResultSummary {
  decisive: number;
  draws: number;
  losses: number;
  total: number;
  winRate: number | null;
  wins: number;
}

export const summarizeResults = (matches: Match[]): ResultSummary => {
  const wins = matches.filter((match) => match.result === 'win').length;
  const losses = matches.filter((match) => match.result === 'loss').length;
  const draws = matches.filter((match) => match.result === 'draw').length;
  const decisive = wins + losses;

  return {
    decisive,
    draws,
    losses,
    total: matches.length,
    winRate: decisive === 0 ? null : Math.round((wins / decisive) * 100),
    wins,
  };
};

export const calculateWinRate = (matches: Match[]) => {
  return summarizeResults(matches).winRate;
};

export const formatWinRate = (winRate: number | null) => (winRate === null ? '--' : `${winRate}%`);

export const getLongestStreak = (matches: Match[]) => {
  const sortedMatches = [...matches]
    .filter((match) => match.result !== 'draw')
    .sort(compareMatchesByTimelineAsc);

  if (sortedMatches.length === 0) {
    return null;
  }

  let bestCount = 0;
  let bestResult: Match['result'] = sortedMatches[0].result;
  let currentCount = 0;
  let currentResult: Match['result'] | null = null;

  for (const match of sortedMatches) {
    if (match.result === currentResult) {
      currentCount += 1;
    } else {
      currentResult = match.result;
      currentCount = 1;
    }

    if (currentCount > bestCount) {
      bestCount = currentCount;
      bestResult = match.result;
    }
  }

  return {
    count: bestCount,
    result: bestResult,
  };
};

export const getPeakHour = (matches: Match[]) => {
  const hourlyCounts = Array.from({ length: 24 }, () => 0);

  for (const match of matches) {
    hourlyCounts[new Date(match.playedAt).getHours()] += 1;
  }

  const maxCount = Math.max(...hourlyCounts);

  if (maxCount === 0) {
    return null;
  }

  return {
    count: maxCount,
    hour: hourlyCounts.findIndex((count) => count === maxCount),
  };
};

export const getCurrentStreak = (matches: Match[]) => {
  const sortedMatches = [...matches].sort(compareMatchesByTimelineDesc);
  const firstDecisiveMatch = sortedMatches.find((match) => match.result !== 'draw');

  if (!firstDecisiveMatch) {
    return null;
  }

  const streakResult = firstDecisiveMatch.result;
  let count = 0;

  for (const match of sortedMatches) {
    if (match.result === 'draw') {
      continue;
    }

    if (match.result !== streakResult) {
      break;
    }

    count += 1;
  }

  return {
    count,
    result: streakResult,
  };
};

export const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    end: end.toISOString(),
    start: start.toISOString(),
  };
};

export interface MapRecommendation {
  confidence: number;
  decisive: number;
  draws: number;
  losses: number;
  mapId: MapOption['value'];
  modeId: MapOption['modeId'];
  recommendationScore: number;
  smoothedWinRate: number;
  total: number;
  winRate: number | null;
  wins: number;
}

const mapOptionById = new Map(mapOptions.map((map) => [map.value, map] as const));

export const rankMapRecommendations = ({
  mapIds,
  matches,
}: {
  mapIds: string[];
  matches: Match[];
}): MapRecommendation[] => {
  const uniqueMapIds = [...new Set(mapIds)].filter((mapId) => mapOptionById.has(mapId));
  const baseline = summarizeResults(matches).winRate ?? 50;
  const baselineRate = baseline / 100;
  const priorStrength = 4;

  return uniqueMapIds
    .map((mapId, orderIndex) => {
      const map = mapOptionById.get(mapId as MapOption['value']);
      const mapMatches = matches.filter((match) => match.mapId === mapId);
      const summary = summarizeResults(mapMatches);
      const smoothed =
        (summary.wins + baselineRate * priorStrength) /
        Math.max(1, summary.decisive + priorStrength);
      const confidence = Math.min(1, summary.decisive / 8);

      return {
        orderIndex,
        recommendation: {
          confidence,
          decisive: summary.decisive,
          draws: summary.draws,
          losses: summary.losses,
          mapId: mapId as MapOption['value'],
          modeId: map?.modeId ?? 'control',
          recommendationScore: Math.round((smoothed * 0.86 + confidence * 0.14) * 1000) / 10,
          smoothedWinRate: Math.round(smoothed * 100),
          total: summary.total,
          winRate: summary.winRate,
          wins: summary.wins,
        },
      };
    })
    .sort(
      (left, right) =>
        right.recommendation.recommendationScore - left.recommendation.recommendationScore ||
        right.recommendation.decisive - left.recommendation.decisive ||
        left.orderIndex - right.orderIndex,
    )
    .map((item) => item.recommendation);
};
