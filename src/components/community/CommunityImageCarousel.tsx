import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CommunityPostImage } from '@/types/communityPost';

interface CommunityImageCarouselProps {
  className?: string;
  images: CommunityPostImage[];
}

const CommunityImageCarousel = ({ className, images }: CommunityImageCarouselProps) => {
  const [index, setIndex] = useState(0);
  const currentImage = images[index] ?? images[0];

  if (!currentImage) {
    return null;
  }

  const goPrevious = () => setIndex((current) => Math.max(0, current - 1));
  const goNext = () => setIndex((current) => Math.min(images.length - 1, current + 1));

  return (
    <div
      className={cn(
        'relative overflow-hidden border-y border-border bg-[hsl(var(--surface-2))]',
        className,
      )}
    >
      <div className="flex aspect-[4/3] max-h-[680px] min-h-[260px] items-center justify-center sm:min-h-[360px]">
        <img
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
          src={currentImage.imageUrl}
        />
      </div>

      {images.length > 1 ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-card/92 shadow-sm"
            disabled={index === 0}
            aria-label="이전 이미지"
            onClick={goPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-card/92 shadow-sm"
            disabled={index === images.length - 1}
            aria-label="다음 이미지"
            onClick={goNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-slate-950/50 px-2 py-1">
            {images.map((image, imageIndex) => (
              <button
                key={image.id}
                type="button"
                className={cn(
                  'h-1.5 w-1.5 rounded-full bg-white/45 transition-colors',
                  imageIndex === index && 'bg-white',
                )}
                aria-label={`${imageIndex + 1}번째 이미지`}
                onClick={() => setIndex(imageIndex)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};

export { CommunityImageCarousel };
