import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  QwenInsightWorkerInboundMessage,
  QwenInsightWorkerOutboundMessage,
} from '@/lib/qwenInsightWorkerProtocol';

export type QwenInsightNarratorStatus =
  | 'done'
  | 'error'
  | 'generating'
  | 'idle'
  | 'loading'
  | 'unsupported';

export interface QwenInsightNarratorState {
  device?: string;
  dtype?: string;
  error?: string;
  message: string;
  model?: string;
  progress?: number;
  signature: string;
  status: QwenInsightNarratorStatus;
  text: string;
}

type QwenInsightWorkerListener = (message: QwenInsightWorkerOutboundMessage) => void;

const workerListeners = new Set<QwenInsightWorkerListener>();
const activeRequestIds = new Set<string>();

let sharedWorker: Worker | null = null;
let preloadStarted = false;

const createInitialState = (signature: string): QwenInsightNarratorState => ({
  message: '',
  signature,
  status: typeof Worker === 'undefined' ? 'unsupported' : 'idle',
  text: '',
});

const getWorkerRuntimeLabel = () => {
  if (typeof Worker === 'undefined') {
    return 'Worker 없음';
  }

  if (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    typeof (navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined'
  ) {
    return 'WebGPU';
  }

  return 'WASM';
};

const getRequestId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const dispatchWorkerMessage = (message: QwenInsightWorkerOutboundMessage) => {
  if (message.type === 'error' || message.type === 'result') {
    activeRequestIds.delete(message.id);
  }

  for (const listener of workerListeners) {
    listener(message);
  }
};

const getSharedWorker = () => {
  if (typeof Worker === 'undefined') {
    return null;
  }

  if (sharedWorker) {
    return sharedWorker;
  }

  const worker = new Worker(new URL('../workers/qwenInsightWorker.ts', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (event: MessageEvent<QwenInsightWorkerOutboundMessage>) => {
    dispatchWorkerMessage(event.data);
  };

  worker.onerror = (event) => {
    for (const id of activeRequestIds) {
      dispatchWorkerMessage({
        error: event.message,
        id,
        type: 'error',
      });
    }
    activeRequestIds.clear();
    sharedWorker = null;
    preloadStarted = false;
  };

  sharedWorker = worker;
  return worker;
};

export const preloadQwenInsightNarrator = () => {
  if (preloadStarted) {
    return;
  }

  const worker = getSharedWorker();

  if (!worker) {
    return;
  }

  preloadStarted = true;

  const message: QwenInsightWorkerInboundMessage = {
    id: `preload-${getRequestId()}`,
    type: 'preload',
  };

  worker.postMessage(message);
};

export const useQwenInsightNarrator = (signature: string) => {
  const requestIdRef = useRef<string | null>(null);
  const requestSignatureRef = useRef<string | null>(null);
  const signatureRef = useRef(signature);
  const [state, setState] = useState<QwenInsightNarratorState>(() => createInitialState(signature));
  const runtimeLabel = useMemo(() => getWorkerRuntimeLabel(), []);
  const isSupported = runtimeLabel !== 'Worker 없음';

  useEffect(() => {
    signatureRef.current = signature;
    requestIdRef.current = null;
    requestSignatureRef.current = null;
  }, [signature]);

  useEffect(() => {
    const listener: QwenInsightWorkerListener = (message) => {
      if (
        message.id !== requestIdRef.current ||
        requestSignatureRef.current !== signatureRef.current
      ) {
        return;
      }

      if (message.type === 'status') {
        setState((current) => ({
          ...current,
          device: message.device ?? current.device,
          dtype: message.dtype ?? current.dtype,
          message: message.message,
          model: message.model ?? current.model,
          progress: message.progress ?? current.progress,
          status: message.status === 'generating' ? 'generating' : 'loading',
        }));
        return;
      }

      if (message.type === 'chunk') {
        setState((current) => ({
          ...current,
          message: 'AI 분석을 생성 중입니다.',
          status: 'generating',
          text: message.text,
        }));
        return;
      }

      if (message.type === 'result') {
        setState((current) => ({
          ...current,
          device: message.device,
          dtype: message.dtype,
          message: 'AI 분석 완료',
          model: message.model,
          progress: 100,
          status: 'done',
          text: message.text,
        }));
        return;
      }

      setState((current) => ({
        ...current,
        error: message.error,
        message: 'AI 분석 실패',
        status: 'error',
      }));
    };

    workerListeners.add(listener);

    return () => {
      workerListeners.delete(listener);
    };
  }, []);

  const generate = useCallback(
    (prompt: string) => {
      const worker = getSharedWorker();

      if (!worker) {
        setState((current) => ({
          ...current,
          message: '이 브라우저는 Worker를 지원하지 않습니다.',
          status: 'unsupported',
        }));
        return;
      }

      const id = getRequestId();
      requestIdRef.current = id;
      requestSignatureRef.current = signature;
      activeRequestIds.add(id);
      setState((current) => ({
        ...current,
        error: undefined,
        message: 'AI 분석 모델을 준비 중입니다.',
        progress: undefined,
        signature,
        status: 'loading',
        text: '',
      }));

      const message: QwenInsightWorkerInboundMessage = {
        id,
        prompt,
        type: 'generate',
      };

      worker.postMessage(message);
    },
    [signature],
  );

  return {
    generate,
    isSupported,
    runtimeLabel,
    state: state.signature === signature ? state : createInitialState(signature),
  };
};
