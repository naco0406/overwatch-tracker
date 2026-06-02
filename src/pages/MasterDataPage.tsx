import { Grid2X2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getMapLabel,
  getModeLabel,
  heroOptions,
  mapOptions,
  modeOptions,
  roleLabels,
  roleOptions,
  type HeroRoleFilter,
} from '@/data/matchOptions';
import {
  getHeroPortraitPath,
  getMapScreenshotPath,
  getModeIconPath,
  getRoleIconPath,
} from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { ModeId } from '@/types/match';

const roleSummary = roleOptions.filter((role) => role.value !== 'all');

const modeCounts = modeOptions.map((mode) => ({
  ...mode,
  count: mapOptions.filter((map) => map.modeId === mode.value).length,
}));

const MasterDataPage = () => {
  const [heroQuery, setHeroQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<HeroRoleFilter>('all');
  const [mapQuery, setMapQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeId | 'all'>('all');

  const filteredHeroes = useMemo(() => {
    const query = heroQuery.trim().toLowerCase();

    return heroOptions.filter((hero) => {
      const roleMatches = roleFilter === 'all' || hero.role === roleFilter;
      const queryMatches =
        query.length === 0 ||
        hero.label.toLowerCase().includes(query) ||
        hero.value.toLowerCase().includes(query);

      return roleMatches && queryMatches;
    });
  }, [heroQuery, roleFilter]);

  const filteredMaps = useMemo(() => {
    const query = mapQuery.trim().toLowerCase();

    return mapOptions.filter((map) => {
      const modeMatches = modeFilter === 'all' || map.modeId === modeFilter;
      const queryMatches =
        query.length === 0 ||
        map.label.toLowerCase().includes(query) ||
        map.value.toLowerCase().includes(query);

      return modeMatches && queryMatches;
    });
  }, [mapQuery, modeFilter]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="마스터"
        title="마스터 데이터"
        description="상세 입력과 이미지 분석에 쓰이는 영웅, 전장, 모드 asset을 확인합니다."
      />

      <section className="workspace-panel overflow-hidden">
        <Tabs defaultValue="heroes">
          <div className="section-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="grid w-full grid-cols-2 lg:w-auto">
              <TabsTrigger value="heroes">영웅</TabsTrigger>
              <TabsTrigger value="maps">전장</TabsTrigger>
            </TabsList>
            <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
              {roleSummary.map((role) => (
                <div
                  key={role.value}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border/70 bg-card px-3 text-xs font-bold"
                >
                  <AssetIcon size="sm" src={getRoleIconPath(role.value)} />
                  {role.label}
                  <span className="text-muted-foreground">
                    {heroOptions.filter((hero) => hero.role === role.value).length}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <TabsContent value="heroes" className="section-pad mt-0 space-y-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
                {roleOptions.map((role) => (
                  <Button
                    key={role.value}
                    type="button"
                    variant={roleFilter === role.value ? 'default' : 'outline'}
                    className={cn('shrink-0', roleFilter !== role.value && 'bg-transparent')}
                    onClick={() => setRoleFilter(role.value)}
                  >
                    {role.value !== 'all' ? (
                      <AssetIcon
                        className={roleFilter === role.value ? 'border-primary-foreground/20' : ''}
                        size="sm"
                        src={getRoleIconPath(role.value)}
                      />
                    ) : (
                      <Grid2X2 className="h-4 w-4" />
                    )}
                    {role.label}
                  </Button>
                ))}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="영웅 검색"
                  value={heroQuery}
                  onChange={(event) => setHeroQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredHeroes.map((hero) => (
                <article
                  key={hero.value}
                  className="group overflow-hidden rounded-lg border border-border/70 bg-card transition-[border-color,background-color] hover:border-primary/35"
                >
                  <div className="relative aspect-[16/11] overflow-hidden bg-[hsl(var(--surface-2))]">
                    <img
                      alt={hero.label}
                      className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                      src={getHeroPortraitPath(hero.value)}
                      loading="lazy"
                    />
                  </div>
                  <div className="grid gap-2 border-t border-border/70 p-2.5 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:p-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold">{hero.label}</h2>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {hero.value}
                      </p>
                    </div>
                    <Badge
                      className="w-fit gap-2 border-border bg-secondary/60 text-foreground"
                      variant="outline"
                    >
                      <AssetIcon size="sm" src={getRoleIconPath(hero.role)} />
                      {roleLabels[hero.role]}
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="maps" className="section-pad mt-0 space-y-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
                <Button
                  type="button"
                  variant={modeFilter === 'all' ? 'default' : 'outline'}
                  className={cn('shrink-0', modeFilter !== 'all' && 'bg-transparent')}
                  onClick={() => setModeFilter('all')}
                >
                  <Grid2X2 className="h-4 w-4" />
                  전체
                </Button>
                {modeCounts.map((mode) => (
                  <Button
                    key={mode.value}
                    type="button"
                    variant={modeFilter === mode.value ? 'default' : 'outline'}
                    className={cn('shrink-0', modeFilter !== mode.value && 'bg-transparent')}
                    onClick={() => setModeFilter(mode.value)}
                  >
                    <AssetIcon
                      className={modeFilter === mode.value ? 'border-primary-foreground/20' : ''}
                      size="sm"
                      src={getModeIconPath(mode.value)}
                    />
                    {mode.label}
                    <span className="text-xs opacity-70">{mode.count}</span>
                  </Button>
                ))}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="전장 검색"
                  value={mapQuery}
                  onChange={(event) => setMapQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {filteredMaps.map((map) => (
                <article
                  key={map.value}
                  className="group overflow-hidden rounded-lg border border-border/70 bg-card transition-[border-color,background-color] hover:border-primary/35"
                >
                  <div className="aspect-[16/8.5] overflow-hidden bg-[hsl(var(--surface-2))]">
                    <img
                      alt={map.label}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                      src={getMapScreenshotPath(map.value)}
                      loading="lazy"
                    />
                  </div>
                  <div className="grid gap-3 border-t border-border/70 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold">{getMapLabel(map.value)}</h2>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {map.value}
                      </p>
                    </div>
                    <Badge
                      className="w-fit gap-2 border-border bg-secondary/60 text-foreground"
                      variant="outline"
                    >
                      <AssetIcon size="sm" src={getModeIconPath(map.modeId)} />
                      {getModeLabel(map.modeId)}
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
};

interface AssetIconProps {
  alt?: string;
  className?: string;
  size?: 'sm' | 'md';
  src: string;
}

const AssetIcon = ({ alt = '', className, size = 'md', src }: AssetIconProps) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-md border border-slate-900/10 bg-slate-950',
      size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
      className,
    )}
  >
    <img
      alt={alt}
      className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')}
      src={src}
      loading="lazy"
    />
  </span>
);

export { MasterDataPage };
