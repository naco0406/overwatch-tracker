import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchDeleteDialog } from '@/components/input/MatchDeleteDialog';
import { MatchEntryDialog } from '@/components/input/MatchEntryDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getHeroLabel, getMapLabel, getModeLabel, getResultLabel } from '@/data/matchOptions';
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

const getResultTone = (result: Match['result']) => {
  if (result === 'win') {
    return 'border-primary/25 bg-primary/10 text-primary';
  }

  if (result === 'loss') {
    return 'border-destructive/25 bg-destructive/10 text-destructive';
  }

  return 'border-border bg-secondary text-muted-foreground';
};

const getSessionMapPreview = (session: MatchSession) => {
  const maps = Array.from(new Set(session.matches.map((match) => getMapLabel(match.mapId))));
  const visibleMaps = maps.slice(0, 3).join(', ');

  if (!visibleMaps) {
    return '기록 없음';
  }

  return maps.length > 3 ? `${visibleMaps} 외 ${maps.length - 3}` : visibleMaps;
};

const getSessionSearchText = (session: MatchSession, accountById: Map<string, PlayerAccount>) => {
  const matchText = session.matches
    .map((match) =>
      [
        getMapLabel(match.mapId),
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
  const { data: matches = [], isLoading } = useMatches();
  const { data: playerAccounts = [] } = usePlayerAccounts();
  const { data: userSettings } = useUserSettings();
  const updateMatchMutation = useUpdateMatch();
  const deleteMatchMutation = useDeleteMatch();
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
            {isLoading ? '불러오는 중' : `${sessions.length.toLocaleString('ko-KR')} 세션`}
          </Badge>
        }
      />

      <section className="workspace-panel overflow-hidden">
        <div className="metric-strip grid-cols-3 divide-x divide-border/70">
          {metrics.map((metric) => (
            <MetricCell key={metric.label} {...metric} isLoading={isLoading} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start xl:gap-4">
        <section className="workspace-panel overflow-hidden">
          <div className="section-header flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">인덱스</p>
              <h2 className="mt-1 truncate text-lg font-bold">세션 목록</h2>
            </div>
            <Badge variant="outline" className="shrink-0 bg-transparent">
              {filteredSessions.length.toLocaleString('ko-KR')}
            </Badge>
          </div>

          <div className="section-pad border-y border-border/70 bg-[hsl(var(--surface-2))]">
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
              <div className="mobile-scroll flex gap-1 overflow-x-auto pb-1">
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
          </div>

          {isLoading ? (
            <SessionIndexSkeleton />
          ) : visibleSessions.length > 0 ? (
            <div className="max-h-[640px] overflow-y-auto xl:max-h-[calc(100dvh-310px)]">
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
            </div>
          ) : (
            <div className="section-pad">
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

        <section className="workspace-panel min-w-0 overflow-hidden xl:sticky xl:top-4">
          {isLoading ? (
            <SelectedSessionSkeleton />
          ) : selectedSession ? (
            <SelectedSessionDetail
              accountById={accountById}
              session={selectedSession}
              onDeleteMatch={setDeleteTarget}
              onEditMatch={setEditingMatch}
            />
          ) : (
            <div className="section-pad">
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
  <div className="px-3 py-3 sm:px-5 sm:py-4">
    <p className="metric-label">{label}</p>
    {isLoading ? (
      <>
        <SkeletonBlock className="mt-3 h-7 w-16" />
        <SkeletonBlock className="mt-2 h-3 w-24" />
      </>
    ) : (
      <>
        <p className="mt-2 truncate text-xl font-bold sm:text-2xl">{value}</p>
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
      'h-8 shrink-0 rounded-md border px-2.5 text-xs font-bold transition-[background-color,border-color,color]',
      active
        ? 'border-primary bg-primary text-primary-foreground'
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
      className={cn(
        'grid w-full gap-2 px-3 py-3 text-left transition-colors hover:bg-secondary/70 sm:grid-cols-[minmax(0,1fr)_84px]',
        selected && 'bg-primary/[0.07]',
      )}
      onClick={onSelect}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="truncate text-sm font-bold">{formatDate(session.startedAt)}</p>
          <p className="shrink-0 text-xs font-semibold text-muted-foreground">
            {formatTime(session.startedAt)}-{formatTime(session.endedAt)}
          </p>
        </div>
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {getSessionMapPreview(session)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
        <p className="text-xs font-bold">{session.matches.length}경기</p>
        <p className="mt-0 text-xs font-semibold text-muted-foreground sm:mt-1">
          {formatWinRate(summary.winRate)}
        </p>
      </div>

      <ResultBar summary={summary} className="sm:col-span-2" />
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
    <>
      <div className="section-header border-b border-border/70">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div className="min-w-0">
            <p className="metric-label">선택 세션</p>
            <h2 className="mt-1 truncate text-xl font-bold">{formatDate(session.startedAt)}</h2>
            <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">
              {formatTime(session.startedAt)} - {formatTime(session.endedAt)} ·{' '}
              {formatDuration(session.startedAt, session.endedAt)}
            </p>
          </div>

          <div className="grid grid-cols-4 divide-x divide-border/70 rounded-md border border-border/70 bg-[hsl(var(--surface-2))]">
            <SummaryCell label="경기" value={session.matches.length.toLocaleString('ko-KR')} />
            <SummaryCell label="승" value={summary.wins.toLocaleString('ko-KR')} />
            <SummaryCell label="패" value={summary.losses.toLocaleString('ko-KR')} />
            <SummaryCell label="승률" value={formatWinRate(summary.winRate)} />
          </div>
        </div>
      </div>

      <div className="border-b border-border/70 px-3 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <p className="metric-label">결과 구성</p>
          <p className="text-xs font-semibold text-muted-foreground">
            {summary.wins}W {summary.losses}L {summary.draws}D
          </p>
        </div>
        <ResultBar summary={summary} className="mt-2 h-2.5" />
      </div>

      <div className="section-pad">
        <div className="subpanel hidden md:block">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-[hsl(var(--surface-2))]">
              <tr className="border-b border-border/70">
                <th className="w-14 px-3 py-3 font-semibold text-muted-foreground">#</th>
                <th className="w-20 px-3 py-3 font-semibold text-muted-foreground">시간</th>
                <th className="px-3 py-3 font-semibold text-muted-foreground">전장</th>
                <th className="w-24 px-3 py-3 font-semibold text-muted-foreground">결과</th>
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

        <div className="subpanel md:hidden">
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
    </>
  );
};

interface SummaryCellProps {
  label: string;
  value: string;
}

const SummaryCell = ({ label, value }: SummaryCellProps) => (
  <div className="min-w-0 px-2 py-2 text-center">
    <p className="metric-label">{label}</p>
    <p className="mt-1 truncate text-sm font-bold">{value}</p>
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
    <tr className="border-b border-border/70 last:border-b-0 hover:bg-[hsl(var(--surface-2))]">
      <td className="px-3 py-3 align-middle text-xs font-bold text-muted-foreground">
        {index + 1}
      </td>
      <td className="px-3 py-3 align-middle text-xs font-semibold text-muted-foreground">
        {formatTime(match.playedAt)}
      </td>
      <td className="min-w-0 px-3 py-3 align-middle">
        <div className="grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-3">
          <div className="aspect-[16/10] overflow-hidden rounded-md border border-border/70 bg-secondary">
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
        <span
          className={cn(
            'inline-flex h-8 min-w-16 items-center justify-center rounded-md border px-2 text-xs font-bold',
            getResultTone(match.result),
          )}
        >
          {match.teamScore}:{match.enemyScore}
        </span>
      </td>
      <td className="min-w-0 px-3 py-3 align-middle">
        <p className="truncate text-sm font-semibold">{accountLabel}</p>
        {heroSummary ? (
          <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{heroSummary}</p>
        ) : null}
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex justify-end gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-destructive hover:text-destructive"
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
    <div className="flat-row p-3">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-3">
        <div className="aspect-[16/10] overflow-hidden rounded-md border border-border/70 bg-secondary">
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
          <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
            {formatTime(match.playedAt)} · {getModeLabel(match.modeId)}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
            {heroSummary ? `${accountLabel} · ${heroSummary}` : accountLabel}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex h-8 min-w-14 items-center justify-center rounded-md border px-2 text-xs font-bold',
            getResultTone(match.result),
          )}
        >
          {match.teamScore}:{match.enemyScore}
        </span>
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
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
    <div className="border-t border-border/70 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-muted-foreground">
          {start.toLocaleString('ko-KR')}-{end.toLocaleString('ko-KR')} /{' '}
          {totalCount.toLocaleString('ko-KR')} {itemLabel}
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-transparent"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            이전
          </Button>
          <span className="px-2 text-center text-xs font-bold text-muted-foreground">
            {page} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-transparent"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            다음
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
    <div className="section-header border-b border-border/70">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-3 h-7 w-36" />
          <SkeletonBlock className="mt-2 h-4 w-52" />
        </div>
        <SkeletonBlock className="h-16 w-full" />
      </div>
    </div>
    <div className="section-pad">
      <div className="subpanel">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flat-row grid gap-3 p-3 md:grid-cols-[48px_64px_minmax(0,1fr)_72px_120px_80px]"
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
