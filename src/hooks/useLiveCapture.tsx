import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getMapLabel } from '@/data/matchOptions';
import {
  createLiveSceneRuntimeState,
  createStableMapSelectionAnalysis,
  getLiveFrameAnalysisPlan,
  getLiveSceneSnapshot,
  liveFrameSchedule,
  reduceLiveProbe,
  reduceLiveVisionAnalysis,
  type LiveSceneSnapshot,
} from '@/lib/liveFrameRuntime';
import {
  analyzeLiveVisionCanvas,
  drawLiveProbeFrame,
  drawLiveVisionFrame,
  probeLiveVisionCanvas,
  terminateLiveVisionOcr,
  type LiveVisionAnalysis,
} from '@/lib/liveVision';

export type LiveStatus = 'capturing' | 'error' | 'idle' | 'starting' | 'unsupported';

export interface LiveStreamInfo {
  displaySurface: string;
  frameRate: number | null;
  height: number | null;
  width: number | null;
}

export interface LiveFrameMetrics {
  brightness: number;
  contrast: number;
  frameIndex: number;
  quality: 'blank' | 'readable' | 'soft';
  sampledAt: string;
}

export interface LiveEvidenceEvent {
  confidence: number;
  detail: string;
  frameIndex: number;
  id: string;
  kind: 'capture' | 'frame' | 'vision';
  label: string;
  observedAt: string;
}

export interface LiveDebugEvent {
  data?: Record<string, unknown>;
  detail: string;
  frameIndex: number;
  id: string;
  level: 'error' | 'info' | 'success' | 'warn';
  observedAt: string;
  stage: 'capture' | 'frame' | 'probe' | 'vision';
  title: string;
}

interface LiveCaptureContextValue {
  clearDebugEvents: () => void;
  debugEvents: LiveDebugEvent[];
  drawPreviewToCanvas: (canvas: HTMLCanvasElement) => boolean;
  errorMessage: string;
  evidenceEvents: LiveEvidenceEvent[];
  frameMetrics: LiveFrameMetrics | null;
  isLiveAvailable: boolean;
  sceneSnapshot: LiveSceneSnapshot;
  startCapture: () => Promise<boolean>;
  status: LiveStatus;
  stopCapture: (nextStatus?: LiveStatus) => void;
  streamInfo: LiveStreamInfo | null;
  visionAnalysis: LiveVisionAnalysis | null;
}

const displayMediaOptions = {
  audio: false,
  monitorTypeSurfaces: 'include',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
  video: {
    displaySurface: 'window',
    frameRate: {
      ideal: 15,
      max: 15,
    },
  },
} as unknown as DisplayMediaStreamOptions;

const fallbackDisplayMediaOptions = {
  audio: false,
  video: true,
} satisfies DisplayMediaStreamOptions;
export const liveSampleIntervalMs = liveFrameSchedule.probeIntervalMs;
export const livePreviewIntervalMs = 1_000;
export const liveCadenceDescription = '250ms probe · adaptive OCR';
const liveUiUpdateIntervalMs = 1_000;
const liveDebugEventLimit = 2_000;

export const liveStatusLabel = {
  capturing: '수집 중',
  error: '오류',
  idle: '대기',
  starting: '연결 중',
  unsupported: '지원 안 함',
} satisfies Record<LiveStatus, string>;

export const liveFrameQualityLabel = {
  blank: '어두움',
  readable: '읽힘',
  soft: '낮은 대비',
} satisfies Record<LiveFrameMetrics['quality'], string>;

const LiveCaptureContext = createContext<LiveCaptureContextValue | null>(null);

type VideoFrameCallbackVideo = HTMLVideoElement & {
  cancelVideoFrameCallback?: (handle: number) => void;
  requestVideoFrameCallback?: (callback: (now: number) => void) => number;
};

const getErrorName = (error: unknown) =>
  error instanceof DOMException || error instanceof Error ? error.name : '';

const getErrorMessage = (error: unknown) => {
  if (error instanceof DOMException || error instanceof Error) {
    if (error.name === 'NotAllowedError') {
      return '공유 권한이 취소됐습니다.';
    }

    if (error.name === 'NotReadableError') {
      return '선택한 화면을 읽을 수 없습니다.';
    }

    if (error.name === 'NotFoundError') {
      return '공유 가능한 화면을 찾지 못했습니다.';
    }

    return error.message;
  }

  return '화면 공유를 시작하지 못했습니다.';
};

const readStreamInfo = (track: MediaStreamTrack): LiveStreamInfo => {
  const settings = track.getSettings() as MediaTrackSettings & {
    displaySurface?: string;
  };

  return {
    displaySurface: settings.displaySurface ?? 'unknown',
    frameRate: settings.frameRate ?? null,
    height: settings.height ?? null,
    width: settings.width ?? null,
  };
};

export const formatLiveNumber = (value: number | null, suffix = '') =>
  typeof value === 'number' ? `${Math.round(value).toLocaleString('ko-KR')}${suffix}` : '--';

export const formatLiveSampleTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(value))
    : '--';

const getFrameQuality = (brightness: number, contrast: number): LiveFrameMetrics['quality'] => {
  if (brightness < 8) return 'blank';
  if (contrast < 16) return 'soft';
  return 'readable';
};

const createDisplayMediaStream = async () => {
  try {
    return await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
  } catch (error) {
    if (getErrorName(error) === 'TypeError') {
      return navigator.mediaDevices.getDisplayMedia(fallbackDisplayMediaOptions);
    }

    throw error;
  }
};

const createHiddenVideo = (stream: MediaStream) => {
  const video = document.createElement('video');

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  return video;
};

const formatMapSelectionDetail = (analysis: LiveVisionAnalysis) => {
  const candidates = analysis.mapSelection?.candidates ?? [];

  if (candidates.length === 0) {
    return '후보 없음';
  }

  return candidates.map((candidate) => getMapLabel(candidate.mapId)).join(' · ');
};

export const LiveCaptureProvider = ({ children }: { children: ReactNode }) => {
  const [errorMessage, setErrorMessage] = useState('');
  const [debugEvents, setDebugEvents] = useState<LiveDebugEvent[]>([]);
  const [evidenceEvents, setEvidenceEvents] = useState<LiveEvidenceEvent[]>([]);
  const [frameMetrics, setFrameMetrics] = useState<LiveFrameMetrics | null>(null);
  const [sceneSnapshot, setSceneSnapshot] = useState<LiveSceneSnapshot>(() =>
    getLiveSceneSnapshot(createLiveSceneRuntimeState(), 0),
  );
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [streamInfo, setStreamInfo] = useState<LiveStreamInfo | null>(null);
  const [visionAnalysis, setVisionAnalysis] = useState<LiveVisionAnalysis | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackFrameTimerRef = useRef<number | null>(null);
  const frameCallbackHandleRef = useRef<number | null>(null);
  const frameIndexRef = useRef(0);
  const lastFrameEvidenceAtRef = useRef(0);
  const lastFrameDebugAtRef = useRef(0);
  const lastFrameMetricsUiAtRef = useRef(0);
  const lastProbeDebugAtRef = useRef(0);
  const lastProbeEvidenceAtRef = useRef(0);
  const lastScenePhaseRef = useRef<LiveSceneSnapshot['phase']>('observing');
  const lastSceneSnapshotUiAtRef = useRef(0);
  const lastStableCandidateKeyRef = useRef('');
  const liveRuntimeRef = useRef(createLiveSceneRuntimeState());
  const probeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scheduleFrameSamplingRef = useRef<() => void>(() => undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const visionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visionInFlightRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const clearSampling = useCallback(() => {
    const video = videoRef.current as VideoFrameCallbackVideo | null;

    if (frameCallbackHandleRef.current !== null) {
      video?.cancelVideoFrameCallback?.(frameCallbackHandleRef.current);
      frameCallbackHandleRef.current = null;
    }

    if (fallbackFrameTimerRef.current !== null) {
      window.clearTimeout(fallbackFrameTimerRef.current);
      fallbackFrameTimerRef.current = null;
    }
  }, []);

  const addEvidenceEvent = useCallback((event: Omit<LiveEvidenceEvent, 'id' | 'observedAt'>) => {
    setEvidenceEvents((current) =>
      [
        {
          ...event,
          id: `${Date.now()}-${event.frameIndex}-${event.kind}`,
          observedAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 12),
    );
  }, []);

  const addDebugEvent = useCallback((event: Omit<LiveDebugEvent, 'id' | 'observedAt'>) => {
    setDebugEvents((current) =>
      [
        {
          ...event,
          id: `${Date.now()}-${event.frameIndex}-${event.stage}`,
          observedAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, liveDebugEventLimit),
    );
  }, []);

  const clearDebugEvents = useCallback(() => {
    setDebugEvents([]);
  }, []);

  const publishSceneSnapshot = useCallback(
    (snapshot: LiveSceneSnapshot, observedAt: number, force = false) => {
      const candidateKey = snapshot.stableMapCandidateIds.join('|');
      const phaseChanged = snapshot.phase !== lastScenePhaseRef.current;
      const candidatesChanged = candidateKey !== lastStableCandidateKeyRef.current;
      const shouldPublish =
        force ||
        phaseChanged ||
        candidatesChanged ||
        observedAt - lastSceneSnapshotUiAtRef.current >= liveUiUpdateIntervalMs;

      if (!shouldPublish) {
        return;
      }

      lastScenePhaseRef.current = snapshot.phase;
      lastStableCandidateKeyRef.current = candidateKey;
      lastSceneSnapshotUiAtRef.current = observedAt;
      setSceneSnapshot(snapshot);
    },
    [],
  );

  const stopCapture = useCallback(
    (nextStatus: LiveStatus = 'idle') => {
      clearSampling();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }

      setStatus(nextStatus);
      lastFrameEvidenceAtRef.current = 0;
      lastFrameDebugAtRef.current = 0;
      lastFrameMetricsUiAtRef.current = 0;
      lastProbeDebugAtRef.current = 0;
      lastProbeEvidenceAtRef.current = 0;
      lastScenePhaseRef.current = 'observing';
      lastSceneSnapshotUiAtRef.current = 0;
      lastStableCandidateKeyRef.current = '';
      visionInFlightRef.current = false;
      void terminateLiveVisionOcr();
    },
    [clearSampling],
  );

  const sampleFrame = useCallback(
    (requestedAt = performance.now()) => {
      const runtime = liveRuntimeRef.current;
      const initialPlan = getLiveFrameAnalysisPlan(runtime, requestedAt, visionInFlightRef.current);

      if (!initialPlan.shouldProbe) {
        return;
      }

      const video = videoRef.current;

      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width <= 0 || height <= 0) {
        return;
      }

      const analysisCanvas = analysisCanvasRef.current ?? document.createElement('canvas');
      analysisCanvasRef.current = analysisCanvas;
      const analysisWidth = 160;
      const analysisHeight = Math.max(1, Math.round((height / width) * analysisWidth));

      if (analysisCanvas.width !== analysisWidth || analysisCanvas.height !== analysisHeight) {
        analysisCanvas.width = analysisWidth;
        analysisCanvas.height = analysisHeight;
      }
      const analysisContext = analysisCanvas.getContext('2d', {
        willReadFrequently: true,
      });

      if (!analysisContext) {
        return;
      }

      analysisContext.drawImage(video, 0, 0, analysisWidth, analysisHeight);
      const imageData = analysisContext.getImageData(0, 0, analysisWidth, analysisHeight).data;
      const pixelCount = imageData.length / 4;
      let lumaTotal = 0;
      let lumaSquares = 0;

      for (let index = 0; index < imageData.length; index += 4) {
        const luma =
          imageData[index] * 0.299 + imageData[index + 1] * 0.587 + imageData[index + 2] * 0.114;

        lumaTotal += luma;
        lumaSquares += luma * luma;
      }

      const brightness = lumaTotal / pixelCount;
      const variance = Math.max(0, lumaSquares / pixelCount - brightness * brightness);
      const contrast = Math.sqrt(variance);
      const quality = getFrameQuality(brightness, contrast);
      const frameIndex = frameIndexRef.current + 1;
      frameIndexRef.current = frameIndex;
      const sampledAt = new Date().toISOString();

      if (
        lastFrameMetricsUiAtRef.current === 0 ||
        requestedAt - lastFrameMetricsUiAtRef.current >= liveUiUpdateIntervalMs ||
        quality !== 'readable'
      ) {
        lastFrameMetricsUiAtRef.current = requestedAt;
        setFrameMetrics({
          brightness,
          contrast,
          frameIndex,
          quality,
          sampledAt,
        });
      }

      if (
        lastFrameDebugAtRef.current === 0 ||
        requestedAt - lastFrameDebugAtRef.current >= liveUiUpdateIntervalMs
      ) {
        lastFrameDebugAtRef.current = requestedAt;
        addDebugEvent({
          data: {
            brightness,
            contrast,
            initialPlan,
            quality,
            video: {
              height,
              readyState: video.readyState,
              width,
            },
          },
          detail: `${formatLiveNumber(brightness)} brightness · ${formatLiveNumber(
            contrast,
          )} contrast`,
          frameIndex,
          level: quality === 'readable' ? 'info' : 'warn',
          stage: 'frame',
          title: quality === 'readable' ? 'Frame readable' : 'Frame degraded',
        });
      }

      if (quality !== 'readable' && requestedAt - lastFrameEvidenceAtRef.current >= 2_000) {
        lastFrameEvidenceAtRef.current = requestedAt;
        addEvidenceEvent({
          confidence: quality === 'soft' ? 0.38 : 0.12,
          detail: `${formatLiveNumber(brightness)} 밝기 · ${formatLiveNumber(contrast)} 대비`,
          frameIndex,
          kind: 'frame',
          label: liveFrameQualityLabel[quality],
        });
      }

      if (quality !== 'readable') {
        return;
      }

      const probeCanvas = probeCanvasRef.current ?? document.createElement('canvas');
      probeCanvasRef.current = probeCanvas;

      if (!drawLiveProbeFrame(video, probeCanvas)) {
        return;
      }

      const probe = probeLiveVisionCanvas(probeCanvas);
      reduceLiveProbe(runtime, probe, requestedAt);
      publishSceneSnapshot(getLiveSceneSnapshot(runtime, requestedAt), requestedAt);

      if (
        lastProbeDebugAtRef.current === 0 ||
        requestedAt - lastProbeDebugAtRef.current >= liveUiUpdateIntervalMs
      ) {
        lastProbeDebugAtRef.current = requestedAt;
        addDebugEvent({
          data: {
            cardScores: probe.cardScores,
            confidence: probe.confidence,
            evidence: probe.evidence,
            phaseAfterProbe: runtime.phase,
            screenCandidate: probe.screenCandidate,
          },
          detail: `${probe.screenCandidate} · ${Math.round(probe.confidence * 100)}%`,
          frameIndex,
          level: probe.screenCandidate === 'map_selection' ? 'success' : 'info',
          stage: 'probe',
          title: 'Probe result',
        });
      }

      if (
        probe.screenCandidate === 'map_selection' &&
        requestedAt - lastProbeEvidenceAtRef.current >= 1_000
      ) {
        lastProbeEvidenceAtRef.current = requestedAt;
        addEvidenceEvent({
          confidence: probe.confidence,
          detail: probe.evidence.join(' · '),
          frameIndex,
          kind: 'vision',
          label: '맵 선택 후보',
        });
      }

      const visionPlan = getLiveFrameAnalysisPlan(runtime, requestedAt, visionInFlightRef.current);

      if (!visionPlan.shouldRunVision) {
        return;
      }

      const visionCanvas = visionCanvasRef.current ?? document.createElement('canvas');
      visionCanvasRef.current = visionCanvas;

      if (!drawLiveVisionFrame(video, visionCanvas)) {
        return;
      }

      visionInFlightRef.current = true;
      const visionStartedAt = performance.now();
      addDebugEvent({
        data: {
          includeOcr: visionPlan.includeOcr,
          phaseBeforeVision: runtime.phase,
          visionPlan,
        },
        detail: visionPlan.includeOcr ? 'template match + OCR' : 'template match only',
        frameIndex,
        level: 'info',
        stage: 'vision',
        title: 'Heavy vision started',
      });
      void analyzeLiveVisionCanvas(visionCanvas, {
        includeOcr: visionPlan.includeOcr,
      })
        .then((analysis) => {
          const finishedAt = performance.now();

          reduceLiveVisionAnalysis(runtime, analysis, finishedAt, {
            includedOcr: visionPlan.includeOcr,
          });

          const nextSnapshot = getLiveSceneSnapshot(runtime, finishedAt);
          const stableAnalysis = createStableMapSelectionAnalysis(
            analysis,
            nextSnapshot.stableMapCandidateIds,
          );

          publishSceneSnapshot(nextSnapshot, finishedAt, true);
          setVisionAnalysis(stableAnalysis);
          addDebugEvent({
            data: {
              durationMs: Math.round(finishedAt - visionStartedAt),
              includedOcr: visionPlan.includeOcr,
              mapSelection: stableAnalysis.mapSelection
                ? {
                    candidates: stableAnalysis.mapSelection.candidates.map((candidate) => ({
                      alternatives: candidate.alternatives.slice(0, 3),
                      confidence: candidate.confidence,
                      mapId: candidate.mapId,
                      margin: candidate.margin,
                      slot: candidate.slot,
                    })),
                    confidence: stableAnalysis.mapSelection.confidence,
                    evidence: stableAnalysis.mapSelection.evidence,
                    textEvidenceCount: stableAnalysis.mapSelection.textEvidenceCount,
                    uniqueVisualMapCount: stableAnalysis.mapSelection.uniqueVisualMapCount,
                  }
                : null,
              phaseAfterVision: nextSnapshot.phase,
              screen: stableAnalysis.screen,
              stableMapCandidateIds: nextSnapshot.stableMapCandidateIds,
            },
            detail: `${stableAnalysis.screen.screenType} · ${Math.round(
              stableAnalysis.screen.confidence * 100,
            )}% · ${stableAnalysis.mapSelection?.candidates.length ?? 0} candidates`,
            frameIndex,
            level: stableAnalysis.screen.screenType === 'map_selection' ? 'success' : 'warn',
            stage: 'vision',
            title: 'Heavy vision result',
          });

          if (stableAnalysis.screen.screenType === 'map_selection' && stableAnalysis.mapSelection) {
            addEvidenceEvent({
              confidence: stableAnalysis.screen.confidence,
              detail: `${formatMapSelectionDetail(stableAnalysis)}${
                visionPlan.includeOcr ? ' · OCR 보정' : ''
              }`,
              frameIndex,
              kind: 'vision',
              label:
                nextSnapshot.phase === 'stable-map-selection' ? '맵 선택 안정' : '맵 선택 확인',
            });
          }
        })
        .catch((error) => {
          addDebugEvent({
            data: {
              durationMs: Math.round(performance.now() - visionStartedAt),
              error: error instanceof Error ? error.message : String(error),
              includeOcr: visionPlan.includeOcr,
            },
            detail: error instanceof Error ? error.message : '분석 실패',
            frameIndex,
            level: 'error',
            stage: 'vision',
            title: 'Heavy vision failed',
          });
          addEvidenceEvent({
            confidence: 0,
            detail: error instanceof Error ? error.message : '분석 실패',
            frameIndex,
            kind: 'vision',
            label: '분석 실패',
          });
        })
        .finally(() => {
          visionInFlightRef.current = false;
        });
    },
    [addDebugEvent, addEvidenceEvent, publishSceneSnapshot],
  );

  const scheduleFrameSampling = useCallback(() => {
    const video = videoRef.current as VideoFrameCallbackVideo | null;

    if (!video) {
      return;
    }

    if (video.requestVideoFrameCallback) {
      frameCallbackHandleRef.current = video.requestVideoFrameCallback((now) => {
        frameCallbackHandleRef.current = null;
        sampleFrame(now);
        scheduleFrameSamplingRef.current();
      });
      return;
    }

    fallbackFrameTimerRef.current = window.setTimeout(() => {
      fallbackFrameTimerRef.current = null;
      sampleFrame(performance.now());
      scheduleFrameSamplingRef.current();
    }, liveFrameSchedule.confirmProbeIntervalMs);
  }, [sampleFrame]);

  useEffect(() => {
    scheduleFrameSamplingRef.current = scheduleFrameSampling;
  }, [scheduleFrameSampling]);

  const drawPreviewToCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const video = videoRef.current;

    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return false;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (width <= 0 || height <= 0) {
      return false;
    }

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);

    return true;
  }, []);

  const startCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus('unsupported');
      setErrorMessage('이 브라우저에서는 화면 캡처를 사용할 수 없습니다.');
      addDebugEvent({
        detail: 'navigator.mediaDevices.getDisplayMedia is unavailable',
        frameIndex: 0,
        level: 'error',
        stage: 'capture',
        title: 'Capture unsupported',
      });
      return false;
    }

    stopCapture('starting');
    setErrorMessage('');
    setDebugEvents([]);
    setEvidenceEvents([]);
    setFrameMetrics(null);
    setVisionAnalysis(null);
    frameIndexRef.current = 0;
    lastFrameEvidenceAtRef.current = 0;
    lastFrameDebugAtRef.current = 0;
    lastFrameMetricsUiAtRef.current = 0;
    lastProbeDebugAtRef.current = 0;
    lastProbeEvidenceAtRef.current = 0;
    lastScenePhaseRef.current = 'observing';
    lastSceneSnapshotUiAtRef.current = 0;
    lastStableCandidateKeyRef.current = '';
    liveRuntimeRef.current = createLiveSceneRuntimeState();
    setSceneSnapshot(getLiveSceneSnapshot(liveRuntimeRef.current, 0));
    addDebugEvent({
      data: {
        displayMediaOptions,
      },
      detail: 'Requesting display media stream',
      frameIndex: 0,
      level: 'info',
      stage: 'capture',
      title: 'Capture requested',
    });

    try {
      const stream = await createDisplayMediaStream();
      const [videoTrack] = stream.getVideoTracks();

      if (!videoTrack) {
        throw new Error('비디오 트랙이 없습니다.');
      }

      const video = createHiddenVideo(stream);

      streamRef.current = stream;
      videoRef.current = video;
      setStreamInfo(readStreamInfo(videoTrack));
      addDebugEvent({
        data: {
          streamInfo: readStreamInfo(videoTrack),
          trackSettings: videoTrack.getSettings(),
        },
        detail: 'MediaStream connected',
        frameIndex: 0,
        level: 'success',
        stage: 'capture',
        title: 'Capture connected',
      });

      videoTrack.addEventListener(
        'ended',
        () => {
          addDebugEvent({
            detail: 'Video track ended',
            frameIndex: frameIndexRef.current,
            level: 'warn',
            stage: 'capture',
            title: 'Capture ended',
          });
          stopCapture('idle');
        },
        {
          once: true,
        },
      );

      await video.play();
      setStatus('capturing');
      addEvidenceEvent({
        confidence: 1,
        detail: 'MediaStream 연결',
        frameIndex: 0,
        kind: 'capture',
        label: '화면 공유',
      });
      sampleFrame();
      scheduleFrameSampling();

      return true;
    } catch (error) {
      stopCapture('error');
      setErrorMessage(getErrorMessage(error));
      addDebugEvent({
        data: {
          error: error instanceof Error ? error.message : String(error),
          name: getErrorName(error),
        },
        detail: getErrorMessage(error),
        frameIndex: frameIndexRef.current,
        level: 'error',
        stage: 'capture',
        title: 'Capture failed',
      });
      return false;
    }
  }, [addDebugEvent, addEvidenceEvent, sampleFrame, scheduleFrameSampling, stopCapture]);

  useEffect(
    () => () => {
      stopCapture('idle');
    },
    [stopCapture],
  );

  const value = useMemo(
    () => ({
      clearDebugEvents,
      debugEvents,
      drawPreviewToCanvas,
      errorMessage,
      evidenceEvents,
      frameMetrics,
      isLiveAvailable: status === 'capturing',
      sceneSnapshot,
      startCapture,
      status,
      stopCapture,
      streamInfo,
      visionAnalysis,
    }),
    [
      clearDebugEvents,
      debugEvents,
      drawPreviewToCanvas,
      errorMessage,
      evidenceEvents,
      frameMetrics,
      sceneSnapshot,
      startCapture,
      status,
      stopCapture,
      streamInfo,
      visionAnalysis,
    ],
  );

  return <LiveCaptureContext.Provider value={value}>{children}</LiveCaptureContext.Provider>;
};

export const useLiveCapture = () => {
  const context = useContext(LiveCaptureContext);

  if (!context) {
    throw new Error('useLiveCapture must be used within LiveCaptureProvider.');
  }

  return context;
};
