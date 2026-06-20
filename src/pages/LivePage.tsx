import type { LucideIcon } from 'lucide-react';
import { CircleAlert, Eye, MapIcon, MonitorUp, Shuffle, Square, TimerReset } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';

import { SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchModeLabel } from '@/components/match/MatchModeBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMapLabel } from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import {
  liveFrameQualityLabel,
  livePreviewIntervalMs,
  liveStatusLabel,
  type LiveFrameMetrics,
  type LiveStatus,
  useLiveCapture,
} from '@/hooks/useLiveCapture';
import { useMatches } from '@/hooks/useMatches';
import type { LiveSceneSnapshot } from '@/lib/liveFrameRuntime';
import type { LiveVisionAnalysis } from '@/lib/liveVision';
import {
  formatWinRate,
  rankLiveMapChoices,
  type LiveMapChoiceRecommendation,
} from '@/lib/matchStats';
import { cn } from '@/lib/utils';

type LiveMapSelectionCandidate = NonNullable<
  LiveVisionAnalysis['mapSelection']
>['candidates'][number];

const mapSelectionSlotLabel = {
  center: '가운데',
  left: '왼쪽',
  right: '오른쪽',
} satisfies Record<LiveMapSelectionCandidate['slot'], string>;

const isStrongVisualMapSelectionCandidate = (candidate: LiveMapSelectionCandidate) => {
  const visualConfidence = candidate.visualConfidence ?? candidate.confidence;
  const visualMargin = candidate.visualMargin ?? candidate.margin;

  return visualConfidence >= 0.9 && visualMargin >= 0.018 && candidate.confidence >= 0.7;
};

const getReadyMapSelectionIds = (analysis: LiveVisionAnalysis | null | undefined) => {
  if (analysis?.screen.screenType !== 'map_selection' || !analysis.mapSelection) {
    return [];
  }

  const candidateIds = analysis.mapSelection.candidates.map((candidate) => candidate.mapId);
  const uniqueCandidateCount = new Set(candidateIds).size;

  if (candidateIds.length < 3 || uniqueCandidateCount < 3) {
    return [];
  }

  const textMatchedCount = analysis.mapSelection.candidates.filter(
    (candidate) => candidate.textMatched,
  ).length;
  const strongCandidateCount = analysis.mapSelection.candidates.filter(
    isStrongVisualMapSelectionCandidate,
  ).length;

  if (textMatchedCount >= 2 || strongCandidateCount >= 3) {
    return candidateIds;
  }

  if (analysis.mapSelection.confidence >= 0.94 && strongCandidateCount >= 2) {
    return candidateIds;
  }

  return [];
};

const LivePage = () => {
  const {
    drawPreviewToCanvas,
    errorMessage,
    frameMetrics,
    isLiveAvailable,
    sceneSnapshot,
    startCapture,
    status,
    stopCapture,
    visionAnalysis,
  } = useLiveCapture();
  const { data: matches = [], isLoading: isMatchesLoading } = useMatches();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapSelectionIds = useMemo(() => {
    const stableMapCandidateIds = sceneSnapshot.stableMapCandidateIds;

    if (
      sceneSnapshot.phase === 'stable-map-selection' &&
      sceneSnapshot.stableScreenType === 'map_selection' &&
      stableMapCandidateIds.length >= 3 &&
      new Set(stableMapCandidateIds).size >= stableMapCandidateIds.length
    ) {
      return stableMapCandidateIds;
    }

    return getReadyMapSelectionIds(visionAnalysis);
  }, [
    sceneSnapshot.phase,
    sceneSnapshot.stableMapCandidateIds,
    sceneSnapshot.stableScreenType,
    visionAnalysis,
  ]);
  const mapRecommendations = useMemo(
    () =>
      rankLiveMapChoices({
        mapIds: mapSelectionIds,
        matches,
      }),
    [mapSelectionIds, matches],
  );
  const stopLive = useCallback(() => {
    stopCapture('idle');
  }, [stopCapture]);

  const startLive = useCallback(() => {
    void startCapture();
  }, [startCapture]);

  useEffect(() => {
    let previewTimer: number | null = null;

    const draw = () => {
      if (canvasRef.current) {
        drawPreviewToCanvas(canvasRef.current);
      }
    };

    if (isLiveAvailable) {
      draw();
      previewTimer = window.setInterval(draw, livePreviewIntervalMs);
    }

    return () => {
      if (previewTimer !== null) {
        window.clearInterval(previewTimer);
      }
    };
  }, [drawPreviewToCanvas, isLiveAvailable]);

  if (!isLiveAvailable) {
    return (
      <div className="page-stack">
        <PageHeader compact title="LIVE" />

        <section className="workspace-panel overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="section-pad lg:border-r lg:border-border/70">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
                  <MonitorUp className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="metric-label">화면 공유 대기</p>
                  <h2 className="mt-1 text-xl font-bold tracking-normal">
                    오버워치 창을 연결하세요
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    LIVE는 공유된 맵 선택 화면만 분석해서 후보 맵과 추천 순위를 보여줍니다.
                  </p>
                </div>
              </div>

              <div className="mt-6 divide-y divide-border/70 border-y border-border/70">
                <LiveReadinessRow
                  icon={MapIcon}
                  label="맵 선택 추천"
                  status="추천 준비"
                  value="후보 맵을 기준으로 내 승률을 비교"
                />
                <LiveReadinessRow
                  icon={TimerReset}
                  label="실시간 분석"
                  status="적응형"
                  value="화면 변화에 맞춰 필요한 순간에만 정밀 분석"
                />
              </div>
            </div>

            <aside className="section-pad bg-[hsl(var(--surface-2))]">
              <p className="metric-label">시작</p>
              <Button
                type="button"
                className="mt-3 hidden w-full xl:inline-flex"
                disabled={status === 'starting' || status === 'unsupported'}
                onClick={startLive}
              >
                <MonitorUp className="h-4 w-4" />
                {status === 'starting'
                  ? '연결 중'
                  : status === 'error'
                    ? '다시 공유'
                    : status === 'unsupported'
                      ? '지원 안 함'
                      : '화면 공유'}
              </Button>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                모바일에서는 LIVE 입력을 제공하지 않습니다.
              </p>

              {errorMessage ? <LiveErrorNotice message={errorMessage} /> : null}
            </aside>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        compact
        eyebrow="실시간 맵 추천"
        title="LIVE"
        actions={
          <Button variant="outline" className="bg-transparent" onClick={stopLive}>
            <Square className="h-4 w-4" />
            공유 종료
          </Button>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.45fr)] xl:items-stretch">
        <LivePreviewPanel
          canvasRef={canvasRef}
          frameMetrics={frameMetrics}
          sceneSnapshot={sceneSnapshot}
          status={status}
        />

        <LiveDecisionPanel
          frameMetrics={frameMetrics}
          isDataLoading={isMatchesLoading}
          recommendations={mapRecommendations}
          visionAnalysis={visionAnalysis}
        />
      </section>

      <LiveChoiceRail recommendations={mapRecommendations} />
    </div>
  );
};

interface LiveReadinessRowProps {
  icon: LucideIcon;
  label: string;
  status: string;
  value: string;
}

const LiveReadinessRow = ({ icon: Icon, label, status, value }: LiveReadinessRowProps) => (
  <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[36px_minmax(0,1fr)_96px] sm:items-center">
    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{value}</p>
    </div>
    <Badge variant="outline" className="col-start-2 w-fit bg-card sm:col-start-auto sm:ml-auto">
      {status}
    </Badge>
  </div>
);

const LiveErrorNotice = ({ message }: { message: string }) => (
  <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-destructive">
    <div className="flex items-start gap-2">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-bold">화면 공유 실패</p>
        <p className="mt-1 text-xs leading-relaxed">{message}</p>
      </div>
    </div>
  </div>
);

const LivePreviewPanel = ({
  canvasRef,
  frameMetrics,
  sceneSnapshot,
  status,
}: {
  canvasRef: RefObject<HTMLCanvasElement>;
  frameMetrics: LiveFrameMetrics | null;
  sceneSnapshot: LiveSceneSnapshot;
  status: LiveStatus;
}) => (
  <div className="workspace-panel flex h-full flex-col overflow-hidden">
    <div className="section-header flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">입력 화면</p>
        <h2 className="mt-1 truncate text-lg font-bold">공유 화면</h2>
      </div>
      <Badge className="shrink-0 gap-2 border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10">
        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
        LIVE
      </Badge>
    </div>

    <div className="section-pad flex flex-1 flex-col">
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-slate-950 shadow-sm">
        <canvas
          ref={canvasRef}
          className="aspect-video h-full max-h-[70vh] min-h-[320px] w-full bg-slate-950 object-contain"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end bg-gradient-to-b from-slate-950/72 to-transparent px-3 py-3 text-white sm:px-4">
          <div className="flex max-w-full flex-wrap justify-end gap-2">
            <LiveOverlayBadge label="상태" value={liveStatusLabel[status]} />
            <LiveOverlayBadge
              label="품질"
              value={frameMetrics ? liveFrameQualityLabel[frameMetrics.quality] : '대기'}
            />
            <LiveOverlayBadge
              label="정확도"
              value={`${Math.round(sceneSnapshot.confidence * 100)}%`}
            />
          </div>
        </div>
        {!frameMetrics ? (
          <div className="absolute inset-0 flex min-h-[280px] items-center justify-center bg-slate-950 text-center text-white">
            <div>
              <span className="mx-auto block h-3 w-3 animate-pulse rounded-full bg-destructive" />
              <p className="mt-3 text-sm font-bold">프레임 대기 중</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  </div>
);

const LiveDecisionPanel = ({
  frameMetrics,
  isDataLoading,
  recommendations,
  visionAnalysis,
}: {
  frameMetrics: LiveFrameMetrics | null;
  isDataLoading: boolean;
  recommendations: LiveMapChoiceRecommendation[];
  visionAnalysis: LiveVisionAnalysis | null;
}) => {
  const detectedMapSelection = visionAnalysis?.mapSelection;
  const shouldShowDataSkeleton = isDataLoading && Boolean(detectedMapSelection);
  const bestRecommendation = shouldShowDataSkeleton ? undefined : recommendations[0];
  const detectedCandidates = detectedMapSelection?.candidates ?? [];
  const panelTitle = bestRecommendation
    ? '추천 준비 완료'
    : detectedCandidates.length > 0
      ? '후보 확인 중'
      : '맵 선택 대기';

  return (
    <div className="workspace-panel flex h-full flex-col overflow-hidden">
      <div className="section-header">
        <div className="min-w-0">
          <p className="metric-label">추천 판단</p>
          <h2 className="mt-1 truncate text-lg font-bold">{panelTitle}</h2>
        </div>
      </div>

      <div className="section-pad flex flex-1 flex-col space-y-3.5 p-3.5 sm:p-4">
        <DetectedCandidateStrip candidates={detectedCandidates} />

        <div className="h-px bg-border/70" />

        {shouldShowDataSkeleton ? (
          <LiveRecommendationSkeleton />
        ) : bestRecommendation ? (
          <PrimaryRecommendation
            recommendation={bestRecommendation}
            runnerUpRecommendation={recommendations[1]}
          />
        ) : (
          <EmptyRecognitionState hasFrame={Boolean(frameMetrics)} />
        )}
      </div>
    </div>
  );
};

const LiveChoiceRail = ({
  recommendations,
}: {
  recommendations: LiveMapChoiceRecommendation[];
}) => (
  <div className="workspace-panel overflow-hidden">
    <div className="section-header flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">선택지 비교</p>
        <h2 className="mt-1 truncate text-lg font-bold">추천 순위</h2>
      </div>
      <Badge variant="outline" className="shrink-0 bg-transparent">
        {recommendations.length}개
      </Badge>
    </div>
    {recommendations.length > 0 ? (
      <div className="grid gap-px border-t border-border/70 bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
        {recommendations.map((recommendation, index) => (
          <ChoiceTile
            key={recommendation.choiceId}
            recommendation={recommendation}
            rank={index + 1}
          />
        ))}
      </div>
    ) : (
      <div className="border-t border-border/70 p-5 text-sm font-semibold text-muted-foreground">
        맵 선택 후보가 잡히면 이 영역에서 후보와 무작위를 비교합니다.
      </div>
    )}
  </div>
);

const LiveOverlayBadge = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-bold backdrop-blur">
    <span className="text-white/55">{label}</span>
    <span className="truncate text-white">{value}</span>
  </span>
);

const DetectedCandidateStrip = ({
  candidates,
}: {
  candidates: NonNullable<LiveVisionAnalysis['mapSelection']>['candidates'];
}) => (
  <div>
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="metric-label">선택 후보</p>
      <Badge variant="outline" className="bg-transparent">
        {candidates.length}/3
      </Badge>
    </div>
    {candidates.length > 0 ? (
      <div className="overflow-hidden rounded-md border border-border/70 bg-card">
        {candidates.map((candidate) => (
          <DetectedCandidateRow key={candidate.slot} candidate={candidate} />
        ))}
      </div>
    ) : (
      <div className="flex min-h-20 items-center gap-3 rounded-md border border-dashed border-border/80 bg-[hsl(var(--surface-2))] p-3">
        <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm font-semibold text-muted-foreground">
          맵 선택 화면이 안정적으로 잡히면 후보 맵이 표시됩니다.
        </p>
      </div>
    )}
  </div>
);

const DetectedCandidateRow = ({
  candidate,
}: {
  candidate: NonNullable<LiveVisionAnalysis['mapSelection']>['candidates'][number];
}) => {
  const sourceLabel = candidate.textMatched
    ? '글자 인식'
    : candidate.temporalMatched
      ? '이전 선택 유지'
      : '화면 비교';

  return (
    <div className="grid min-w-0 grid-cols-[46px_minmax(0,1fr)_42px] items-center gap-2.5 border-b border-border/70 px-2.5 py-2 last:border-b-0">
      <div className="relative h-8 w-[46px] overflow-hidden rounded bg-slate-950">
        <img
          src={getMapScreenshotPath(candidate.mapId)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{getMapLabel(candidate.mapId)}</p>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">
          {mapSelectionSlotLabel[candidate.slot]} · {sourceLabel}
        </p>
      </div>
      <p className="text-right text-xs font-black tabular-nums">
        {Math.round(candidate.confidence * 100)}%
      </p>
    </div>
  );
};

const PrimaryRecommendation = ({
  recommendation,
  runnerUpRecommendation,
}: {
  recommendation: LiveMapChoiceRecommendation;
  runnerUpRecommendation?: LiveMapChoiceRecommendation;
}) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
    <div className="relative min-h-[160px] overflow-hidden bg-slate-950">
      {recommendation.choiceType === 'map' ? (
        <img
          src={getMapScreenshotPath(recommendation.mapId)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.28),transparent_34%),linear-gradient(135deg,#0f172a,#111827_48%,#020617)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/10" />
      <div className="relative flex min-h-[160px] flex-col justify-end p-3.5 text-white">
        <div className="mb-auto flex items-start justify-between gap-3">
          <Badge className="bg-white text-slate-950 hover:bg-white">BEST</Badge>
          <Badge className="bg-cyan-300 text-slate-950 hover:bg-cyan-300">
            {Math.round(recommendation.recommendationScore)}
          </Badge>
        </div>
        <RecommendationContext className="text-white/70" recommendation={recommendation} />
        <h3 className="mt-1 truncate text-xl font-black">
          {getRecommendationTitle(recommendation)}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-relaxed text-white/72">
          {getRecommendationDetail(recommendation)}
        </p>
      </div>
    </div>
    <RecommendationRationale
      recommendation={recommendation}
      runnerUpRecommendation={runnerUpRecommendation}
    />
  </div>
);

const RecommendationRationale = ({
  recommendation,
  runnerUpRecommendation,
}: {
  recommendation: LiveMapChoiceRecommendation;
  runnerUpRecommendation?: LiveMapChoiceRecommendation;
}) => {
  const scoreGap = runnerUpRecommendation
    ? Math.max(0, recommendation.recommendationScore - runnerUpRecommendation.recommendationScore)
    : null;
  const primaryReason =
    recommendation.choiceType === 'random'
      ? '남은 전장 평균 기준'
      : recommendation.decisive > 0
        ? `${recommendation.wins}승 ${recommendation.losses}패`
        : '기록 없음';
  const secondaryReason =
    recommendation.choiceType === 'random'
      ? `보정 ${recommendation.smoothedWinRate}%`
      : recommendation.decisive > 0
        ? `${recommendation.decisive}경기 · 보정 ${recommendation.smoothedWinRate}%`
        : `전체 승률 보정 ${recommendation.smoothedWinRate}%`;

  return (
    <div className="border-t border-border/70 bg-[hsl(var(--surface-2))] px-3.5 py-2.5">
      <p className="metric-label">판단 근거</p>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground">
        <span className="font-black text-foreground">{primaryReason}</span>
        <span>{secondaryReason}</span>
        {scoreGap !== null && scoreGap >= 0.1 ? <span>2위 +{scoreGap.toFixed(1)}</span> : null}
      </div>
    </div>
  );
};

const EmptyRecognitionState = ({ hasFrame }: { hasFrame: boolean }) => (
  <div className="flex min-h-[168px] items-center gap-3 rounded-lg border border-dashed border-border/80 bg-[hsl(var(--surface-2))] p-4">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
      <MapIcon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="text-sm font-bold">{hasFrame ? '맵 선택 화면 대기 중' : '프레임 대기 중'}</p>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
        후보 맵이 감지되면 추천 결정이 이 영역에 바로 표시됩니다.
      </p>
    </div>
  </div>
);

const LiveRecommendationSkeleton = () => (
  <div className="rounded-lg border border-border/70 p-3.5">
    <div className="flex items-start gap-3">
      <SkeletonBlock className="h-9 w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <SkeletonBlock className="h-4 w-40 max-w-full" />
        <SkeletonBlock className="mt-2 h-3 w-56 max-w-full" />
      </div>
    </div>
  </div>
);

const getRecommendationTitle = (recommendation: LiveMapChoiceRecommendation) =>
  recommendation.choiceType === 'random' ? '무작위 전장' : getMapLabel(recommendation.mapId);

const getRecommendationDetail = (recommendation: LiveMapChoiceRecommendation) =>
  recommendation.choiceType === 'random'
    ? recommendation.reason
    : recommendation.decisive > 0
      ? `${recommendation.wins}승 ${recommendation.losses}패 · ${recommendation.decisive}경기`
      : recommendation.reason;

const RecommendationContext = ({
  className,
  recommendation,
}: {
  className?: string;
  recommendation: LiveMapChoiceRecommendation;
}) =>
  recommendation.choiceType === 'random' ? (
    <span className={cn('text-xs font-bold text-muted-foreground', className)}>
      {recommendation.poolSize}개 전장 풀
    </span>
  ) : (
    <MatchModeLabel
      className={cn('text-xs font-bold text-muted-foreground', className)}
      modeId={recommendation.modeId}
    />
  );

const ChoiceTile = ({
  recommendation,
  rank,
}: {
  recommendation: LiveMapChoiceRecommendation;
  rank: number;
}) => (
  <div className="min-w-0 bg-card p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Badge
          variant={rank === 1 ? 'default' : 'outline'}
          className={cn('mb-2', rank !== 1 && 'bg-transparent')}
        >
          #{rank}
        </Badge>
        <p className="truncate text-sm font-black">{getRecommendationTitle(recommendation)}</p>
        <RecommendationContext className="mt-1" recommendation={recommendation} />
      </div>
      {recommendation.choiceType === 'map' ? (
        <img
          src={getMapScreenshotPath(recommendation.mapId)}
          alt=""
          className="h-11 w-14 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-primary">
          <Shuffle className="h-4 w-4" />
        </div>
      )}
    </div>
    <div className="mt-4 flex items-end justify-between gap-3">
      <p className="min-w-0 text-xs font-semibold leading-relaxed text-muted-foreground">
        {getRecommendationDetail(recommendation)}
      </p>
      <div className="shrink-0 text-right">
        <p className="text-lg font-black tabular-nums">
          {Math.round(recommendation.recommendationScore)}
        </p>
        <p className="text-[10px] font-bold text-muted-foreground">
          {recommendation.choiceType === 'random' ? '보정' : '승률'}
        </p>
      </div>
    </div>
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-border/80">
      <div
        className={cn('h-full rounded-full', rank === 1 ? 'bg-primary' : 'bg-muted-foreground/45')}
        style={{
          width: `${Math.max(
            8,
            Math.min(
              100,
              recommendation.choiceType === 'random'
                ? recommendation.smoothedWinRate
                : (recommendation.winRate ?? recommendation.smoothedWinRate),
            ),
          )}%`,
        }}
      />
    </div>
    <p className="mt-2 text-right text-xs font-black tabular-nums">
      {recommendation.choiceType === 'random'
        ? `${recommendation.smoothedWinRate}%`
        : formatWinRate(recommendation.winRate)}
    </p>
  </div>
);

export { LivePage };
