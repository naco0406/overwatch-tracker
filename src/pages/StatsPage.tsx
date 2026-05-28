import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Clock3,
  Filter,
  ListOrdered,
  MapIcon,
  RotateCcw,
  Swords,
  Target,
} from 'lucide-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { formatWinRate, getPeakHour, summarizeResults } from '@/lib/matchStats';
import { groupMatchesBySession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { Match, ModeId, QueueType } from '@/types/match';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const periodOptions = [
  { label: '전체', value: 'all' },
  { label: '7일', value: '7d' },
  { label: '30일', value: '30d' },
  { label: '90일', value: '90d' },
] as const;

type PeriodFilter = (typeof periodOptions)[number]['value'];

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

const tooltipStyle = {
  backgroundColor: chartColors.card,
  border: `1px solid ${chartColors.grid}`,
  borderRadius: 8,
  boxShadow: '0 16px 36px -28px hsl(var(--foreground) / 0.36)',
  color: 'hsl(var(--foreground))',
  fontFamily: chartFontFamily,
} satisfies CSSProperties;

const legendStyle = {
  fontFamily: chartFontFamily,
} satisfies CSSProperties;

const getAxisTick = (fontSize = 12) => ({
  fill: chartColors.text,
  fontFamily: chartFontFamily,
  fontSize,
});

const StatsPage = () => {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30d');
  const [modeFilter, setModeFilter] = useState<ModeId | 'all'>('all');
  const [queueFilter, setQueueFilter] = useState<QueueType | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [heroFilter, setHeroFilter] = useState('all');
  const { data: matches = [], isLoading } = useMatches();
  const { data: playerAccounts = [] } = usePlayerAccounts();

  const filteredMatches = useMemo(() => {
    const periodStart = getPeriodStart(periodFilter);

    return matches.filter((match) => {
      const playedAtTime = new Date(match.playedAt).getTime();

      if (periodStart !== null && playedAtTime < periodStart) {
        return false;
      }

      if (modeFilter !== 'all' && match.modeId !== modeFilter) {
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

      if (heroFilter !== 'all' && !match.myHeroes.includes(heroFilter)) {
        return false;
      }

      return true;
    });
  }, [accountFilter, heroFilter, matches, modeFilter, periodFilter, queueFilter]);

  const summary = useMemo(() => summarizeResults(filteredMatches), [filteredMatches]);
  const peakHour = useMemo(() => getPeakHour(filteredMatches), [filteredMatches]);
  const sessions = useMemo(() => groupMatchesBySession(filteredMatches), [filteredMatches]);

  const modeStats = useMemo(
    () =>
      modeOptions.map((mode) => {
        const modeMatches = filteredMatches.filter((match) => match.modeId === mode.value);
        return {
          ...summarizeResults(modeMatches),
          label: mode.label,
          value: mode.value,
        };
      }),
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

  const hourlyStats = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      matches: [] as Match[],
    }));

    for (const match of filteredMatches) {
      buckets[new Date(match.playedAt).getHours()].matches.push(match);
    }

    return buckets.map((bucket) => ({
      ...summarizeResults(bucket.matches),
      hour: bucket.hour,
    }));
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
        name: stat.label,
        무승부: stat.draws,
        승리: stat.wins,
        승률: stat.winRate ?? 0,
        패배: stat.losses,
      })),
    [modeStats],
  );
  const resultChartData = useMemo(
    () =>
      [
        { fill: chartColors.win, name: '승리', value: summary.wins },
        { fill: chartColors.loss, name: '패배', value: summary.losses },
        { fill: chartColors.draw, name: '무승부', value: summary.draws },
      ].filter((item) => item.value > 0),
    [summary.draws, summary.losses, summary.wins],
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
  const maxMapCount = Math.max(1, ...mapStats.map((stat) => stat.total));
  const maxHeroCount = Math.max(1, ...heroStats.map((stat) => stat.total));
  const maxOrderCount = Math.max(1, ...orderStats.map((stat) => stat.total));
  const activeFilterCount = [
    periodFilter !== '30d',
    modeFilter !== 'all',
    queueFilter !== 'all',
    accountFilter !== 'all',
    heroFilter !== 'all',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setPeriodFilter('30d');
    setModeFilter('all');
    setQueueFilter('all');
    setAccountFilter('all');
    setHeroFilter('all');
  };

  const metrics = [
    {
      detail: `${summary.wins}승 ${summary.losses}패 ${summary.draws}무`,
      icon: BarChart3,
      label: '경기',
      value: summary.total.toLocaleString('ko-KR'),
    },
    {
      detail: summary.decisive === 0 ? '승패 데이터 없음' : '무승부 제외',
      icon: Target,
      label: '승률',
      value: formatWinRate(summary.winRate),
    },
    {
      detail: '필터 내 고유 전장',
      icon: MapIcon,
      label: '전장',
      value: new Set(filteredMatches.map((match) => match.mapId)).size.toLocaleString('ko-KR'),
    },
    {
      detail: peakHour ? `${peakHour.count}경기 집중` : '기록 대기',
      icon: Clock3,
      label: '피크 시간',
      value: peakHour ? `${peakHour.hour}시` : '--',
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="분석"
        title="통계"
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

      <section className="workspace-panel overflow-hidden">
        <div className="grid border-b border-border md:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCell key={metric.label} {...metric} />
          ))}
        </div>

        <div className="border-b border-border p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold">필터</p>
            </div>
            <Badge variant={activeFilterCount > 0 ? 'default' : 'secondary'}>
              {activeFilterCount} active
            </Badge>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px_260px]">
            <FilterGroup label="기간">
              {periodOptions.map((period) => (
                <FilterButton
                  key={period.value}
                  active={periodFilter === period.value}
                  onClick={() => setPeriodFilter(period.value)}
                >
                  {period.label}
                </FilterButton>
              ))}
            </FilterGroup>

            <FilterSelect label="계정">
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="h-9 bg-card">
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

            <FilterSelect label="영웅">
              <Select value={heroFilter} onValueChange={setHeroFilter}>
                <SelectTrigger className="h-9 bg-card">
                  <SelectValue placeholder="영웅 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 영웅</SelectItem>
                  {heroOptions.map((hero) => (
                    <SelectItem key={hero.value} value={hero.value}>
                      {hero.label} · {roleLabels[hero.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSelect>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <FilterGroup label="모드">
              <FilterButton active={modeFilter === 'all'} onClick={() => setModeFilter('all')}>
                전체
              </FilterButton>
              {modeOptions.map((mode) => (
                <FilterButton
                  key={mode.value}
                  active={modeFilter === mode.value}
                  onClick={() => setModeFilter(mode.value)}
                >
                  {mode.label}
                </FilterButton>
              ))}
            </FilterGroup>

            <FilterGroup label="큐">
              <FilterButton active={queueFilter === 'all'} onClick={() => setQueueFilter('all')}>
                전체
              </FilterButton>
              {queueOptions.map((queue) => (
                <FilterButton
                  key={queue.value}
                  active={queueFilter === queue.value}
                  onClick={() => setQueueFilter(queue.value)}
                >
                  {queue.label}
                </FilterButton>
              ))}
            </FilterGroup>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <Tabs defaultValue="mode" className="w-full">
            <TabsList className="mobile-scroll flex w-full justify-start overflow-x-auto xl:inline-flex xl:w-auto">
              <TabsTrigger value="mode">모드</TabsTrigger>
              <TabsTrigger value="map">전장</TabsTrigger>
              <TabsTrigger value="hero">영웅</TabsTrigger>
              <TabsTrigger value="time">시간</TabsTrigger>
              <TabsTrigger value="order">순서</TabsTrigger>
            </TabsList>

            <TabsContent value="mode" className="mt-4">
              <AnalysisPanel icon={BarChart3} label="모드 분포" title="모드별 성과">
                {filteredMatches.length > 0 ? (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <ChartShell>
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
                        <Tooltip
                          contentStyle={tooltipStyle}
                          cursor={{ fill: 'hsl(var(--secondary) / 0.65)' }}
                          itemStyle={tooltipStyle}
                          labelStyle={tooltipStyle}
                        />
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

                    <ChartShell>
                      <PieChart>
                        <Tooltip
                          contentStyle={tooltipStyle}
                          itemStyle={tooltipStyle}
                          labelStyle={tooltipStyle}
                        />
                        <Pie
                          data={resultChartData}
                          dataKey="value"
                          innerRadius={58}
                          nameKey="name"
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {resultChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Legend wrapperStyle={legendStyle} />
                      </PieChart>
                    </ChartShell>

                    <div className="space-y-2 xl:col-span-2">
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
                ) : (
                  <TabEmpty
                    icon={BarChart3}
                    isLoading={isLoading}
                    title="필터에 해당하는 모드 기록이 없습니다."
                  />
                )}
              </AnalysisPanel>
            </TabsContent>

            <TabsContent value="map" className="mt-4">
              <AnalysisPanel icon={MapIcon} label="전장 분포" title="전장별 성과">
                {mapStats.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {mapStats.slice(0, 12).map((stat) => (
                      <MediaStatRow
                        key={stat.value}
                        count={stat.total}
                        detail={getModeLabel(stat.modeId)}
                        imageSrc={getMapScreenshotPath(stat.value)}
                        label={getMapLabel(stat.value)}
                        maxCount={maxMapCount}
                        winRate={stat.winRate}
                      />
                    ))}
                  </div>
                ) : (
                  <TabEmpty
                    icon={MapIcon}
                    isLoading={isLoading}
                    title="필터에 해당하는 전장 기록이 없습니다."
                  />
                )}
              </AnalysisPanel>
            </TabsContent>

            <TabsContent value="hero" className="mt-4">
              <AnalysisPanel icon={Swords} label="영웅 풀" title="영웅별 성과">
                {heroStats.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
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
                ) : (
                  <TabEmpty
                    icon={Swords}
                    isLoading={isLoading}
                    title="필터에 해당하는 영웅 기록이 없습니다."
                  />
                )}
              </AnalysisPanel>
            </TabsContent>

            <TabsContent value="time" className="mt-4">
              <AnalysisPanel icon={Clock3} label="시간대" title="시간대별 집중도">
                {filteredMatches.length > 0 ? (
                  <ChartShell className="h-[360px]">
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
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: 'hsl(var(--secondary) / 0.65)' }}
                        itemStyle={tooltipStyle}
                        labelStyle={tooltipStyle}
                      />
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
              </AnalysisPanel>
            </TabsContent>

            <TabsContent value="order" className="mt-4">
              <AnalysisPanel icon={ListOrdered} label="세션 순서" title="세션 내 순서별 성과">
                {orderStats.length > 0 ? (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <ChartShell className="h-[340px]">
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
                        <Tooltip
                          contentStyle={tooltipStyle}
                          cursor={{ fill: 'hsl(var(--secondary) / 0.65)' }}
                          itemStyle={tooltipStyle}
                          labelStyle={tooltipStyle}
                        />
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

                    <div className="space-y-2">
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
                ) : (
                  <TabEmpty
                    icon={ListOrdered}
                    isLoading={isLoading}
                    title="필터에 해당하는 세션 순서 기록이 없습니다."
                  />
                )}
              </AnalysisPanel>
            </TabsContent>
          </Tabs>
        </div>
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

const MetricCell = ({ detail, icon: Icon, label, value }: MetricCellProps) => (
  <div className="flex min-h-[112px] items-start justify-between gap-4 border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-5">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      <p className="mt-3 truncate text-2xl font-bold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
      <Icon className="h-5 w-5" />
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
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
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
    <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1">{children}</div>
  </div>
);

const FilterSelect = ({ children, label }: FilterGroupProps) => (
  <div>
    <p className="metric-label mb-2">{label}</p>
    {children}
  </div>
);

interface AnalysisPanelProps {
  children: ReactNode;
  icon: LucideIcon;
  label: string;
  title: string;
}

const AnalysisPanel = ({ children, icon: Icon, label, title }: AnalysisPanelProps) => (
  <div className="overflow-hidden rounded-lg border border-border bg-card">
    <div className="flex items-center justify-between gap-3 border-b border-border bg-[hsl(var(--surface-2))] p-4">
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <h2 className="mt-2 truncate text-lg font-bold">{title}</h2>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-card text-primary">
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </div>
);

interface ChartShellProps {
  children: ReactNode;
  className?: string;
}

const ChartShell = ({ children, className }: ChartShellProps) => (
  <div
    className={cn(
      'h-[320px] min-w-0 rounded-lg border border-border bg-[hsl(var(--surface-2))] p-3',
      className,
    )}
  >
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
  <div className="grid gap-3 rounded-md border border-border bg-[hsl(var(--surface-2))] p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-bold">{label}</p>
        <span className="text-xs font-semibold text-muted-foreground">{count}경기</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(5, (count / maxCount) * 100)}%` }}
        />
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 sm:justify-end">
      <span className="text-xs font-semibold text-muted-foreground">{detail}</span>
      <Badge variant="outline" className="w-[64px] justify-center bg-card">
        {formatWinRate(winRate)}
      </Badge>
    </div>
  </div>
);

interface MediaStatRowProps extends Omit<StatRowProps, 'detail'> {
  detail: string;
  imageClassName?: string;
  imageSrc: string;
}

const MediaStatRow = ({
  count,
  detail,
  imageClassName,
  imageSrc,
  label,
  maxCount,
  winRate,
}: MediaStatRowProps) => (
  <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-border bg-[hsl(var(--surface-2))] p-2">
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
          <p className="truncate text-sm font-bold">{label}</p>
          <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{detail}</p>
        </div>
        <Badge variant="outline" className="shrink-0 bg-card">
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
        <span className="w-10 text-right text-xs font-semibold text-muted-foreground">
          {count}경기
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
  <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
    <div className="h-[260px] rounded-lg border border-border bg-[hsl(var(--surface-2))] p-4">
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
          className="grid gap-3 rounded-md border border-border bg-[hsl(var(--surface-2))] p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
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
