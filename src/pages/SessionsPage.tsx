import { ChevronLeft, ChevronRight, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchDeleteDialog } from '@/components/input/MatchDeleteDialog';
import { MatchEntryDialog } from '@/components/input/MatchEntryDialog';
import { MatchRoleBadge, MatchRoleLabel } from '@/components/match/MatchRoleBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getHeroLabel,
  getMapLabel,
  getMatchRoleLabel,
  getModeLabel,
  getResultLabel,
} from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import { toast } from '@/hooks/use-toast';
import { useDeleteMatch, useMatches, useUpdateMatch } from '@/hooks/useMatches';
import { usePlayerAccounts } from '@/hooks/usePlayerAccounts';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatWinRate, getLongestStreak, summarizeResults } from '@/lib/matchStats';
import { groupMatchesBySession, type MatchSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { Match, MatchCreateInput } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const sessionPageSize = 80;

const periodOptions = [
  { label: '전체', value: 'all' },
  { label: '7일', value: '7d' },
  { label: '30일', value: '30d' },
  { label: '90일', value: '90d' },
] as const;

type PeriodFilter = (typeof periodOptions)[number]['value'];

const periodDays = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} satisfies Record<Exclude<PeriodFilter, 'all'>, number>;

const getWeekStart = () => {
  const date = new Date();
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - mondayOffset);

  return date.getTime();
};

const getPeriodStart = (period: PeriodFilter) => {
  if (period === 'all') {
    return null;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - periodDays[period] + 1);

  return start.getTime();
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(new Date(value));

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const formatDuration = (startedAt: string, endedAt: string) => {
  const durationMinutes = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000),
  );

  if (durationMinutes < 60) {
    return `${durationMinutes}분`;
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
};

const getResultTextTone = (result: Match['result']) => {
  if (result === 'win') {
    return 'text-primary';
  }

  if (result === 'loss') {
    return 'text-destructive';
  }

  return 'text-muted-foreground';
};

const getResultRailTone = (result: Match['result']) => {
  if (result === 'win') {
    return 'bg-primary';
  }

  if (result === 'loss') {
    return 'bg-destructive';
  }

  return 'bg-muted-foreground/45';
};

const getSessionMapPreview = (session: MatchSession) => {
  const maps = Array.from(new Set(session.matches.map((match) => getMapLabel(match.mapId))));
  const visibleMaps = maps.slice(0, 3).join(', ');

  if (!visibleMaps) {
    return '기록 없음';
  }

  return maps.length > 3 ? `${visibleMaps} 외 ${maps.length - 3}개` : visibleMaps;
};

const getSessionModePreview = (session: MatchSession) => {
  const modes = Array.from(new Set(session.matches.map((match) => getModeLabel(match.modeId))));
  const visibleModes = modes.slice(0, 2).join(', ');

  if (!visibleModes) {
    return '모드 없음';
  }

  return modes.length > 2 ? `${visibleModes} 외 ${modes.length - 2}개` : visibleModes;
};

const formatResultRecord = (summary: ReturnType<typeof summarizeResults>) => {
  const draws = summary.draws > 0 ? ` ${summary.draws}무` : '';

  return `${summary.wins}승 ${summary.losses}패${draws}`;
};

const getSessionSearchText = (session: MatchSession, accountById: Map<string, PlayerAccount>) => {
  const matchText = session.matches
    .map((match) =>
      [
        getMapLabel(match.mapId),
        getMatchRoleLabel(match.matchRole),
        getModeLabel(match.modeId),
        getResultLabel(match.result),
        `${match.teamScore}:${match.enemyScore}`,
        getPlayerAccountLabel(accountById.get(match.accountId ?? '')),
        match.myHeroes.map((heroId) => getHeroLabel(heroId)).join(' '),
      ].join(' '),
    )
    .join(' ');

  return [
    formatDate(session.startedAt),
    formatTime(session.startedAt),
    formatTime(session.endedAt),
    formatDuration(session.startedAt, session.endedAt),
    matchText,
  ]
    .join(' ')
    .toLowerCase();
};

const SessionsPage = () => {
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Match | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [sessionPage, setSessionPage] = useState(1);
  const { data: matches = [], isLoading: isMatchesLoading } = useMatches();
  const { data: playerAccounts = [], isLoading: isAccountsLoading } = usePlayerAccounts();
  const { data: userSettings } = useUserSettings();
  const updateMatchMutation = useUpdateMatch();
  const deleteMatchMutation = useDeleteMatch();
  const isSessionsLoading = isMatchesLoading || isAccountsLoading;
  const sessions = useMemo(() => groupMatchesBySession(matches), [matches]);
  const accountById = useMemo(
    () => new Map(playerAccounts.map((account) => [account.id, account])),
    [playerAccounts],
  );
  const weekStart = useMemo(() => getWeekStart(), []);
  const weekSessions = useMemo(
    () => sessions.filter((session) => new Date(session.startedAt).getTime() >= weekStart),
    [sessions, weekStart],
  );
  const filteredSessions = useMemo(() => {
    const periodStart = getPeriodStart(periodFilter);
    const query = searchQuery.trim().toLowerCase();

    return sessions.filter((session) => {
      if (periodStart !== null && new Date(session.startedAt).getTime() < periodStart) {
        return false;
      }

      if (query && !getSessionSearchText(session, accountById).includes(query)) {
        return false;
      }

      return true;
    });
  }, [accountById, periodFilter, searchQuery, sessions]);
  const sessionPageCount = Math.max(1, Math.ceil(filteredSessions.length / sessionPageSize));
  const currentSessionPage = Math.min(sessionPage, sessionPageCount);
  const visibleSessions = filteredSessions.slice(
    (currentSessionPage - 1) * sessionPageSize,
    currentSessionPage * sessionPageSize,
  );
  const selectedSession = useMemo(
    () =>
      visibleSessions.find((session) => session.sessionId === selectedSessionId) ??
      visibleSessions[0] ??
      null,
    [selectedSessionId, visibleSessions],
  );
  const longestStreak = useMemo(() => getLongestStreak(matches), [matches]);
  const averageMatches =
    sessions.length === 0
      ? '--'
      : (matches.length / sessions.length).toFixed(matches.length % sessions.length === 0 ? 0 : 1);
  const hasActiveFilters = searchQuery.trim().length > 0 || periodFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setPeriodFilter('all');
    setSessionPage(1);
    setSelectedSessionId(null);
  };

  const selectPeriod = (period: PeriodFilter) => {
    setPeriodFilter(period);
    setSessionPage(1);
    setSelectedSessionId(null);
  };

  const handleUpdateMatch = async (input: MatchCreateInput) => {
    if (!editingMatch) {
      return;
    }

    try {
      await updateMatchMutation.mutateAsync({
        ...input,
        id: editingMatch.id,
      });
      toast({
        description: '저장된 경기 정보를 갱신했습니다.',
        title: '경기 수정 완료',
      });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '경기 수정 실패',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteMatch = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteMatchMutation.mutateAsync(deleteTarget.id);
      toast({
        description: '세션과 통계에서 해당 경기를 제거했습니다.',
        title: '경기 삭제 완료',
      });
      setDeleteTarget(null);
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '경기 삭제 실패',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const metrics = [
    {
      detail: '필터 전',
      label: '전체 세션',
      value: sessions.length.toLocaleString('ko-KR'),
    },
    {
      detail: '월요일 이후',
      label: '이번 주 세션',
      value: weekSessions.length.toLocaleString('ko-KR'),
    },
    {
      detail: '세션당 평균',
      label: '평균 경기 수',
      value: averageMatches,
    },
    {
      detail: longestStreak
        ? longestStreak.result === 'win'
          ? '최장 연승'
          : '최장 연패'
        : '승패 기록 없음',
      label: '최장 흐름',
      value: longestStreak
        ? `${longestStreak.count}${longestStreak.result === 'win' ? 'W' : 'L'}`
        : '--',
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="기록"
        title="세션"
        actions={
          <Badge variant="secondary">
            {isSessionsLoading ? '불러오는 중' : `${sessions.length.toLocaleString('ko-KR')} 세션`}
          </Badge>
        }
      />

      <section className="border-y border-border/70 bg-card">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/70 bg-[hsl(var(--surface-2))] md:grid-cols-4 md:divide-y-0">
          {metrics.map((metric) => (
            <MetricCell key={metric.label} {...metric} isLoading={isSessionsLoading} />
          ))}
        </div>
      </section>

      <section className="grid overflow-hidden border-y border-border/70 bg-card shadow-[0_24px_80px_-64px_hsl(var(--foreground)/0.38)] xl:grid-cols-[392px_minmax(0,1fr)] xl:items-start">
        <section className="min-h-0 border-b border-border/70 xl:flex xl:max-h-[calc(100dvh-252px)] xl:flex-col xl:border-b-0 xl:border-r">
          <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] px-3.5 py-4 sm:px-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="metric-label">탐색</p>
                <h2 className="mt-1 truncate text-xl font-bold">세션 목록</h2>
              </div>
              <div className="text-right">
                <p className="metric-label">표시</p>
                {isSessionsLoading ? (
                  <SkeletonBlock className="mt-2 h-4 w-10 sm:ml-auto" />
                ) : (
                  <p className="mt-1 text-sm font-bold tabular-nums">
                    {filteredSessions.length.toLocaleString('ko-KR')}
                  </p>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 bg-card pl-9"
                placeholder="맵, 계정, 영웅, 결과 검색"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSessionPage(1);
                  setSelectedSessionId(null);
                }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="mobile-scroll flex gap-1.5 overflow-x-auto pb-1">
                {periodOptions.map((period) => (
                  <FilterButton
                    key={period.value}
                    active={periodFilter === period.value}
                    onClick={() => selectPeriod(period.value)}
                  >
                    {period.label}
                  </FilterButton>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 bg-card"
                disabled={!hasActiveFilters}
                onClick={resetFilters}
              >
                <RotateCcw className="h-4 w-4" />
                초기화
              </Button>
            </div>

            {hasActiveFilters ? (
              <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 border-t border-border/70 pt-3 text-xs font-semibold text-muted-foreground">
                {periodFilter !== 'all' ? (
                  <span>
                    {periodOptions.find((period) => period.value === periodFilter)?.label}
                  </span>
                ) : null}
                {searchQuery.trim() ? <span>"{searchQuery.trim()}"</span> : null}
              </div>
            ) : null}

            {!isSessionsLoading && visibleSessions.length > 0 ? (
              <PaginationBar
                itemLabel="세션"
                page={currentSessionPage}
                pageCount={sessionPageCount}
                pageSize={sessionPageSize}
                totalCount={filteredSessions.length}
                visibleCount={visibleSessions.length}
                onPageChange={(page) => {
                  setSessionPage(page);
                  setSelectedSessionId(null);
                }}
              />
            ) : null}
          </div>

          {isSessionsLoading ? (
            <SessionIndexSkeleton />
          ) : visibleSessions.length > 0 ? (
            <>
              <div className="max-h-[440px] min-h-0 overflow-y-auto sm:max-h-[540px] xl:max-h-none xl:flex-1">
                <div className="divide-y divide-border/70">
                  {visibleSessions.map((session) => (
                    <SessionIndexRow
                      key={session.sessionId}
                      selected={session.sessionId === selectedSession?.sessionId}
                      session={session}
                      onSelect={() => setSelectedSessionId(session.sessionId)}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="px-3 py-6 sm:px-5">
              <InlineEmptyState
                title="세션 없음"
                description={
                  hasActiveFilters
                    ? '조건에 맞는 세션이 없습니다.'
                    : '경기를 저장하면 세션이 생성됩니다.'
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" className="bg-transparent" onClick={resetFilters}>
                      <RotateCcw className="h-4 w-4" />
                      초기화
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}
        </section>

        <section className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-252px)] xl:overflow-hidden">
          {isSessionsLoading ? (
            <SelectedSessionSkeleton />
          ) : selectedSession ? (
            <SelectedSessionDetail
              accountById={accountById}
              session={selectedSession}
              onDeleteMatch={setDeleteTarget}
              onEditMatch={setEditingMatch}
            />
          ) : (
            <div className="px-3 py-6 sm:px-5">
              <InlineEmptyState
                title="선택된 세션 없음"
                description="왼쪽에서 세션을 선택하세요."
              />
            </div>
          )}
        </section>
      </section>

      <MatchEntryDialog
        accounts={playerAccounts}
        defaultSettings={userSettings}
        isSubmitting={updateMatchMutation.isPending}
        match={editingMatch}
        open={Boolean(editingMatch)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMatch(null);
          }
        }}
        onSaved={() => setEditingMatch(null)}
        onSubmit={handleUpdateMatch}
      />

      <MatchDeleteDialog
        isDeleting={deleteMatchMutation.isPending}
        match={deleteTarget}
        open={Boolean(deleteTarget)}
        onConfirm={handleDeleteMatch}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
};

interface MetricCellProps {
  detail: string;
  isLoading?: boolean;
  label: string;
  value: string;
}

const MetricCell = ({ detail, isLoading = false, label, value }: MetricCellProps) => (
  <div className="min-w-0 px-3.5 py-3.5 sm:px-5">
    <p className="metric-label">{label}</p>
    {isLoading ? (
      <>
        <SkeletonBlock className="mt-3 h-7 w-16" />
        <SkeletonBlock className="mt-2 h-3 w-24" />
      </>
    ) : (
      <>
        <p className="mt-1 truncate text-base font-bold tabular-nums sm:text-lg">{value}</p>
        <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">{detail}</p>
      </>
    )}
  </div>
);

interface FilterButtonProps {
  active: boolean;
  children: string;
  onClick: () => void;
}

const FilterButton = ({ active, children, onClick }: FilterButtonProps) => (
  <button
    type="button"
    className={cn(
      'h-8 shrink-0 rounded-md border px-3 text-xs font-bold transition-[background-color,border-color,color]',
      active
        ? 'border-primary bg-primary text-primary-foreground shadow-[0_10px_28px_-22px_hsl(var(--primary))]'
        : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
    )}
    onClick={onClick}
  >
    {children}
  </button>
);

interface SessionIndexRowProps {
  onSelect: () => void;
  selected: boolean;
  session: MatchSession;
}

const SessionIndexRow = ({ onSelect, selected, session }: SessionIndexRowProps) => {
  const summary = summarizeResults(session.matches);

  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group grid w-full gap-2 border-l-[3px] border-l-transparent px-3.5 py-3.5 text-left transition-colors hover:bg-[hsl(var(--surface-2))] sm:grid-cols-[minmax(0,1fr)_104px]',
        selected && 'border-l-primary bg-primary/[0.055]',
      )}
      onClick={onSelect}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="truncate text-sm font-bold leading-5">{formatDate(session.startedAt)}</p>
          <p className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
            {formatTime(session.startedAt)}-{formatTime(session.endedAt)}
          </p>
        </div>
        <p className="mt-1.5 truncate text-xs font-semibold text-foreground/75">
          {getSessionMapPreview(session)}
        </p>
        <p className="mt-1 truncate text-[11px] font-semibold text-muted-foreground">
          {getSessionModePreview(session)} · {formatDuration(session.startedAt, session.endedAt)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
        <p className="text-xs font-bold leading-5 tabular-nums">{session.matches.length}경기</p>
        <p className="mt-0 text-xs font-semibold text-muted-foreground sm:mt-1">
          {formatResultRecord(summary)}
        </p>
        <p className="mt-0 text-xs font-bold tabular-nums text-foreground sm:mt-1">
          {formatWinRate(summary.winRate)}
        </p>
      </div>

      <ResultBar summary={summary} className="h-1 sm:col-span-2" />
    </button>
  );
};

interface SelectedSessionDetailProps {
  accountById: Map<string, PlayerAccount>;
  onDeleteMatch: (match: Match) => void;
  onEditMatch: (match: Match) => void;
  session: MatchSession;
}

const SelectedSessionDetail = ({
  accountById,
  onDeleteMatch,
  onEditMatch,
  session,
}: SelectedSessionDetailProps) => {
  const summary = summarizeResults(session.matches);

  return (
    <div className="flex min-h-0 flex-col xl:max-h-[calc(100dvh-252px)]">
      <div className="border-b border-border/70 px-3.5 py-5 sm:px-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 border-l-[3px] border-l-primary pl-3.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="metric-label">선택 세션</p>
              <p className="text-xs font-semibold tabular-nums text-muted-foreground">
                {formatResultRecord(summary)}
              </p>
            </div>
            <h2 className="mt-1 truncate text-2xl font-bold leading-8">
              {formatDate(session.startedAt)}
            </h2>
            <p className="mt-1 truncate text-sm font-semibold tabular-nums text-muted-foreground">
              {formatTime(session.startedAt)} - {formatTime(session.endedAt)} ·{' '}
              {formatDuration(session.startedAt, session.endedAt)}
            </p>
            <p className="mt-2 truncate text-xs font-semibold text-muted-foreground">
              {getSessionMapPreview(session)} · {getSessionModePreview(session)}
            </p>
          </div>

          <div>
            <div className="grid grid-cols-4 divide-x divide-border/70 border-y border-border/70 bg-[hsl(var(--surface-2))]">
              <SummaryCell label="경기" value={session.matches.length.toLocaleString('ko-KR')} />
              <SummaryCell label="승" value={summary.wins.toLocaleString('ko-KR')} />
              <SummaryCell label="패" value={summary.losses.toLocaleString('ko-KR')} />
              <SummaryCell label="승률" value={formatWinRate(summary.winRate)} />
            </div>
            <div className="mt-3.5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="metric-label">결과 구성</p>
                <p className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {summary.wins}W {summary.losses}L {summary.draws}D
                </p>
              </div>
              <ResultBar summary={summary} className="h-2.5" />
            </div>
          </div>
        </div>
      </div>

      <SessionMapTimeline matches={session.matches} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[hsl(var(--surface-2))]">
              <tr className="border-b border-border/70">
                <th className="w-14 px-3 py-3 font-semibold text-muted-foreground">#</th>
                <th className="w-20 px-3 py-3 font-semibold text-muted-foreground">시간</th>
                <th className="px-3 py-3 font-semibold text-muted-foreground">전장</th>
                <th className="w-24 px-3 py-3 font-semibold text-muted-foreground">포지션</th>
                <th className="w-24 px-3 py-3 font-semibold text-muted-foreground">스코어</th>
                <th className="w-36 px-3 py-3 font-semibold text-muted-foreground">계정</th>
                <th className="w-24 px-3 py-3 text-right font-semibold text-muted-foreground">
                  액션
                </th>
              </tr>
            </thead>
            <tbody>
              {session.matches.map((match, index) => (
                <SessionMatchTableRow
                  key={match.id}
                  accountLabel={getPlayerAccountLabel(accountById.get(match.accountId ?? ''))}
                  index={index}
                  match={match}
                  onDelete={() => onDeleteMatch(match)}
                  onEdit={() => onEditMatch(match)}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden">
          {session.matches.map((match, index) => (
            <SessionMatchMobileRow
              key={match.id}
              accountLabel={getPlayerAccountLabel(accountById.get(match.accountId ?? ''))}
              index={index}
              match={match}
              onDelete={() => onDeleteMatch(match)}
              onEdit={() => onEditMatch(match)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface SummaryCellProps {
  label: string;
  value: string;
}

const SummaryCell = ({ label, value }: SummaryCellProps) => (
  <div className="min-w-0 px-2 py-2.5 text-center">
    <p className="metric-label">{label}</p>
    <p className="mt-1 truncate text-sm font-bold tabular-nums">{value}</p>
  </div>
);

interface SessionMapTimelineProps {
  matches: Match[];
}

const SessionMapTimeline = ({ matches }: SessionMapTimelineProps) => (
  <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] px-3.5 py-3.5 sm:px-5">
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <p className="metric-label">전장 흐름</p>
      <p className="text-xs font-semibold tabular-nums text-muted-foreground">
        {matches.length.toLocaleString('ko-KR')}경기
      </p>
    </div>
    <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1">
      {matches.map((match, index) => (
        <div key={match.id} className="w-[98px] shrink-0 sm:w-[112px]">
          <div className="relative aspect-[16/9] overflow-hidden border border-border/60 bg-secondary">
            <img
              alt={getMapLabel(match.mapId)}
              className="h-full w-full object-cover"
              loading="lazy"
              src={getMapScreenshotPath(match.mapId)}
            />
            <span
              className={cn('absolute inset-x-0 top-0 h-0.5', getResultRailTone(match.result))}
            />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1 text-[10px] font-bold tabular-nums text-white">
              <span>{index + 1}</span>
              <span>
                {match.teamScore}:{match.enemyScore}
              </span>
            </div>
          </div>
          <p className="mt-1.5 truncate text-[11px] font-bold">{getMapLabel(match.mapId)}</p>
          <p
            className={cn('mt-0.5 truncate text-[10px] font-bold', getResultTextTone(match.result))}
          >
            {getResultLabel(match.result)}
          </p>
        </div>
      ))}
    </div>
  </div>
);

interface SessionMatchRowProps {
  accountLabel: string;
  index: number;
  match: Match;
  onDelete: () => void;
  onEdit: () => void;
}

const SessionMatchTableRow = ({
  accountLabel,
  index,
  match,
  onDelete,
  onEdit,
}: SessionMatchRowProps) => {
  const heroSummary = getHeroSummary(match);

  return (
    <tr className="border-b border-border/70 transition-colors last:border-b-0 hover:bg-[hsl(var(--surface-2))]">
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-2">
          <span className={cn('h-8 w-0.5 shrink-0', getResultRailTone(match.result))} />
          <span className="text-xs font-bold tabular-nums text-muted-foreground">{index + 1}</span>
        </div>
      </td>
      <td className="px-3 py-3 align-middle text-xs font-semibold tabular-nums text-muted-foreground">
        {formatTime(match.playedAt)}
      </td>
      <td className="min-w-0 px-3 py-3 align-middle">
        <div className="grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-3">
          <div className="aspect-[16/10] overflow-hidden border border-border/60 bg-secondary">
            <img
              alt={getMapLabel(match.mapId)}
              className="h-full w-full object-cover"
              loading="lazy"
              src={getMapScreenshotPath(match.mapId)}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold">{getMapLabel(match.mapId)}</p>
            <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
              {getModeLabel(match.modeId)}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <MatchRoleBadge role={match.matchRole} />
      </td>
      <td className="px-3 py-3 align-middle">
        <p className="text-sm font-bold tabular-nums">
          {match.teamScore}:{match.enemyScore}
        </p>
        <p className={cn('mt-1 text-xs font-bold', getResultTextTone(match.result))}>
          {getResultLabel(match.result)}
        </p>
      </td>
      <td className="min-w-0 px-3 py-3 align-middle">
        <p className="truncate text-sm font-semibold">{accountLabel}</p>
        {heroSummary ? (
          <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{heroSummary}</p>
        ) : null}
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex justify-end gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
};

const SessionMatchMobileRow = ({
  accountLabel,
  index,
  match,
  onDelete,
  onEdit,
}: SessionMatchRowProps) => {
  const heroSummary = getHeroSummary(match);

  return (
    <div className="grid grid-cols-[3px_minmax(0,1fr)] border-b border-border/70 last:border-b-0">
      <span className={cn('block', getResultRailTone(match.result))} />
      <div className="px-3.5 py-3">
        <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-3">
          <div className="aspect-[16/10] overflow-hidden border border-border/60 bg-secondary">
            <img
              alt={getMapLabel(match.mapId)}
              className="h-full w-full object-cover"
              loading="lazy"
              src={getMapScreenshotPath(match.mapId)}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {index + 1}. {getMapLabel(match.mapId)}
            </p>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span className="truncate">
                {formatTime(match.playedAt)} · {getModeLabel(match.modeId)}
              </span>
              <span className="shrink-0">·</span>
              <MatchRoleLabel className="shrink-0" role={match.matchRole} />
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
              {heroSummary ? `${accountLabel} · ${heroSummary}` : accountLabel}
            </p>
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums">
            {match.teamScore}:{match.enemyScore}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p
            className={cn(
              'inline-flex min-w-0 items-center gap-1.5 text-xs font-bold',
              getResultTextTone(match.result),
            )}
          >
            <span className="truncate">{getResultLabel(match.result)}</span>
            <span className="shrink-0">·</span>
            <MatchRoleLabel className="shrink-0" role={match.matchRole} />
          </p>
          <div className="flex shrink-0 justify-end gap-1">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PaginationBarProps {
  itemLabel: string;
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  visibleCount: number;
}

const PaginationBar = ({
  itemLabel,
  onPageChange,
  page,
  pageCount,
  pageSize,
  totalCount,
  visibleCount,
}: PaginationBarProps) => {
  if (totalCount === 0) {
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = start + visibleCount - 1;

  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-semibold tabular-nums text-muted-foreground">
          {start.toLocaleString('ko-KR')}-{end.toLocaleString('ko-KR')} /{' '}
          {totalCount.toLocaleString('ko-KR')} {itemLabel}
        </p>
        <div className="grid shrink-0 grid-cols-[28px_auto_28px] items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-card"
            disabled={page <= 1}
            aria-label="이전 페이지"
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-1 text-center text-xs font-bold tabular-nums text-muted-foreground">
            {page} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-card"
            disabled={page >= pageCount}
            aria-label="다음 페이지"
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const getHeroSummary = (match: Match) =>
  match.myHeroes.length > 0
    ? match.myHeroes
        .slice(0, 3)
        .map((heroId) => getHeroLabel(heroId))
        .join(', ')
    : '';

const SessionIndexSkeleton = () => (
  <div className="divide-y divide-border/70">
    {Array.from({ length: 10 }, (_, index) => (
      <div key={index} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_84px]">
        <div>
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="mt-2 h-3 w-52 max-w-full" />
        </div>
        <div className="sm:text-right">
          <SkeletonBlock className="h-3 w-12 sm:ml-auto" />
          <SkeletonBlock className="mt-2 h-3 w-16 sm:ml-auto" />
        </div>
        <SkeletonBlock className="h-2 rounded-full sm:col-span-2" />
      </div>
    ))}
  </div>
);

const SelectedSessionSkeleton = () => (
  <>
    <div className="border-b border-border/70 px-3 py-3 sm:px-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-3 h-7 w-36" />
          <SkeletonBlock className="mt-2 h-4 w-52" />
        </div>
        <SkeletonBlock className="h-16 w-full" />
      </div>
    </div>
    <div className="divide-y divide-border/70">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="grid gap-3 px-3 py-3 md:grid-cols-[48px_64px_minmax(0,1fr)_72px_120px_80px]"
        >
          <SkeletonBlock className="h-4 w-6" />
          <SkeletonBlock className="h-4 w-12" />
          <div>
            <SkeletonBlock className="h-4 w-44 max-w-full" />
            <SkeletonBlock className="mt-2 h-3 w-28" />
          </div>
          <SkeletonBlock className="h-8 w-16" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-9 w-20" />
        </div>
      ))}
    </div>
  </>
);

interface ResultBarProps {
  className?: string;
  summary: ReturnType<typeof summarizeResults>;
}

const ResultBar = ({ className, summary }: ResultBarProps) => {
  const total = Math.max(1, summary.total);

  return (
    <div className={cn('flex h-1.5 overflow-hidden rounded-full bg-secondary', className)}>
      <div className="bg-primary" style={{ width: `${(summary.wins / total) * 100}%` }} />
      <div className="bg-destructive" style={{ width: `${(summary.losses / total) * 100}%` }} />
      <div
        className="bg-muted-foreground/40"
        style={{ width: `${(summary.draws / total) * 100}%` }}
      />
    </div>
  );
};

export { SessionsPage };
