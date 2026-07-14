import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type DeferredImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  eager?: boolean;
  placeholderClassName?: string;
  rootMargin?: string;
  src: string;
};

const requestedImageSources = new Set<string>();
interface SharedObserverEntry {
  callbacks: Map<Element, () => void>;
  observer: IntersectionObserver;
}

const sharedObservers = new Map<string, SharedObserverEntry>();

const observeVisibility = (element: Element, rootMargin: string, onVisible: () => void) => {
  let sharedEntry = sharedObservers.get(rootMargin);

  if (!sharedEntry) {
    const callbacks = new Map<Element, () => void>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const callback = callbacks.get(entry.target);

          if (!callback) {
            return;
          }

          callbacks.delete(entry.target);
          observer.unobserve(entry.target);
          callback();
        });

        if (callbacks.size === 0) {
          observer.disconnect();
          sharedObservers.delete(rootMargin);
        }
      },
      { rootMargin },
    );

    sharedEntry = { callbacks, observer };
    sharedObservers.set(rootMargin, sharedEntry);
  }

  sharedEntry.callbacks.set(element, onVisible);
  sharedEntry.observer.observe(element);

  return () => {
    const currentEntry = sharedObservers.get(rootMargin);

    if (!currentEntry) {
      return;
    }

    currentEntry.observer.unobserve(element);
    currentEntry.callbacks.delete(element);

    if (currentEntry.callbacks.size === 0) {
      currentEntry.observer.disconnect();
      sharedObservers.delete(rootMargin);
    }
  };
};

export const DeferredImage = ({
  className,
  decoding = 'async',
  eager = false,
  loading = 'lazy',
  onError,
  onLoad,
  placeholderClassName,
  rootMargin = '280px',
  src,
  ...props
}: DeferredImageProps) => {
  const placeholderRef = useRef<HTMLSpanElement | null>(null);
  const [visibleSource, setVisibleSource] = useState<string | null>(() =>
    eager || requestedImageSources.has(src) ? src : null,
  );
  const shouldLoad = eager || requestedImageSources.has(src) || visibleSource === src;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (eager || requestedImageSources.has(src)) {
      return;
    }

    const placeholder = placeholderRef.current;

    if (!placeholder || !('IntersectionObserver' in window)) {
      const frameId = window.requestAnimationFrame(() => {
        requestedImageSources.add(src);
        setVisibleSource(src);
      });

      return () => window.cancelAnimationFrame(frameId);
    }

    return observeVisibility(placeholder, rootMargin, () => {
      requestedImageSources.add(src);
      setVisibleSource(src);
    });
  }, [eager, rootMargin, src]);

  if (!shouldLoad) {
    return (
      <span
        ref={placeholderRef}
        aria-hidden="true"
        className={cn('block h-full w-full bg-secondary', className, placeholderClassName)}
      />
    );
  }

  return (
    <img
      {...props}
      className={className}
      decoding={decoding}
      loading={eager ? 'eager' : loading}
      src={src}
      onError={(event) => {
        requestedImageSources.delete(src);
        onError?.(event);
      }}
      onLoad={onLoad}
    />
  );
};
