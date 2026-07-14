import { useState, type ImgHTMLAttributes } from 'react';

import { DeferredImage } from '@/components/common/DeferredImage';
import { MatchModeLabel } from '@/components/match/MatchModeBadge';
import { getMapLabel, mapOptions } from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';

type MapScreenshotProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  fallbackClassName?: string;
  mapId: string;
};

const mapById = new Map(mapOptions.map((map) => [map.value, map] as const));

export const MapScreenshot = ({
  alt,
  className,
  fallbackClassName,
  mapId,
  onError,
  ...props
}: MapScreenshotProps) => {
  const [failedMapId, setFailedMapId] = useState<string | null>(null);
  const map = mapById.get(mapId);
  const mapLabel = map?.label ?? getMapLabel(mapId);
  const hasError = failedMapId === mapId;

  if (hasError) {
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[linear-gradient(135deg,hsl(var(--surface-2)),hsl(var(--secondary)))] px-2 text-center',
          className,
          fallbackClassName,
        )}
        role={alt ? 'img' : undefined}
        aria-label={alt}
      >
        <span className="line-clamp-2 text-[11px] font-black leading-tight text-foreground">
          {mapLabel}
        </span>
        {map ? (
          <MatchModeLabel
            className="max-w-full justify-center text-[10px] font-bold text-muted-foreground"
            iconClassName="h-3 w-3"
            modeId={map.modeId}
          />
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">이미지 준비 중</span>
        )}
      </div>
    );
  }

  return (
    <DeferredImage
      {...props}
      alt={alt}
      className={className}
      src={getMapScreenshotPath(mapId)}
      onError={(event) => {
        setFailedMapId(mapId);
        onError?.(event);
      }}
    />
  );
};
