import type { LucideIcon } from 'lucide-react';
import { CalendarClock, Circle, Pencil, Swords, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchDeleteDialog } from '@/components/input/MatchDeleteDialog';
import { MatchEntryDialog } from '@/components/input/MatchEntryDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getHeroLabel, getMapLabel, getModeLabel, getResultLabel } from '@/data/matchOptions';
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
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="기록"
        title="세션"
        actions={<Badge variant="secondary">{matches.length.toLocaleString('ko-KR')} 경기</Badge>}
      />

      <section className="workspace-panel overflow-hidden">
        <div className="grid border-b border-border md:grid-cols-3">
          {metrics.map((metric) => (
            <MetricCell key={metric.label} {...metric} />
          ))}
        </div>

        <div className="grid 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="metric-label">타임라인</p>
                <h2 className="mt-2 text-xl font-bold">세션 타임라인</h2>
              </div>
              <Badge variant="outline" className="bg-transparent">
                {sessions.length} sessions
              </Badge>
            </div>

            {sessions.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                {sessions.map((session) => (
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
              <EmptyState
                icon={CalendarClock}
                title={isLoading ? '세션 불러오는 중' : '세션 없음'}
                description={
                  isLoading
                    ? 'Supabase에서 경기 기록을 확인하고 있습니다.'
                    : '경기를 저장하면 30분 간격 기준으로 자동 그룹핑됩니다.'
                }
                className="min-h-[360px]"
              />
            )}
          </div>

          <aside className="border-t border-border bg-[hsl(var(--surface-2))] p-4 sm:p-5 2xl:border-l 2xl:border-t-0">
            <div className="mb-4">
              <p className="metric-label">요약</p>
              <h3 className="mt-2 text-lg font-bold">최근 세션</h3>
            </div>

            {sessions.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {sessions.slice(0, 8).map((session) => {
                  const summary = summarizeResults(session.matches);

                  return (
                    <div key={session.sessionId} className="flat-row p-3">
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm font-semibold text-muted-foreground">
                저장된 세션이 없습니다.
              </div>
            )}
          </aside>
        </div>
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
  label: string;
  value: string;
}

const MetricCell = ({ detail, icon: Icon, label, value }: MetricCellProps) => (
  <div className="flex min-h-[112px] items-start justify-between gap-4 border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-5">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      <p className="mt-3 truncate text-2xl font-bold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
      <Icon className="h-5 w-5" />
    </div>
  </div>
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
    <article className="grid gap-4 border-b border-border bg-card p-4 last:border-b-0 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div>
        <p className="metric-label">{formatDate(session.startedAt)}</p>
        <h3 className="mt-2 text-lg font-bold">
          {formatTime(session.startedAt)} - {formatTime(session.endedAt)}
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{session.matches.length}경기</Badge>
          <Badge variant="outline" className="bg-transparent">
            {formatDuration(session.startedAt, session.endedAt)}
          </Badge>
        </div>
        <ResultBar summary={summary} className="mt-4" />
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          승률 {formatWinRate(summary.winRate)}
        </p>
      </div>

      <div className="space-y-2">
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

interface MatchRowProps {
  accountLabel: string;
  index: number;
  match: Match;
  onDelete: () => void;
  onEdit: () => void;
}

const MatchRow = ({ accountLabel, index, match, onDelete, onEdit }: MatchRowProps) => (
  <div className="grid gap-3 rounded-md border border-border bg-[hsl(var(--surface-2))] p-3 sm:grid-cols-[56px_minmax(0,1fr)_80px_auto] sm:items-center">
    <div className="flex items-center gap-2 sm:block">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-card text-xs font-bold text-muted-foreground">
        {index + 1}
      </div>
      <p className="text-xs font-semibold text-muted-foreground sm:mt-2">
        {formatTime(match.playedAt)}
      </p>
    </div>

    <div className="min-w-0">
      <p className="truncate text-sm font-bold">
        {getMapLabel(match.mapId)} · {getModeLabel(match.modeId)}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
        {accountLabel} ·{' '}
        {match.myHeroes.map((heroId) => getHeroLabel(heroId)).join(', ') || '영웅 미지정'}
      </p>
    </div>

    <div className="flex items-center justify-between gap-2 sm:block">
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

    <div className="flex justify-end gap-1">
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
