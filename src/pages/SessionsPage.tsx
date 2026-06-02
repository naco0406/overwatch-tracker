import type { LucideIcon } from 'lucide-react';
import { CalendarClock, Circle, Pencil, Swords, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchDeleteDialog } from '@/components/input/MatchDeleteDialog';
import { MatchEntryDialog } from '@/components/input/MatchEntryDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const getWeekStart = () => {
  const date = new Date();
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - mondayOffset);

  return date.getTime();
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

const SessionsPage = () => {
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Match | null>(null);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
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
  const focusedSession = useMemo(
    () => sessions.find((session) => session.sessionId === focusedSessionId) ?? null,
    [focusedSessionId, sessions],
  );
  const visibleSessions = focusedSession ? [focusedSession] : sessions;
  const longestStreak = useMemo(() => getLongestStreak(matches), [matches]);
  const averageMatches =
    sessions.length === 0
      ? '--'
      : (matches.length / sessions.length).toFixed(matches.length % sessions.length === 0 ? 0 : 1);

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
      icon: CalendarClock,
      label: '이번 주 세션',
      value: weekSessions.length.toLocaleString('ko-KR'),
    },
    {
      detail: '세션당 평균',
      icon: Swords,
      label: '평균 경기 수',
      value: averageMatches,
    },
    {
      detail: longestStreak
        ? longestStreak.result === 'win'
          ? '최장 연승'
          : '최장 연패'
        : '승패 기록 없음',
      icon: Circle,
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
            {isLoading ? '불러오는 중' : `${matches.length.toLocaleString('ko-KR')} 경기`}
          </Badge>
        }
      />

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-4">
        <div className="workspace-panel overflow-hidden">
          <div className="metric-strip grid-cols-3 divide-x divide-border/70">
            {metrics.map((metric) => (
              <MetricCell key={metric.label} {...metric} isLoading={isLoading} />
            ))}
          </div>

          <div className="section-pad">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="metric-label">타임라인</p>
                <h2 className="mt-1 text-xl font-bold">
                  {focusedSession ? formatDate(focusedSession.startedAt) : '세션 흐름'}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {focusedSession ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                    onClick={() => setFocusedSessionId(null)}
                  >
                    전체 보기
                  </Button>
                ) : null}
                <Badge variant="outline" className="w-fit bg-transparent">
                  {visibleSessions.length} sessions
                </Badge>
              </div>
            </div>

            {isLoading ? (
              <SessionTimelineSkeleton />
            ) : visibleSessions.length > 0 ? (
              <div className="subpanel">
                {visibleSessions.map((session) => (
                  <SessionBlock
                    key={session.sessionId}
                    accountById={accountById}
                    session={session}
                    onDeleteMatch={setDeleteTarget}
                    onEditMatch={setEditingMatch}
                  />
                ))}
              </div>
            ) : (
              <SessionTimelineEmpty />
            )}
          </div>
        </div>

        <aside className="workspace-panel overflow-hidden">
          <div className="section-header flex items-center justify-between gap-3">
            <div>
              <p className="metric-label">요약</p>
              <h3 className="mt-1 text-lg font-bold">최근 세션</h3>
            </div>
            {focusedSession ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => setFocusedSessionId(null)}
              >
                전체
              </Button>
            ) : null}
          </div>

          <div className="section-pad">
            {isLoading ? (
              <RecentSessionsSkeleton />
            ) : sessions.length > 0 ? (
              <div className="subpanel">
                {sessions.slice(0, 8).map((session) => {
                  const summary = summarizeResults(session.matches);
                  const selected = session.sessionId === focusedSessionId;

                  return (
                    <button
                      key={session.sessionId}
                      type="button"
                      className={cn(
                        'flat-row w-full p-3 text-left transition-colors hover:bg-secondary/70',
                        selected && 'bg-primary/[0.06]',
                      )}
                      onClick={() => setFocusedSessionId(session.sessionId)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            {formatDate(session.startedAt)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">
                            {formatTime(session.startedAt)} · {session.matches.length}경기
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 bg-transparent">
                          {formatWinRate(summary.winRate)}
                        </Badge>
                      </div>
                      <ResultBar summary={summary} className="mt-3" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="subpanel">
                <div className="flat-row p-3">
                  <InlineEmptyState
                    title="저장된 세션 없음"
                    description="세션 요약이 비어 있습니다."
                  />
                </div>
                <RecentSessionPlaceholder />
              </div>
            )}
          </div>
        </aside>
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
  icon: LucideIcon;
  isLoading?: boolean;
  label: string;
  value: string;
}

const MetricCell = ({ detail, icon: Icon, isLoading = false, label, value }: MetricCellProps) => (
  <div className="metric-cell border-b-0 border-r-0">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      {isLoading ? (
        <>
          <SkeletonBlock className="mt-3 h-7 w-16" />
          <SkeletonBlock className="mt-2 h-3 w-24" />
        </>
      ) : (
        <>
          <p className="mt-2 truncate text-xl font-bold sm:mt-3 sm:text-2xl">{value}</p>
          <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">{detail}</p>
        </>
      )}
    </div>
    <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary sm:flex">
      <Icon className="h-5 w-5" />
    </div>
  </div>
);

const SessionTimelineSkeleton = () => (
  <div className="subpanel">
    {Array.from({ length: 3 }, (_, index) => (
      <article
        key={index}
        className="grid gap-4 border-b border-border/70 bg-card p-4 last:border-b-0 lg:grid-cols-[180px_minmax(0,1fr)]"
      >
        <div>
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-3 h-6 w-32" />
          <div className="mt-3 flex flex-wrap gap-2">
            <SkeletonBlock className="h-6 w-14" />
            <SkeletonBlock className="h-6 w-20" />
          </div>
          <SkeletonBlock className="mt-4 h-2 w-full rounded-full" />
          <SkeletonBlock className="mt-3 h-3 w-16" />
        </div>

        <div className="space-y-2">
          {Array.from({ length: index === 0 ? 3 : 2 }, (_, rowIndex) => (
            <MatchRowSkeleton key={rowIndex} />
          ))}
        </div>
      </article>
    ))}
  </div>
);

const SessionTimelineEmpty = () => (
  <div className="subpanel">
    <article className="grid gap-4 bg-card p-4 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div>
        <p className="metric-label">세션 없음</p>
        <h3 className="mt-2 text-lg font-bold">--:-- - --:--</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">0경기</Badge>
          <Badge variant="outline" className="bg-transparent">
            0분
          </Badge>
        </div>
        <div className="mt-4 h-2 rounded-full bg-secondary" />
        <p className="mt-2 text-xs font-semibold text-muted-foreground">승률 --</p>
      </div>

      <div className="space-y-2">
        <InlineEmptyState
          title="세션 없음"
          description="경기를 저장하면 시간순으로 세션이 생성됩니다."
        />
        <EmptyMatchRowPlaceholder />
        <EmptyMatchRowPlaceholder />
      </div>
    </article>
  </div>
);

const MatchRowSkeleton = () => (
  <div className="grid gap-3 bg-card p-3 sm:grid-cols-[48px_88px_minmax(0,1fr)_88px_auto] sm:items-center">
    <div>
      <SkeletonBlock className="h-8 w-8" />
      <SkeletonBlock className="mt-2 h-3 w-12" />
    </div>
    <SkeletonBlock className="aspect-[16/10] w-full" />
    <div className="min-w-0">
      <SkeletonBlock className="h-4 w-48 max-w-full" />
      <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
    </div>
    <div>
      <SkeletonBlock className="h-8 w-16" />
      <SkeletonBlock className="mt-2 h-4 w-10" />
    </div>
    <div className="flex justify-end gap-1">
      <SkeletonBlock className="h-9 w-9" />
      <SkeletonBlock className="h-9 w-9" />
    </div>
  </div>
);

const EmptyMatchRowPlaceholder = () => (
  <div className="grid gap-3 bg-card p-3 opacity-60 sm:grid-cols-[48px_88px_minmax(0,1fr)_88px_auto] sm:items-center">
    <div>
      <div className="h-8 w-8 rounded-md bg-secondary" />
      <div className="mt-2 h-3 w-12 rounded-md bg-secondary" />
    </div>
    <div className="aspect-[16/10] rounded-md bg-secondary" />
    <div className="min-w-0">
      <div className="h-4 w-48 max-w-full rounded-md bg-secondary" />
      <div className="mt-2 h-3 w-64 max-w-full rounded-md bg-secondary" />
    </div>
    <div>
      <div className="h-8 w-16 rounded-md bg-secondary" />
      <div className="mt-2 h-4 w-10 rounded-md bg-secondary" />
    </div>
    <div className="hidden justify-end gap-1 sm:flex">
      <div className="h-9 w-9 rounded-md bg-secondary" />
      <div className="h-9 w-9 rounded-md bg-secondary" />
    </div>
  </div>
);

const RecentSessionsSkeleton = () => (
  <div className="subpanel">
    {Array.from({ length: 5 }, (_, index) => (
      <div key={index} className="flat-row p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-2 h-3 w-28" />
          </div>
          <SkeletonBlock className="h-6 w-16" />
        </div>
        <SkeletonBlock className="mt-3 h-2 w-full rounded-full" />
      </div>
    ))}
  </div>
);

const RecentSessionPlaceholder = () => (
  <>
    {Array.from({ length: 3 }, (_, index) => (
      <div key={index} className="flat-row p-3 opacity-60">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="h-4 w-24 rounded-md bg-secondary/70" />
            <div className="mt-2 h-3 w-28 rounded-md bg-secondary/70" />
          </div>
          <div className="h-6 w-16 rounded-md bg-secondary/70" />
        </div>
        <div className="mt-3 h-2 rounded-full bg-secondary/70" />
      </div>
    ))}
  </>
);

interface SessionBlockProps {
  accountById: Map<string, PlayerAccount>;
  onDeleteMatch: (match: Match) => void;
  onEditMatch: (match: Match) => void;
  session: MatchSession;
}

const SessionBlock = ({ accountById, onDeleteMatch, onEditMatch, session }: SessionBlockProps) => {
  const summary = summarizeResults(session.matches);

  return (
    <article className="border-b border-border/70 bg-card last:border-b-0">
      <div className="grid gap-4 border-b border-border/70 bg-[hsl(var(--surface-2))] p-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div className="min-w-0">
          <p className="metric-label">{formatDate(session.startedAt)}</p>
          <h3 className="mt-1 text-lg font-bold">
            {formatTime(session.startedAt)} - {formatTime(session.endedAt)}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary">{session.matches.length}경기</Badge>
            <Badge variant="outline" className="bg-transparent">
              {formatDuration(session.startedAt, session.endedAt)}
            </Badge>
            <Badge variant="outline" className="bg-transparent">
              승률 {formatWinRate(summary.winRate)}
            </Badge>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <ResultCount label="승" value={summary.wins} />
            <ResultCount label="패" value={summary.losses} />
            <ResultCount label="무" value={summary.draws} />
          </div>
          <ResultBar summary={summary} className="mt-3" />
        </div>
      </div>

      <div className="divide-y divide-border/70">
        {session.matches.map((match, index) => (
          <MatchRow
            key={match.id}
            accountLabel={getPlayerAccountLabel(accountById.get(match.accountId ?? ''))}
            index={index}
            match={match}
            onDelete={() => onDeleteMatch(match)}
            onEdit={() => onEditMatch(match)}
          />
        ))}
      </div>
    </article>
  );
};

interface ResultCountProps {
  label: string;
  value: number;
}

const ResultCount = ({ label, value }: ResultCountProps) => (
  <div className="rounded-md border border-border/70 bg-card px-2 py-2">
    <p className="metric-label">{label}</p>
    <p className="mt-1 text-sm font-bold">{value}</p>
  </div>
);

interface MatchRowProps {
  accountLabel: string;
  index: number;
  match: Match;
  onDelete: () => void;
  onEdit: () => void;
}

const MatchRow = ({ accountLabel, index, match, onDelete, onEdit }: MatchRowProps) => {
  const heroSummary =
    match.myHeroes.length > 0
      ? match.myHeroes
          .slice(0, 3)
          .map((heroId) => getHeroLabel(heroId))
          .join(', ')
      : '';

  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 bg-card p-3 transition-colors hover:bg-[hsl(var(--surface-2))] sm:grid-cols-[48px_88px_minmax(0,1fr)_88px_auto] sm:items-center">
      <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:block">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs font-bold text-muted-foreground">
          {index + 1}
        </div>
        <p className="text-xs font-semibold text-muted-foreground sm:mt-2">
          {formatTime(match.playedAt)}
        </p>
      </div>

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
          {getMapLabel(match.mapId)} · {getModeLabel(match.modeId)}
        </p>
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {heroSummary ? `${accountLabel} · ${heroSummary}` : accountLabel}
        </p>
      </div>

      <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:block">
        <span
          className={cn(
            'inline-flex h-8 min-w-16 items-center justify-center rounded-md border px-2 text-xs font-bold',
            getResultTone(match.result),
          )}
        >
          {getResultLabel(match.result)}
        </span>
        <p className="text-right text-sm font-bold sm:mt-2">
          {match.teamScore}:{match.enemyScore}
        </p>
      </div>

      <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          aria-label="경기 수정"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 text-destructive hover:text-destructive"
          aria-label="경기 삭제"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

interface ResultBarProps {
  className?: string;
  summary: ReturnType<typeof summarizeResults>;
}

const ResultBar = ({ className, summary }: ResultBarProps) => {
  const total = Math.max(1, summary.total);

  return (
    <div className={cn('flex h-2 overflow-hidden rounded-full bg-secondary', className)}>
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
