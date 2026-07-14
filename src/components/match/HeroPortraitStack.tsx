import { Swords } from 'lucide-react';
import { useState } from 'react';

import { DeferredImage } from '@/components/common/DeferredImage';
import { heroOptions } from '@/data/matchOptions';
import { getHeroPortraitPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';

const heroById = new Map(heroOptions.map((hero) => [hero.value, hero] as const));

interface HeroPortraitStackProps {
  className?: string;
  heroIds: string[];
  max?: number;
  size?: 'sm' | 'md';
}

const HeroPortraitStack = ({
  className,
  heroIds,
  max = 3,
  size = 'sm',
}: HeroPortraitStackProps) => {
  const heroes = heroIds
    .map((heroId) => heroById.get(heroId))
    .filter((hero): hero is (typeof heroOptions)[number] => Boolean(hero));
  const visibleHeroes = heroes.slice(0, max);
  const hiddenCount = Math.max(0, heroes.length - visibleHeroes.length);

  if (visibleHeroes.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('flex min-w-0 items-center', className)}
      aria-label={`플레이 영웅 ${heroes.map((hero) => hero.label).join(', ')}`}
    >
      {visibleHeroes.map((hero, index) => (
        <HeroPortrait key={hero.value} hero={hero} index={index} size={size} />
      ))}
      {hiddenCount > 0 ? (
        <span
          className={cn(
            'ow-slant-frame -ml-1.5 flex shrink-0 items-center justify-center border border-white bg-[hsl(var(--ow-navy))] font-black text-white shadow-sm',
            size === 'md' ? 'h-9 min-w-9 px-1 text-[10px]' : 'h-7 min-w-7 px-1 text-[9px]',
          )}
        >
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
};

const HeroPortrait = ({
  hero,
  index,
  size,
}: {
  hero: (typeof heroOptions)[number];
  index: number;
  size: NonNullable<HeroPortraitStackProps['size']>;
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={cn(
        'ow-portrait-shell relative shrink-0 shadow-sm',
        index > 0 && '-ml-1.5',
        size === 'md' ? 'h-9 w-9' : 'h-7 w-7',
      )}
      title={hero.label}
    >
      <span className="ow-portrait-core">
        <Swords className="h-3.5 w-3.5 text-muted-foreground" />
        {!failed ? (
          <DeferredImage
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top"
            rootMargin="160px"
            src={getHeroPortraitPath(hero.value)}
            onError={() => setFailed(true)}
          />
        ) : null}
      </span>
    </span>
  );
};

export { HeroPortraitStack };
