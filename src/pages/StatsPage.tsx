import type { LucideIcon } from 'lucide-react';
import { BarChart3, Clock3, ListOrdered, MapIcon, RotateCcw, Swords, Target } from 'lucide-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  type TooltipPayloadEntry,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getHeroLabel,
  getMapLabel,
  getModeLabel,
  heroOptions,
  mapOptions,
  modeOptions,
  queueOptions,
  roleLabels,
} from '@/data/matchOptions';
import { getHeroPortraitPath, getMapScreenshotPath } from '@/data/masterAssets';
import { useMatches } from '@/hooks/useMatches';
import { usePlayerAccounts } from '@/hooks/usePlayerAccounts';
import { formatWinRate, summarizeResults } from '@/lib/matchStats';
import { groupMatchesBySession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { Match, ModeId, QueueType } from '@/types/match';
import { getPlayerAccountLabel, type PlayerAccount } from '@/types/playerAccount';

const periodOptions = [
  { label: '전체', value: 'all' },
  { label: '7일', value: '7d' },
  { label: '30일', value: '30d' },
  { label: '90일', value: '90d' },
] as const;

type PeriodFilter = (typeof periodOptions)[number]['value'];

const statsSections = [
  {
    description: '모드별 맵 선택률과 전장별 승률을 비교합니다.',
    eyebrow: '전장 분석',
    title: '전장 통계',
    value: 'maps',
  },
  {
    description: '모드별 경기 수, 승률, 결과 분포를 봅니다.',
    eyebrow: '모드 분석',
    title: '모드 통계',
    value: 'modes',
  },
  {
    description: '영웅 사용량과 승률을 역할별로 확인합니다.',
    eyebrow: '영웅 분석',
    title: '영웅 통계',
    value: 'heroes',
  },
  {
    description: '시간대별 경기 집중도와 승률 변화를 확인합니다.',
    eyebrow: '시간 분석',
    title: '시간대 통계',
    value: 'time',
  },
  {
    description: '세션 안에서 몇 번째 경기인지에 따른 흐름을 분석합니다.',
    eyebrow: '세션 분석',
    title: '순서 통계',
    value: 'order',
  },
] as const;

type StatsSection = (typeof statsSections)[number]['value'];

const isStatsSection = (value: string | undefined): value is StatsSection =>
  statsSections.some((section) => section.value === value);

const periodDays = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} satisfies Record<Exclude<PeriodFilter, 'all'>, number>;

const getPeriodStart = (period: PeriodFilter) => {
  if (period === 'all') {
    return null;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - periodDays[period] + 1);

  return start.getTime();
};

const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

const formatShare = (value: number) => `${value}%`;

const getShare = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 100);

const getBestWinRate = <TItem extends { total: number; winRate: number | null }>(
  items: TItem[],
  minTotal = 1,
) =>
  items
    .filter((item) => item.winRate !== null && item.total >= minTotal)
    .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.total - a.total)[0] ?? null;

const getWorstWinRate = <TItem extends { total: number; winRate: number | null }>(
  items: TItem[],
  minTotal = 1,
) =>
  items
    .filter((item) => item.winRate !== null && item.total >= minTotal)
    .sort((a, b) => (a.winRate ?? 101) - (b.winRate ?? 101) || b.total - a.total)[0] ?? null;

const chartFontFamily =
  'Pretendard, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const chartColors = {
  card: 'hsl(var(--card))',
  draw: 'hsl(var(--muted-foreground) / 0.42)',
  grid: 'hsl(var(--border))',
  loss: 'hsl(var(--destructive))',
  primary: 'hsl(var(--primary))',
  text: 'hsl(var(--muted-foreground))',
  win: 'hsl(var(--primary))',
};

const legendStyle = {
  fontFamily: chartFontFamily,
} satisfies CSSProperties;

const getAxisTick = (fontSize = 12) => ({
  fill: chartColors.text,
  fontFamily: chartFontFamily,
  fontSize,
});

const percentageTooltipKeys = new Set(['승률', '선택률']);

const tooltipCursorStyle = {
  fill: 'hsl(var(--primary) / 0.07)',
  stroke: 'hsl(var(--primary) / 0.2)',
  strokeWidth: 1,
};

const tooltipEscapeViewBox = { x: true, y: true };

const tooltipWrapperStyle = {
  outline: 'none',
} satisfies CSSProperties;

const getTooltipColor = (entry: TooltipPayloadEntry) =>
  entry.color ?? entry.fill ?? entry.stroke ?? chartColors.primary;

const formatTooltipLabel = (label: string | number | undefined) =>
  label === undefined ? '데이터' : String(label);

const formatTooltipValue = (
  value: TooltipValueType | undefined,
  name: string | number | undefined,
) => {
  if (value === undefined) {
    return '--';
  }

  if (Array.isArray(value)) {
    return value.map(String).join(' - ');
  }

  if (typeof value === 'number') {
    const formattedValue = value.toLocaleString('ko-KR', {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
    });

    return percentageTooltipKeys.has(String(name)) ? `${formattedValue}%` : `${formattedValue}경기`;
  }

  return value;
};

const hasTooltipMode = (value: unknown): value is { mode: string } =>
  typeof value === 'object' &&
  value !== null &&
  'mode' in value &&
  typeof (value as { mode?: unknown }).mode === 'string';

const StatsPage = () => {
  const { section } = useParams();
  const activeSection = isStatsSection(section) ? section : 'maps';
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30d');
  const [modeFilter, setModeFilter] = useState<ModeId | 'all'>('all');
  const [queueFilter, setQueueFilter] = useState<QueueType | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const { data: matches = [], isLoading } = useMatches();
  const { data: playerAccounts = [] } = usePlayerAccounts();
  const shouldApplyModeFilter = activeSection !== 'modes' && modeFilter !== 'all';
  const heroRoleById = useMemo(
    () => new Map(heroOptions.map((hero) => [hero.value, hero.role])),
    [],
  );

  const filteredMatches = useMemo(() => {
    const periodStart = getPeriodStart(periodFilter);

    return matches.filter((match) => {
      const playedAtTime = new Date(match.playedAt).getTime();

      if (periodStart !== null && playedAtTime < periodStart) {
        return false;
      }

      if (shouldApplyModeFilter && match.modeId !== modeFilter) {
        return false;
      }

      if (queueFilter !== 'all' && match.queueType !== queueFilter) {
        return false;
      }

      if (accountFilter === 'unassigned' && match.accountId) {
        return false;
      }

      if (
        accountFilter !== 'all' &&
        accountFilter !== 'unassigned' &&
        match.accountId !== accountFilter
      ) {
        return false;
      }

      return true;
    });
  }, [accountFilter, matches, modeFilter, periodFilter, queueFilter, shouldApplyModeFilter]);

  const summary = useMemo(() => summarizeResults(filteredMatches), [filteredMatches]);
  const sessions = useMemo(() => groupMatchesBySession(filteredMatches), [filteredMatches]);

  const modeStats = useMemo(
    () =>
      modeOptions
        .map((mode) => {
          const modeMatches = filteredMatches.filter((match) => match.modeId === mode.value);
          return {
            ...summarizeResults(modeMatches),
            label: mode.label,
            value: mode.value,
          };
        })
        .filter((mode) => mode.total > 0),
    [filteredMatches],
  );

  const modeMapStats = useMemo(
    () =>
      modeOptions
        .map((mode) => {
          const modeMatches = filteredMatches.filter((match) => match.modeId === mode.value);
          const modeSummary = summarizeResults(modeMatches);
          const maps = mapOptions
            .filter((map) => map.modeId === mode.value)
            .map((map) => {
              const mapMatches = modeMatches.filter((match) => match.mapId === map.value);

              return {
                ...summarizeResults(mapMatches),
                label: map.label,
                pickRate: getShare(mapMatches.length, modeMatches.length),
                value: map.value,
              };
            })
            .filter((map) => map.total > 0)
            .sort((a, b) => b.total - a.total || (b.winRate ?? -1) - (a.winRate ?? -1));

          return {
            ...modeSummary,
            label: mode.label,
            maps,
            value: mode.value,
          };
        })
        .filter((mode) => mode.total > 0),
    [filteredMatches],
  );

  const mapStats = useMemo(
    () =>
      mapOptions
        .map((map) => {
          const mapMatches = filteredMatches.filter((match) => match.mapId === map.value);
          return {
            ...summarizeResults(mapMatches),
            label: map.label,
            modeId: map.modeId,
            value: map.value,
          };
        })
        .filter((map) => map.total > 0)
        .sort((a, b) => b.total - a.total || (b.winRate ?? -1) - (a.winRate ?? -1)),
    [filteredMatches],
  );

  const heroStats = useMemo(
    () =>
      heroOptions
        .map((hero) => {
          const heroMatches = filteredMatches.filter((match) =>
            match.myHeroes.includes(hero.value),
          );
          return {
            ...summarizeResults(heroMatches),
            label: hero.label,
            role: hero.role,
            value: hero.value,
          };
        })
        .filter((hero) => hero.total > 0)
        .sort((a, b) => b.total - a.total || (b.winRate ?? -1) - (a.winRate ?? -1)),
    [filteredMatches],
  );

  const roleStats = useMemo(
    () =>
      ['tank', 'damage', 'support']
        .map((role) => {
          const roleMatches = filteredMatches.filter((match) =>
            match.myHeroes.some((heroId) => heroRoleById.get(heroId) === role),
          );

          return {
            ...summarizeResults(roleMatches),
            label: roleLabels[role as keyof typeof roleLabels],
            value: role,
          };
        })
        .filter((role) => role.total > 0),
    [filteredMatches, heroRoleById],
  );

  const hourlyStats = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      matches: [] as Match[],
    }));

    for (const match of filteredMatches) {
      buckets[new Date(match.playedAt).getHours()].matches.push(match);
    }

    return buckets
      .map((bucket) => ({
        ...summarizeResults(bucket.matches),
        hour: bucket.hour,
      }))
      .filter((bucket) => bucket.total > 0);
  }, [filteredMatches]);

  const orderStats = useMemo(() => {
    const buckets = new Map<number, Match[]>();

    for (const session of sessions) {
      session.matches.forEach((match, index) => {
        const order = index + 1;
        const current = buckets.get(order) ?? [];
        current.push(match);
        buckets.set(order, current);
      });
    }

    return Array.from(buckets.entries())
      .map(([order, orderMatches]) => ({
        ...summarizeResults(orderMatches),
        order,
      }))
      .sort((a, b) => a.order - b.order);
  }, [sessions]);

  const modeChartData = useMemo(
    () =>
      modeStats.map((stat) => ({
        경기: stat.total,
        name: stat.label,
        무승부: stat.draws,
        승리: stat.wins,
        승률: stat.winRate ?? 0,
        패배: stat.losses,
      })),
    [modeStats],
  );
  const mapPickRateChartData = useMemo(
    () =>
      modeMapStats
        .flatMap((mode) =>
          mode.maps.map((map) => ({
            name: map.label,
            mode: mode.label,
            경기: map.total,
            선택률: map.pickRate,
            승률: map.winRate ?? 0,
          })),
        )
        .sort((a, b) => b.선택률 - a.선택률 || b.경기 - a.경기)
        .slice(0, 10),
    [modeMapStats],
  );
  const heroChartData = useMemo(
    () =>
      heroStats.slice(0, 12).map((stat) => ({
        name: stat.label,
        경기: stat.total,
        승률: stat.winRate ?? 0,
      })),
    [heroStats],
  );
  const roleChartData = useMemo(
    () =>
      roleStats.map((stat) => ({
        name: stat.label,
        경기: stat.total,
        승률: stat.winRate ?? 0,
      })),
    [roleStats],
  );
  const hourlyChartData = useMemo(
    () =>
      hourlyStats.map((stat) => ({
        name: formatHour(stat.hour),
        경기: stat.total,
        승률: stat.winRate ?? 0,
      })),
    [hourlyStats],
  );
  const orderChartData = useMemo(
    () =>
      orderStats.map((stat) => ({
        name: `${stat.order}번째`,
        경기: stat.total,
        승률: stat.winRate ?? 0,
      })),
    [orderStats],
  );

  const maxModeCount = Math.max(1, ...modeStats.map((stat) => stat.total));
  const maxHeroCount = Math.max(1, ...heroStats.map((stat) => stat.total));
  const maxOrderCount = Math.max(1, ...orderStats.map((stat) => stat.total));
  const topMap = mapStats[0] ?? null;
  const topMode = [...modeStats].sort((a, b) => b.total - a.total)[0] ?? null;
  const bestMap = getBestWinRate(mapStats, 2);
  const bestMode = getBestWinRate(modeStats, 2);
  const topHero = heroStats[0] ?? null;
  const bestHero = getBestWinRate(heroStats, 2);
  const topHour = [...hourlyStats].sort((a, b) => b.total - a.total)[0] ?? null;
  const bestHour = getBestWinRate(hourlyStats, 2);
  const topOrder = [...orderStats].sort((a, b) => b.total - a.total)[0] ?? null;
  const bestOrder = getBestWinRate(orderStats, 2);
  const worstOrder = getWorstWinRate(orderStats, 2);
  const activeSectionMeta =
    statsSections.find((statsSection) => statsSection.value === activeSection) ?? statsSections[0];
  const activeFilterCount = [
    periodFilter !== '30d',
    shouldApplyModeFilter,
    queueFilter !== 'all',
    accountFilter !== 'all',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setPeriodFilter('30d');
    setModeFilter('all');
    setQueueFilter('all');
    setAccountFilter('all');
  };

  const sectionMetrics = {
    heroes: [
      {
        detail: '기록에 등장한 영웅',
        icon: Swords,
        label: '영웅 수',
        value: heroStats.length.toLocaleString('ko-KR'),
      },
      {
        detail: topHero ? `${topHero.total}경기 · ${roleLabels[topHero.role]}` : '기록 대기',
        icon: BarChart3,
        label: '최다 영웅',
        value: topHero ? topHero.label : '--',
      },
      {
        detail: bestHero ? `${bestHero.total}경기 기준` : '표본 2경기 이상',
        icon: Target,
        label: '최고 승률',
        value: bestHero ? `${bestHero.label} ${formatWinRate(bestHero.winRate)}` : '--',
      },
      {
        detail: '선택 영웅 기준',
        icon: BarChart3,
        label: '역할 분포',
        value: roleStats.length.toLocaleString('ko-KR'),
      },
    ],
    maps: [
      {
        detail: '필터 내 고유 전장',
        icon: MapIcon,
        label: '전장 수',
        value: mapStats.length.toLocaleString('ko-KR'),
      },
      {
        detail: topMap ? `${topMap.total}경기 · ${getModeLabel(topMap.modeId)}` : '기록 대기',
        icon: BarChart3,
        label: '최다 선택',
        value: topMap ? topMap.label : '--',
      },
      {
        detail: bestMap ? `${bestMap.total}경기 기준` : '표본 2경기 이상',
        icon: Target,
        label: '최고 승률',
        value: bestMap ? `${bestMap.label} ${formatWinRate(bestMap.winRate)}` : '--',
      },
      {
        detail: '모드 안 맵 선택률',
        icon: MapIcon,
        label: '분석 대상',
        value: modeMapStats.length.toLocaleString('ko-KR'),
      },
    ],
    modes: [
      {
        detail: '기록에 등장한 모드',
        icon: BarChart3,
        label: '모드 수',
        value: modeStats.length.toLocaleString('ko-KR'),
      },
      {
        detail: topMode ? `${topMode.total}경기 · ${formatWinRate(topMode.winRate)}` : '기록 대기',
        icon: BarChart3,
        label: '최다 모드',
        value: topMode ? topMode.label : '--',
      },
      {
        detail: bestMode ? `${bestMode.total}경기 기준` : '표본 2경기 이상',
        icon: Target,
        label: '최고 승률',
        value: bestMode ? `${bestMode.label} ${formatWinRate(bestMode.winRate)}` : '--',
      },
      {
        detail: `${summary.wins}승 ${summary.losses}패 ${summary.draws}무`,
        icon: Target,
        label: '전체 승률',
        value: formatWinRate(summary.winRate),
      },
    ],
    order: [
      {
        detail: '세션 내 순서 구간',
        icon: ListOrdered,
        label: '구간 수',
        value: orderStats.length.toLocaleString('ko-KR'),
      },
      {
        detail: topOrder ? `${topOrder.total}경기` : '기록 대기',
        icon: BarChart3,
        label: '최다 구간',
        value: topOrder ? `${topOrder.order}번째` : '--',
      },
      {
        detail: bestOrder ? `${bestOrder.total}경기 기준` : '표본 2경기 이상',
        icon: Target,
        label: '최고 승률',
        value: bestOrder ? `${bestOrder.order}번째 ${formatWinRate(bestOrder.winRate)}` : '--',
      },
      {
        detail: worstOrder ? `${worstOrder.total}경기 기준` : '표본 2경기 이상',
        icon: ListOrdered,
        label: '주의 구간',
        value: worstOrder ? `${worstOrder.order}번째 ${formatWinRate(worstOrder.winRate)}` : '--',
      },
    ],
    time: [
      {
        detail: '기록이 있는 시간대',
        icon: Clock3,
        label: '시간대 수',
        value: hourlyStats.length.toLocaleString('ko-KR'),
      },
      {
        detail: topHour ? `${topHour.total}경기 집중` : '기록 대기',
        icon: BarChart3,
        label: '최다 시간',
        value: topHour ? formatHour(topHour.hour) : '--',
      },
      {
        detail: bestHour ? `${bestHour.total}경기 기준` : '표본 2경기 이상',
        icon: Target,
        label: '최고 승률',
        value: bestHour ? `${formatHour(bestHour.hour)} ${formatWinRate(bestHour.winRate)}` : '--',
      },
      {
        detail: `${summary.wins}승 ${summary.losses}패 ${summary.draws}무`,
        icon: Clock3,
        label: '분석 경기',
        value: summary.total.toLocaleString('ko-KR'),
      },
    ],
  } satisfies Record<StatsSection, MetricCellProps[]>;

  if (section && !isStatsSection(section)) {
    return <Navigate to="/stats/maps" replace />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={activeSectionMeta.eyebrow}
        title={activeSectionMeta.title}
        description={activeSectionMeta.description}
        actions={
          <Button
            variant="outline"
            className="bg-transparent"
            disabled={activeFilterCount === 0}
            onClick={resetFilters}
          >
            <RotateCcw className="h-4 w-4" />
            초기화
          </Button>
        }
      />

      <section className="min-w-0">
        {activeSection === 'maps' ? (
          <div className="space-y-4">
            <StatsFilterPanel
              activeFilterCount={activeFilterCount}
              accountFilter={accountFilter}
              label="전장 조건"
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onModeFilterChange={setModeFilter}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              title="전장 선택률 기준"
            />
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                  <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                    <p className="metric-label">맵 선택률</p>
                    <h2 className="mt-1 text-lg font-bold">모드 안에서 많이 나온 전장</h2>
                  </div>
                  <div className="section-pad">
                    {modeMapStats.length > 0 ? (
                      <ChartShell className="h-[420px]">
                        <BarChart
                          data={mapPickRateChartData}
                          layout="vertical"
                          margin={{ bottom: 0, left: 8, right: 18, top: 8 }}
                        >
                          <CartesianGrid
                            stroke={chartColors.grid}
                            strokeDasharray="3 3"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            domain={[0, 100]}
                            tick={getAxisTick()}
                            tickFormatter={(value) => `${value}%`}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={128}
                            tick={getAxisTick(11)}
                            tickLine={false}
                            axisLine={false}
                          />
                          <ChartTooltipLayer />
                          <Bar dataKey="선택률" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ChartShell>
                    ) : (
                      <TabEmpty
                        icon={MapIcon}
                        isLoading={isLoading}
                        title="필터에 해당하는 전장 기록이 없습니다."
                      />
                    )}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {modeMapStats.map((mode) => (
                    <div
                      key={mode.value}
                      className="overflow-hidden rounded-lg border border-border/70 bg-card/75"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
                        <div>
                          <p className="metric-label">{mode.total}경기</p>
                          <h3 className="mt-1 text-base font-bold">{mode.label}</h3>
                        </div>
                        <Badge variant="outline" className="bg-transparent">
                          {formatWinRate(mode.winRate)}
                        </Badge>
                      </div>
                      <div className="px-4 py-1 sm:px-5">
                        {mode.maps.map((stat) => (
                          <MediaStatRow
                            key={stat.value}
                            count={stat.total}
                            detail={`${stat.total}경기`}
                            imageSrc={getMapScreenshotPath(stat.value)}
                            label={getMapLabel(stat.value)}
                            maxCount={Math.max(1, mode.total)}
                            share={stat.pickRate}
                            winRate={stat.winRate}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="space-y-4">
                <SectionMetricStack metrics={sectionMetrics.maps} />
                {topMap ? (
                  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                    <div className="aspect-[16/10] bg-secondary">
                      <img
                        alt={topMap.label}
                        className="h-full w-full object-cover"
                        src={getMapScreenshotPath(topMap.value)}
                      />
                    </div>
                    <div className="section-pad">
                      <p className="metric-label">최다 선택 전장</p>
                      <h3 className="mt-1 text-lg font-bold">{topMap.label}</h3>
                      <p className="mt-2 text-sm font-semibold text-muted-foreground">
                        {topMap.total}경기 · {getModeLabel(topMap.modeId)} · 승률{' '}
                        {formatWinRate(topMap.winRate)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </div>
        ) : null}

        {activeSection === 'modes' ? (
          <div className="space-y-4">
            <StatsFilterPanel
              activeFilterCount={activeFilterCount}
              accountFilter={accountFilter}
              includeMode={false}
              label="모드 조건"
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onModeFilterChange={setModeFilter}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              title="모드별 비교 기준"
            />
            <div className="space-y-4">
              <MetricGrid metrics={sectionMetrics.modes} />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                  <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                    <p className="metric-label">결과 분포</p>
                    <h2 className="mt-1 text-lg font-bold">모드별 승/패/무 누적</h2>
                  </div>
                  <div className="section-pad">
                    {modeStats.length > 0 ? (
                      <ChartShell className="h-[380px]">
                        <BarChart
                          data={modeChartData}
                          margin={{ bottom: 0, left: -18, right: 8, top: 12 }}
                        >
                          <CartesianGrid
                            stroke={chartColors.grid}
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="name"
                            tick={getAxisTick()}
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={getAxisTick()}
                            tickLine={false}
                            axisLine={false}
                          />
                          <ChartTooltipLayer />
                          <Legend wrapperStyle={legendStyle} />
                          <Bar
                            dataKey="승리"
                            stackId="result"
                            fill={chartColors.win}
                            radius={[0, 0, 4, 4]}
                          />
                          <Bar dataKey="무승부" stackId="result" fill={chartColors.draw} />
                          <Bar
                            dataKey="패배"
                            stackId="result"
                            fill={chartColors.loss}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ChartShell>
                    ) : (
                      <TabEmpty
                        icon={BarChart3}
                        isLoading={isLoading}
                        title="필터에 해당하는 모드 기록이 없습니다."
                      />
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                  <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                    <p className="metric-label">승률 순위</p>
                    <h2 className="mt-1 text-lg font-bold">모드별 비교</h2>
                  </div>
                  <div className="px-4 py-1 sm:px-5">
                    {modeStats.map((stat) => (
                      <StatRow
                        key={stat.value}
                        count={stat.total}
                        detail={`${stat.wins}승 ${stat.losses}패 ${stat.draws}무`}
                        label={stat.label}
                        maxCount={maxModeCount}
                        winRate={stat.winRate}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                  <p className="metric-label">추세형 비교</p>
                  <h2 className="mt-1 text-lg font-bold">경기 수와 승률</h2>
                </div>
                <div className="section-pad">
                  {modeStats.length > 0 ? (
                    <ChartShell className="h-[320px]">
                      <ComposedChart
                        data={modeChartData}
                        margin={{ bottom: 8, left: -18, right: 8, top: 12 }}
                      >
                        <CartesianGrid
                          stroke={chartColors.grid}
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          tick={getAxisTick()}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                        />
                        <YAxis
                          yAxisId="left"
                          allowDecimals={false}
                          tick={getAxisTick()}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          domain={[0, 100]}
                          tick={getAxisTick()}
                          tickFormatter={(value) => `${value}%`}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltipLayer />
                        <Legend wrapperStyle={legendStyle} />
                        <Bar
                          yAxisId="left"
                          dataKey="경기"
                          fill={chartColors.primary}
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="승률"
                          stroke="hsl(var(--success))"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--success))', r: 3 }}
                        />
                      </ComposedChart>
                    </ChartShell>
                  ) : (
                    <TabEmpty
                      icon={BarChart3}
                      isLoading={isLoading}
                      title="필터에 해당하는 모드 기록이 없습니다."
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === 'heroes' ? (
          <div className="space-y-4">
            <StatsFilterPanel
              activeFilterCount={activeFilterCount}
              accountFilter={accountFilter}
              label="영웅 조건"
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onModeFilterChange={setModeFilter}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              title="영웅 사용 분석 기준"
            />
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                      <p className="metric-label">영웅 사용량</p>
                      <h2 className="mt-1 text-lg font-bold">상위 영웅 경기 수와 승률</h2>
                    </div>
                    <div className="section-pad">
                      {heroStats.length > 0 ? (
                        <ChartShell className="h-[360px]">
                          <ComposedChart
                            data={heroChartData}
                            margin={{ bottom: 8, left: -18, right: 8, top: 12 }}
                          >
                            <CartesianGrid
                              stroke={chartColors.grid}
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="name"
                              tick={getAxisTick(11)}
                              angle={-32}
                              height={58}
                              tickLine={false}
                              axisLine={false}
                              interval={0}
                              textAnchor="end"
                            />
                            <YAxis
                              yAxisId="left"
                              allowDecimals={false}
                              tick={getAxisTick()}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              domain={[0, 100]}
                              tick={getAxisTick()}
                              tickFormatter={(value) => `${value}%`}
                              tickLine={false}
                              axisLine={false}
                            />
                            <ChartTooltipLayer />
                            <Legend wrapperStyle={legendStyle} />
                            <Bar
                              yAxisId="left"
                              dataKey="경기"
                              fill={chartColors.primary}
                              radius={[4, 4, 0, 0]}
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="승률"
                              stroke="hsl(var(--success))"
                              strokeWidth={2}
                              dot={{ fill: 'hsl(var(--success))', r: 3 }}
                            />
                          </ComposedChart>
                        </ChartShell>
                      ) : (
                        <TabEmpty
                          icon={Swords}
                          isLoading={isLoading}
                          title="필터에 해당하는 영웅 기록이 없습니다."
                        />
                      )}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                      <p className="metric-label">역할</p>
                      <h2 className="mt-1 text-lg font-bold">역할별 기록</h2>
                    </div>
                    <div className="section-pad">
                      {roleStats.length > 0 ? (
                        <ChartShell className="h-[360px]">
                          <ComposedChart
                            data={roleChartData}
                            margin={{ bottom: 8, left: -18, right: 8, top: 12 }}
                          >
                            <CartesianGrid
                              stroke={chartColors.grid}
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="name"
                              tick={getAxisTick()}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              yAxisId="left"
                              allowDecimals={false}
                              tick={getAxisTick()}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              domain={[0, 100]}
                              tick={getAxisTick()}
                              tickFormatter={(value) => `${value}%`}
                              tickLine={false}
                              axisLine={false}
                            />
                            <ChartTooltipLayer />
                            <Legend wrapperStyle={legendStyle} />
                            <Bar
                              yAxisId="left"
                              dataKey="경기"
                              fill={chartColors.primary}
                              radius={[4, 4, 0, 0]}
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="승률"
                              stroke="hsl(var(--success))"
                              strokeWidth={2}
                              dot={{ fill: 'hsl(var(--success))', r: 3 }}
                            />
                          </ComposedChart>
                        </ChartShell>
                      ) : (
                        <TabEmpty
                          icon={Swords}
                          isLoading={isLoading}
                          title="필터에 해당하는 역할 기록이 없습니다."
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                  <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                    <p className="metric-label">영웅별 표</p>
                    <h3 className="mt-1 text-lg font-bold">상위 영웅 상세</h3>
                  </div>
                  <div className="grid gap-x-6 px-4 py-1 sm:px-5 lg:grid-cols-2">
                    {heroStats.slice(0, 16).map((stat) => (
                      <MediaStatRow
                        key={stat.value}
                        count={stat.total}
                        detail={roleLabels[stat.role]}
                        imageClassName="object-top"
                        imageSrc={getHeroPortraitPath(stat.value)}
                        label={getHeroLabel(stat.value)}
                        maxCount={maxHeroCount}
                        winRate={stat.winRate}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <aside>
                <SectionMetricStack metrics={sectionMetrics.heroes} />
              </aside>
            </div>
          </div>
        ) : null}

        {activeSection === 'time' ? (
          <div className="space-y-4">
            <StatsFilterPanel
              activeFilterCount={activeFilterCount}
              accountFilter={accountFilter}
              label="시간 조건"
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onModeFilterChange={setModeFilter}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              title="시간대 분석 기준"
            />
            <div className="space-y-4">
              <MetricGrid metrics={sectionMetrics.time} />
              <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                  <p className="metric-label">시간대</p>
                  <h2 className="mt-1 text-lg font-bold">시간대별 경기 수와 승률</h2>
                </div>
                <div className="section-pad">
                  {filteredMatches.length > 0 ? (
                    <ChartShell className="h-[460px]">
                      <ComposedChart
                        data={hourlyChartData}
                        margin={{ bottom: 8, left: -18, right: 8, top: 12 }}
                      >
                        <CartesianGrid
                          stroke={chartColors.grid}
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          tick={getAxisTick(11)}
                          tickLine={false}
                          axisLine={false}
                          interval={1}
                        />
                        <YAxis
                          yAxisId="left"
                          allowDecimals={false}
                          tick={getAxisTick()}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          domain={[0, 100]}
                          tick={getAxisTick()}
                          tickFormatter={(value) => `${value}%`}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltipLayer />
                        <Legend wrapperStyle={legendStyle} />
                        <Bar
                          yAxisId="left"
                          dataKey="경기"
                          fill={chartColors.primary}
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="승률"
                          stroke="hsl(var(--success))"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--success))', r: 3 }}
                        />
                      </ComposedChart>
                    </ChartShell>
                  ) : (
                    <TabEmpty
                      icon={Clock3}
                      isLoading={isLoading}
                      title="필터에 해당하는 시간대 기록이 없습니다."
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === 'order' ? (
          <div className="space-y-4">
            <StatsFilterPanel
              activeFilterCount={activeFilterCount}
              accountFilter={accountFilter}
              label="순서 조건"
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onModeFilterChange={setModeFilter}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              title="세션 순서 분석 기준"
            />
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                  <p className="metric-label">세션 순서</p>
                  <h2 className="mt-1 text-lg font-bold">몇 번째 경기에서 흔들리는지</h2>
                </div>
                <div className="section-pad">
                  {orderStats.length > 0 ? (
                    <ChartShell className="h-[460px]">
                      <ComposedChart
                        data={orderChartData}
                        margin={{ bottom: 8, left: -18, right: 8, top: 12 }}
                      >
                        <CartesianGrid
                          stroke={chartColors.grid}
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          tick={getAxisTick()}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          yAxisId="left"
                          allowDecimals={false}
                          tick={getAxisTick()}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          domain={[0, 100]}
                          tick={getAxisTick()}
                          tickFormatter={(value) => `${value}%`}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltipLayer />
                        <Legend wrapperStyle={legendStyle} />
                        <Bar
                          yAxisId="left"
                          dataKey="경기"
                          fill={chartColors.primary}
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="승률"
                          stroke="hsl(var(--success))"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--success))', r: 3 }}
                        />
                      </ComposedChart>
                    </ChartShell>
                  ) : (
                    <TabEmpty
                      icon={ListOrdered}
                      isLoading={isLoading}
                      title="필터에 해당하는 세션 순서 기록이 없습니다."
                    />
                  )}
                </div>
              </div>

              <aside className="space-y-4">
                <SectionMetricStack metrics={sectionMetrics.order} />
                <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                  <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                    <p className="metric-label">순서별 표</p>
                    <h3 className="mt-1 text-lg font-bold">구간 비교</h3>
                  </div>
                  <div className="px-4 py-1 sm:px-5">
                    {orderStats.slice(0, 12).map((stat) => (
                      <StatRow
                        key={stat.order}
                        count={stat.total}
                        detail={`${stat.wins}승 ${stat.losses}패 ${stat.draws}무`}
                        label={`${stat.order}번째 경기`}
                        maxCount={maxOrderCount}
                        winRate={stat.winRate}
                      />
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};

interface MetricCellProps {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

interface MetricCardProps extends MetricCellProps {
  className?: string;
}

const MetricCard = ({ className, detail, icon: Icon, label, value }: MetricCardProps) => (
  <div className={cn('bg-card/55 p-4 sm:p-5', className)}>
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="metric-label">{label}</p>
          <p className="mt-2 break-words text-xl font-bold leading-tight">{value}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 break-words text-xs font-semibold leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  </div>
);

const MetricGrid = ({ className, metrics }: { className?: string; metrics: MetricCellProps[] }) => (
  <div
    className={cn(
      'grid overflow-hidden rounded-lg border border-border/70 bg-card/55 md:grid-cols-4',
      className,
    )}
  >
    {metrics.map((metric) => (
      <MetricCard
        key={metric.label}
        {...metric}
        className="border-b border-border/60 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
      />
    ))}
  </div>
);

const SectionMetricStack = ({ metrics }: { metrics: MetricCellProps[] }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/55">
    {metrics.map((metric) => (
      <MetricCard
        key={metric.label}
        {...metric}
        className="border-b border-border/60 last:border-b-0"
      />
    ))}
  </div>
);

interface StatsFilterPanelProps {
  activeFilterCount: number;
  accountFilter: string;
  className?: string;
  includeMode?: boolean;
  label: string;
  modeFilter: ModeId | 'all';
  onAccountFilterChange: (value: string) => void;
  onModeFilterChange: (value: ModeId | 'all') => void;
  onPeriodFilterChange: (value: PeriodFilter) => void;
  onQueueFilterChange: (value: QueueType | 'all') => void;
  periodFilter: PeriodFilter;
  playerAccounts: PlayerAccount[];
  queueFilter: QueueType | 'all';
  title: string;
}

const StatsFilterPanel = ({
  activeFilterCount,
  accountFilter,
  className,
  includeMode = true,
  label,
  modeFilter,
  onAccountFilterChange,
  onModeFilterChange,
  onPeriodFilterChange,
  onQueueFilterChange,
  periodFilter,
  playerAccounts,
  queueFilter,
  title,
}: StatsFilterPanelProps) => (
  <div className={cn('rounded-lg border border-border/70 bg-card/55 px-4 py-3 sm:px-5', className)}>
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start">
      <div>
        <div className="flex items-center justify-between gap-3 xl:block">
          <div>
            <p className="metric-label">{label}</p>
            <h2 className="mt-1 text-base font-bold">{title}</h2>
          </div>
          <Badge variant="outline" className="shrink-0 bg-transparent">
            {activeFilterCount}개 적용
          </Badge>
        </div>
      </div>
      <div
        className={cn(
          'grid gap-4',
          includeMode ? 'lg:grid-cols-2 2xl:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        <FilterGroup label="기간">
          {periodOptions.map((period) => (
            <FilterButton
              key={period.value}
              active={periodFilter === period.value}
              onClick={() => onPeriodFilterChange(period.value)}
            >
              {period.label}
            </FilterButton>
          ))}
        </FilterGroup>

        <FilterSelect label="계정">
          <Select value={accountFilter} onValueChange={onAccountFilterChange}>
            <SelectTrigger className="h-9 bg-transparent">
              <SelectValue placeholder="계정 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 계정</SelectItem>
              <SelectItem value="unassigned">미지정</SelectItem>
              {playerAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {getPlayerAccountLabel(account)}
                  {account.isMain ? ' · 본계' : ''}
                  {!account.isActive ? ' · 비활성' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSelect>

        {includeMode ? (
          <FilterGroup label="모드">
            <FilterButton active={modeFilter === 'all'} onClick={() => onModeFilterChange('all')}>
              전체
            </FilterButton>
            {modeOptions.map((mode) => (
              <FilterButton
                key={mode.value}
                active={modeFilter === mode.value}
                onClick={() => onModeFilterChange(mode.value)}
              >
                {mode.label}
              </FilterButton>
            ))}
          </FilterGroup>
        ) : null}

        <FilterGroup label="큐">
          <FilterButton active={queueFilter === 'all'} onClick={() => onQueueFilterChange('all')}>
            전체
          </FilterButton>
          {queueOptions.map((queue) => (
            <FilterButton
              key={queue.value}
              active={queueFilter === queue.value}
              onClick={() => onQueueFilterChange(queue.value)}
            >
              {queue.label}
            </FilterButton>
          ))}
        </FilterGroup>
      </div>
    </div>
  </div>
);

interface FilterButtonProps {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}

const FilterButton = ({ active, children, onClick }: FilterButtonProps) => (
  <button
    type="button"
    className={cn(
      'h-9 shrink-0 rounded-md border px-3 text-xs font-bold transition-[background-color,border-color,color]',
      active
        ? 'border-primary/60 bg-primary/10 text-primary'
        : 'border-border/70 bg-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
    )}
    onClick={onClick}
  >
    {children}
  </button>
);

interface FilterGroupProps {
  children: ReactNode;
  label: string;
}

const FilterGroup = ({ children, label }: FilterGroupProps) => (
  <div>
    <p className="metric-label mb-2">{label}</p>
    <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
      {children}
    </div>
  </div>
);

const FilterSelect = ({ children, label }: FilterGroupProps) => (
  <div>
    <p className="metric-label mb-2">{label}</p>
    {children}
  </div>
);

const ChartTooltipLayer = () => (
  <Tooltip
    allowEscapeViewBox={tooltipEscapeViewBox}
    content={(props) => <ChartTooltip {...props} />}
    cursor={tooltipCursorStyle}
    isAnimationActive={false}
    wrapperStyle={tooltipWrapperStyle}
  />
);

const ChartTooltip = ({
  active,
  label,
  payload,
}: TooltipContentProps<TooltipValueType, string | number>) => {
  const rows = payload?.filter((entry) => entry.value !== undefined && entry.value !== null) ?? [];

  if (!active || rows.length === 0) {
    return null;
  }

  const contextPayload = rows[0]?.payload;
  const contextLabel = hasTooltipMode(contextPayload) ? contextPayload.mode : '데이터 포인트';

  return (
    <div className="max-w-[280px] rounded-lg border border-border/80 bg-card/95 px-3 py-2.5 text-foreground shadow-[0_18px_48px_-28px_hsl(var(--foreground)/0.55)] backdrop-blur-xl">
      <div className="border-b border-border/60 pb-2">
        <p className="metric-label">{contextLabel}</p>
        <p className="mt-1 break-words text-sm font-bold leading-snug">
          {formatTooltipLabel(label)}
        </p>
      </div>
      <div className="mt-2 space-y-2">
        {rows.map((entry, index) => (
          <div
            key={`${String(entry.dataKey ?? entry.name ?? 'metric')}-${index}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getTooltipColor(entry) }}
            />
            <span className="min-w-0 break-words text-xs font-semibold leading-snug text-muted-foreground">
              {String(entry.name ?? entry.dataKey ?? '값')}
            </span>
            <span className="whitespace-nowrap text-right text-xs font-bold">
              {formatTooltipValue(entry.value, entry.name)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ChartShellProps {
  children: ReactNode;
  className?: string;
}

const ChartShell = ({ children, className }: ChartShellProps) => (
  <div className={cn('h-[320px] min-w-0 rounded-md bg-transparent p-1 sm:p-2', className)}>
    <ResponsiveContainer height="100%" width="100%">
      {children}
    </ResponsiveContainer>
  </div>
);

interface StatRowProps {
  count: number;
  detail: string;
  label: string;
  maxCount: number;
  winRate: number | null;
}

const StatRow = ({ count, detail, label, maxCount, winRate }: StatRowProps) => (
  <div className="grid gap-3 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 break-words text-sm font-bold leading-snug">{label}</p>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">{count}경기</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(5, (count / maxCount) * 100)}%` }}
        />
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 sm:justify-end">
      <span className="min-w-0 break-words text-xs font-semibold leading-snug text-muted-foreground">
        {detail}
      </span>
      <Badge variant="outline" className="w-[64px] justify-center bg-transparent">
        {formatWinRate(winRate)}
      </Badge>
    </div>
  </div>
);

interface MediaStatRowProps extends Omit<StatRowProps, 'detail'> {
  detail: string;
  imageClassName?: string;
  imageSrc: string;
  share?: number;
}

const MediaStatRow = ({
  count,
  detail,
  imageClassName,
  imageSrc,
  label,
  maxCount,
  share,
  winRate,
}: MediaStatRowProps) => (
  <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-border/60 py-3 last:border-b-0">
    <div className="aspect-[4/3] overflow-hidden rounded-md bg-secondary">
      <img
        alt={label}
        className={cn('h-full w-full object-cover', imageClassName)}
        src={imageSrc}
        loading="lazy"
      />
    </div>
    <div className="min-w-0 py-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold leading-snug">{label}</p>
          <p className="mt-1 break-words text-xs font-semibold leading-snug text-muted-foreground">
            {detail}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 bg-transparent">
          {formatWinRate(winRate)}
        </Badge>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.max(5, (count / maxCount) * 100)}%` }}
          />
        </div>
        <span className="w-12 text-right text-xs font-semibold text-muted-foreground">
          {share === undefined ? `${count}경기` : formatShare(share)}
        </span>
      </div>
    </div>
  </div>
);

interface TabEmptyProps {
  icon: LucideIcon;
  isLoading: boolean;
  title: string;
}

const TabEmpty = ({ icon: Icon, isLoading, title }: TabEmptyProps) =>
  isLoading ? (
    <TabLoadingSkeleton />
  ) : (
    <EmptyState
      icon={Icon}
      title={title}
      description="필터를 바꾸거나 경기를 추가해보세요."
      className="min-h-[220px]"
    />
  );

const TabLoadingSkeleton = () => (
  <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
    <div className="h-[260px] rounded-lg border border-border/70 bg-card/55 p-4">
      <div className="flex h-full items-center justify-center">
        <div className="relative h-32 w-32 rounded-full border-[18px] border-secondary">
          <SkeletonBlock className="absolute inset-5 rounded-full bg-card" />
        </div>
      </div>
    </div>
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="grid gap-3 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
        >
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-4 w-36 max-w-full" />
              <SkeletonBlock className="h-3 w-10" />
            </div>
            <SkeletonBlock className="mt-3 h-2 w-full rounded-full" />
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-6 w-14" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export { StatsPage };
