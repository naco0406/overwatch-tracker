import type { Match } from '@/types/match';

export const calculateWinRate = (matches: Match[]) => {
  const decisiveMatches = matches.filter((match) => match.result !== 'draw');

  if (decisiveMatches.length === 0) {
    return null;
  }

  const wins = decisiveMatches.filter((match) => match.result === 'win').length;

  return Math.round((wins / decisiveMatches.length) * 100);
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
