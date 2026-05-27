import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Clock3,
  Crosshair,
  FilePlus2,
  Flag,
  MapIcon,
  Plus,
  ShieldCheck,
  Swords,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchEntryForm } from '@/components/input/MatchEntryForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useCreateMatch, useMatches } from '@/hooks/useMatches';
import { usePlayerAccounts } from '@/hooks/usePlayerAccounts';
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  getHeroLabel,
  getMapLabel,
  getModeLabel,
  getResultLabel,
  queueOptions,
  getOptionLabel,
} from '@/data/matchOptions';
import { groupMatchesBySession } from '@/lib/session';
import { calculateWinRate, getCurrentStreak, getTodayRange } from '@/lib/matchStats';
import type { Match, MatchCreateInput } from '@/types/match';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const emptySessionSlots = Array.from({ length: 6 });

const formatTime = (value?: string) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

const getSummaryMetrics = (matches: Match[]) => {
  const winRate = calculateWinRate(matches);
  const streak = getCurrentStreak(matches);

  return [
    {
      detail: matches.length > 0 ? '오늘 저장됨' : '저장 대기',
      icon: CalendarDays,
      label: '오늘 경기',
      tone: 'text-primary bg-primary/10',
      value: String(matches.length),
    },
    {
      detail: winRate === null ? '승패 데이터 없음' : '무승부 제외',
      icon: TrendingUp,
      label: '승률',
      tone: 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.12)]',
      value: winRate === null ? '--' : `${winRate}%`,
    },
    {
      detail: streak ? (streak.result === 'win' ? '연승 중' : '연패 중') : '세션 시작 전',
      icon: Activity,
      label: '현재 흐름',
      tone: 'text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.14)]',
      value: streak ? `${streak.count}${streak.result === 'win' ? 'W' : 'L'}` : '--',
    },
  ];
};

const pipeline = [
  { label: '캡처', icon: Clipboard },
  { label: '확인', icon: CheckCircle2 },
  { label: '저장', icon: ShieldCheck },
];

const HomePage = () => {
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entrySource, setEntrySource] = useState<MatchCreateInput['source']>('manual');
  const todayRange = useMemo(() => getTodayRange(), []);
  const { data: todayMatches = [], isLoading } = useMatches({
    playedFrom: todayRange.start,
    playedTo: todayRange.end,
  });
  const { data: userSettings } = useUserSettings();
  const { data: playerAccounts = [] } = usePlayerAccounts();
  const createMatchMutation = useCreateMatch();

  const sortedTodayMatches = useMemo(
    () =>
      [...todayMatches].sort(
        (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
      ),
    [todayMatches],
  );
  const latestMatch = sortedTodayMatches[0];
  const todaySessions = useMemo(() => groupMatchesBySession(todayMatches), [todayMatches]);
  const summaryMetrics = useMemo(() => getSummaryMetrics(todayMatches), [todayMatches]);
  const activePlayerAccounts = useMemo(
    () => playerAccounts.filter((account) => account.isActive),
    [playerAccounts],
  );
  const mainAccount = activePlayerAccounts.find((account) => account.isMain);
  const accountById = useMemo(
    () => new Map(playerAccounts.map((account) => [account.id, account])),
    [playerAccounts],
  );

  const reviewFields = latestMatch
    ? [
        {
          label: '계정',
          value: getPlayerAccountLabel(accountById.get(latestMatch.accountId ?? '')),
        },
        { label: '모드', value: getModeLabel(latestMatch.modeId) },
        { label: '맵', value: getMapLabel(latestMatch.mapId) },
        { label: '결과', value: getResultLabel(latestMatch.result) },
        { label: '스코어', value: `${latestMatch.teamScore} : ${latestMatch.enemyScore}` },
        {
          label: '영웅',
          value: latestMatch.myHeroes.map((heroId) => getHeroLabel(heroId)).join(', ') || '-',
        },
      ]
    : [
        { label: '계정', value: '미지정' },
        { label: '모드', value: '미선택' },
        { label: '맵', value: '미선택' },
        { label: '결과', value: '미선택' },
        { label: '스코어', value: '-- : --' },
        { label: '영웅', value: '미선택' },
      ];

  const handleCreateMatch = async (input: MatchCreateInput) => {
    try {
      await createMatchMutation.mutateAsync(input);
      toast({
        description: '오늘 세션에 새 경기가 추가됐습니다.',
        title: '경기 저장 완료',
      });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '경기 저장 실패',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const openDirectEntry = () => {
    setEntrySource('manual');
    setEntryDialogOpen(true);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="오늘"
        title="경기 기록"
        actions={
          <>
            <Button variant="outline" className="hidden sm:inline-flex" disabled>
              <Crosshair className="h-4 w-4" />
              OCR 입력
            </Button>
            <Button type="button" onClick={openDirectEntry}>
              <Plus className="h-4 w-4" />
              직접 입력
            </Button>
          </>
        }
      />

      <section className="workspace-panel overflow-hidden">
        <div className="grid border-b border-border 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid md:grid-cols-3">
            {summaryMetrics.map((metric) => (
              <div
                key={metric.label}
                className="flex min-h-[112px] items-start justify-between gap-4 border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-5"
              >
                <div>
                  <p className="metric-label">{metric.label}</p>
                  <p className="mt-3 text-3xl font-bold leading-none">{metric.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{metric.detail}</p>
                </div>
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${metric.tone}`}
                >
                  <metric.icon className="h-5 w-5" />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border bg-[hsl(var(--surface-2))] p-4 sm:p-5 2xl:border-l 2xl:border-t-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="metric-label">기본값</p>
                <p className="mt-2 text-lg font-bold">
                  {mainAccount ? getPlayerAccountLabel(mainAccount) : '계정 미지정'}
                </p>
              </div>
              <span className="status-chip">
                <span className="status-dot" />
                {getOptionLabel(queueOptions, userSettings?.defaultQueueType ?? 'solo')}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-r border-border p-3">
                <p className="metric-label">계정</p>
                <p className="mt-2 text-sm font-semibold">
                  {mainAccount ? '본계 설정됨' : '설정 필요'}
                </p>
              </div>
              <div className="p-3">
                <p className="metric-label">입력</p>
                <p className="mt-2 text-sm font-semibold">OCR 우선</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-4 sm:p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="metric-label">입력</p>
                <h2 className="mt-2 text-2xl font-bold tracking-normal">새 경기</h2>
              </div>
              <Badge
                variant="outline"
                className="hidden w-fit border-primary/25 bg-primary/5 text-primary sm:inline-flex"
              >
                클립보드 대기
              </Badge>
            </div>

            <div className="field-surface flex min-h-[320px] items-center justify-center p-6 text-center sm:min-h-[380px]">
              <div className="relative z-10 w-full max-w-lg">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border border-primary/20 bg-card text-primary">
                  <Clipboard className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-2xl font-bold tracking-normal">스코어보드 캡처</h3>
                <p className="mt-2 text-sm text-muted-foreground">붙여넣기 대기 중</p>

                <div className="mt-7 grid gap-2 sm:grid-cols-2">
                  <Button size="lg" disabled>
                    <Crosshair className="h-4 w-4" />
                    OCR 입력
                  </Button>
                  <Button size="lg" type="button" variant="outline" onClick={openDirectEntry}>
                    <FilePlus2 className="h-4 w-4" />
                    직접 입력
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid overflow-hidden rounded-lg border border-border sm:grid-cols-3">
              {pipeline.map((item, index) => (
                <div
                  key={item.label}
                  className="flat-row tap-target flex items-center gap-3 p-3 sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">STEP {index + 1}</p>
                    <p className="text-sm font-semibold">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="border-t border-border bg-[hsl(var(--surface-2))] p-4 sm:p-5 2xl:border-l 2xl:border-t-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="metric-label">확인 패널</p>
                <h3 className="mt-2 text-lg font-bold">
                  {latestMatch ? '최근 저장' : '입력 대기'}
                </h3>
              </div>
              <span className="status-chip">
                <span className="status-dot" />
                {latestMatch ? formatTime(latestMatch.playedAt) : 'Idle'}
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
              {reviewFields.map((field) => (
                <div
                  key={field.label}
                  className="flat-row flex items-center justify-between gap-3 p-3"
                >
                  <span className="text-sm font-semibold text-muted-foreground">{field.label}</span>
                  <span className="truncate text-sm font-semibold">{field.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-r border-border p-3">
                <MapIcon className="h-4 w-4 text-primary" />
                <p className="metric-label mt-3">맵</p>
                <p className="mt-1 truncate text-xs font-semibold">
                  {latestMatch ? getMapLabel(latestMatch.mapId) : '-'}
                </p>
              </div>
              <div className="border-r border-border p-3">
                <Flag className="h-4 w-4 text-[hsl(var(--warning))]" />
                <p className="metric-label mt-3">결과</p>
                <p className="mt-1 text-xs font-semibold">
                  {latestMatch ? getResultLabel(latestMatch.result) : '-'}
                </p>
              </div>
              <div className="p-3">
                <Clock3 className="h-4 w-4 text-[hsl(var(--success))]" />
                <p className="metric-label mt-3">세션</p>
                <p className="mt-1 text-xs font-semibold">{todaySessions.length}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="workspace-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
          <div>
            <p className="metric-label">세션</p>
            <h2 className="mt-2 text-lg font-bold tracking-normal">오늘 세션</h2>
          </div>
          <Badge variant="secondary">{todayMatches.length} 경기</Badge>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-3">
            {todayMatches.length > 0
              ? sortedTodayMatches.slice(0, 9).map((match, index) => (
                  <div
                    key={match.id}
                    className={`flex h-14 flex-col items-center justify-center rounded-md border text-xs font-bold ${getResultTone(
                      match.result,
                    )}`}
                  >
                    <span>{index + 1}</span>
                    <span>{getResultLabel(match.result)}</span>
                  </div>
                ))
              : emptySessionSlots.map((_, index) => (
                  <div
                    key={index}
                    className="flex h-14 items-center justify-center rounded-md border border-dashed border-border bg-secondary/40 text-xs font-semibold text-muted-foreground"
                  >
                    {index + 1}
                  </div>
                ))}
          </div>
          {todayMatches.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {sortedTodayMatches.slice(0, 6).map((match) => (
                <div
                  key={match.id}
                  className="flat-row grid gap-3 p-3 sm:grid-cols-[72px_minmax(0,1fr)_80px]"
                >
                  <div className="text-sm font-bold">{formatTime(match.playedAt)}</div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {getMapLabel(match.mapId)} · {getModeLabel(match.modeId)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {getPlayerAccountLabel(accountById.get(match.accountId ?? ''))} ·{' '}
                      {match.myHeroes.map((heroId) => getHeroLabel(heroId)).join(', ')}
                    </p>
                  </div>
                  <div
                    className={`flex h-9 items-center justify-center rounded-md border text-xs font-bold ${getResultTone(
                      match.result,
                    )}`}
                  >
                    {match.teamScore}:{match.enemyScore}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Swords}
              title={isLoading ? '경기 불러오는 중' : '저장된 경기 없음'}
              description={
                isLoading
                  ? 'Supabase에서 오늘 기록을 확인하고 있습니다.'
                  : '첫 경기를 저장해보세요.'
              }
              className="min-h-[180px]"
              action={
                <Button variant="outline" className="bg-transparent" disabled>
                  <Plus className="h-4 w-4" />
                  경기 추가
                </Button>
              }
            />
          )}
        </div>
      </section>

      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-5xl gap-0 p-0 sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border bg-card px-4 py-4 pr-14 sm:px-5 sm:py-5">
            <DialogTitle>경기 입력</DialogTitle>
            <DialogDescription>경기 결과와 플레이 정보</DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain p-4 sm:max-h-[calc(100dvh-9rem)] sm:p-5">
            <MatchEntryForm
              accounts={activePlayerAccounts}
              defaultSettings={userSettings}
              isSubmitting={createMatchMutation.isPending}
              source={entrySource}
              onSaved={() => setEntryDialogOpen(false)}
              onSubmit={handleCreateMatch}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export { HomePage };
