import { Clipboard, ImagePlus, Loader2, Pencil, Plus, Trash2, Wand2, X } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useCreateMatch, useDeleteMatch, useMatches, useUpdateMatch } from '@/hooks/useMatches';
import { usePlayerAccounts } from '@/hooks/usePlayerAccounts';
import { useUserSettings } from '@/hooks/useUserSettings';
import { getMapLabel, getModeLabel, getResultLabel } from '@/data/matchOptions';
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
      label: '오늘 경기',
      value: String(matches.length),
    },
    {
      detail: winRate === null ? '승패 데이터 없음' : '무승부 제외',
      label: '승률',
      value: winRate === null ? '--' : `${winRate}%`,
    },
    {
      detail: streak ? (streak.result === 'win' ? '연승 중' : '연패 중') : '세션 시작 전',
      label: '현재 흐름',
      value: streak ? `${streak.count}${streak.result === 'win' ? 'W' : 'L'}` : '--',
    },
  ];
};

const HomePage = () => {
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entrySource, setEntrySource] = useState<MatchCreateInput['source']>('manual');
  const [toolsOpen, setToolsOpen] = useState(false);
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
  const summaryMetrics = useMemo(() => getSummaryMetrics(todayMatches), [todayMatches]);
  const activePlayerAccounts = useMemo(
    () => playerAccounts.filter((account) => account.isActive),
    [playerAccounts],
  );
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
    setToolsOpen(false);
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
      setToolsOpen(false);
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
    setToolsOpen(false);
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
    <div className="page-stack" onPaste={handlePaste}>
      <PageHeader
        eyebrow="오늘"
        title="경기 기록"
        actions={
          <Button
            variant="outline"
            className="bg-transparent"
            type="button"
            onClick={() => setToolsOpen(true)}
          >
            <Plus className="h-4 w-4" />
            상세/이미지
          </Button>
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
        <div className="metric-strip sm:grid-cols-3 sm:divide-x sm:divide-border/70">
          {summaryMetrics.map((metric) => (
            <div
              key={metric.label}
              className="flex min-h-[74px] items-end justify-between gap-3 border-b border-border/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:px-5 sm:py-4"
            >
              <div className="min-w-0">
                <p className="metric-label">{metric.label}</p>
                <div className="mt-2 flex min-w-0 items-baseline gap-2">
                  <p className="text-2xl font-bold leading-none">{metric.value}</p>
                  <p className="truncate text-xs font-semibold text-muted-foreground">
                    {metric.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="section-pad">
          <QuickMatchEntry
            accounts={activePlayerAccounts}
            defaultSettings={userSettings}
            isSubmitting={createMatchMutation.isPending}
            onSubmit={handleCreateMatch}
          />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="metric-label">세션</p>
              <h2 className="mt-1 text-lg font-bold tracking-normal">오늘 세션</h2>
            </div>
            <Badge variant="secondary">{todayMatches.length} 경기</Badge>
          </div>
          <div className="grid grid-cols-6 gap-2 lg:grid-cols-3">
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
        </div>

        <div className="min-w-0">
          <div className="mb-2 hidden items-center justify-between gap-3 lg:flex">
            <p className="metric-label">최근 기록</p>
            <span className="text-xs font-semibold text-muted-foreground">
              {formatTime(sortedTodayMatches[0]?.playedAt)}
            </span>
          </div>
          {isLoading ? (
            <TodayMatchRowsSkeleton />
          ) : todayMatches.length > 0 ? (
            <div className="subpanel">
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
                      {getPlayerAccountLabel(accountById.get(match.accountId ?? ''))}
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
            <div className="subpanel">
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

      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-2xl flex-col gap-0 p-0 sm:h-[680px] sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/70 bg-card px-4 py-4 pr-12 sm:px-5">
            <DialogTitle>보조 입력</DialogTitle>
            <DialogDescription>상세 기록과 이미지 분석은 필요할 때만 사용합니다.</DialogDescription>
          </DialogHeader>

          <div
            className="flex min-h-0 flex-1 flex-col p-4 sm:p-5"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-lg border border-border/70 bg-card p-4 text-left transition-colors hover:bg-secondary"
                onClick={openDirectEntry}
              >
                <p className="metric-label">수기</p>
                <p className="mt-2 text-base font-bold">상세 입력</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">
                  계정, 시간, 영웅까지 수정합니다.
                </p>
              </button>

              <button
                type="button"
                className="rounded-lg border border-border/70 bg-card p-4 text-left transition-colors hover:bg-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <p className="metric-label">이미지</p>
                <p className="mt-2 text-base font-bold">스크린샷 선택</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">
                  붙여넣기, 드롭, 파일 선택을 지원합니다.
                </p>
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/70 bg-card p-3">
              {screenshotPreview ? (
                <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="aspect-video overflow-hidden rounded-md bg-secondary">
                    <img
                      alt={screenshotPreview.name}
                      className="h-full w-full object-cover"
                      src={screenshotPreview.imageUrl}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="metric-label">선택된 이미지</p>
                        <p className="mt-2 truncate text-sm font-bold">{screenshotPreview.name}</p>
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

                    {visionProgress ? (
                      <div className="mt-3 rounded-md border border-border/70 bg-background p-3">
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
                      <div className="mt-3 rounded-md border border-border/70 bg-background p-3">
                        <p className="metric-label">분석 결과</p>
                        <p className="mt-2 truncate text-sm font-bold">
                          {visionResult.draft.mapId
                            ? getMapLabel(visionResult.draft.mapId)
                            : '맵 확인'}{' '}
                          ·{' '}
                          {visionResult.draft.result
                            ? getResultLabel(visionResult.draft.result)
                            : '결과 확인'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-56 items-center justify-center rounded-md border border-dashed border-border bg-[hsl(var(--surface-2))] text-center">
                  <div>
                    <Clipboard className="mx-auto h-6 w-6 text-primary" />
                    <p className="mt-2 text-sm font-bold">이미지 없음</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      붙여넣거나 파일을 선택하세요.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  disabled={!screenshotPreview || isExtractingVision}
                  onClick={openScreenshotEntry}
                >
                  {isExtractingVision ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  {isExtractingVision ? '분석 중' : visionResult ? '결과 열기' : '이미지 분석'}
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
          </div>
        </DialogContent>
      </Dialog>

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
  <div className="subpanel">
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
