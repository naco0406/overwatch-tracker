import type { Match } from '@/types/match';

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
    .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());

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
  const sortedMatches = [...matches].sort(
    (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
  );
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
