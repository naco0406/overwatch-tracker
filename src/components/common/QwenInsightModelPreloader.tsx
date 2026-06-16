import { useEffect } from 'react';

import {
  canUseQwenInsightNarrator,
  preloadQwenInsightNarrator,
} from '@/hooks/useQwenInsightNarrator';

type WindowWithIdleCallback = Window & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
};

const preloadDelayMs = 1800;

const QwenInsightModelPreloader = () => {
  useEffect(() => {
    if (!canUseQwenInsightNarrator()) {
      return;
    }

    const startPreload = () => {
      preloadQwenInsightNarrator();
    };
    const windowWithIdleCallback = window as WindowWithIdleCallback;
    let timeoutId: number | null = window.setTimeout(startPreload, preloadDelayMs);
    let idleId: number | null = null;

    if (windowWithIdleCallback.requestIdleCallback) {
      idleId = windowWithIdleCallback.requestIdleCallback(startPreload, {
        timeout: 4500,
      });
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (idleId !== null && windowWithIdleCallback.cancelIdleCallback) {
        windowWithIdleCallback.cancelIdleCallback(idleId);
      }
    };
  }, []);

  return null;
};

export { QwenInsightModelPreloader };
