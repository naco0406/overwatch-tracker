import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  ImageIcon,
  Info,
  Loader2,
  Radio,
  RefreshCw,
  Swords,
  Trophy,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { InlineEmptyState } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useExternalDataOverview } from '@/hooks/useExternalData';
import { isExternalDataApiConfigured } from '@/lib/externalDataApi';
import { cn } from '@/lib/utils';
import type { ExternalDataOverview, ExternalEsportsEvent } from '@/types/externalData';

type MatchEvent = ExternalDataOverview['esportsEvents'][number];
type MatchMetadata = Record<string, unknown>;

interface TeamRecord {
  losses: number;
  played: number;
  team: string;
  winRate: number | null;
  wins: number;
}

interface TeamRecentMatch {
  id: string;
  opponent: string;
  opponentLogoUrl: string;
  result: 'D' | 'L' | 'W';
  scoreLabel: string;
  startsAt: string | null;
  tournament: string;
}

interface RosterPlayer {
  country: string;
  flag: string;
  id: string;
  name: string;
  role: string;
}

interface MatchBroadcast {
  id: string;
  language: string;
  name: string;
  platform: string;
  url: string;
}

const externalRegionLabels = {
  all: '전체',
  americas: '미주',
  asia: '아시아',
  china: '중국',
  emea: 'EMEA',
  europe: '유럽',
  global: '글로벌',
  japan: '일본',
  korea: '한국',
  na: '북미',
  north_america: '북미',
  owwc: '월드컵',
  pacific: '퍼시픽',
} as const;

const externalEventStatusLabels = {
  canceled: '취소',
  completed: '종료',
  live: '진행 중',
  postponed: '연기',
  scheduled: '예정',
} satisfies Record<ExternalEsportsEvent['status'], string>;

const logoWellStyle = {
  background:
    'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.20), transparent 58%), linear-gradient(145deg, hsl(222 20% 15%), hsl(220 16% 8%))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -12px 28px rgba(0,0,0,0.18)',
} satisfies CSSProperties;

const logoImageClassName =
  'h-full w-full object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)] drop-shadow-[0_0_10px_rgba(0,0,0,0.45)]';

const eventDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'long',
  weekday: 'short',
  year: 'numeric',
});

const getExternalRegionLabel = (value: string) =>
  value in externalRegionLabels
    ? externalRegionLabels[value as keyof typeof externalRegionLabels]
    : value || '미지정';

const getExternalEventStatusLabel = (status: ExternalEsportsEvent['status']) =>
  externalEventStatusLabels[status] ?? status;

const getCompactSourceLabel = (sourceId: string) => {
  if (sourceId === 'owtics') return 'OWTICS';
  if (sourceId === 'official_esports') return '공식 일정';

  return sourceId;
};

const formatEventDateTime = (value: string | null) => {
  if (!value) return '일정 미정';

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '일정 미정' : eventDateFormatter.format(date);
};

const formatRelativeMatchDate = (value: string | null, now: number) => {
  if (!value) return '일정 미정';

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) return '일정 미정';

  const diffDays = Math.floor((now - time) / 86_400_000);

  if (diffDays <= 0) return '오늘';
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 35) return `${Math.floor(diffDays / 7)}주 전`;

  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(time));
};

const getEventTime = (event: MatchEvent) => {
  if (!event.startsAt) return null;

  const time = new Date(event.startsAt).getTime();

  return Number.isFinite(time) ? time : null;
};

const getScoreLabel = (event: MatchEvent) =>
  event.status === 'completed' && event.scoreA !== null && event.scoreB !== null
    ? `${event.scoreA} - ${event.scoreB}`
    : 'vs';

const getWinnerSide = (event: MatchEvent) => {
  if (event.scoreA === null || event.scoreB === null || event.scoreA === event.scoreB) {
    return null;
  }

  return event.scoreA > event.scoreB ? 'A' : 'B';
};

const getMetadataString = (metadata: MatchMetadata, key: string) => {
  const value = metadata[key];

  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

const hasMetadataValue = (metadata: MatchMetadata, key: string) =>
  Boolean(getMetadataString(metadata, key));

const getNestedMetadataArray = (metadata: MatchMetadata, path: string[]) => {
  let current: unknown = metadata;

  for (const key of path) {
    if (!current || typeof current !== 'object') return [];

    current = (current as Record<string, unknown>)[key];
  }

  return Array.isArray(current) ? current : [];
};

const getFirstMetadataArray = (metadata: MatchMetadata, paths: string[][]) => {
  for (const path of paths) {
    const value = getNestedMetadataArray(metadata, path);

    if (value.length > 0) return value;
  }

  return [];
};

const getRosterPlayers = (metadata: MatchMetadata, side: 'A' | 'B'): RosterPlayer[] => {
  const sideKey = side === 'A' ? 'teamA' : 'teamB';
  const lowerSideKey = side === 'A' ? 'team_a' : 'team_b';
  const rawPlayers = getFirstMetadataArray(metadata, [
    ['rosters', sideKey],
    ['rosters', lowerSideKey],
    [`${sideKey}Roster`],
    [`${lowerSideKey}_roster`],
    [`${sideKey}Players`],
  ]);

  return rawPlayers
    .map((player, index) => {
      if (!player || typeof player !== 'object') return null;

      const record = player as Record<string, unknown>;
      const name = String(record.name ?? record.playerName ?? record.handle ?? '').trim();

      if (!name) return null;

      const role = String(record.role ?? record.position ?? '').trim();
      const country = String(
        record.country ?? record.countryCode ?? record.nationality ?? '',
      ).trim();
      const flag = String(record.flag ?? '').trim();

      return {
        country,
        flag,
        id: String(record.id ?? `${name}-${index}`),
        name,
        role: role ? role.toUpperCase() : 'PLAYER',
      };
    })
    .filter((player): player is RosterPlayer => player !== null);
};

const getModeBreakdown = (metadata: MatchMetadata) =>
  getFirstMetadataArray(metadata, [['modeBreakdown'], ['records', 'modeBreakdown']]).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
  );

const getMatchBroadcasts = (metadata: MatchMetadata): MatchBroadcast[] =>
  getFirstMetadataArray(metadata, [['broadcasts'], ['streams'], ['watchChannels']])
    .map((broadcast, index) => {
      if (!broadcast || typeof broadcast !== 'object') return null;

      const record = broadcast as Record<string, unknown>;
      const name = String(record.name ?? record.title ?? record.channel ?? '').trim();
      const url = String(record.url ?? record.href ?? record.link ?? '').trim();

      if (!name && !url) return null;

      return {
        id: String(record.id ?? `${name || url}-${index}`),
        language: String(record.language ?? record.locale ?? '').trim(),
        name: name || getWatchLinkLabel(url),
        platform: String(record.platform ?? record.service ?? '').trim(),
        url,
      };
    })
    .filter((broadcast): broadcast is MatchBroadcast => broadcast !== null);

const getTeamLogoUrl = (event: MatchEvent, side: 'A' | 'B') => {
  const key = side === 'A' ? 'teamALogoUrl' : 'teamBLogoUrl';

  return getMetadataString(event.metadata, key);
};

const getCompetitionLogoUrl = (event: MatchEvent) =>
  getMetadataString(event.metadata, 'competitionLogoUrl');

const getCompetitionTitle = (event: MatchEvent) =>
  getMetadataString(event.metadata, 'competitionTitle') ||
  event.series ||
  event.tournament ||
  '대회 정보 없음';

const getAvailableMetadataRows = (event: MatchEvent) =>
  [
    ['Competition ID', getMetadataString(event.metadata, 'competitionId')],
    ['Competition slug', getMetadataString(event.metadata, 'competitionSlug')],
    ['Competition region', getMetadataString(event.metadata, 'competitionRegion')],
    ['Team A ID', getMetadataString(event.metadata, 'teamAId')],
    ['Team A slug', getMetadataString(event.metadata, 'teamASlug')],
    ['Team B ID', getMetadataString(event.metadata, 'teamBId')],
    ['Team B slug', getMetadataString(event.metadata, 'teamBSlug')],
    ['Raw status', getMetadataString(event.metadata, 'rawStatus')],
  ].filter((row): row is [string, string] => Boolean(row[1]));

const hasCompetitionMetadata = (event: MatchEvent) =>
  [
    'competitionLogoUrl',
    'competitionId',
    'competitionSlug',
    'competitionRegion',
    'competitionSeries',
    'competitionTitle',
  ].some((key) => hasMetadataValue(event.metadata, key));

const getTeamCode = (event: MatchEvent, side: 'A' | 'B') => {
  const metadataKey = side === 'A' ? 'teamAAbbreviation' : 'teamBAbbreviation';
  const fromMetadata = getMetadataString(event.metadata, metadataKey);
  const teamName = side === 'A' ? event.teamA : event.teamB;

  if (fromMetadata) return fromMetadata;

  const compact = teamName.replace(/[^A-Za-z0-9]/g, '');

  if (!compact) return 'TBD';
  if (compact.length <= 4) return compact.toUpperCase();

  const words = teamName.split(/\s+/).filter(Boolean);

  if (words.length > 1) {
    return words
      .map((word) => word[0])
      .join('')
      .slice(0, 4)
      .toUpperCase();
  }

  return compact.slice(0, 4).toUpperCase();
};

const getWatchLinkLabel = (value: string) => {
  if (/twitch\.tv/i.test(value)) return 'Twitch';
  if (/youtu\.?be|youtube\.com/i.test(value)) return 'YouTube';
  if (/owtics\.gg/i.test(value)) return 'OWTICS';

  return '보기';
};

const getCountdownParts = (startsAt: string | null, now: number) => {
  if (!startsAt) return null;

  const target = new Date(startsAt).getTime();

  if (!Number.isFinite(target)) return null;

  const diffSeconds = Math.max(0, Math.floor((target - now) / 1000));

  return {
    days: Math.floor(diffSeconds / 86_400),
    hours: Math.floor((diffSeconds % 86_400) / 3_600),
    minutes: Math.floor((diffSeconds % 3_600) / 60),
    seconds: diffSeconds % 60,
  };
};

const getCompletedTeamEvents = (events: MatchEvent[], team: string) =>
  events.filter(
    (event) =>
      event.status === 'completed' &&
      event.scoreA !== null &&
      event.scoreB !== null &&
      (event.teamA === team || event.teamB === team),
  );

const getTeamRecord = (events: MatchEvent[], team: string): TeamRecord => {
  const completedEvents = getCompletedTeamEvents(events, team);
  const wins = completedEvents.filter((event) => {
    const winner = getWinnerSide(event);

    return (winner === 'A' && event.teamA === team) || (winner === 'B' && event.teamB === team);
  }).length;
  const losses = completedEvents.length - wins;

  return {
    losses,
    played: completedEvents.length,
    team,
    winRate: completedEvents.length > 0 ? Math.round((wins / completedEvents.length) * 100) : null,
    wins,
  };
};

const getTeamRecentMatches = (
  events: MatchEvent[],
  team: string,
  currentEvent: MatchEvent,
): TeamRecentMatch[] =>
  getCompletedTeamEvents(events, team)
    .filter((event) => event.id !== currentEvent.id)
    .sort((left, right) => (getEventTime(right) ?? 0) - (getEventTime(left) ?? 0))
    .slice(0, 5)
    .map((event) => {
      const teamIsA = event.teamA === team;
      const winner = getWinnerSide(event);
      const won = (winner === 'A' && teamIsA) || (winner === 'B' && !teamIsA);
      const result = winner === null ? 'D' : won ? 'W' : 'L';

      return {
        id: event.id,
        opponent: teamIsA ? event.teamB : event.teamA,
        opponentLogoUrl: getTeamLogoUrl(event, teamIsA ? 'B' : 'A'),
        result,
        scoreLabel: `${event.scoreA ?? '-'}-${event.scoreB ?? '-'}`,
        startsAt: event.startsAt,
        tournament: event.series || event.tournament,
      };
    });

const useMatchNow = (event: MatchEvent | null) => {
  const [now, setNow] = useState(() => Date.now());
  const startsAt = event?.startsAt ?? null;
  const status = event?.status ?? 'completed';

  useEffect(() => {
    if (!startsAt || status === 'completed' || status === 'canceled') {
      return undefined;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(intervalId);
  }, [startsAt, status]);

  return now;
};

const ExternalEsportsMatchPage = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const isConfigured = isExternalDataApiConfigured();
  const { data: overview, error, isFetching, isLoading, refetch } = useExternalDataOverview(true);
  const decodedEventId = eventId ? decodeURIComponent(eventId) : '';
  const events = useMemo(() => overview?.esportsEvents ?? [], [overview?.esportsEvents]);
  const match = useMemo(
    () =>
      events.find(
        (event) => event.id === decodedEventId || event.externalEventId === decodedEventId,
      ) ?? null,
    [decodedEventId, events],
  );
  const now = useMatchNow(match);

  if (!isConfigured) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="OVERWATCH ESPORTS"
          title="매치 상세"
          description="선택한 경기의 일정과 팀 정보를 확인합니다."
        />
        <EmptyState
          icon={Swords}
          title="경기 데이터를 연결하지 못했어요."
          description="잠시 후 다시 시도해주세요. 문제가 계속되면 e스포츠 일정으로 돌아가세요."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="OVERWATCH ESPORTS"
          title="매치 상세"
          description="경기 상세 데이터를 불러오는 중 문제가 발생했습니다."
          actions={
            <Button variant="outline" className="bg-transparent" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </Button>
          }
        />
        <EmptyState
          icon={Swords}
          title="매치 데이터를 불러오지 못했어요."
          description="잠시 후 다시 시도해주세요."
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="OVERWATCH ESPORTS"
          title="매치 상세"
          description="경기 정보를 불러오는 중입니다."
        />
        <EmptyState
          icon={Loader2}
          title="불러오는 중"
          description="경기 상세를 준비하고 있습니다."
        />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="OVERWATCH ESPORTS"
          title="매치 상세"
          description="현재 일정 목록에서 해당 경기를 찾지 못했습니다."
          actions={
            <Button asChild variant="outline" className="bg-transparent">
              <Link to="/external-data/esports">
                <ArrowLeft className="h-4 w-4" />
                일정으로
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={Swords}
          title="매치를 찾을 수 없습니다."
          description="제공 범위 밖의 경기이거나 새로고침이 필요할 수 있습니다."
        />
      </div>
    );
  }

  const teamARecord = getTeamRecord(events, match.teamA);
  const teamBRecord = getTeamRecord(events, match.teamB);
  const teamARecentMatches = getTeamRecentMatches(events, match.teamA, match);
  const teamBRecentMatches = getTeamRecentMatches(events, match.teamB, match);
  const teamARoster = getRosterPlayers(match.metadata, 'A');
  const teamBRoster = getRosterPlayers(match.metadata, 'B');
  const modeBreakdown = getModeBreakdown(match.metadata);
  const hasRosterData = teamARoster.length > 0 || teamBRoster.length > 0;
  const hasRecentMatchData = teamARecentMatches.length > 0 || teamBRecentMatches.length > 0;
  const hasRecordData = teamARecord.played > 0 || teamBRecord.played > 0;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="OVERWATCH ESPORTS"
        title={`${match.teamA || 'TBD'} vs ${match.teamB || 'TBD'}`}
        description={[match.tournament, match.stage, getExternalRegionLabel(match.region)]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="bg-transparent">
              <Link to="/external-data/esports">
                <ArrowLeft className="h-4 w-4" />
                일정으로
              </Link>
            </Button>
            <Button
              variant="outline"
              className="bg-transparent"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              새로고침
            </Button>
          </div>
        }
      />

      <ExternalMatchHero event={match} now={now} />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:items-start">
        <div className="space-y-4">
          {hasRosterData ? (
            <ExternalMatchRosterPanel
              teamA={match.teamA}
              teamB={match.teamB}
              teamARoster={teamARoster}
              teamBRoster={teamBRoster}
            />
          ) : null}
          {hasRecentMatchData ? (
            <ExternalRecentMatchesPanel
              now={now}
              teamA={match.teamA}
              teamB={match.teamB}
              teamARecentMatches={teamARecentMatches}
              teamBRecentMatches={teamBRecentMatches}
            />
          ) : null}
          {hasRecordData ? (
            <ExternalOverallRecordPanel
              modeBreakdown={modeBreakdown}
              teamARecord={teamARecord}
              teamBRecord={teamBRecord}
            />
          ) : null}
        </div>

        <aside className="space-y-4">
          {hasCompetitionMetadata(match) ? <ExternalCompetitionPanel event={match} /> : null}
          <ExternalWatchPanel event={match} />
          <ExternalMatchFactsPanel event={match} sources={overview?.sources ?? []} />
        </aside>
      </div>
    </div>
  );
};

const ExternalMatchHero = ({ event, now }: { event: MatchEvent; now: number }) => {
  const countdownParts =
    event.status === 'scheduled' || event.status === 'live'
      ? getCountdownParts(event.startsAt, now)
      : null;
  const competitionLogoUrl = getCompetitionLogoUrl(event);

  return (
    <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
      <div className="grid gap-px bg-border/60 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="bg-card px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {competitionLogoUrl ? (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 ring-1 ring-black/20"
                style={logoWellStyle}
              >
                <img
                  src={competitionLogoUrl}
                  alt={getCompetitionTitle(event)}
                  className={cn(logoImageClassName, 'p-1')}
                />
              </span>
            ) : null}
            <Badge variant="outline" className="gap-1.5 bg-transparent">
              <Swords className="h-3.5 w-3.5" />
              {getCompactSourceLabel(event.sourceId)}
            </Badge>
            <Badge variant="outline" className="bg-transparent">
              {getExternalEventStatusLabel(event.status)}
            </Badge>
            {event.region ? (
              <Badge variant="outline" className="bg-transparent">
                {getExternalRegionLabel(event.region)}
              </Badge>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] lg:items-center">
            <MatchTeamIdentity
              align="left"
              code={getTeamCode(event, 'A')}
              logoUrl={getTeamLogoUrl(event, 'A')}
              teamName={event.teamA || 'TBD'}
            />
            <div className="flex flex-col items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-3 py-3 text-center">
              <p className="text-2xl font-black leading-none">{getScoreLabel(event)}</p>
              <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                {event.status === 'completed' ? 'Final' : 'Series'}
              </p>
            </div>
            <MatchTeamIdentity
              align="right"
              code={getTeamCode(event, 'B')}
              logoUrl={getTeamLogoUrl(event, 'B')}
              teamName={event.teamB || 'TBD'}
            />
          </div>

          <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/60 sm:grid-cols-3">
            <MatchHeroFact
              icon={CalendarDays}
              label="시작"
              value={formatEventDateTime(event.startsAt)}
            />
            <MatchHeroFact
              icon={Trophy}
              label="대회"
              value={event.series || event.tournament || '대회 정보 없음'}
            />
            <MatchHeroFact
              icon={Radio}
              label="방송"
              value={`${event.watchUrls.length.toLocaleString('ko-KR')}개 링크`}
            />
          </div>
        </div>

        <div className="bg-[hsl(var(--surface-2))] px-4 py-5 sm:px-5">
          <p className="metric-label">
            {event.status === 'completed' ? '결과' : 'Match Starts In'}
          </p>
          {countdownParts ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <CountdownCell label="D" value={countdownParts.days} />
              <CountdownCell label="H" value={countdownParts.hours} />
              <CountdownCell label="M" value={countdownParts.minutes} />
              <CountdownCell label="S" value={countdownParts.seconds} />
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-border/70 bg-card px-3 py-3">
              <p className="text-2xl font-black">{getScoreLabel(event)}</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {formatEventDateTime(event.startsAt)}
              </p>
            </div>
          )}
          <p className="mt-4 text-xs font-semibold leading-relaxed text-muted-foreground">
            {event.stage || 'Stage 미정'}
          </p>
        </div>
      </div>
    </section>
  );
};

const MatchTeamIdentity = ({
  align,
  code,
  logoUrl,
  teamName,
}: {
  align: 'left' | 'right';
  code: string;
  logoUrl: string;
  teamName: string;
}) => (
  <div
    className={cn(
      'grid gap-3',
      align === 'right'
        ? 'lg:grid-cols-[minmax(0,1fr)_72px] lg:text-right'
        : 'lg:grid-cols-[72px_minmax(0,1fr)]',
    )}
  >
    <TeamLogo
      className={cn(align === 'right' && 'lg:order-2')}
      logoUrl={logoUrl}
      teamName={teamName}
    />
    <div className="min-w-0 self-center">
      <p className="metric-label">{code}</p>
      <h2 className="mt-1 break-words text-3xl font-black leading-tight">{teamName}</h2>
    </div>
  </div>
);

const TeamLogo = ({
  className,
  logoUrl,
  teamName,
}: {
  className?: string;
  logoUrl: string;
  teamName: string;
}) => (
  <div
    className={cn(
      'flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 ring-1 ring-black/20',
      className,
    )}
    style={logoWellStyle}
  >
    {logoUrl ? (
      <img src={logoUrl} alt={teamName} className={cn(logoImageClassName, 'p-2')} />
    ) : (
      <span className="text-lg font-black text-white/80">{getTeamInitials(teamName)}</span>
    )}
  </div>
);

const getTeamInitials = (teamName: string) =>
  teamName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'T';

const MatchHeroFact = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) => (
  <div className="min-w-0 bg-[hsl(var(--surface-2))] px-3.5 py-3">
    <div className="flex items-start gap-2.5">
      <div className="ow-game-icon-shell mt-0.5 h-7 w-7 bg-primary">
        <div className="ow-game-icon-core bg-card text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <p className="mt-1 line-clamp-2 text-sm font-black leading-tight">{value}</p>
      </div>
    </div>
  </div>
);

const CountdownCell = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md border border-border/70 bg-card px-3 py-3 text-center">
    <p className="text-2xl font-black tabular-nums">{String(value).padStart(2, '0')}</p>
    <p className="mt-1 text-[11px] font-bold text-muted-foreground">{label}</p>
  </div>
);

const ExternalWatchPanel = ({ event }: { event: MatchEvent }) => {
  const detailUrl = getMetadataString(event.metadata, 'detailsUrl');
  const broadcasts = getMatchBroadcasts(event.metadata);
  const urls = Array.from(new Set([...event.watchUrls, detailUrl].filter(Boolean)));

  return (
    <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="metric-label">Where to Watch</p>
        <h2 className="mt-1 text-lg font-bold">방송 및 원문 링크</h2>
      </div>
      <div className="grid gap-2 p-4">
        {broadcasts.length > 0 ? (
          broadcasts.map((broadcast) =>
            broadcast.url ? (
              <Button
                key={broadcast.id}
                asChild
                variant="outline"
                className="justify-start bg-transparent"
              >
                <a href={broadcast.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {broadcast.name}
                  {broadcast.language ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {broadcast.language}
                    </span>
                  ) : null}
                </a>
              </Button>
            ) : (
              <div
                key={broadcast.id}
                className="flex min-h-10 items-center gap-3 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-3 text-sm font-bold"
              >
                <Radio className="h-4 w-4 text-primary" />
                <span className="min-w-0 flex-1 truncate">{broadcast.name}</span>
                {broadcast.language || broadcast.platform ? (
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {[broadcast.platform, broadcast.language].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </div>
            ),
          )
        ) : urls.length > 0 ? (
          urls.map((url) => (
            <Button key={url} asChild variant="outline" className="justify-start bg-transparent">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {getWatchLinkLabel(url)}
              </a>
            </Button>
          ))
        ) : (
          <InlineEmptyState
            title="방송 링크가 없습니다."
            description="공식 일정 또는 OWTICS 링크가 제공되면 표시됩니다."
          />
        )}
      </div>
    </section>
  );
};

const ExternalCompetitionPanel = ({ event }: { event: MatchEvent }) => {
  const competitionLogoUrl = getCompetitionLogoUrl(event);
  const competitionRows = [
    ['ID', getMetadataString(event.metadata, 'competitionId')],
    ['Slug', getMetadataString(event.metadata, 'competitionSlug')],
    [
      'Region',
      getMetadataString(event.metadata, 'competitionRegion') ||
        getExternalRegionLabel(event.region),
    ],
    ['Series', getMetadataString(event.metadata, 'competitionSeries') || event.stage],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="metric-label">Competition</p>
        <h2 className="mt-1 text-lg font-bold">대회 정보</h2>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-white/10 ring-1 ring-black/20"
            style={logoWellStyle}
          >
            {competitionLogoUrl ? (
              <img
                src={competitionLogoUrl}
                alt={getCompetitionTitle(event)}
                className={cn(logoImageClassName, 'p-2')}
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-white/70" />
            )}
          </div>
          <div className="min-w-0 self-center">
            <p className="truncate text-base font-black">{getCompetitionTitle(event)}</p>
            <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
              {event.stage || getExternalRegionLabel(event.region)}
            </p>
          </div>
        </div>
        {competitionRows.length > 0 ? (
          <div className="mt-4 grid divide-y divide-border/60 rounded-md border border-border/70 bg-[hsl(var(--surface-2))]">
            {competitionRows.map(([label, value]) => (
              <MatchFactRow key={label} label={label} value={value} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};

const ExternalMatchFactsPanel = ({
  event,
  sources,
}: {
  event: MatchEvent;
  sources: ExternalDataOverview['sources'];
}) => {
  const source = sources.find((item) => item.id === event.sourceId);
  const metadataRows = getAvailableMetadataRows(event);

  return (
    <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="metric-label">Match Facts</p>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-bold">
          <Info className="h-4 w-4 text-primary" />
          데이터 정보
        </h2>
      </div>
      <div className="grid divide-y divide-border/60">
        <MatchFactRow label="경기 ID" value={event.externalEventId} />
        <MatchFactRow label="상태" value={getExternalEventStatusLabel(event.status)} />
        <MatchFactRow label="지역" value={getExternalRegionLabel(event.region)} />
        <MatchFactRow
          label="출처"
          value={source?.displayName ?? getCompactSourceLabel(event.sourceId)}
        />
        <MatchFactRow label="최근 업데이트" value={formatEventDateTime(event.fetchedAt)} />
        {metadataRows.map(([label, value]) => (
          <MatchFactRow key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
};

const MatchFactRow = ({ label, value }: { label: string; value: string }) => (
  <div className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-3 px-4 py-3">
    <p className="metric-label">{label}</p>
    <p className="break-words text-sm font-bold">{value || '-'}</p>
  </div>
);

const ExternalMatchRosterPanel = ({
  teamA,
  teamARoster,
  teamB,
  teamBRoster,
}: {
  teamA: string;
  teamARoster: RosterPlayer[];
  teamB: string;
  teamBRoster: RosterPlayer[];
}) => (
  <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <p className="metric-label">Rosters</p>
      <h2 className="mt-1 text-lg font-bold">팀 로스터</h2>
    </div>
    <div
      className={cn(
        'grid gap-px bg-border/60',
        teamARoster.length > 0 && teamBRoster.length > 0 && 'lg:grid-cols-2',
      )}
    >
      {teamARoster.length > 0 ? <RosterTeamColumn players={teamARoster} teamName={teamA} /> : null}
      {teamBRoster.length > 0 ? <RosterTeamColumn players={teamBRoster} teamName={teamB} /> : null}
    </div>
  </section>
);

const RosterTeamColumn = ({ players, teamName }: { players: RosterPlayer[]; teamName: string }) => (
  <div className="min-w-0 bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="truncate text-base font-black">{teamName || 'TBD'}</h3>
      <Badge variant="outline" className="bg-transparent">
        {players.length.toLocaleString('ko-KR')}명
      </Badge>
    </div>
    <div className="mt-3 grid gap-2">
      {players.map((player) => (
        <div
          key={player.id}
          className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2"
        >
          <span className="text-[11px] font-black text-muted-foreground">{player.role}</span>
          <span className="truncate text-sm font-black">{player.name}</span>
          <span className="text-xs font-bold text-muted-foreground">
            {player.flag || player.country || '-'}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const ExternalRecentMatchesPanel = ({
  now,
  teamA,
  teamARecentMatches,
  teamB,
  teamBRecentMatches,
}: {
  now: number;
  teamA: string;
  teamARecentMatches: TeamRecentMatch[];
  teamB: string;
  teamBRecentMatches: TeamRecentMatch[];
}) => (
  <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <p className="metric-label">Recent Matches</p>
      <h2 className="mt-1 text-lg font-bold">최근 경기 흐름</h2>
    </div>
    <div
      className={cn(
        'grid gap-px bg-border/60',
        teamARecentMatches.length > 0 && teamBRecentMatches.length > 0 && 'lg:grid-cols-2',
      )}
    >
      {teamARecentMatches.length > 0 ? (
        <RecentTeamColumn matches={teamARecentMatches} now={now} teamName={teamA} />
      ) : null}
      {teamBRecentMatches.length > 0 ? (
        <RecentTeamColumn matches={teamBRecentMatches} now={now} teamName={teamB} />
      ) : null}
    </div>
  </section>
);

const RecentTeamColumn = ({
  matches,
  now,
  teamName,
}: {
  matches: TeamRecentMatch[];
  now: number;
  teamName: string;
}) => {
  const wins = matches.filter((match) => match.result === 'W').length;
  const losses = matches.filter((match) => match.result === 'L').length;

  return (
    <div className="min-w-0 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black">{teamName || 'TBD'}</h3>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {wins}W {losses}L in last {matches.length}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {matches.map((match) => (
          <div
            key={match.id}
            className="grid grid-cols-[32px_54px_minmax(0,1fr)_74px] items-center gap-3 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2"
          >
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-xs font-black',
                match.result === 'W'
                  ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]'
                  : match.result === 'L'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-secondary text-muted-foreground',
              )}
            >
              {match.result}
            </span>
            <span className="text-sm font-black">{match.scoreLabel}</span>
            <span className="flex min-w-0 items-center gap-2">
              {match.opponentLogoUrl ? (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 ring-1 ring-black/20"
                  style={logoWellStyle}
                >
                  <img
                    src={match.opponentLogoUrl}
                    alt={match.opponent}
                    className={cn(logoImageClassName, 'p-0.5')}
                  />
                </span>
              ) : null}
              <span className="truncate text-sm font-bold">{match.opponent || 'TBD'}</span>
            </span>
            <span className="text-right text-[11px] font-semibold text-muted-foreground">
              {formatRelativeMatchDate(match.startsAt, now)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ExternalOverallRecordPanel = ({
  modeBreakdown,
  teamARecord,
  teamBRecord,
}: {
  modeBreakdown: Record<string, unknown>[];
  teamARecord: TeamRecord;
  teamBRecord: TeamRecord;
}) => (
  <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <p className="metric-label">Overall Record</p>
      <h2 className="mt-1 text-lg font-bold">현재 제공 범위 기준 전적</h2>
    </div>
    <div className="grid gap-px bg-border/60 lg:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)]">
      <RecordTeamCard align="left" record={teamARecord} />
      <div className="flex items-center justify-center bg-[hsl(var(--surface-2))] px-4 py-4">
        <Badge variant="outline" className="bg-card font-black">
          vs
        </Badge>
      </div>
      <RecordTeamCard align="right" record={teamBRecord} />
    </div>
    {modeBreakdown.length > 0 ? (
      <div className="border-t border-border/60 bg-card px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="metric-label">Mode Breakdown</p>
            <h3 className="mt-1 text-base font-bold">모드별 기록</h3>
          </div>
          <Badge variant="outline" className="bg-transparent">
            {modeBreakdown.length.toLocaleString('ko-KR')}개
          </Badge>
        </div>
        <div className="mt-3 grid gap-2">
          {modeBreakdown.map((mode, index) => (
            <div
              key={`${String(mode.mode ?? mode.name ?? index)}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2"
            >
              <span className="truncate text-sm font-black">
                {String(mode.mode ?? mode.name ?? '모드')}
              </span>
              <span className="text-sm font-bold text-muted-foreground">
                {String(mode.summary ?? mode.record ?? '-')}
              </span>
            </div>
          ))}
        </div>
      </div>
    ) : null}
  </section>
);

const RecordTeamCard = ({ align, record }: { align: 'left' | 'right'; record: TeamRecord }) => (
  <div className={cn('min-w-0 bg-card p-4', align === 'right' && 'lg:text-right')}>
    <p className="metric-label">{record.team || 'TBD'}</p>
    <p className="mt-2 text-3xl font-black">
      {record.winRate === null ? '--' : `${record.winRate}%`}
    </p>
    <p className="mt-1 text-sm font-bold text-muted-foreground">
      {record.wins.toLocaleString('ko-KR')}W {record.losses.toLocaleString('ko-KR')}L ·{' '}
      {record.played.toLocaleString('ko-KR')} played
    </p>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/70">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${record.winRate ?? 0}%` }}
      />
    </div>
  </div>
);

export { ExternalEsportsMatchPage };
