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
  prewarmLiveVisionOcr,
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

interface LiveCaptureContextValue {
  drawPreviewToCanvas: (canvas: HTMLCanvasElement) => boolean;
  errorMessage: string;
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
export const liveCadenceDescription = '화면 변화에 맞춰 정밀 분석';
const liveUiUpdateIntervalMs = 1_000;

export const liveStatusLabel = {
  capturing: '공유 중',
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

export const LiveCaptureProvider = ({ children }: { children: ReactNode }) => {
  const [errorMessage, setErrorMessage] = useState('');
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
  const lastFrameMetricsUiAtRef = useRef(0);
  const lastScenePhaseRef = useRef<LiveSceneSnapshot['phase']>('observing');
  const lastSceneSnapshotUiAtRef = useRef(0);
  const lastStableCandidateKeyRef = useRef('');
  const liveSessionIdRef = useRef(0);
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
      liveSessionIdRef.current += 1;
      liveRuntimeRef.current = createLiveSceneRuntimeState();
      setFrameMetrics(null);
      setSceneSnapshot(getLiveSceneSnapshot(liveRuntimeRef.current, 0));
      setStreamInfo(null);
      setVisionAnalysis(null);
      lastFrameMetricsUiAtRef.current = 0;
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

      const isMapSelectionProbe = probe.screenCandidate === 'map_selection';
      const shouldPromoteMapSelectionVision =
        isMapSelectionProbe &&
        runtime.phase !== 'stable-map-selection' &&
        !visionInFlightRef.current &&
        requestedAt - runtime.lastVisionAt >= liveFrameSchedule.heavyVisionIntervalMs;
      const shouldRunVision = initialPlan.shouldRunVision || shouldPromoteMapSelectionVision;
      const includeOcr =
        shouldRunVision &&
        (initialPlan.includeOcr ||
          (isMapSelectionProbe &&
            requestedAt - runtime.lastOcrAt >= liveFrameSchedule.ocrCooldownMs));
      const visionPlan = {
        ...initialPlan,
        includeOcr,
        shouldRunVision,
      };

      if (!visionPlan.shouldRunVision) {
        return;
      }

      const visionCanvas = visionCanvasRef.current ?? document.createElement('canvas');
      visionCanvasRef.current = visionCanvas;

      if (!drawLiveVisionFrame(video, visionCanvas)) {
        return;
      }

      visionInFlightRef.current = true;
      const liveSessionId = liveSessionIdRef.current;
      void analyzeLiveVisionCanvas(visionCanvas, {
        includeOcr: visionPlan.includeOcr,
      })
        .then((analysis) => {
          if (liveSessionId !== liveSessionIdRef.current) {
            return;
          }

          const finishedAt = performance.now();

          reduceLiveVisionAnalysis(runtime, analysis, finishedAt, {
            includedOcr: visionPlan.includeOcr,
          });

          const nextSnapshot = getLiveSceneSnapshot(runtime, finishedAt);
          const stableAnalysis =
            nextSnapshot.phase === 'stable-map-selection'
              ? createStableMapSelectionAnalysis(analysis, nextSnapshot.stableMapCandidateIds)
              : analysis;

          publishSceneSnapshot(nextSnapshot, finishedAt, true);
          setVisionAnalysis(stableAnalysis);
        })
        .catch(() => undefined)
        .finally(() => {
          if (liveSessionId === liveSessionIdRef.current) {
            visionInFlightRef.current = false;
          }
        });
    },
    [publishSceneSnapshot],
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
      return false;
    }

    stopCapture('starting');
    setErrorMessage('');
    setFrameMetrics(null);
    setVisionAnalysis(null);
    frameIndexRef.current = 0;
    lastFrameMetricsUiAtRef.current = 0;
    lastScenePhaseRef.current = 'observing';
    lastSceneSnapshotUiAtRef.current = 0;
    lastStableCandidateKeyRef.current = '';
    liveRuntimeRef.current = createLiveSceneRuntimeState();
    setSceneSnapshot(getLiveSceneSnapshot(liveRuntimeRef.current, 0));

    try {
      void prewarmLiveVisionOcr();
      const stream = await createDisplayMediaStream();
      const [videoTrack] = stream.getVideoTracks();

      if (!videoTrack) {
        throw new Error('비디오 트랙이 없습니다.');
      }

      const video = createHiddenVideo(stream);

      streamRef.current = stream;
      videoRef.current = video;
      setStreamInfo(readStreamInfo(videoTrack));

      videoTrack.addEventListener(
        'ended',
        () => {
          stopCapture('idle');
        },
        {
          once: true,
        },
      );

      await video.play();
      setStatus('capturing');
      sampleFrame();
      scheduleFrameSampling();

      return true;
    } catch (error) {
      stopCapture('error');
      setErrorMessage(getErrorMessage(error));
      return false;
    }
  }, [sampleFrame, scheduleFrameSampling, stopCapture]);

  useEffect(
    () => () => {
      stopCapture('idle');
    },
    [stopCapture],
  );

  const value = useMemo(
    () => ({
      drawPreviewToCanvas,
      errorMessage,
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
      drawPreviewToCanvas,
      errorMessage,
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
