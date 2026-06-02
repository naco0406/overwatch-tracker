import type { LucideIcon } from 'lucide-react';
import {
  CircleAlert,
  FileCheck2,
  MapIcon,
  MonitorUp,
  Radio,
  ScanLine,
  Square,
  TimerReset,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMapLabel, getModeLabel } from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import {
  formatLiveNumber,
  formatLiveSampleTime,
  liveFrameQualityLabel,
  liveSampleIntervalMs,
  liveStatusLabel,
  type LiveEvidenceEvent,
  type LiveFrameMetrics,
  type LiveStreamInfo,
  useLiveCapture,
} from '@/hooks/useLiveCapture';
import { useMatches } from '@/hooks/useMatches';
import type { LiveVisionAnalysis } from '@/lib/liveVision';
import { formatWinRate, rankMapRecommendations, type MapRecommendation } from '@/lib/matchStats';
import { cn } from '@/lib/utils';

const livePreviewIntervalMs = liveSampleIntervalMs;
const liveSampleIntervalSeconds = Math.round(liveSampleIntervalMs / 1_000);

const formatResolution = (streamInfo: LiveStreamInfo | null) =>
  streamInfo ? `${streamInfo.width ?? '--'}x${streamInfo.height ?? '--'}` : '--';

const LivePage = () => {
  const {
    drawPreviewToCanvas,
    errorMessage,
    evidenceEvents,
    frameMetrics,
    isLiveAvailable,
    startCapture,
    status,
    stopCapture,
    streamInfo,
    visionAnalysis,
  } = useLiveCapture();
  const { data: matches = [] } = useMatches();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapSelectionIds = useMemo(
    () => visionAnalysis?.mapSelection?.candidates.map((candidate) => candidate.mapId) ?? [],
    [visionAnalysis],
  );
  const mapRecommendations = useMemo(
    () =>
      rankMapRecommendations({
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
                  status={`${liveSampleIntervalSeconds}초 간격`}
                  value="브라우저 부담을 낮춘 주기적 프레임 수집"
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
        description="공유된 화면을 바탕으로 맵 선택 추천과 경기 결과 후보를 준비합니다."
        actions={
          <Button variant="outline" className="bg-transparent" onClick={stopLive}>
            <Square className="h-4 w-4" />
            공유 종료
          </Button>
        }
      />

      <section className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:items-start xl:gap-4">
        <div className="workspace-panel overflow-hidden">
          <div className="section-header flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">화면 입력</p>
              <h2 className="mt-1 truncate text-lg font-bold">공유 프레임</h2>
            </div>
            <Badge className="shrink-0 gap-2 border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              LIVE
            </Badge>
          </div>

          <div className="section-pad">
            <div className="relative overflow-hidden rounded-lg border border-border/70 bg-slate-950">
              <canvas
                ref={canvasRef}
                className="aspect-video h-full w-full bg-slate-950 object-contain"
              />
              {!frameMetrics ? (
                <div className="absolute inset-0 flex min-h-[240px] items-center justify-center bg-slate-950 text-center text-white">
                  <div>
                    <span className="mx-auto block h-3 w-3 animate-pulse rounded-full bg-destructive" />
                    <p className="mt-3 text-sm font-bold">프레임 대기 중</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid border-t border-border/70 bg-[hsl(var(--surface-2))] sm:grid-cols-3 sm:divide-x sm:divide-border/70">
            <LiveMetric
              detail={streamInfo?.displaySurface ?? 'window'}
              icon={Radio}
              label="캡처"
              value={liveStatusLabel[status]}
            />
            <LiveMetric
              detail={frameMetrics ? liveFrameQualityLabel[frameMetrics.quality] : '대기'}
              icon={ScanLine}
              label="프레임"
              value={frameMetrics ? frameMetrics.frameIndex.toLocaleString('ko-KR') : '--'}
            />
            <LiveMetric
              detail={`${liveSampleIntervalSeconds}초 간격`}
              icon={TimerReset}
              label="샘플"
              value={formatLiveSampleTime(frameMetrics?.sampledAt ?? null)}
            />
          </div>
        </div>

        <aside className="space-y-3">
          <LiveInsightPanel
            frameMetrics={frameMetrics}
            recommendations={mapRecommendations}
            visionAnalysis={visionAnalysis}
          />
          <StreamStatusPanel streamInfo={streamInfo} />
        </aside>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-4">
        <div className="workspace-panel overflow-hidden">
          <div className="section-header flex items-center justify-between gap-3">
            <div>
              <p className="metric-label">증거 로그</p>
              <h2 className="mt-1 text-lg font-bold">최근 수집</h2>
            </div>
            <Badge variant="outline" className="bg-transparent">
              {evidenceEvents.length} events
            </Badge>
          </div>
          <div className="divide-y divide-border/70">
            {evidenceEvents.length > 0 ? (
              evidenceEvents.map((event) => <EvidenceRow key={event.id} event={event} />)
            ) : (
              <div className="p-4 text-sm font-semibold text-muted-foreground">기록 없음</div>
            )}
          </div>
        </div>

        <div className="workspace-panel overflow-hidden">
          <div className="section-header">
            <p className="metric-label">진단</p>
            <h2 className="mt-1 text-lg font-bold">샘플 품질</h2>
          </div>
          <div className="divide-y divide-border/70">
            <InfoRow label="밝기" value={formatLiveNumber(frameMetrics?.brightness ?? null)} />
            <InfoRow label="대비" value={formatLiveNumber(frameMetrics?.contrast ?? null)} />
            <InfoRow
              label="판정"
              value={frameMetrics ? liveFrameQualityLabel[frameMetrics.quality] : '--'}
            />
          </div>
        </div>
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

const LiveInsightPanel = ({
  frameMetrics,
  recommendations,
  visionAnalysis,
}: {
  frameMetrics: LiveFrameMetrics | null;
  recommendations: MapRecommendation[];
  visionAnalysis: LiveVisionAnalysis | null;
}) => {
  const detectedMapSelection = visionAnalysis?.mapSelection;
  const bestRecommendation = recommendations.find((recommendation) => recommendation.decisive > 0);
  const statusLabel = detectedMapSelection
    ? `${Math.round(visionAnalysis.screen.confidence * 100)}%`
    : frameMetrics
      ? '대기'
      : '준비';

  return (
    <div className="workspace-panel overflow-hidden">
      <div className="section-header flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="metric-label">맵 선택 추천</p>
          <h2 className="mt-1 truncate text-lg font-bold">
            {bestRecommendation ? getMapLabel(bestRecommendation.mapId) : '후보 감지 대기'}
          </h2>
        </div>
        <Badge variant="outline" className="shrink-0 bg-transparent">
          {statusLabel}
        </Badge>
      </div>

      {bestRecommendation ? (
        <div className="border-y border-border/70">
          <div className="relative min-h-[172px] overflow-hidden bg-slate-950">
            <img
              src={getMapScreenshotPath(bestRecommendation.mapId)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/10" />
            <div className="relative flex min-h-[172px] flex-col justify-end p-4 text-white">
              <p className="text-xs font-bold text-white/70">
                {getModeLabel(bestRecommendation.modeId)}
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-2xl font-black">
                    {formatWinRate(bestRecommendation.winRate)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-white/70">
                    {bestRecommendation.wins}승 {bestRecommendation.losses}패 ·{' '}
                    {bestRecommendation.decisive}경기
                  </p>
                </div>
                <Badge className="shrink-0 bg-white text-slate-950 hover:bg-white">
                  추천 {Math.round(bestRecommendation.recommendationScore)}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-y border-border/70 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
              <MapIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {detectedMapSelection
                  ? '후보는 감지됐지만 데이터가 부족합니다'
                  : '맵 선택 화면 대기 중'}
              </p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                {detectedMapSelection
                  ? '해당 후보 맵의 승패 기록이 쌓이면 추천이 표시됩니다.'
                  : '오버워치 맵 선택 화면이 공유 프레임에 잡히면 후보를 비교합니다.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-border/70">
        {recommendations.length > 0 ? (
          recommendations.map((recommendation) => (
            <MapRecommendationRow key={recommendation.mapId} recommendation={recommendation} />
          ))
        ) : (
          <div className="p-3 text-sm font-semibold text-muted-foreground">후보 없음</div>
        )}
      </div>
    </div>
  );
};

const MapRecommendationRow = ({ recommendation }: { recommendation: MapRecommendation }) => (
  <div className="grid grid-cols-[44px_minmax(0,1fr)_72px] items-center gap-3 p-3">
    <img
      src={getMapScreenshotPath(recommendation.mapId)}
      alt=""
      className="h-11 w-11 rounded-md object-cover"
    />
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{getMapLabel(recommendation.mapId)}</p>
      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
        {recommendation.decisive > 0
          ? `${recommendation.wins}승 ${recommendation.losses}패 · ${recommendation.decisive}경기`
          : '데이터 없음'}
      </p>
    </div>
    <div className="text-right">
      <p className="text-sm font-black">{formatWinRate(recommendation.winRate)}</p>
      <p className="mt-1 text-[10px] font-bold text-muted-foreground">
        {Math.round(recommendation.recommendationScore)}
      </p>
    </div>
  </div>
);

const StreamStatusPanel = ({ streamInfo }: { streamInfo: LiveStreamInfo | null }) => (
  <div className="workspace-panel overflow-hidden">
    <div className="section-header">
      <p className="metric-label">스트림</p>
      <h2 className="mt-1 text-lg font-bold">입력 상태</h2>
    </div>
    <div className="divide-y divide-border/70">
      <InfoRow label="해상도" value={formatResolution(streamInfo)} />
      <InfoRow label="표면" value={streamInfo?.displaySurface ?? '--'} />
      <InfoRow
        label="프레임레이트"
        value={formatLiveNumber(streamInfo?.frameRate ?? null, 'fps')}
      />
    </div>
  </div>
);

interface LiveMetricProps {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

const LiveMetric = ({ detail, icon: Icon, label, value }: LiveMetricProps) => (
  <div className="flex min-h-[76px] items-start justify-between gap-2 px-3 py-3 sm:min-h-[86px] sm:px-5">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      <p className="mt-2 truncate text-lg font-bold sm:text-2xl">{value}</p>
      <p className="mt-1 truncate text-[10px] font-semibold text-muted-foreground sm:text-xs">
        {detail}
      </p>
    </div>
    <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-card text-primary sm:flex">
      <Icon className="h-4 w-4" />
    </div>
  </div>
);

interface InfoRowProps {
  label: string;
  value: string;
}

const InfoRow = ({ label, value }: InfoRowProps) => (
  <div className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-3 sm:px-5">
    <p className="metric-label">{label}</p>
    <p className="min-w-0 truncate text-right text-sm font-bold">{value}</p>
  </div>
);

const EvidenceRow = ({ event }: { event: LiveEvidenceEvent }) => (
  <div className="grid gap-3 p-3 sm:grid-cols-[92px_minmax(0,1fr)_96px] sm:items-center">
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
      <p className="text-xs font-bold text-muted-foreground">
        {formatLiveSampleTime(event.observedAt)}
      </p>
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{event.label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{event.detail}</p>
    </div>
    <Badge variant="outline" className="w-fit bg-transparent sm:ml-auto">
      {Math.round(event.confidence * 100)}%
    </Badge>
  </div>
);

export { LivePage };
