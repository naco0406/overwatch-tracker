import { useCallback, useEffect, useRef, useState } from 'react';

export type GeminiStatsInsightStatus = 'done' | 'error' | 'idle' | 'loading';

export interface GeminiStatsInsightState {
  error?: string;
  message: string;
  signature: string;
  status: GeminiStatsInsightStatus;
  text: string;
}

interface GeminiStatsInsightResponse {
  text?: unknown;
}

const createInitialState = (signature: string): GeminiStatsInsightState => ({
  message: '',
  signature,
  status: 'idle',
  text: '',
});

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Gemini API 요청에 실패했습니다.';

export const useGeminiStatsInsight = (signature: string) => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<GeminiStatsInsightState>(() => createInitialState(signature));

  useEffect(() => {
    abortControllerRef.current?.abort();
  }, [signature]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const generate = useCallback(
    async (prompt: string) => {
      abortControllerRef.current?.abort();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setState({
        message: 'Gemini API로 요약을 생성하고 있습니다.',
        signature,
        status: 'loading',
        text: '',
      });

      try {
        const response = await fetch('/api/gemini/stats-insight', {
          body: JSON.stringify({ prompt, signature }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Gemini API route is not available.');
        }

        const data = (await response.json()) as GeminiStatsInsightResponse;
        const text = typeof data.text === 'string' ? data.text.trim() : '';

        if (!text) {
          throw new Error('Gemini API 응답에 요약 텍스트가 없습니다.');
        }

        setState({
          message: 'AI 분석 완료',
          signature,
          status: 'done',
          text,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setState({
          error: getErrorMessage(error),
          message: '기본 요약으로 표시합니다.',
          signature,
          status: 'error',
          text: '',
        });
      }
    },
    [signature],
  );

  return {
    generate,
    state: state.signature === signature ? state : createInitialState(signature),
  };
};
