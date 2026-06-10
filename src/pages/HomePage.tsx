import {
  Clipboard,
  ImagePlus,
  Loader2,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
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

import { SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { StickyNotesDock } from '@/components/home/StickyNotesDock';
import { MatchDeleteDialog } from '@/components/input/MatchDeleteDialog';
import { MatchEntryDialog } from '@/components/input/MatchEntryDialog';
import { QuickMatchEntry } from '@/components/input/QuickMatchEntry';
import { MatchRoleLabel } from '@/components/match/MatchRoleBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useCreateMatch, useDeleteMatch, useMatches, useUpdateMatch } from '@/hooks/useMatches';
import { usePlayerAccounts } from '@/hooks/usePlayerAccounts';
import { useUserSettings } from '@/hooks/useUserSettings';
import { getMapLabel, getModeLabel, getResultLabel } from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import { activeSessionStorageKey } from '@/lib/clientSessionState';
import { calculateWinRate, compareMatchesByTimelineDesc, getCurrentStreak } from '@/lib/matchStats';
import { createSessionId, groupMatchesBySession, shouldReuseSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  extractMatchFromScreenshot,
  type VisionExtractionProgress,
  type VisionExtractionResult,
} from '@/lib/visionExtraction';
import type { Match, MatchCreateInput } from '@/types/match';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const recentPreviewCount = 4;
const sessionTimelineCount = 8;
const recentPreviewRows = Array.from({ length: recentPreviewCount });
const sessionTimelineSkeletonItems = Array.from({ length: sessionTimelineCount });
const sessionIdStartedAtPattern = /^session_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_/;

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

const getSessionIdStartedAt = (sessionId: string) => {
  const parts = sessionId.match(sessionIdStartedAtPattern);

  if (!parts) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = parts;

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
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

const getSummaryMetrics = (matches: Match[], isManualSessionActive: boolean) => {
  const winRate = calculateWinRate(matches);
  const streak = getCurrentStreak(matches);

  return [
    {
      detail:
        matches.length > 0
          ? '현재 세션'
          : isManualSessionActive
            ? '수동 세션 진행중'
            : '새 세션 대기',
      label: '세션 경기',
      value: String(matches.length),
    },
    {
      detail: winRate === null ? '승패 데이터 없음' : '무승부 제외',
      label: '승률',
      value: winRate === null ? '--' : `${winRate}%`,
    },
    {
      detail: streak ? (streak.result === 'win' ? '연승 중' : '연패 중') : '흐름 없음',
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
  const [stickyNotesDesktopOpen, setStickyNotesDesktopOpen] = useState(false);
  const [manualSessionId, setManualSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem(activeSessionStorageKey);
  });
  const [pendingSessionDecision, setPendingSessionDecision] = useState<{
    input: MatchCreateInput;
    previousEndedAt: string;
    previousSessionId: string;
    source: 'active' | 'latest';
  } | null>(null);
  const [quickEntryResetKey, setQuickEntryResetKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: matches = [], isLoading: isMatchesLoading } = useMatches();
  const { data: userSettings, isLoading: isSettingsLoading } = useUserSettings();
  const { data: playerAccounts = [], isLoading: isAccountsLoading } = usePlayerAccounts();
  const createMatchMutation = useCreateMatch();
  const updateMatchMutation = useUpdateMatch();
  const deleteMatchMutation = useDeleteMatch();
  const isHomeDataLoading = isMatchesLoading || isAccountsLoading || isSettingsLoading;
  const sessions = useMemo(() => groupMatchesBySession(matches), [matches]);
  const activeSession = useMemo(() => {
    if (manualSessionId) {
      return sessions.find((session) => session.sessionId === manualSessionId) ?? null;
    }

    const latestSession = sessions[0];

    if (!latestSession) {
      return null;
    }

    return shouldReuseSession(latestSession.endedAt, new Date()) ? latestSession : null;
  }, [manualSessionId, sessions]);
  const sessionMatches = useMemo(() => activeSession?.matches ?? [], [activeSession]);

  const sortedSessionMatches = useMemo(
    () => [...sessionMatches].sort(compareMatchesByTimelineDesc),
    [sessionMatches],
  );
  const sessionFlowMatches = useMemo(
    () => sortedSessionMatches.slice(0, sessionTimelineCount).reverse(),
    [sortedSessionMatches],
  );
  const summaryMetrics = useMemo(
    () => getSummaryMetrics(sessionMatches, Boolean(manualSessionId)),
    [manualSessionId, sessionMatches],
  );
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

  const setActiveManualSession = (sessionId: string | null) => {
    setManualSessionId(sessionId);

    if (sessionId) {
      window.localStorage.setItem(activeSessionStorageKey, sessionId);
      return;
    }

    window.localStorage.removeItem(activeSessionStorageKey);
  };

  const saveMatch = async (input: MatchCreateInput) => {
    try {
      await createMatchMutation.mutateAsync(input);
      setScreenshotPreview(null);
      setVisionProgress(null);
      setVisionResult(null);
      toast({
        description: '이번 세션에 새 경기가 추가됐습니다.',
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

  const handleCreateMatch = async (input: MatchCreateInput) => {
    const playedAt = input.playedAt ?? new Date().toISOString();
    const manualSession = manualSessionId
      ? sessions.find((session) => session.sessionId === manualSessionId)
      : null;
    const manualSessionStartedAt = manualSessionId ? getSessionIdStartedAt(manualSessionId) : null;
    const latestSession = sessions[0];

    if (manualSessionId && manualSession && !shouldReuseSession(manualSession.endedAt, playedAt)) {
      setPendingSessionDecision({
        input,
        previousEndedAt: manualSession.endedAt,
        previousSessionId: manualSessionId,
        source: 'active',
      });
      return false;
    }

    if (
      manualSessionId &&
      !manualSession &&
      manualSessionStartedAt &&
      !shouldReuseSession(manualSessionStartedAt, playedAt)
    ) {
      setPendingSessionDecision({
        input,
        previousEndedAt: manualSessionStartedAt.toISOString(),
        previousSessionId: manualSessionId,
        source: 'active',
      });
      return false;
    }

    if (manualSessionId) {
      await saveMatch({
        ...input,
        sessionId: manualSessionId,
      });
      return;
    }

    if (latestSession && !shouldReuseSession(latestSession.endedAt, playedAt)) {
      setPendingSessionDecision({
        input,
        previousEndedAt: latestSession.endedAt,
        previousSessionId: latestSession.sessionId,
        source: 'latest',
      });
      return false;
    }

    await saveMatch(input);
  };

  const handleStartSession = () => {
    const latestSession = sessions[0];
    const sessionId =
      latestSession && shouldReuseSession(latestSession.endedAt, new Date())
        ? latestSession.sessionId
        : createSessionId();

    setActiveManualSession(sessionId);
    toast({
      description:
        latestSession?.sessionId === sessionId
          ? '최근 세션을 이어서 기록합니다.'
          : '새 세션으로 기록을 시작합니다.',
      title: '세션 시작',
    });
  };

  const handleStopSession = () => {
    setActiveManualSession(null);
    toast({
      description: '다음 기록부터는 시간 간격 기준으로 세션을 판단합니다.',
      title: '세션 종료',
    });
  };

  const savePendingSessionDecision = async (mode: 'continue' | 'new') => {
    if (!pendingSessionDecision) {
      return;
    }

    const input = pendingSessionDecision.input;
    const nextSessionId =
      mode === 'continue'
        ? pendingSessionDecision.previousSessionId
        : createSessionId(input.playedAt ?? new Date());

    await saveMatch({
      ...input,
      sessionId: nextSessionId,
    });
    setActiveManualSession(nextSessionId);
    setPendingSessionDecision(null);
    setQuickEntryResetKey((value) => value + 1);
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
      <div
        className={cn(
          'page-stack min-w-0 transition-[padding-right] duration-300 ease-out',
          stickyNotesDesktopOpen ? 'xl:pr-[400px]' : 'xl:pr-12',
        )}
      >
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
          <div className="metric-strip grid-cols-3 divide-x divide-border/70">
            {summaryMetrics.map((metric) => (
              <div
                key={metric.label}
                className="flex min-h-[68px] items-end justify-between gap-2 px-3 py-3 sm:min-h-[74px] sm:px-5 sm:py-4"
              >
                <div className="min-w-0">
                  <p className="metric-label">{metric.label}</p>
                  {isHomeDataLoading ? (
                    <div className="mt-2 min-w-0 sm:flex sm:items-baseline sm:gap-2">
                      <SkeletonBlock className="h-6 w-14 sm:h-7" />
                      <SkeletonBlock className="mt-2 h-3 w-20 sm:mt-0" />
                    </div>
                  ) : (
                    <div className="mt-2 min-w-0 sm:flex sm:items-baseline sm:gap-2">
                      <p className="truncate text-xl font-bold leading-none sm:text-2xl">
                        {metric.value}
                      </p>
                      <p className="mt-1 truncate text-[10px] font-semibold text-muted-foreground sm:mt-0 sm:text-xs">
                        {metric.detail}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="section-pad">
            <QuickMatchEntry
              key={quickEntryResetKey}
              accounts={activePlayerAccounts}
              defaultSettings={userSettings}
              isHydrating={isHomeDataLoading}
              isSubmitting={createMatchMutation.isPending}
              matches={matches}
              onSubmit={handleCreateMatch}
            />
          </div>
        </section>

        <section className="workspace-panel overflow-hidden">
          <div className="section-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="metric-label">세션</p>
              <h2 className="mt-1 truncate text-lg font-bold tracking-normal">이번 세션</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isHomeDataLoading ? (
                <SkeletonBlock className="h-6 w-20" />
              ) : (
                <Badge variant={manualSessionId ? 'default' : 'secondary'}>
                  {manualSessionId ? '진행중' : `${sessionMatches.length} 경기`}
                </Badge>
              )}
              <Button
                type="button"
                size="sm"
                variant={manualSessionId ? 'outline' : 'default'}
                className={manualSessionId ? 'bg-transparent' : ''}
                disabled={isHomeDataLoading}
                onClick={manualSessionId ? handleStopSession : handleStartSession}
              >
                {manualSessionId ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {manualSessionId ? '종료' : '시작'}
              </Button>
            </div>
          </div>

          {isHomeDataLoading ? (
            <SessionStripSkeleton />
          ) : (
            <div>
              <div className="border-b border-border/70 px-3.5 py-3 sm:px-5">
                {sessionMatches.length > 0 ? (
                  <SessionTimeline matches={sessionFlowMatches} />
                ) : (
                  <div className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-dashed border-border/80 bg-[hsl(var(--surface-2))] px-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">새 세션 대기</p>
                      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                        빠른 기록을 저장하면 이곳에 흐름이 쌓입니다.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {sessionMatches.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {sortedSessionMatches.slice(0, recentPreviewCount).map((match) => (
                    <RecentMatchRow
                      key={match.id}
                      accountLabel={getPlayerAccountLabel(accountById.get(match.accountId ?? ''))}
                      match={match}
                      onDelete={() => setDeleteTarget(match)}
                      onEdit={() => openEditEntry(match)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
      <StickyNotesDock onDesktopOpenChange={setStickyNotesDesktopOpen} />

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

      <Dialog
        open={Boolean(pendingSessionDecision)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSessionDecision(null);
          }
        }}
      >
        <DialogContent className="gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/70 px-4 py-4 pr-12 sm:px-5">
            <DialogTitle>세션을 이어서 저장할까요?</DialogTitle>
            <DialogDescription>
              마지막 경기와 6시간 이상 차이가 납니다. 이전 세션에 이어 넣거나 새 세션으로 저장할 수
              있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <div className="rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3">
              <p className="metric-label">
                {pendingSessionDecision?.source === 'active' ? '켜져 있던 세션' : '최근 세션'}
              </p>
              <p className="mt-2 text-sm font-bold">
                마지막 경기 {formatTime(pendingSessionDecision?.previousEndedAt)}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                게임 종료를 깜빡했거나 늦게 입력하는 기록이면 이어서 저장하세요.
              </p>
            </div>
          </div>
          <DialogFooter className="grid gap-2 border-t border-border/70 px-4 py-4 sm:grid-cols-2 sm:px-5">
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              disabled={createMatchMutation.isPending}
              onClick={() => void savePendingSessionDecision('new')}
            >
              새 세션
            </Button>
            <Button
              type="button"
              disabled={createMatchMutation.isPending}
              onClick={() => void savePendingSessionDecision('continue')}
            >
              이전 세션에 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface RecentMatchRowProps {
  accountLabel: string;
  match: Match;
  onDelete: () => void;
  onEdit: () => void;
}

const recentMatchRowClassName =
  'grid min-h-[68px] grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:grid-cols-[56px_72px_minmax(0,1fr)_88px_80px] sm:px-5';

const RecentMatchRow = ({ accountLabel, match, onDelete, onEdit }: RecentMatchRowProps) => (
  <div className={recentMatchRowClassName}>
    <div className="h-10 w-14 overflow-hidden rounded-md bg-secondary">
      <img
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        src={getMapScreenshotPath(match.mapId)}
      />
    </div>
    <div className="hidden text-sm font-bold tabular-nums sm:block">
      {formatTime(match.playedAt)}
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">
        {getMapLabel(match.mapId)} · {getModeLabel(match.modeId)}
      </p>
      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="sm:hidden">
          {formatTime(match.playedAt)} · {getResultLabel(match.result)} ·{' '}
        </span>
        <span className="truncate">{accountLabel}</span>
        <span className="shrink-0">·</span>
        <MatchRoleLabel className="shrink-0" role={match.matchRole} />
      </p>
    </div>
    <div
      className={`hidden h-9 items-center justify-center rounded-md border text-xs font-bold sm:flex ${getResultTone(
        match.result,
      )}`}
    >
      {match.teamScore}:{match.enemyScore}
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

const SessionTimeline = ({ matches }: { matches: Match[] }) => (
  <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1">
    {matches.map((match, index) => (
      <SessionTimelineItem key={match.id} index={index + 1} match={match} />
    ))}
  </div>
);

const SessionTimelineItem = ({ index, match }: { index: number; match: Match }) => (
  <div
    className={`grid h-12 min-w-[128px] shrink-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-2 rounded-md border px-2.5 ${getResultTone(
      match.result,
    )}`}
  >
    <span className="flex h-6 w-6 items-center justify-center rounded bg-background/70 text-[11px] font-black tabular-nums">
      {index}
    </span>
    <div className="min-w-0">
      <p className="truncate text-xs font-bold">{getMapLabel(match.mapId)}</p>
      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-semibold opacity-75">
        <span className="truncate">
          {match.teamScore}:{match.enemyScore} · {getResultLabel(match.result)}
        </span>
        <span className="shrink-0">·</span>
        <MatchRoleLabel className="shrink-0 gap-1" role={match.matchRole} />
      </p>
    </div>
  </div>
);

const SessionStripSkeleton = () => (
  <div>
    <div className="border-b border-border/70 px-3.5 py-3 sm:px-5">
      <div className="mobile-scroll flex gap-2 overflow-hidden pb-1">
        {sessionTimelineSkeletonItems.map((_, index) => (
          <SkeletonBlock key={index} className="h-12 min-w-[128px] shrink-0" />
        ))}
      </div>
    </div>
    <TodayMatchRowsSkeleton />
  </div>
);

const TodayMatchRowsSkeleton = () => (
  <div className="divide-y divide-border/70">
    {recentPreviewRows.map((_, index) => (
      <div key={index} className={recentMatchRowClassName}>
        <SkeletonBlock className="h-10 w-14" />
        <SkeletonBlock className="hidden h-5 w-12 sm:block" />
        <div className="min-w-0">
          <SkeletonBlock className="h-4 w-48 max-w-full" />
          <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
        </div>
        <SkeletonBlock className="hidden h-9 w-full sm:block" />
        <div className="flex justify-end gap-1">
          <SkeletonBlock className="h-9 w-9" />
          <SkeletonBlock className="h-9 w-9" />
        </div>
      </div>
    ))}
  </div>
);

export { HomePage };
