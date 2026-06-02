import { compareMatchesByTimelineAsc } from '@/lib/matchStats';
import type { Match } from '@/types/match';

export const SESSION_CONTINUATION_WINDOW_MS = 60 * 60 * 1000;

export interface MatchSession {
  draws: number;
  endedAt: string;
  losses: number;
  matches: Match[];
  sessionId: string;
  startedAt: string;
  wins: number;
}

const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));
const sessionIdTimestampPattern = /-|:|\.|T|Z/g;

export const createSessionId = (playedAt: Date | string = new Date()) => {
  const date = toDate(playedAt);
  const timestamp = date.toISOString().replace(sessionIdTimestampPattern, '').slice(0, 14);
  const randomSegment = crypto.randomUUID().slice(0, 8);

  return `session_${timestamp}_${randomSegment}`;
};

export const shouldReuseSession = (
  previousPlayedAt: Date | string,
  nextPlayedAt: Date | string,
) => {
  const previousTime = toDate(previousPlayedAt).getTime();
  const nextTime = toDate(nextPlayedAt).getTime();

  return Math.abs(nextTime - previousTime) <= SESSION_CONTINUATION_WINDOW_MS;
};

export const groupMatchesBySession = (matches: Match[]): MatchSession[] => {
  const sortedInputMatches = [...matches].sort(compareMatchesByTimelineAsc);
  const sessionGroups: Match[][] = [];

  for (const match of sortedInputMatches) {
    const currentGroup = sessionGroups.at(-1);
    const previousMatch = currentGroup?.at(-1);

    if (
      currentGroup &&
      previousMatch &&
      shouldReuseSession(previousMatch.playedAt, match.playedAt)
    ) {
      currentGroup.push(match);
      continue;
    }

    sessionGroups.push([match]);
  }

  return sessionGroups
    .map((sessionMatches) => {
      const sortedMatches = [...sessionMatches].sort(compareMatchesByTimelineAsc);
      const firstMatch = sortedMatches[0];

      return {
        draws: sortedMatches.filter((match) => match.result === 'draw').length,
        endedAt: sortedMatches.at(-1)?.playedAt ?? '',
        losses: sortedMatches.filter((match) => match.result === 'loss').length,
        matches: sortedMatches,
        sessionId: firstMatch ? `${firstMatch.sessionId}:${firstMatch.id}` : 'session_empty',
        startedAt: sortedMatches[0]?.playedAt ?? '',
        wins: sortedMatches.filter((match) => match.result === 'win').length,
      };
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
};
