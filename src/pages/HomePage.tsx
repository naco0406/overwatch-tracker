import {
  Activity,
  CalendarDays,
  Clipboard,
  Clock3,
  Flag,
  ImagePlus,
  Loader2,
  MapIcon,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Wand2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';

import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchDeleteDialog } from '@/components/input/MatchDeleteDialog';
import { MatchEntryDialog } from '@/components/input/MatchEntryDialog';
import { QuickMatchEntry } from '@/components/input/QuickMatchEntry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useCreateMatch, useDeleteMatch, useMatches, useUpdateMatch } from '@/hooks/useMatches';
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
import {
  extractMatchFromScreenshot,
  type VisionExtractionProgress,
  type VisionExtractionResult,
} from '@/lib/visionExtraction';
import type { Match, MatchCreateInput } from '@/types/match';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const emptySessionSlots = Array.from({ length: 6 });

interface ScreenshotPreview {
  file: File;
  imageUrl: string;
  name: string;
  size: number;
}

const formatTime = (value?: string) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
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

const HomePage = () => {
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entrySource, setEntrySource] = useState<MatchCreateInput['source']>('manual');
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Match | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<ScreenshotPreview | null>(null);
  const [visionProgress, setVisionProgress] = useState<VisionExtractionProgress | null>(null);
  const [visionResult, setVisionResult] = useState<VisionExtractionResult | null>(null);
  const [isExtractingVision, setIsExtractingVision] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const todayRange = useMemo(() => getTodayRange(), []);
  const { data: todayMatches = [], isLoading } = useMatches({
    playedFrom: todayRange.start,
    playedTo: todayRange.end,
  });
  const { data: userSettings } = useUserSettings();
  const { data: playerAccounts = [] } = usePlayerAccounts();
  const createMatchMutation = useCreateMatch();
  const updateMatchMutation = useUpdateMatch();
  const deleteMatchMutation = useDeleteMatch();

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
  useEffect(
    () => () => {
      if (screenshotPreview?.imageUrl) {
        URL.revokeObjectURL(screenshotPreview.imageUrl);
      }
    },
    [screenshotPreview?.imageUrl],
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
          value:
            latestMatch.myHeroes.map((heroId) => getHeroLabel(heroId)).join(', ') || '영웅 미지정',
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
      setScreenshotPreview(null);
      setVisionProgress(null);
      setVisionResult(null);
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

  const setScreenshotFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        description: 'PNG, JPEG, WebP 이미지를 사용할 수 있습니다.',
        title: '이미지 파일이 아닙니다.',
        variant: 'destructive',
      });
      return;
    }

    setScreenshotPreview({
      file,
      imageUrl: URL.createObjectURL(file),
      name: file.name || 'clipboard-image',
      size: file.size,
    });
    setVisionProgress(null);
    setVisionResult(null);
    setEntrySource('mixed');
    setEditingMatch(null);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageFile = Array.from(event.clipboardData.files).find((file) =>
      file.type.startsWith('image/'),
    );

    if (!imageFile) {
      return;
    }

    event.preventDefault();
    setScreenshotFile(imageFile);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const imageFile = Array.from(event.dataTransfer.files).find((file) =>
      file.type.startsWith('image/'),
    );

    if (imageFile) {
      setScreenshotFile(imageFile);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      setScreenshotFile(file);
    }

    event.target.value = '';
  };

  const openDirectEntry = () => {
    setEntrySource('manual');
    setEditingMatch(null);
    setScreenshotPreview(null);
    setVisionProgress(null);
    setVisionResult(null);
    setEntryDialogOpen(true);
  };

  const handleAnalyzeScreenshot = async () => {
    if (!screenshotPreview) {
      openDirectEntry();
      return;
    }

    const analysisStartedAt = performance.now();

    console.info('[Overwatch Vision UI] analyze:start', {
      accountCount: activePlayerAccounts.length,
      file: {
        name: screenshotPreview.file.name,
        size: screenshotPreview.file.size,
        type: screenshotPreview.file.type,
      },
      pipeline: 'ocr-image-matching',
    });
    setIsExtractingVision(true);
    setVisionProgress({
      message: '스크린샷 분석을 준비하는 중',
      stage: 'preparing',
    });

    try {
      const result = await extractMatchFromScreenshot({
        accounts: activePlayerAccounts,
        file: screenshotPreview.file,
        onProgress: setVisionProgress,
      });

      console.info('[Overwatch Vision UI] extract:end', {
        draft: result.draft,
        durationMs: Math.round(performance.now() - analysisStartedAt),
        heroCandidates: result.heroCandidates,
        mapCandidates: result.mapCandidates,
        ocrText: result.ocrText,
        warnings: result.warnings,
      });
      setVisionResult(result);
      setEntrySource('mixed');
      setEditingMatch(null);
      setEntryDialogOpen(true);
      toast({
        description: result.warnings[0] ?? '인식한 값을 입력폼에 채웠습니다. 저장 전 확인하세요.',
        title: '이미지 분석 완료',
      });
    } catch (error) {
      console.error('[Overwatch Vision UI] analyze:error', {
        durationMs: Math.round(performance.now() - analysisStartedAt),
        error,
      });
      toast({
        description:
          error instanceof Error ? error.message : '이미지에서 경기 정보를 추출하지 못했습니다.',
        title: '스크린샷 분석 실패',
        variant: 'destructive',
      });
    } finally {
      console.info('[Overwatch Vision UI] analyze:end', {
        durationMs: Math.round(performance.now() - analysisStartedAt),
      });
      setIsExtractingVision(false);
    }
  };

  const openScreenshotEntry = () => {
    if (screenshotPreview && !visionResult) {
      void handleAnalyzeScreenshot();
      return;
    }

    setEntrySource(screenshotPreview ? 'mixed' : 'manual');
    setEditingMatch(null);
    setEntryDialogOpen(true);
  };

  const openEditEntry = (match: Match) => {
    setEditingMatch(match);
    setEntrySource(match.source);
    setEntryDialogOpen(true);
  };

  const closeEntryDialog = (open: boolean) => {
    setEntryDialogOpen(open);

    if (!open) {
      setEditingMatch(null);
      setEntrySource('manual');
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6" onPaste={handlePaste}>
      <PageHeader
        eyebrow="오늘"
        title="경기 기록"
        actions={
          <>
            <Button
              variant="outline"
              className="hidden bg-transparent sm:inline-flex"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              이미지 선택
            </Button>
            <Button type="button" onClick={openDirectEntry}>
              <Plus className="h-4 w-4" />
              직접 입력
            </Button>
          </>
        }
      />
      <input
        ref={fileInputRef}
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        type="file"
        onChange={handleFileChange}
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
                <p className="mt-2 text-sm font-semibold">수기 우선</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-4 sm:p-5">
            <QuickMatchEntry
              accounts={activePlayerAccounts}
              defaultSettings={userSettings}
              isSubmitting={createMatchMutation.isPending}
              onSubmit={handleCreateMatch}
            />
          </div>

          <aside className="space-y-5 border-t border-border bg-[hsl(var(--surface-2))] p-4 sm:p-5 2xl:border-l 2xl:border-t-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="metric-label">확인 패널</p>
                <h3 className="mt-2 text-lg font-bold">
                  {latestMatch ? '최근 저장' : '입력 대기'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="status-chip">
                  <span className="status-dot" />
                  {latestMatch ? formatTime(latestMatch.playedAt) : 'Idle'}
                </span>
                {latestMatch ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-transparent"
                    onClick={() => openEditEntry(latestMatch)}
                  >
                    <Pencil className="h-4 w-4" />
                    수정
                  </Button>
                ) : null}
              </div>
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

            <div
              className="rounded-lg border border-border bg-card p-3 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/25"
              aria-label="스크린샷 보조 입력"
              tabIndex={0}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="metric-label">보조 입력</p>
                  <h3 className="mt-2 text-base font-bold">이미지 분석</h3>
                </div>
                <span className="status-chip">
                  <Wand2 className="h-3.5 w-3.5" />
                  OCR
                </span>
              </div>

              {screenshotPreview ? (
                <div className="overflow-hidden rounded-lg border border-border bg-[hsl(var(--surface-2))]">
                  <div className="aspect-video bg-secondary">
                    <img
                      alt={screenshotPreview.name}
                      className="h-full w-full object-cover"
                      src={screenshotPreview.imageUrl}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{screenshotPreview.name}</p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {formatFileSize(screenshotPreview.size)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label="이미지 제거"
                      onClick={() => {
                        setScreenshotPreview(null);
                        setVisionProgress(null);
                        setVisionResult(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-[hsl(var(--surface-2))] text-center">
                  <div>
                    <Clipboard className="mx-auto h-6 w-6 text-primary" />
                    <p className="mt-2 text-sm font-bold">스크린샷</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">대기</p>
                  </div>
                </div>
              )}

              {visionProgress ? (
                <div className="mt-3 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-bold">{visionProgress.message}</p>
                    {typeof visionProgress.progress === 'number' ? (
                      <span className="text-xs font-bold text-muted-foreground">
                        {Math.round(visionProgress.progress)}%
                      </span>
                    ) : null}
                  </div>
                  {typeof visionProgress.progress === 'number' ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.max(4, Math.min(100, visionProgress.progress))}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {visionResult ? (
                <div className="mt-3 grid gap-2">
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="metric-label">분석 결과</p>
                    <p className="mt-2 truncate text-sm font-bold">
                      {visionResult.draft.mapId ? getMapLabel(visionResult.draft.mapId) : '맵 확인'}{' '}
                      ·{' '}
                      {visionResult.draft.result
                        ? getResultLabel(visionResult.draft.result)
                        : '결과 확인'}
                    </p>
                  </div>
                  {visionResult.warnings.length > 0 ? (
                    <div className="rounded-md border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.08)] p-3">
                      <p className="text-xs font-semibold leading-5">
                        {visionResult.warnings.slice(0, 1).join(' ')}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                <Button type="button" disabled={isExtractingVision} onClick={openScreenshotEntry}>
                  {isExtractingVision ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : screenshotPreview ? (
                    <Wand2 className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {isExtractingVision
                    ? '분석 중'
                    : screenshotPreview
                      ? visionResult
                        ? '결과 열기'
                        : '이미지 분석'
                      : '상세 입력'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-transparent"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  이미지 선택
                </Button>
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
            {isLoading
              ? emptySessionSlots.map((_, index) => (
                  <SkeletonBlock key={index} className="h-14 rounded-md" />
                ))
              : todayMatches.length > 0
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
          {isLoading ? (
            <TodayMatchRowsSkeleton />
          ) : todayMatches.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {sortedTodayMatches.slice(0, 6).map((match) => (
                <div
                  key={match.id}
                  className="flat-row grid gap-3 p-3 sm:grid-cols-[72px_minmax(0,1fr)_80px_auto]"
                >
                  <div className="text-sm font-bold">{formatTime(match.playedAt)}</div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {getMapLabel(match.mapId)} · {getModeLabel(match.modeId)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {getPlayerAccountLabel(accountById.get(match.accountId ?? ''))} ·{' '}
                      {match.myHeroes.map((heroId) => getHeroLabel(heroId)).join(', ') ||
                        '영웅 미지정'}
                    </p>
                  </div>
                  <div
                    className={`flex h-9 items-center justify-center rounded-md border text-xs font-bold ${getResultTone(
                      match.result,
                    )}`}
                  >
                    {match.teamScore}:{match.enemyScore}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      aria-label="경기 수정"
                      onClick={() => openEditEntry(match)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-destructive hover:text-destructive"
                      aria-label="경기 삭제"
                      onClick={() => setDeleteTarget(match)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flat-row p-3">
                <InlineEmptyState
                  title="저장된 경기 없음"
                  description="오늘 저장된 경기 기록이 없습니다."
                  action={
                    <Button variant="outline" className="bg-transparent" disabled>
                      <Plus className="h-4 w-4" />
                      경기 추가
                    </Button>
                  }
                />
              </div>
              {Array.from({ length: 2 }, (_, index) => (
                <div
                  key={index}
                  className="flat-row grid gap-3 p-3 opacity-55 sm:grid-cols-[72px_minmax(0,1fr)_80px_auto]"
                >
                  <div className="h-9 rounded-md border border-dashed border-border bg-secondary/40" />
                  <div className="min-w-0">
                    <div className="h-4 w-40 rounded-md border border-dashed border-border bg-secondary/40" />
                    <div className="mt-2 h-3 w-56 max-w-full rounded-md border border-dashed border-border bg-secondary/40" />
                  </div>
                  <div className="h-9 rounded-md border border-dashed border-border bg-secondary/40" />
                  <div className="hidden h-9 w-20 rounded-md border border-dashed border-border bg-secondary/40 sm:block" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <MatchEntryDialog
        accounts={editingMatch ? playerAccounts : activePlayerAccounts}
        defaultSettings={userSettings}
        initialDraft={editingMatch ? undefined : visionResult?.draft}
        isSubmitting={createMatchMutation.isPending || updateMatchMutation.isPending}
        match={editingMatch}
        open={entryDialogOpen}
        screenshot={editingMatch ? null : screenshotPreview}
        source={entrySource}
        onOpenChange={closeEntryDialog}
        onSaved={() => closeEntryDialog(false)}
        onSubmit={editingMatch ? handleUpdateMatch : handleCreateMatch}
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

const TodayMatchRowsSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-border bg-card">
    {Array.from({ length: 4 }, (_, index) => (
      <div
        key={index}
        className="flat-row grid gap-3 p-3 sm:grid-cols-[72px_minmax(0,1fr)_80px_auto]"
      >
        <SkeletonBlock className="h-5 w-12" />
        <div className="min-w-0">
          <SkeletonBlock className="h-4 w-48 max-w-full" />
          <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
        </div>
        <SkeletonBlock className="h-9 w-full" />
        <div className="flex gap-1">
          <SkeletonBlock className="h-9 w-9" />
          <SkeletonBlock className="h-9 w-9" />
        </div>
      </div>
    ))}
  </div>
);

export { HomePage };
