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
  analyzeLiveVisionCanvas,
  drawLiveVisionFrame,
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

interface LiveCaptureContextValue {
  drawPreviewToCanvas: (canvas: HTMLCanvasElement) => boolean;
  errorMessage: string;
  evidenceEvents: LiveEvidenceEvent[];
  frameMetrics: LiveFrameMetrics | null;
  isLiveAvailable: boolean;
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
      max: 30,
    },
  },
} as unknown as DisplayMediaStreamOptions;

const fallbackDisplayMediaOptions = {
  audio: false,
  video: true,
} satisfies DisplayMediaStreamOptions;
export const liveSampleIntervalMs = 5_000;

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
  const [evidenceEvents, setEvidenceEvents] = useState<LiveEvidenceEvent[]>([]);
  const [frameMetrics, setFrameMetrics] = useState<LiveFrameMetrics | null>(null);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [streamInfo, setStreamInfo] = useState<LiveStreamInfo | null>(null);
  const [visionAnalysis, setVisionAnalysis] = useState<LiveVisionAnalysis | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIndexRef = useRef(0);
  const sampleTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const visionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visionInFlightRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const clearSampling = useCallback(() => {
    if (sampleTimerRef.current !== null) {
      window.clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
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
      setStreamInfo(null);
      setVisionAnalysis(null);
      frameIndexRef.current = 0;
      visionInFlightRef.current = false;
      void terminateLiveVisionOcr();
    },
    [clearSampling],
  );

  const sampleFrame = useCallback(() => {
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

    setFrameMetrics({
      brightness,
      contrast,
      frameIndex,
      quality,
      sampledAt,
    });
    addEvidenceEvent({
      confidence: quality === 'readable' ? 0.72 : quality === 'soft' ? 0.38 : 0.12,
      detail: `${formatLiveNumber(brightness)} 밝기 · ${formatLiveNumber(contrast)} 대비`,
      frameIndex,
      kind: 'frame',
      label: liveFrameQualityLabel[quality],
    });

    if (quality !== 'readable' || visionInFlightRef.current) {
      return;
    }

    const visionCanvas = visionCanvasRef.current ?? document.createElement('canvas');
    visionCanvasRef.current = visionCanvas;

    if (!drawLiveVisionFrame(video, visionCanvas)) {
      return;
    }

    visionInFlightRef.current = true;
    void analyzeLiveVisionCanvas(visionCanvas)
      .then((analysis) => {
        setVisionAnalysis(analysis);

        if (analysis.screen.screenType === 'map_selection' && analysis.mapSelection) {
          addEvidenceEvent({
            confidence: analysis.screen.confidence,
            detail: formatMapSelectionDetail(analysis),
            frameIndex,
            kind: 'vision',
            label: '맵 선택 감지',
          });
        }
      })
      .catch((error) => {
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
  }, [addEvidenceEvent]);

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
    setEvidenceEvents([]);
    setFrameMetrics(null);
    setVisionAnalysis(null);
    frameIndexRef.current = 0;

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
      addEvidenceEvent({
        confidence: 1,
        detail: 'MediaStream 연결',
        frameIndex: 0,
        kind: 'capture',
        label: '화면 공유',
      });
      sampleFrame();
      sampleTimerRef.current = window.setInterval(sampleFrame, liveSampleIntervalMs);

      return true;
    } catch (error) {
      stopCapture('error');
      setErrorMessage(getErrorMessage(error));
      return false;
    }
  }, [addEvidenceEvent, sampleFrame, stopCapture]);

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
      evidenceEvents,
      frameMetrics,
      isLiveAvailable: status === 'capturing',
      startCapture,
      status,
      stopCapture,
      streamInfo,
      visionAnalysis,
    }),
    [
      drawPreviewToCanvas,
      errorMessage,
      evidenceEvents,
      frameMetrics,
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
