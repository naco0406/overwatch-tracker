import { CalendarDays, Clock3, Grid2X2, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { SkeletonBlock } from '@/components/common/DataState';
import { DeferredImage } from '@/components/common/DeferredImage';
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
  matchRoleOptions,
  modeOptions,
  roleOptions,
  type HeroOption,
  type HeroRoleFilter,
} from '@/data/matchOptions';
import {
  getHeroPortraitPath,
  getMapScreenshotPath,
  getModeIconPath,
  getRoleIconPath,
} from '@/data/masterAssets';
import { useCompetitiveSeasons } from '@/hooks/useCompetitiveSeasons';
import { cn } from '@/lib/utils';
import { getCurrentCompetitiveSeason, type CompetitiveSeason } from '@/types/competitiveSeason';
import type { ModeId } from '@/types/match';

const modeCounts = modeOptions.map((mode) => ({
  ...mode,
  count: mapOptions.filter((map) => map.modeId === mode.value).length,
}));
const searchableHeroOptions = heroOptions.map((hero) => ({
  ...hero,
  searchText: `${hero.label} ${hero.value}`.toLowerCase(),
}));
const searchableMapOptions = mapOptions.map((map) => ({
  ...map,
  searchText: `${map.label} ${map.value}`.toLowerCase(),
}));

const seasonDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  timeZone: 'Asia/Seoul',
  year: 'numeric',
});

const formatSeasonDate = (value: string | null) =>
  value ? seasonDateFormatter.format(new Date(value)) : '미정';

const getSeasonDurationDays = (season: CompetitiveSeason) => {
  if (!season.endsAt) {
    return null;
  }

  const startsAt = new Date(season.startsAt).getTime();
  const endsAt = new Date(season.endsAt).getTime();

  return Math.max(1, Math.round((endsAt - startsAt) / 86_400_000));
};

const getSeasonStatus = (season: CompetitiveSeason, now = new Date()) => {
  const timestamp = now.getTime();
  const startsAt = new Date(season.startsAt).getTime();

  if (timestamp < startsAt) return 'upcoming';

  if (!season.endsAt) return 'current';

  const endsAt = new Date(season.endsAt).getTime();

  if (timestamp >= endsAt) return 'ended';

  return 'current';
};

const getSeasonProgress = (season: CompetitiveSeason, now = new Date()) => {
  if (!season.endsAt) {
    return null;
  }

  const timestamp = now.getTime();
  const startsAt = new Date(season.startsAt).getTime();
  const endsAt = new Date(season.endsAt).getTime();

  if (timestamp <= startsAt) return 0;
  if (timestamp >= endsAt) return 100;

  return Math.round(((timestamp - startsAt) / (endsAt - startsAt)) * 100);
};

const MasterDataPage = () => {
  const [heroQuery, setHeroQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<HeroRoleFilter>('all');
  const [mapQuery, setMapQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeId | 'all'>('all');
  const { data: seasons = [], isLoading: isSeasonsLoading } = useCompetitiveSeasons();
  const currentSeason = useMemo(() => getCurrentCompetitiveSeason(seasons), [seasons]);

  const filteredHeroes = useMemo(() => {
    const query = heroQuery.trim().toLowerCase();

    return searchableHeroOptions.filter((hero) => {
      const roleMatches = roleFilter === 'all' || hero.role === roleFilter;
      const queryMatches = query.length === 0 || hero.searchText.includes(query);

      return roleMatches && queryMatches;
    });
  }, [heroQuery, roleFilter]);

  const filteredMaps = useMemo(() => {
    const query = mapQuery.trim().toLowerCase();

    return searchableMapOptions.filter((map) => {
      const modeMatches = modeFilter === 'all' || map.modeId === modeFilter;
      const queryMatches = query.length === 0 || map.searchText.includes(query);

      return modeMatches && queryMatches;
    });
  }, [mapQuery, modeFilter]);
  const groupedHeroes = useMemo(
    () =>
      matchRoleOptions
        .map((role) => ({
          ...role,
          heroes: filteredHeroes.filter((hero) => hero.role === role.value),
        }))
        .filter((group) => group.heroes.length > 0),
    [filteredHeroes],
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="오버워치"
        title="게임 자료"
        description="오버워치 영웅, 전장, 게임 모드와 현재 시즌을 살펴봅니다."
      />

      <section className="workspace-panel ow-panel-cap overflow-hidden">
        <Tabs defaultValue="heroes">
          <div className="section-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto">
              <TabsTrigger value="heroes">영웅</TabsTrigger>
              <TabsTrigger value="maps">전장</TabsTrigger>
              <TabsTrigger value="seasons">시즌</TabsTrigger>
            </TabsList>
            <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
              <AssetSummaryChip label="영웅" value={heroOptions.length} />
              <AssetSummaryChip label="전장" value={mapOptions.length} />
              <AssetSummaryChip
                label="시즌"
                value={isSeasonsLoading ? '...' : seasons.length.toLocaleString('ko-KR')}
              />
              <AssetSummaryChip label="현재" value={currentSeason?.displayName ?? '-'} />
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

            <div className="space-y-6">
              {groupedHeroes.map((group) => (
                <section key={group.value}>
                  <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-2">
                    <AssetIcon size="sm" src={getRoleIconPath(group.value)} />
                    <h2 className="text-sm font-black">{group.label}</h2>
                    <span className="text-xs font-bold text-muted-foreground">
                      {group.heroes.length.toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-2.5 lg:grid-cols-7 2xl:grid-cols-9">
                    {group.heroes.map((hero) => (
                      <HeroAssetCard key={hero.value} hero={hero} />
                    ))}
                  </div>
                </section>
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

            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredMaps.map((map) => (
                <article
                  key={map.value}
                  className="ow-map-tile group overflow-hidden border border-border bg-card shadow-[0_10px_24px_-22px_hsl(var(--foreground)/0.65)] transition-[border-color,box-shadow] hover:border-primary/55 hover:shadow-[0_12px_26px_-20px_hsl(var(--primary)/0.6)]"
                >
                  <AssetArtwork
                    alt={map.label}
                    className="aspect-video"
                    fallbackLabel={map.label}
                    imageClassName="object-cover"
                    src={getMapScreenshotPath(map.value)}
                  />
                  <div className="grid gap-2 border-t border-border/70 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-black">{getMapLabel(map.value)}</h2>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">전장</p>
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

          <TabsContent value="seasons" className="section-pad mt-0 space-y-5">
            <div className="grid gap-3 lg:grid-cols-3">
              <SeasonMetricCard
                icon={<CalendarDays className="h-4 w-4" />}
                label="현재 시즌"
                value={isSeasonsLoading ? '불러오는 중' : (currentSeason?.displayName ?? '-')}
                detail={
                  currentSeason
                    ? `${formatSeasonDate(currentSeason.startsAt)} - ${formatSeasonDate(
                        currentSeason.endsAt,
                      )}`
                    : '현재 진행 중인 시즌 없음'
                }
              />
              <SeasonMetricCard
                icon={<Grid2X2 className="h-4 w-4" />}
                label="등록 시즌"
                value={isSeasonsLoading ? '...' : seasons.length.toLocaleString('ko-KR')}
                detail="경쟁전 기록 자동 매핑 기준"
              />
              <SeasonMetricCard
                icon={<Clock3 className="h-4 w-4" />}
                label="시간대"
                value="KST"
                detail="시즌 경계는 한국 시간 기준으로 표시"
              />
            </div>

            {isSeasonsLoading ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    className="ow-panel-cap rounded-[3px] border border-border bg-card p-4"
                  >
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="mt-3 h-6 w-44" />
                    <SkeletonBlock className="mt-4 h-3 w-full" />
                    <SkeletonBlock className="mt-3 h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : seasons.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {seasons.map((season) => (
                  <SeasonCard
                    key={season.id}
                    current={currentSeason?.id === season.id}
                    season={season}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[3px] border border-dashed border-border bg-[hsl(var(--surface-2))] p-5">
                <p className="text-sm font-bold">시즌 정보 없음</p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  시즌 일정이 확인되면 시작일과 종료일이 여기에 표시됩니다.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
};

const HeroAssetCard = ({ hero }: { hero: HeroOption }) => (
  <article className="hero-select-button group min-w-0" data-role={hero.role}>
    <div className="hero-select-shell">
      <div className="hero-select-card">
        <AssetArtwork
          alt={hero.label}
          className="aspect-[4/4.35] bg-[hsl(var(--surface-3))]"
          fallbackLabel={hero.label}
          imageClassName="object-cover object-top transition-opacity group-hover:opacity-95"
          src={getHeroPortraitPath(hero.value)}
        />
        <div className="hero-select-name min-w-0 border-t border-border px-1.5">
          <h3 className="truncate text-[10px] font-black sm:text-[11px]">{hero.label}</h3>
        </div>
      </div>
    </div>
  </article>
);

interface AssetSummaryChipProps {
  label: string;
  value: number | string;
}

const AssetSummaryChip = ({ label, value }: AssetSummaryChipProps) => (
  <div className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[3px] border border-border bg-card px-3 text-xs font-bold">
    <span className="text-muted-foreground">{label}</span>
    <span>{value}</span>
  </div>
);

interface SeasonMetricCardProps {
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}

const SeasonMetricCard = ({ detail, icon, label, value }: SeasonMetricCardProps) => (
  <article className="ow-panel-cap rounded-[3px] border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <p className="mt-1 truncate text-lg font-black">{value}</p>
      </div>
      <div className="ow-game-icon-shell h-9 w-9 shrink-0 bg-primary">
        <div className="ow-game-icon-core bg-card text-primary">{icon}</div>
      </div>
    </div>
    <p className="mt-3 min-h-8 text-xs font-semibold leading-relaxed text-muted-foreground">
      {detail}
    </p>
  </article>
);

interface SeasonCardProps {
  current: boolean;
  season: CompetitiveSeason;
}

const SeasonCard = ({ current, season }: SeasonCardProps) => {
  const status = getSeasonStatus(season);
  const progress = getSeasonProgress(season);
  const durationDays = getSeasonDurationDays(season);
  const statusLabel = status === 'current' ? '진행 중' : status === 'upcoming' ? '예정' : '종료';
  const progressLabel =
    progress === null || durationDays === null
      ? '종료일 미정'
      : `${progress}% · ${durationDays.toLocaleString('ko-KR')}일`;

  return (
    <article
      className={cn(
        'ow-panel-cap overflow-hidden rounded-[3px] border bg-card transition-[border-color,box-shadow]',
        current
          ? 'border-primary/35 shadow-[0_20px_60px_-48px_hsl(var(--primary)/0.85)]'
          : 'border-border/70',
      )}
    >
      <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="metric-label">경쟁전 시즌</p>
            <h2 className="mt-1 truncate text-lg font-black">{season.displayName}</h2>
          </div>
          <Badge
            variant={current ? 'secondary' : 'outline'}
            className={cn(
              current
                ? 'border-primary/20 bg-primary/10 text-primary'
                : 'bg-card text-muted-foreground',
            )}
          >
            {current ? '현재 시즌' : statusLabel}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SeasonInfoItem label="시작" value={formatSeasonDate(season.startsAt)} />
          <SeasonInfoItem label="종료" value={formatSeasonDate(season.endsAt)} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="metric-label">진행률</span>
            <span className="text-xs font-bold text-muted-foreground">{progressLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                'h-full rounded-full',
                current ? 'bg-primary' : 'bg-muted-foreground/35',
              )}
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border/70 rounded-md border border-border/70 bg-[hsl(var(--surface-2))]">
          <SeasonInfoItem compact label="연도" value={String(season.year)} />
          <SeasonInfoItem compact label="번호" value={`${season.seasonNumber}시즌`} />
        </div>
      </div>
    </article>
  );
};

interface SeasonInfoItemProps {
  compact?: boolean;
  label: string;
  value: string;
}

const SeasonInfoItem = ({ compact = false, label, value }: SeasonInfoItemProps) => (
  <div className={cn('min-w-0', compact ? 'px-3 py-2.5' : '')}>
    <p className="metric-label">{label}</p>
    <p
      className={cn(
        'mt-1 truncate font-bold',
        compact ? 'text-xs text-muted-foreground' : 'text-sm',
      )}
    >
      {value}
    </p>
  </div>
);

interface AssetIconProps {
  alt?: string;
  className?: string;
  size?: 'sm' | 'md';
  src: string;
}

interface AssetArtworkProps {
  alt: string;
  className?: string;
  fallbackLabel: string;
  imageClassName?: string;
  src: string;
}

const AssetArtwork = ({
  alt,
  className,
  fallbackLabel,
  imageClassName,
  src,
}: AssetArtworkProps) => (
  <div
    className={cn(
      'relative overflow-hidden bg-[linear-gradient(118deg,hsl(var(--surface-2))_0%,hsl(var(--surface-2))_72%,hsl(var(--primary)/0.12)_72%,hsl(var(--primary)/0.12)_74%,hsl(var(--background))_74%)]',
      className,
    )}
  >
    <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
      <span className="rounded-[3px] border border-border bg-card px-3 py-2 text-sm font-black shadow-sm">
        {fallbackLabel}
      </span>
    </div>
    <DeferredImage
      alt={alt}
      className={cn('relative z-10 h-full w-full', imageClassName)}
      decoding="async"
      placeholderClassName="bg-transparent"
      rootMargin="320px"
      src={src}
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  </div>
);

const AssetIcon = ({ alt = '', className, size = 'md', src }: AssetIconProps) => (
  <span className={cn('ow-game-icon-shell', size === 'sm' ? 'h-6 w-6' : 'h-7 w-7', className)}>
    <span className="ow-game-icon-core">
      <img
        alt={alt}
        className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')}
        src={src}
        loading="lazy"
      />
    </span>
  </span>
);

export { MasterDataPage };
