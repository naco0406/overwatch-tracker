import type { LucideIcon } from 'lucide-react';
import { Radio, ScanLine, Square, TimerReset } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatLiveNumber,
  formatLiveSampleTime,
  liveFrameQualityLabel,
  liveSampleIntervalMs,
  liveStatusLabel,
  type LiveEvidenceEvent,
  useLiveCapture,
} from '@/hooks/useLiveCapture';
import { cn } from '@/lib/utils';

const livePreviewIntervalMs = liveSampleIntervalMs;
const liveSampleIntervalSeconds = Math.round(liveSampleIntervalMs / 1_000);

const LivePage = () => {
  const {
    drawPreviewToCanvas,
    evidenceEvents,
    frameMetrics,
    isLiveAvailable,
    status,
    stopCapture,
    streamInfo,
  } = useLiveCapture();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  const stopLive = useCallback(() => {
    stopCapture('idle');
    navigate('/');
  }, [navigate, stopCapture]);

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
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="실시간"
        title="LIVE"
        actions={
          <Button variant="outline" className="bg-transparent" onClick={stopLive}>
            <Square className="h-4 w-4" />
            종료
          </Button>
        }
      />

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-4">
        <div className="workspace-panel overflow-hidden">
          <div className="metric-strip grid-cols-3 divide-x divide-border/70">
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
        </div>

        <aside className="space-y-3">
          <div className="workspace-panel overflow-hidden">
            <div className="section-header">
              <p className="metric-label">스트림</p>
              <h2 className="mt-1 text-lg font-bold">입력 상태</h2>
            </div>
            <div className="divide-y divide-border/70">
              <InfoRow
                label="해상도"
                value={
                  streamInfo ? `${streamInfo.width ?? '--'}x${streamInfo.height ?? '--'}` : '--'
                }
              />
              <InfoRow label="표면" value={streamInfo?.displaySurface ?? '--'} />
              <InfoRow
                label="프레임레이트"
                value={formatLiveNumber(streamInfo?.frameRate ?? null, 'fps')}
              />
            </div>
          </div>

          <div className="workspace-panel overflow-hidden">
            <div className="section-header">
              <p className="metric-label">프레임 진단</p>
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
        </aside>
      </section>

      <section className="workspace-panel overflow-hidden">
        <div className="section-header flex items-center justify-between gap-3">
          <div>
            <p className="metric-label">증거 로그</p>
            <h2 className="mt-1 text-lg font-bold">프레임 수집</h2>
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
      </section>
    </div>
  );
};

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
    <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary sm:flex">
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
          event.kind === 'capture' ? 'bg-destructive' : 'bg-muted-foreground/60',
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
