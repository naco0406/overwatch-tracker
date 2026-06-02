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
  const sessions = new Map<string, Match[]>();

  for (const match of matches) {
    const current = sessions.get(match.sessionId) ?? [];
    current.push(match);
    sessions.set(match.sessionId, current);
  }

  return Array.from(sessions.entries())
    .map(([sessionId, sessionMatches]) => {
      const sortedMatches = [...sessionMatches].sort(compareMatchesByTimelineAsc);

      return {
        draws: sortedMatches.filter((match) => match.result === 'draw').length,
        endedAt: sortedMatches.at(-1)?.playedAt ?? '',
        losses: sortedMatches.filter((match) => match.result === 'loss').length,
        matches: sortedMatches,
        sessionId,
        startedAt: sortedMatches[0]?.playedAt ?? '',
        wins: sortedMatches.filter((match) => match.result === 'win').length,
      };
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
};
