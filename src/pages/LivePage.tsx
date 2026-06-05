import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  CircleAlert,
  Eye,
  FileCheck2,
  Gauge,
  ListChecks,
  MapIcon,
  MonitorUp,
  Shuffle,
  Square,
  TimerReset,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';

import { SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMapLabel, getModeLabel } from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import {
  formatLiveNumber,
  liveCadenceDescription,
  liveFrameQualityLabel,
  livePreviewIntervalMs,
  liveStatusLabel,
  type LiveEvidenceEvent,
  type LiveFrameMetrics,
  type LiveStatus,
  type LiveStreamInfo,
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

const formatResolution = (streamInfo: LiveStreamInfo | null) =>
  streamInfo ? `${streamInfo.width ?? '--'}x${streamInfo.height ?? '--'}` : '--';

const liveScenePhaseLabel = {
  'confirming-map-selection': '확인 중',
  observing: '감시',
  'stable-map-selection': '안정',
  'suspecting-map-selection': '후보',
} satisfies Record<LiveSceneSnapshot['phase'], string>;

const LivePage = () => {
  const {
    drawPreviewToCanvas,
    errorMessage,
    evidenceEvents,
    frameMetrics,
    isLiveAvailable,
    sceneSnapshot,
    startCapture,
    status,
    stopCapture,
    streamInfo,
    visionAnalysis,
  } = useLiveCapture();
  const { data: matches = [], isLoading: isMatchesLoading } = useMatches();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapSelectionIds = useMemo(
    () =>
      sceneSnapshot.stableMapCandidateIds.length > 0
        ? sceneSnapshot.stableMapCandidateIds
        : (visionAnalysis?.mapSelection?.candidates.map((candidate) => candidate.mapId) ?? []),
    [sceneSnapshot.stableMapCandidateIds, visionAnalysis],
  );
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
  const hasPreviousLiveSnapshot = Boolean(frameMetrics || visionAnalysis || evidenceEvents.length);

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

  if (!isLiveAvailable && hasPreviousLiveSnapshot) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="마지막 수집"
          title="LIVE"
          description="화면 공유는 종료됐고, 마지막으로 인식한 상태만 남겨두었습니다."
          actions={
            <Button
              type="button"
              disabled={status === 'starting' || status === 'unsupported'}
              onClick={startLive}
            >
              <MonitorUp className="h-4 w-4" />
              다시 공유
            </Button>
          }
        />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <LiveDecisionPanel
            frameMetrics={frameMetrics}
            isDataLoading={isMatchesLoading}
            recommendations={mapRecommendations}
            sceneSnapshot={sceneSnapshot}
            visionAnalysis={visionAnalysis}
          />
          <LiveSystemPanel
            evidenceEvents={evidenceEvents}
            frameMetrics={frameMetrics}
            sceneSnapshot={sceneSnapshot}
            streamInfo={streamInfo}
          />
        </section>

        <LiveChoiceRail recommendations={mapRecommendations} />
      </div>
    );
  }

  if (!isLiveAvailable) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="PC 전용"
          title="LIVE"
          description="오버워치 창을 공유하면 맵 선택 추천과 경기 결과 기록 후보를 이 화면에서 확인합니다."
        />

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
                    LIVE는 게임 위에 무언가를 띄우지 않고, 공유된 화면을 웹서비스 안에서 분석합니다.
                  </p>
                </div>
              </div>

              <div className="mt-6 divide-y divide-border/70 border-y border-border/70">
                <LiveReadinessRow
                  icon={MapIcon}
                  label="맵 선택 화면"
                  status="추천 준비"
                  value="후보 맵을 기준으로 내 승률을 비교"
                />
                <LiveReadinessRow
                  icon={FileCheck2}
                  label="결과 화면"
                  status="기록 준비"
                  value="스코어와 승패 후보를 저장 전 확인"
                />
                <LiveReadinessRow
                  icon={TimerReset}
                  label="샘플링"
                  status="적응형"
                  value="짧은 probe 후 필요한 순간에만 OCR 실행"
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
        eyebrow="실시간 수집"
        title="LIVE"
        description="공유 화면에서 현재 상황과 맵 선택 후보를 실시간으로 추적합니다."
        actions={
          <Button variant="outline" className="bg-transparent" onClick={stopLive}>
            <Square className="h-4 w-4" />
            공유 종료
          </Button>
        }
      />

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)] 2xl:items-start">
        <LivePreviewPanel
          canvasRef={canvasRef}
          frameMetrics={frameMetrics}
          sceneSnapshot={sceneSnapshot}
          status={status}
          streamInfo={streamInfo}
        />

        <LiveDecisionPanel
          frameMetrics={frameMetrics}
          isDataLoading={isMatchesLoading}
          recommendations={mapRecommendations}
          sceneSnapshot={sceneSnapshot}
          visionAnalysis={visionAnalysis}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <LiveChoiceRail recommendations={mapRecommendations} />
        <LiveSystemPanel
          evidenceEvents={evidenceEvents}
          frameMetrics={frameMetrics}
          sceneSnapshot={sceneSnapshot}
          streamInfo={streamInfo}
        />
      </section>
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
  streamInfo,
}: {
  canvasRef: RefObject<HTMLCanvasElement>;
  frameMetrics: LiveFrameMetrics | null;
  sceneSnapshot: LiveSceneSnapshot;
  status: LiveStatus;
  streamInfo: LiveStreamInfo | null;
}) => (
  <div className="workspace-panel overflow-hidden">
    <div className="section-header flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">입력 화면</p>
        <h2 className="mt-1 truncate text-lg font-bold">공유 프레임</h2>
      </div>
      <Badge className="shrink-0 gap-2 border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10">
        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
        LIVE
      </Badge>
    </div>

    <div className="section-pad">
      <div className="relative overflow-hidden rounded-lg border border-border/70 bg-slate-950 shadow-sm">
        <canvas
          ref={canvasRef}
          className="aspect-video h-full max-h-[68vh] min-h-[280px] w-full bg-slate-950 object-contain"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-slate-950/80 to-transparent px-3 py-3 text-white sm:px-4">
          <LiveOverlayBadge label="상태" value={liveStatusLabel[status]} />
          <LiveOverlayBadge label="화면" value={liveScenePhaseLabel[sceneSnapshot.phase]} />
          <LiveOverlayBadge
            label="신뢰도"
            value={`${Math.round(sceneSnapshot.confidence * 100)}%`}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 grid gap-2 bg-gradient-to-t from-slate-950/88 to-transparent p-3 text-white sm:grid-cols-3 sm:p-4">
          <LiveOverlayMetric
            icon={Eye}
            label="품질"
            value={frameMetrics ? liveFrameQualityLabel[frameMetrics.quality] : '대기'}
            detail="현재 공유 프레임"
          />
          <LiveOverlayMetric
            icon={Activity}
            label="분석"
            value={sceneSnapshot.cadenceLabel}
            detail={liveCadenceDescription}
          />
          <LiveOverlayMetric
            icon={Gauge}
            label="입력"
            value={formatResolution(streamInfo)}
            detail={streamInfo?.displaySurface ?? 'window'}
          />
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
  sceneSnapshot,
  visionAnalysis,
}: {
  frameMetrics: LiveFrameMetrics | null;
  isDataLoading: boolean;
  recommendations: LiveMapChoiceRecommendation[];
  sceneSnapshot: LiveSceneSnapshot;
  visionAnalysis: LiveVisionAnalysis | null;
}) => {
  const detectedMapSelection = visionAnalysis?.mapSelection;
  const shouldShowDataSkeleton = isDataLoading && Boolean(detectedMapSelection);
  const bestRecommendation = shouldShowDataSkeleton ? undefined : recommendations[0];
  const detectedCandidates = detectedMapSelection?.candidates ?? [];

  return (
    <div className="workspace-panel overflow-hidden">
      <div className="section-header flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="metric-label">실시간 인식</p>
          <h2 className="mt-1 truncate text-lg font-bold">
            {sceneSnapshot.phase === 'observing' ? '상황 감시 중' : '맵 선택 화면 추적'}
          </h2>
        </div>
        <Badge variant="outline" className="shrink-0 bg-transparent">
          {Math.round(sceneSnapshot.confidence * 100)}%
        </Badge>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border/70 border-y border-border/70 bg-[hsl(var(--surface-2))]">
        <DecisionMetric label="화면" value={liveScenePhaseLabel[sceneSnapshot.phase]} />
        <DecisionMetric
          label="품질"
          value={frameMetrics ? liveFrameQualityLabel[frameMetrics.quality] : '--'}
        />
        <DecisionMetric label="후보" value={`${detectedCandidates.length}`} />
      </div>

      <div className="section-pad space-y-4">
        <DetectedCandidateStrip candidates={detectedCandidates} />

        <div className="h-px bg-border/70" />

        {shouldShowDataSkeleton ? (
          <LiveRecommendationSkeleton />
        ) : bestRecommendation ? (
          <PrimaryRecommendation recommendation={bestRecommendation} />
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
        {recommendations.length} choices
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

const LiveSystemPanel = ({
  evidenceEvents,
  frameMetrics,
  sceneSnapshot,
  streamInfo,
}: {
  evidenceEvents: LiveEvidenceEvent[];
  frameMetrics: LiveFrameMetrics | null;
  sceneSnapshot: LiveSceneSnapshot;
  streamInfo: LiveStreamInfo | null;
}) => (
  <div className="workspace-panel overflow-hidden">
    <div className="section-header">
      <p className="metric-label">시스템</p>
      <h2 className="mt-1 text-lg font-bold">입력 상태</h2>
    </div>
    <div className="grid grid-cols-2 border-y border-border/70 bg-[hsl(var(--surface-2))]">
      <CompactMetric label="해상도" value={formatResolution(streamInfo)} />
      <CompactMetric
        label="품질"
        value={frameMetrics ? liveFrameQualityLabel[frameMetrics.quality] : '--'}
      />
      <CompactMetric label="분석" value={sceneSnapshot.cadenceLabel} />
      <CompactMetric label="FPS" value={formatLiveNumber(streamInfo?.frameRate ?? null, 'fps')} />
    </div>
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold">
        <span className="flex min-w-0 items-center gap-2">
          <ListChecks className="h-4 w-4 shrink-0 text-primary" />
          최근 이벤트
        </span>
      </summary>
      <div className="max-h-64 overflow-auto border-t border-border/70">
        {evidenceEvents.length > 0 ? (
          evidenceEvents.slice(0, 5).map((event) => <EvidenceRow key={event.id} event={event} />)
        ) : (
          <div className="p-4 text-sm font-semibold text-muted-foreground">기록 없음</div>
        )}
      </div>
    </details>
  </div>
);

const LiveOverlayBadge = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-bold backdrop-blur">
    <span className="text-white/55">{label}</span>
    <span className="truncate text-white">{value}</span>
  </span>
);

const LiveOverlayMetric = ({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <div className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/10 px-3 py-2 backdrop-blur">
    <Icon className="h-4 w-4 shrink-0 text-cyan-200" />
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase text-white/50">{label}</p>
      <p className="truncate text-sm font-black text-white">{value}</p>
      <p className="truncate text-[10px] font-semibold text-white/55">{detail}</p>
    </div>
  </div>
);

const DecisionMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 px-3 py-3 text-center">
    <p className="metric-label">{label}</p>
    <p className="mt-1 truncate text-sm font-black">{value}</p>
  </div>
);

const CompactMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 border-b border-r border-border/70 px-3 py-3 last:border-r-0">
    <p className="metric-label">{label}</p>
    <p className="mt-1 truncate text-sm font-bold">{value}</p>
  </div>
);

const DetectedCandidateStrip = ({
  candidates,
}: {
  candidates: NonNullable<LiveVisionAnalysis['mapSelection']>['candidates'];
}) => (
  <div>
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="metric-label">감지된 후보</p>
      <Badge variant="outline" className="bg-transparent">
        {candidates.length}/3
      </Badge>
    </div>
    {candidates.length > 0 ? (
      <div className="grid gap-2">
        {candidates.map((candidate) => (
          <DetectedCandidateRow key={candidate.slot} candidate={candidate} />
        ))}
      </div>
    ) : (
      <div className="flex min-h-24 items-center gap-3 rounded-md border border-dashed border-border/80 bg-[hsl(var(--surface-2))] p-4">
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
}) => (
  <div className="grid grid-cols-[54px_minmax(0,1fr)_52px] items-center gap-3 rounded-md border border-border/70 bg-card p-2">
    <img
      src={getMapScreenshotPath(candidate.mapId)}
      alt=""
      className="h-10 w-14 rounded object-cover"
    />
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{getMapLabel(candidate.mapId)}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">
        {candidate.slot} · margin {Math.round(candidate.margin * 1000) / 10}
      </p>
    </div>
    <p className="text-right text-xs font-black">{Math.round(candidate.confidence * 100)}%</p>
  </div>
);

const PrimaryRecommendation = ({
  recommendation,
}: {
  recommendation: LiveMapChoiceRecommendation;
}) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
    <div className="relative min-h-[210px] overflow-hidden bg-slate-950">
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
      <div className="relative flex min-h-[210px] flex-col justify-end p-4 text-white">
        <div className="mb-auto flex items-start justify-between gap-3">
          <Badge className="bg-white text-slate-950 hover:bg-white">BEST</Badge>
          <Badge className="bg-cyan-300 text-slate-950 hover:bg-cyan-300">
            {Math.round(recommendation.recommendationScore)}
          </Badge>
        </div>
        <p className="text-xs font-bold text-white/70">
          {getRecommendationContext(recommendation)}
        </p>
        <h3 className="mt-1 truncate text-2xl font-black">
          {getRecommendationTitle(recommendation)}
        </h3>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-white/72">
          {getRecommendationDetail(recommendation)}
        </p>
      </div>
    </div>
  </div>
);

const EmptyRecognitionState = ({ hasFrame }: { hasFrame: boolean }) => (
  <div className="flex min-h-[210px] items-center gap-3 rounded-lg border border-dashed border-border/80 bg-[hsl(var(--surface-2))] p-5">
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
  <div className="border-y border-border/70 p-4">
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

const getRecommendationContext = (recommendation: LiveMapChoiceRecommendation) =>
  recommendation.choiceType === 'random'
    ? `${recommendation.poolSize}개 전장 풀`
    : getModeLabel(recommendation.modeId);

const getRecommendationDetail = (recommendation: LiveMapChoiceRecommendation) =>
  recommendation.choiceType === 'random'
    ? `${recommendation.reason} · 보정 ${recommendation.smoothedWinRate}%`
    : recommendation.decisive > 0
      ? `${recommendation.wins}승 ${recommendation.losses}패 · ${recommendation.decisive}경기`
      : recommendation.reason;

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
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {getRecommendationContext(recommendation)}
        </p>
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

const EvidenceRow = ({ event }: { event: LiveEvidenceEvent }) => (
  <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_72px] sm:items-center">
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          event.kind === 'capture'
            ? 'bg-destructive'
            : event.kind === 'vision'
              ? 'bg-primary'
              : 'bg-muted-foreground/60',
        )}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{event.label}</p>
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{event.detail}</p>
      </div>
    </div>
    <Badge variant="outline" className="w-fit bg-transparent sm:ml-auto">
      {Math.round(event.confidence * 100)}%
    </Badge>
  </div>
);

export { LivePage };
