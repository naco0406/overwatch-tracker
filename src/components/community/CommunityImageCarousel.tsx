import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CommunityPostImage } from '@/types/communityPost';

interface CommunityImageCarouselProps {
  className?: string;
  images: CommunityPostImage[];
}

const swipeThreshold = 44;

const CommunityImageCarousel = ({ className, images }: CommunityImageCarouselProps) => {
  const [index, setIndex] = useState(0);
  const pointerStartXRef = useRef<number | null>(null);
  const safeIndex = Math.min(index, Math.max(0, images.length - 1));
  const currentImage = images[safeIndex];

  if (!currentImage) {
    return null;
  }

  const canGoPrevious = safeIndex > 0;
  const canGoNext = safeIndex < images.length - 1;
  const selectIndex = (nextIndex: number) =>
    setIndex(Math.max(0, Math.min(images.length - 1, nextIndex)));
  const goPrevious = () => selectIndex(safeIndex - 1);
  const goNext = () => selectIndex(safeIndex + 1);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' && canGoPrevious) {
      event.preventDefault();
      goPrevious();
    }

    if (event.key === 'ArrowRight' && canGoNext) {
      event.preventDefault();
      goNext();
    }
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStartXRef.current = event.clientX;
  };
  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const startX = pointerStartXRef.current;

    pointerStartXRef.current = null;

    if (startX === null) {
      return;
    }

    const deltaX = event.clientX - startX;

    if (Math.abs(deltaX) < swipeThreshold) {
      return;
    }

    if (deltaX > 0 && canGoPrevious) {
      goPrevious();
    }

    if (deltaX < 0 && canGoNext) {
      goNext();
    }
  };

  return (
    <div
      className={cn(
        'group/carousel relative overflow-hidden border-y border-border bg-white',
        className,
      )}
    >
      <div
        className="flex aspect-square max-h-[680px] min-h-[280px] touch-pan-y items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
        role={images.length > 1 ? 'group' : undefined}
        aria-label={images.length > 1 ? `이미지 ${safeIndex + 1}/${images.length}` : undefined}
        tabIndex={images.length > 1 ? 0 : -1}
        onKeyDown={handleKeyDown}
        onPointerCancel={() => {
          pointerStartXRef.current = null;
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
      >
        <img
          key={currentImage.id}
          alt=""
          className="h-full w-full select-none object-contain"
          draggable={false}
          src={currentImage.imageUrl}
        />
      </div>

      {images.length > 1 ? (
        <>
          <div className="absolute right-3 top-3 rounded-full bg-slate-950/65 px-2.5 py-1 text-xs font-bold text-white">
            {safeIndex + 1}/{images.length}
          </div>
          {canGoPrevious ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-card/92 shadow-sm transition-opacity sm:opacity-0 sm:group-hover/carousel:opacity-100 sm:focus-visible:opacity-100"
              aria-label="이전 이미지"
              title="이전 이미지"
              onClick={goPrevious}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}
          {canGoNext ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-card/92 shadow-sm transition-opacity sm:opacity-0 sm:group-hover/carousel:opacity-100 sm:focus-visible:opacity-100"
              aria-label="다음 이미지"
              title="다음 이미지"
              onClick={goNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-slate-950/55 px-2 py-1">
            {images.map((image, imageIndex) => (
              <button
                key={image.id}
                type="button"
                className={cn(
                  'h-1.5 w-1.5 rounded-full bg-white/45 transition-colors',
                  imageIndex === safeIndex && 'bg-white',
                )}
                aria-label={`${imageIndex + 1}번째 이미지`}
                onClick={() => selectIndex(imageIndex)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};

export { CommunityImageCarousel };
