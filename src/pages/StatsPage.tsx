import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListOrdered,
  Loader2,
  MapIcon,
  RotateCcw,
  Sparkles,
  Swords,
  Target,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
import { MatchRoleIcon, MatchRoleLabel } from '@/components/match/MatchRoleBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getMatchRoleLabel,
  getModeLabel,
  heroOptions,
  matchRoleOptions,
  mapOptions,
  modeOptions,
  queueOptions,
  roleLabels,
} from '@/data/matchOptions';
import { getHeroPortraitPath, getMapScreenshotPath } from '@/data/masterAssets';
import { useCompetitiveSeasons } from '@/hooks/useCompetitiveSeasons';
import { useMatches } from '@/hooks/useMatches';
import { usePlayerAccounts } from '@/hooks/usePlayerAccounts';
import { useQwenInsightNarrator } from '@/hooks/useQwenInsightNarrator';
import {
  compareMatchesByTimelineDesc,
  formatWinRate,
  summarizeResults,
  type ResultSummary,
} from '@/lib/matchStats';
import { groupMatchesBySession } from '@/lib/session';
import {
  buildStatsInsightPack,
  type StatsInsightCandidate,
  type StatsInsightPack,
  type StatsInsightTone,
} from '@/lib/statsInsights';
import { cn } from '@/lib/utils';
import {
  getCurrentCompetitiveSeason,
  getSeasonFilterLabel,
  type CompetitiveSeason,
  type SeasonFilterValue,
} from '@/types/competitiveSeason';
import type { Match, MatchRole, ModeId, QueueType } from '@/types/match';
import { getPlayerAccountLabel, type PlayerAccount } from '@/types/playerAccount';

const periodOptions = [
  { label: '전체', value: 'all' },
  { label: '7일', value: '7d' },
  { label: '30일', value: '30d' },
  { label: '90일', value: '90d' },
  { label: '직접', value: 'custom' },
] as const;

type PeriodFilter = (typeof periodOptions)[number]['value'];

const statsSections = [
  {
    description: '전장별 승률을 먼저 보고, 모드 안에서의 선택 비중은 보조로 확인합니다.',
    eyebrow: '전장 분석',
    title: '전장 통계',
    value: 'maps',
  },
  {
    description: '모드별 승률을 먼저 보고, 승/패/무 분포와 경기 수를 함께 비교합니다.',
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
  {
    description: '현재 필터의 전장, 모드, 영웅, 시간, 순서, 조합 신호를 한 번에 요약합니다.',
    eyebrow: '인사이트',
    title: '요약(beta)',
    value: 'summary',
  },
] as const;

type StatsSection = (typeof statsSections)[number]['value'];

const isStatsSection = (value: string | undefined): value is StatsSection =>
  statsSections.some((section) => section.value === value);

const periodDays = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} satisfies Record<Exclude<PeriodFilter, 'all' | 'custom'>, number>;

const getDateStartTime = (date: string) => new Date(`${date}T00:00:00`).getTime();

const getDateEndTime = (date: string) => new Date(`${date}T23:59:59.999`).getTime();

const formatDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseDateValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const formatDateLabel = (value: string) => {
  const date = parseDateValue(value);

  if (!date) {
    return '';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    year: 'numeric',
  }).format(date);

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

const getCalendarMonthDays = (month: Date) => {
  const firstDay = getMonthStart(month);
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
};

const getNormalizedDateRange = (startDate: string, endDate: string) => {
  if (!startDate && !endDate) {
    return { end: '', start: '' };
  }

  if (!startDate) {
    return { end: endDate, start: endDate };
  }

  if (!endDate) {
    return { end: startDate, start: startDate };
  }

  return startDate <= endDate
    ? { end: endDate, start: startDate }
    : { end: startDate, start: endDate };
};

const getCustomPeriodRange = (startDate: string, endDate: string) => {
  const start = startDate ? getDateStartTime(startDate) : null;
  const end = endDate ? getDateEndTime(endDate) : null;

  if (start === null && end === null) {
    return null;
  }

  if (start !== null && end !== null && start > end) {
    return { end: getDateEndTime(startDate), start: getDateStartTime(endDate) };
  }

  return { end, start };
};

const getPeriodRange = (period: PeriodFilter, startDate: string, endDate: string) => {
  if (period === 'all') {
    return null;
  }

  if (period === 'custom') {
    return getCustomPeriodRange(startDate, endDate);
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - periodDays[period] + 1);

  return { end: null, start: start.getTime() };
};

const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

const formatHourRange = (hour: number) => `${formatHour(hour)}-${formatHour((hour + 1) % 24)}`;

const formatShare = (value: number) => `${value}%`;

const getShare = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 100);

const pushGrouped = <TKey, TValue>(groups: Map<TKey, TValue[]>, key: TKey, value: TValue) => {
  const current = groups.get(key);

  if (current) {
    current.push(value);
    return;
  }

  groups.set(key, [value]);
};

const getEmptyResultSummary = (): ResultSummary => ({
  decisive: 0,
  draws: 0,
  losses: 0,
  total: 0,
  winRate: null,
  wins: 0,
});

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

type HeroRole = keyof typeof roleLabels;

const heroRoles = ['tank', 'damage', 'support'] as const satisfies HeroRole[];
const mapsByMode = new Map(
  modeOptions.map((mode) => [mode.value, mapOptions.filter((map) => map.modeId === mode.value)]),
);

const legendStyle = {
  fontFamily: chartFontFamily,
  zIndex: 1,
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
  pointerEvents: 'none',
  zIndex: 30,
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

const getTooltipExtraRows = (value: unknown, renderedNames: Set<string>) => {
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const datum = value as Record<string, unknown>;
  const rows: Array<{ label: string; value: string }> = [];

  if (!renderedNames.has('경기') && typeof datum.경기 === 'number') {
    rows.push({ label: '경기', value: String(formatTooltipValue(datum.경기, '경기')) });
  }

  if (typeof datum.전적 === 'string') {
    rows.push({ label: '전적', value: datum.전적 });
  }

  if (!renderedNames.has('선택률') && typeof datum.선택률 === 'number') {
    rows.push({ label: '선택률', value: String(formatTooltipValue(datum.선택률, '선택률')) });
  }

  return rows;
};

const StatsPage = () => {
  const { section } = useParams();
  const activeSection = isStatsSection(section) ? section : 'maps';
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [customPeriodStartDate, setCustomPeriodStartDate] = useState('');
  const [customPeriodEndDate, setCustomPeriodEndDate] = useState('');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilterValue>('current');
  const [modeFilter, setModeFilter] = useState<ModeId | 'all'>('all');
  const [matchRoleFilter, setMatchRoleFilter] = useState<MatchRole | 'all'>('all');
  const [queueFilter, setQueueFilter] = useState<QueueType | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const { data: matches = [], isLoading: isMatchesLoading } = useMatches();
  const { data: seasons = [], isLoading: isSeasonsLoading } = useCompetitiveSeasons();
  const { data: playerAccounts = [], isLoading: isAccountsLoading } = usePlayerAccounts();
  const currentSeason = useMemo(() => getCurrentCompetitiveSeason(seasons), [seasons]);
  const currentSeasonId = currentSeason?.id ?? null;
  const isStatsLoading = isMatchesLoading || isAccountsLoading || isSeasonsLoading;
  const shouldApplyModeFilter = activeSection !== 'modes' && modeFilter !== 'all';
  const heroRoleById = useMemo(
    () => new Map(heroOptions.map((hero) => [hero.value, hero.role])),
    [],
  );

  const roleBaseMatches = useMemo(() => {
    const periodRange = getPeriodRange(periodFilter, customPeriodStartDate, customPeriodEndDate);

    return matches.filter((match) => {
      const playedAtTime = new Date(match.playedAt).getTime();

      if (seasonFilter === 'current') {
        if (!currentSeasonId || match.competitiveSeasonId !== currentSeasonId) {
          return false;
        }
      } else if (seasonFilter === 'unassigned') {
        if (match.competitiveSeasonId) {
          return false;
        }
      } else if (seasonFilter !== 'all' && match.competitiveSeasonId !== seasonFilter) {
        return false;
      }

      if (
        periodRange?.start !== null &&
        periodRange?.start !== undefined &&
        playedAtTime < periodRange.start
      ) {
        return false;
      }

      if (
        periodRange?.end !== null &&
        periodRange?.end !== undefined &&
        playedAtTime > periodRange.end
      ) {
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
  }, [
    accountFilter,
    currentSeasonId,
    customPeriodEndDate,
    customPeriodStartDate,
    matches,
    modeFilter,
    periodFilter,
    queueFilter,
    seasonFilter,
    shouldApplyModeFilter,
  ]);

  const filteredMatches = useMemo(
    () =>
      roleBaseMatches.filter(
        (match) => matchRoleFilter === 'all' || match.matchRole === matchRoleFilter,
      ),
    [matchRoleFilter, roleBaseMatches],
  );

  const matchRoleMatchesByRole = useMemo(() => {
    const byMatchRole = new Map<MatchRole, Match[]>();

    for (const match of roleBaseMatches) {
      pushGrouped(byMatchRole, match.matchRole, match);
    }

    return byMatchRole;
  }, [roleBaseMatches]);

  const filteredMatchGroups = useMemo(() => {
    const byHero = new Map<string, Match[]>();
    const byHeroRole = new Map<HeroRole, Match[]>();
    const byMap = new Map<string, Match[]>();
    const byMode = new Map<ModeId, Match[]>();
    const byModeMap = new Map<ModeId, Map<string, Match[]>>();

    for (const match of filteredMatches) {
      pushGrouped(byMap, match.mapId, match);
      pushGrouped(byMode, match.modeId, match);

      let mapsForMode = byModeMap.get(match.modeId);
      if (!mapsForMode) {
        mapsForMode = new Map<string, Match[]>();
        byModeMap.set(match.modeId, mapsForMode);
      }
      pushGrouped(mapsForMode, match.mapId, match);

      const matchHeroRoles = new Set<HeroRole>();
      for (const heroId of new Set(match.myHeroes)) {
        pushGrouped(byHero, heroId, match);

        const heroRole = heroRoleById.get(heroId);
        if (heroRole) {
          matchHeroRoles.add(heroRole);
        }
      }

      for (const heroRole of matchHeroRoles) {
        pushGrouped(byHeroRole, heroRole, match);
      }
    }

    return {
      byHero,
      byHeroRole,
      byMap,
      byMode,
      byModeMap,
    };
  }, [filteredMatches, heroRoleById]);

  const summary = useMemo(() => summarizeResults(filteredMatches), [filteredMatches]);
  const sessions = useMemo(() => groupMatchesBySession(filteredMatches), [filteredMatches]);
  const insightPack = useMemo(() => buildStatsInsightPack(filteredMatches), [filteredMatches]);

  const matchRoleStats = useMemo(
    () =>
      matchRoleOptions.map((role) => {
        const roleMatches = matchRoleMatchesByRole.get(role.value) ?? [];

        return {
          ...summarizeResults(roleMatches),
          label: role.label,
          pickRate: getShare(roleMatches.length, roleBaseMatches.length),
          value: role.value,
        };
      }),
    [matchRoleMatchesByRole, roleBaseMatches.length],
  );

  const modeStats = useMemo(
    () =>
      modeOptions
        .map((mode) => {
          const modeMatches = filteredMatchGroups.byMode.get(mode.value) ?? [];
          return {
            ...summarizeResults(modeMatches),
            label: mode.label,
            value: mode.value,
          };
        })
        .filter((mode) => mode.total > 0),
    [filteredMatchGroups],
  );

  const modeMapStats = useMemo(
    () =>
      modeOptions
        .map((mode) => {
          const modeMatches = filteredMatchGroups.byMode.get(mode.value) ?? [];
          const modeSummary = summarizeResults(modeMatches);
          const modeMapMatches = filteredMatchGroups.byModeMap.get(mode.value);
          const maps = (mapsByMode.get(mode.value) ?? [])
            .map((map) => {
              const mapMatches = modeMapMatches?.get(map.value) ?? [];

              return {
                ...summarizeResults(mapMatches),
                label: map.label,
                pickRate: getShare(mapMatches.length, modeMatches.length),
                value: map.value,
              };
            })
            .filter((map) => map.total > 0)
            .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.total - a.total);

          return {
            ...modeSummary,
            label: mode.label,
            maps,
            value: mode.value,
          };
        })
        .filter((mode) => mode.total > 0),
    [filteredMatchGroups],
  );

  const mapStats = useMemo(
    () =>
      mapOptions
        .map((map) => {
          const mapMatches = filteredMatchGroups.byMap.get(map.value) ?? [];
          return {
            ...summarizeResults(mapMatches),
            label: map.label,
            modeId: map.modeId,
            pickRate: getShare(mapMatches.length, filteredMatches.length),
            value: map.value,
          };
        })
        .filter((map) => map.total > 0)
        .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.total - a.total),
    [filteredMatchGroups, filteredMatches.length],
  );

  const heroStats = useMemo(
    () =>
      heroOptions
        .map((hero) => {
          const heroMatches = filteredMatchGroups.byHero.get(hero.value) ?? [];
          return {
            ...summarizeResults(heroMatches),
            label: hero.label,
            pickRate: getShare(heroMatches.length, filteredMatches.length),
            role: hero.role as HeroRole,
            value: hero.value,
          };
        })
        .filter((hero) => hero.total > 0)
        .sort((a, b) => b.total - a.total || (b.winRate ?? -1) - (a.winRate ?? -1)),
    [filteredMatchGroups, filteredMatches.length],
  );

  const roleStats = useMemo(
    () =>
      heroRoles
        .map((role) => {
          const roleMatches = filteredMatchGroups.byHeroRole.get(role) ?? [];

          return {
            ...summarizeResults(roleMatches),
            label: roleLabels[role],
            pickRate: getShare(roleMatches.length, filteredMatches.length),
            value: role,
          };
        })
        .filter((role) => role.total > 0),
    [filteredMatchGroups, filteredMatches.length],
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

  const fullHourlyStats = useMemo(() => {
    const hourlyStatsByHour = new Map(hourlyStats.map((stat) => [stat.hour, stat]));

    return Array.from(
      { length: 24 },
      (_, hour) =>
        hourlyStatsByHour.get(hour) ?? {
          ...getEmptyResultSummary(),
          hour,
        },
    );
  }, [hourlyStats]);

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

  const modeWinRateStats = useMemo(
    () => [...modeStats].sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.total - a.total),
    [modeStats],
  );

  const modeRecentFormStats = useMemo(
    () =>
      modeWinRateStats.map((modeStat) => {
        const recentMatches = [...(filteredMatchGroups.byMode.get(modeStat.value) ?? [])]
          .sort(compareMatchesByTimelineDesc)
          .slice(0, 8);
        const recentSummary = summarizeResults(recentMatches);
        const trend =
          recentSummary.winRate === null || modeStat.winRate === null
            ? null
            : recentSummary.winRate - modeStat.winRate;

        return {
          ...recentSummary,
          label: modeStat.label,
          matches: [...recentMatches].reverse(),
          trend,
          value: modeStat.value,
        };
      }),
    [filteredMatchGroups, modeWinRateStats],
  );

  const modeChartData = useMemo(
    () =>
      modeWinRateStats.map((stat) => ({
        경기: stat.total,
        name: stat.label,
        무승부: stat.draws,
        승리: stat.wins,
        승률: stat.winRate ?? 0,
        전적: `${stat.wins}승 ${stat.losses}패 ${stat.draws}무`,
        패배: stat.losses,
      })),
    [modeWinRateStats],
  );
  const mapWinRateChartData = useMemo(
    () =>
      mapStats.slice(0, 14).map((stat) => ({
        경기: stat.total,
        mode: getModeLabel(stat.modeId),
        name: stat.label,
        선택률: stat.pickRate,
        승률: stat.winRate ?? 0,
        전적: `${stat.wins}승 ${stat.losses}패 ${stat.draws}무`,
      })),
    [mapStats],
  );
  const selectedMapStat = useMemo(
    () => mapStats.find((stat) => stat.value === selectedMapId) ?? mapStats[0] ?? null,
    [mapStats, selectedMapId],
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
  const hourlyChartData = useMemo(
    () =>
      hourlyStats.map((stat) => ({
        name: formatHour(stat.hour),
        경기: stat.total,
        승률: stat.winRate ?? 0,
        전적: `${stat.wins}승 ${stat.losses}패 ${stat.draws}무`,
      })),
    [hourlyStats],
  );
  const orderChartData = useMemo(
    () =>
      orderStats.map((stat) => ({
        name: `${stat.order}번째`,
        경기: stat.total,
        승률: stat.winRate ?? 0,
        전적: `${stat.wins}승 ${stat.losses}패 ${stat.draws}무`,
      })),
    [orderStats],
  );

  const maxHourCount = Math.max(1, ...hourlyStats.map((stat) => stat.total));
  const topMap = useMemo(
    () => [...mapStats].sort((a, b) => b.total - a.total)[0] ?? null,
    [mapStats],
  );
  const topMode = useMemo(
    () => [...modeStats].sort((a, b) => b.total - a.total)[0] ?? null,
    [modeStats],
  );
  const bestMap = useMemo(() => getBestWinRate(mapStats), [mapStats]);
  const bestMode = useMemo(() => getBestWinRate(modeStats, 2), [modeStats]);
  const topHero = heroStats[0] ?? null;
  const bestHero = useMemo(() => getBestWinRate(heroStats, 2), [heroStats]);
  const topHour = useMemo(
    () => [...hourlyStats].sort((a, b) => b.total - a.total)[0] ?? null,
    [hourlyStats],
  );
  const bestHour = useMemo(() => getBestWinRate(hourlyStats, 2), [hourlyStats]);
  const topOrder = useMemo(
    () => [...orderStats].sort((a, b) => b.total - a.total)[0] ?? null,
    [orderStats],
  );
  const bestOrder = useMemo(() => getBestWinRate(orderStats, 2), [orderStats]);
  const worstOrder = useMemo(() => getWorstWinRate(orderStats, 2), [orderStats]);
  const activeSectionMeta =
    statsSections.find((statsSection) => statsSection.value === activeSection) ?? statsSections[0];
  const activeFilterCount = [
    periodFilter !== 'all',
    seasonFilter !== 'current',
    shouldApplyModeFilter,
    matchRoleFilter !== 'all',
    queueFilter !== 'all',
    accountFilter !== 'all',
  ].filter(Boolean).length;
  const resetFilters = () => {
    setPeriodFilter('all');
    setCustomPeriodStartDate('');
    setCustomPeriodEndDate('');
    setSeasonFilter('current');
    setModeFilter('all');
    setMatchRoleFilter('all');
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
        label: '최다 경기',
        value: topMap ? topMap.label : '--',
      },
      {
        detail: bestMap
          ? `${bestMap.wins}승 ${bestMap.losses}패 ${bestMap.draws}무 · ${bestMap.total}경기 표본`
          : '기록 대기',
        icon: Target,
        label: '최고 승률',
        value: bestMap ? `${bestMap.label} ${formatWinRate(bestMap.winRate)}` : '--',
      },
      {
        detail: `${summary.wins}승 ${summary.losses}패 ${summary.draws}무`,
        icon: MapIcon,
        label: '분석 경기',
        value: summary.total.toLocaleString('ko-KR'),
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
    summary: [
      {
        detail: `${summary.wins}승 ${summary.losses}패 ${summary.draws}무`,
        icon: BarChart3,
        label: '분석 경기',
        value: summary.total.toLocaleString('ko-KR'),
      },
      {
        detail: summary.decisive > 0 ? `${summary.decisive}결정전 기준` : '결정전 기록 대기',
        icon: Target,
        label: '전체 승률',
        value: formatWinRate(summary.winRate),
      },
      {
        detail: '전장 · 모드 · 영웅 · 시간 · 순서 · 조합',
        icon: Sparkles,
        label: '후보 수',
        value: insightPack.candidates.length.toLocaleString('ko-KR'),
      },
      {
        detail: insightPack.candidates[0]
          ? insightToneLabels[insightPack.candidates[0].tone]
          : '표본 대기',
        icon: Sparkles,
        label: '최상위 신호',
        value: insightPack.candidates[0]?.title ?? '--',
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

  if (isStatsLoading) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow={activeSectionMeta.eyebrow}
          title={activeSectionMeta.title}
          description={activeSectionMeta.description}
          actions={
            <Button variant="outline" className="bg-transparent" disabled>
              <RotateCcw className="h-4 w-4" />
              초기화
            </Button>
          }
        />

        <StatsSectionSkeleton section={activeSection} />
      </div>
    );
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
              customPeriodEndDate={customPeriodEndDate}
              customPeriodStartDate={customPeriodStartDate}
              currentSeasonId={currentSeasonId}
              label="전장 조건"
              matchRoleFilter={matchRoleFilter}
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onMatchRoleFilterChange={setMatchRoleFilter}
              onModeFilterChange={setModeFilter}
              onCustomPeriodEndDateChange={setCustomPeriodEndDate}
              onCustomPeriodStartDateChange={setCustomPeriodStartDate}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              onSeasonFilterChange={setSeasonFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              seasonFilter={seasonFilter}
              seasons={seasons}
              title="맵별 승률 기준"
            />
            <PositionSummaryStrip
              activeRole={matchRoleFilter}
              stats={matchRoleStats}
              onRoleChange={setMatchRoleFilter}
            />
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                  <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                    <p className="metric-label">전장 승률</p>
                    <h2 className="mt-1 text-lg font-bold">승률과 표본을 같이 비교</h2>
                  </div>
                  <div className="section-pad">
                    {mapStats.length > 0 ? (
                      <ChartShell className="h-[360px] sm:h-[420px]">
                        <BarChart
                          data={mapWinRateChartData}
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
                          <Bar dataKey="승률" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ChartShell>
                    ) : (
                      <TabEmpty
                        icon={MapIcon}
                        isLoading={isStatsLoading}
                        title="필터에 해당하는 전장 기록이 없습니다."
                      />
                    )}
                  </div>
                </div>

                <MapAtlasPanel
                  isLoading={isStatsLoading}
                  selectedMap={selectedMapStat}
                  stats={mapStats}
                  onSelectMap={setSelectedMapId}
                />
              </div>

              <aside className="space-y-4">
                <SectionMetricStack metrics={sectionMetrics.maps} />
                {bestMap ? (
                  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                    <div className="aspect-[16/10] bg-secondary">
                      <img
                        alt={bestMap.label}
                        className="h-full w-full object-cover"
                        src={getMapScreenshotPath(bestMap.value)}
                      />
                    </div>
                    <div className="section-pad">
                      <p className="metric-label">최고 승률 전장</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 text-lg font-bold">{bestMap.label}</h3>
                        {bestMap.total < 2 ? (
                          <Badge variant="outline" className="bg-transparent">
                            표본 적음
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-muted-foreground">
                        {bestMap.wins}승 {bestMap.losses}패 {bestMap.draws}무 · {bestMap.total}
                        경기 · {getModeLabel(bestMap.modeId)} · 승률{' '}
                        {formatWinRate(bestMap.winRate)}
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
              customPeriodEndDate={customPeriodEndDate}
              customPeriodStartDate={customPeriodStartDate}
              currentSeasonId={currentSeasonId}
              includeMode={false}
              label="모드 조건"
              matchRoleFilter={matchRoleFilter}
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onMatchRoleFilterChange={setMatchRoleFilter}
              onModeFilterChange={setModeFilter}
              onCustomPeriodEndDateChange={setCustomPeriodEndDate}
              onCustomPeriodStartDateChange={setCustomPeriodStartDate}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              onSeasonFilterChange={setSeasonFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              seasonFilter={seasonFilter}
              seasons={seasons}
              title="모드별 비교 기준"
            />
            <PositionSummaryStrip
              activeRole={matchRoleFilter}
              stats={matchRoleStats}
              onRoleChange={setMatchRoleFilter}
            />
            <div className="space-y-4">
              <MetricGrid metrics={sectionMetrics.modes} />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
                <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                  <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                    <p className="metric-label">모드별 승률</p>
                    <h2 className="mt-1 text-lg font-bold">어떤 모드에서 승률이 좋은지</h2>
                  </div>
                  <div className="section-pad">
                    {modeStats.length > 0 ? (
                      <>
                        <ChartShell className="h-[220px] sm:h-[260px]">
                          <BarChart
                            data={modeChartData}
                            margin={{ bottom: 0, left: -18, right: 8, top: 8 }}
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
                              domain={[0, 100]}
                              tick={getAxisTick()}
                              tickFormatter={(value) => `${value}%`}
                              tickLine={false}
                              axisLine={false}
                            />
                            <ChartTooltipLayer />
                            <Bar
                              dataKey="승률"
                              fill={chartColors.primary}
                              maxBarSize={44}
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ChartShell>
                        <ModeRecentFormPanel stats={modeRecentFormStats} />
                      </>
                    ) : (
                      <TabEmpty
                        icon={BarChart3}
                        isLoading={isStatsLoading}
                        title="필터에 해당하는 모드 기록이 없습니다."
                      />
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                  <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                    <p className="metric-label">승률 순위</p>
                    <h2 className="mt-1 text-lg font-bold">모드별 판단 요약</h2>
                  </div>
                  <div className="px-4 py-1 sm:px-5">
                    {modeWinRateStats.length > 0 ? (
                      modeWinRateStats.map((stat) => (
                        <ModeInsightRow
                          key={stat.value}
                          modeMapStats={modeMapStats.find((mode) => mode.value === stat.value)}
                          stat={stat}
                        />
                      ))
                    ) : (
                      <TabEmpty
                        icon={BarChart3}
                        isLoading={isStatsLoading}
                        title="필터에 해당하는 모드 기록이 없습니다."
                      />
                    )}
                  </div>
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
              customPeriodEndDate={customPeriodEndDate}
              customPeriodStartDate={customPeriodStartDate}
              currentSeasonId={currentSeasonId}
              label="영웅 조건"
              matchRoleFilter={matchRoleFilter}
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onMatchRoleFilterChange={setMatchRoleFilter}
              onModeFilterChange={setModeFilter}
              onCustomPeriodEndDateChange={setCustomPeriodEndDate}
              onCustomPeriodStartDateChange={setCustomPeriodStartDate}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              onSeasonFilterChange={setSeasonFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              seasonFilter={seasonFilter}
              seasons={seasons}
              title="영웅 사용 분석 기준"
            />
            <PositionSummaryStrip
              activeRole={matchRoleFilter}
              stats={matchRoleStats}
              onRoleChange={setMatchRoleFilter}
            />
            {heroStats.length > 0 ? (
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <HeroSpotlightPanel bestHero={bestHero} topHero={topHero} />

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                      <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                        <p className="metric-label">영웅 사용량</p>
                        <h2 className="mt-1 text-lg font-bold">많이 꺼낸 영웅과 승률</h2>
                      </div>
                      <div className="section-pad">
                        <ChartShell className="h-[280px] sm:h-[320px]">
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
                              angle={-30}
                              height={54}
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
                              maxBarSize={40}
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
                      </div>
                    </div>

                    <HeroRolePanel roleStats={roleStats} />
                  </div>

                  <HeroRosterPanel heroStats={heroStats} />
                </div>

                <aside className="space-y-4">
                  <SectionMetricStack metrics={sectionMetrics.heroes} />
                  {bestHero ? <HeroBestPanel hero={bestHero} /> : null}
                </aside>
              </div>
            ) : (
              <div className="rounded-lg border border-border/70 bg-card/75 section-pad">
                <TabEmpty
                  icon={Swords}
                  isLoading={isStatsLoading}
                  title="필터에 해당하는 영웅 기록이 없습니다."
                />
              </div>
            )}
          </div>
        ) : null}

        {activeSection === 'time' ? (
          <div className="space-y-4">
            <StatsFilterPanel
              activeFilterCount={activeFilterCount}
              accountFilter={accountFilter}
              customPeriodEndDate={customPeriodEndDate}
              customPeriodStartDate={customPeriodStartDate}
              currentSeasonId={currentSeasonId}
              label="시간 조건"
              matchRoleFilter={matchRoleFilter}
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onMatchRoleFilterChange={setMatchRoleFilter}
              onModeFilterChange={setModeFilter}
              onCustomPeriodEndDateChange={setCustomPeriodEndDate}
              onCustomPeriodStartDateChange={setCustomPeriodStartDate}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              onSeasonFilterChange={setSeasonFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              seasonFilter={seasonFilter}
              seasons={seasons}
              title="시간대 분석 기준"
            />
            <PositionSummaryStrip
              activeRole={matchRoleFilter}
              stats={matchRoleStats}
              onRoleChange={setMatchRoleFilter}
            />
            {hourlyStats.length > 0 ? (
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                  <TimeSpotlightPanel bestHour={bestHour} summary={summary} topHour={topHour} />

                  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                      <p className="metric-label">시간대 흐름</p>
                      <h2 className="mt-1 text-lg font-bold">경기 수와 승률 변화</h2>
                    </div>
                    <div className="section-pad">
                      <ChartShell className="h-[280px] sm:h-[340px]">
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
                            maxBarSize={34}
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
                    </div>
                  </div>

                  <TimeClockBoard stats={fullHourlyStats} maxCount={maxHourCount} />
                </div>

                <aside className="space-y-4">
                  <SectionMetricStack metrics={sectionMetrics.time} />
                  <TimeRankPanel stats={hourlyStats} />
                </aside>
              </div>
            ) : (
              <div className="rounded-lg border border-border/70 bg-card/75 section-pad">
                <TabEmpty
                  icon={Clock3}
                  isLoading={isStatsLoading}
                  title="필터에 해당하는 시간대 기록이 없습니다."
                />
              </div>
            )}
          </div>
        ) : null}

        {activeSection === 'order' ? (
          <div className="space-y-4">
            <StatsFilterPanel
              activeFilterCount={activeFilterCount}
              accountFilter={accountFilter}
              customPeriodEndDate={customPeriodEndDate}
              customPeriodStartDate={customPeriodStartDate}
              currentSeasonId={currentSeasonId}
              label="순서 조건"
              matchRoleFilter={matchRoleFilter}
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onMatchRoleFilterChange={setMatchRoleFilter}
              onModeFilterChange={setModeFilter}
              onCustomPeriodEndDateChange={setCustomPeriodEndDate}
              onCustomPeriodStartDateChange={setCustomPeriodStartDate}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              onSeasonFilterChange={setSeasonFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              seasonFilter={seasonFilter}
              seasons={seasons}
              title="세션 순서 분석 기준"
            />
            <PositionSummaryStrip
              activeRole={matchRoleFilter}
              stats={matchRoleStats}
              onRoleChange={setMatchRoleFilter}
            />
            {orderStats.length > 0 ? (
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <OrderSpotlightPanel
                    bestOrder={bestOrder}
                    topOrder={topOrder}
                    worstOrder={worstOrder}
                  />

                  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
                    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                      <p className="metric-label">세션 순서</p>
                      <h2 className="mt-1 text-lg font-bold">몇 번째 경기에서 흔들리는지</h2>
                    </div>
                    <div className="section-pad">
                      <ChartShell className="h-[280px] sm:h-[340px]">
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
                            maxBarSize={42}
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
                    </div>
                  </div>

                  <OrderFlowPanel
                    bestOrder={bestOrder}
                    stats={orderStats}
                    worstOrder={worstOrder}
                  />
                </div>

                <aside className="space-y-4">
                  <SectionMetricStack metrics={sectionMetrics.order} />
                  <OrderJudgePanel
                    bestOrder={bestOrder}
                    stats={orderStats}
                    worstOrder={worstOrder}
                  />
                </aside>
              </div>
            ) : (
              <div className="rounded-lg border border-border/70 bg-card/75 section-pad">
                <TabEmpty
                  icon={ListOrdered}
                  isLoading={isStatsLoading}
                  title="필터에 해당하는 세션 순서 기록이 없습니다."
                />
              </div>
            )}
          </div>
        ) : null}

        {activeSection === 'summary' ? (
          <div className="space-y-4">
            <StatsFilterPanel
              activeFilterCount={activeFilterCount}
              accountFilter={accountFilter}
              customPeriodEndDate={customPeriodEndDate}
              customPeriodStartDate={customPeriodStartDate}
              currentSeasonId={currentSeasonId}
              label="요약 조건"
              matchRoleFilter={matchRoleFilter}
              modeFilter={modeFilter}
              onAccountFilterChange={setAccountFilter}
              onMatchRoleFilterChange={setMatchRoleFilter}
              onModeFilterChange={setModeFilter}
              onCustomPeriodEndDateChange={setCustomPeriodEndDate}
              onCustomPeriodStartDateChange={setCustomPeriodStartDate}
              onPeriodFilterChange={setPeriodFilter}
              onQueueFilterChange={setQueueFilter}
              onSeasonFilterChange={setSeasonFilter}
              periodFilter={periodFilter}
              playerAccounts={playerAccounts}
              queueFilter={queueFilter}
              seasonFilter={seasonFilter}
              seasons={seasons}
              title="인사이트 분석 기준"
            />
            <PositionSummaryStrip
              activeRole={matchRoleFilter}
              stats={matchRoleStats}
              onRoleChange={setMatchRoleFilter}
            />
            <MetricGrid metrics={sectionMetrics.summary} />
            <StatsInsightSummaryPanel insightPack={insightPack} />
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
  <div className={cn('bg-card/55 p-3.5 sm:p-5', className)}>
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
      'grid grid-cols-2 overflow-hidden rounded-lg border border-border/70 bg-card/55 md:grid-cols-4',
      className,
    )}
  >
    {metrics.map((metric) => (
      <MetricCard
        key={metric.label}
        {...metric}
        className="border-b border-border/60 odd:border-r last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
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

const insightToneLabels = {
  neutral: '관찰',
  positive: '강점',
  warning: '주의',
} satisfies Record<StatsInsightTone, string>;

const insightToneClassNames = {
  neutral: 'border-white/15 bg-white/[0.05]',
  positive: 'border-emerald-300/25 bg-emerald-300/[0.08]',
  warning: 'border-amber-300/30 bg-amber-300/[0.08]',
} satisfies Record<StatsInsightTone, string>;

const insightToneBadgeClassNames = {
  neutral: 'border-white/15 bg-white/10 text-slate-300',
  positive: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  warning: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
} satisfies Record<StatsInsightTone, string>;

const insightToneAccentClassNames = {
  neutral: 'bg-slate-400/70',
  positive: 'bg-emerald-300',
  warning: 'bg-amber-300',
} satisfies Record<StatsInsightTone, string>;

const insightToneIconClassNames = {
  neutral: 'border-white/15 bg-white/10 text-slate-300',
  positive: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  warning: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
} satisfies Record<StatsInsightTone, string>;

const StatsInsightSummaryPanel = ({ insightPack }: { insightPack: StatsInsightPack }) => {
  const { generate, isSupported, state } = useQwenInsightNarrator(insightPack.signature);
  const shouldAutoGenerate =
    isSupported && insightPack.summary.total > 0 && state.status === 'idle';
  const isBusy = state.status === 'loading' || state.status === 'generating' || shouldAutoGenerate;
  const generatedText = state.text.trim();
  const displayText = generatedText || insightPack.fallbackText;
  const topCandidate = insightPack.candidates[0] ?? null;
  const positiveCandidateCount = insightPack.candidates.filter(
    (candidate) => candidate.tone === 'positive',
  ).length;
  const warningCandidateCount = insightPack.candidates.filter(
    (candidate) => candidate.tone === 'warning',
  ).length;
  const neutralCandidateCount = insightPack.candidates.filter(
    (candidate) => candidate.tone === 'neutral',
  ).length;

  useEffect(() => {
    if (!shouldAutoGenerate) {
      return;
    }

    generate(insightPack.prompt);
  }, [generate, insightPack.prompt, shouldAutoGenerate]);

  return (
    <section className="ai-insight-shell overflow-hidden rounded-lg border border-sky-300/20 shadow-[0_34px_120px_-76px_rgb(2_6_23/0.9)]">
      <div className="ai-scanline" />
      <div className="relative z-10 overflow-hidden border-b border-white/10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-sky-400/25 via-emerald-300/55 to-amber-300/45" />
        <div className="px-4 py-6 sm:px-5">
          <div className="min-w-0">
            <Badge
              variant="outline"
              className="mb-3 w-fit gap-1.5 border-sky-300/25 bg-sky-300/10 text-sky-100 shadow-[0_0_30px_rgb(56_189_248/0.15)]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI 분석
            </Badge>
            <h2 className="ai-gradient-text text-2xl font-black tracking-normal sm:text-3xl">
              경기 흐름 요약
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300/85">
              눈에 띄는 강점과 점검 포인트를 간결하게 정리합니다.
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 grid xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4 p-4 sm:p-5">
          <StatsInsightNarrativePanel
            displayText={displayText}
            generatedText={generatedText}
            insightPack={insightPack}
            isBusy={isBusy}
            state={state}
          />
        </div>

        <StatsInsightSignalPanel
          neutralCandidateCount={neutralCandidateCount}
          positiveCandidateCount={positiveCandidateCount}
          topCandidate={topCandidate}
          totalCandidateCount={insightPack.candidates.length}
          warningCandidateCount={warningCandidateCount}
        />
      </div>

      <div className="relative z-10 border-t border-white/10 bg-black/20 p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-400">인사이트 후보</p>
            <h3 className="mt-1 text-base font-bold text-white">계산된 신호</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="w-fit border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
            >
              강점 {positiveCandidateCount}
            </Badge>
            <Badge
              variant="outline"
              className="w-fit border-amber-300/30 bg-amber-300/10 text-amber-100"
            >
              주의 {warningCandidateCount}
            </Badge>
            <Badge variant="outline" className="w-fit border-white/15 bg-white/10 text-slate-200">
              전체 {insightPack.candidates.length}
            </Badge>
          </div>
        </div>

        {insightPack.candidates.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {insightPack.candidates.map((candidate, index) => (
              <StatsInsightCandidateCard key={candidate.id} candidate={candidate} index={index} />
            ))}
          </div>
        ) : (
          <div className="ai-glass rounded-lg p-5">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">표본 대기</p>
              <p className="mt-1 text-sm font-semibold text-slate-300/80">
                표본이 더 쌓이면 후보가 표시됩니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const StatsInsightNarrativePanel = ({
  displayText,
  generatedText,
  insightPack,
  isBusy,
  state,
}: {
  displayText: string;
  generatedText: string;
  insightPack: StatsInsightPack;
  isBusy: boolean;
  state: ReturnType<typeof useQwenInsightNarrator>['state'];
}) => {
  const shouldShowSkeleton = isBusy;
  const title = isBusy ? '요약을 준비하는 중' : generatedText ? 'AI 요약' : '기본 요약';
  const meta =
    insightPack.summary.total === 0
      ? '기록 없음'
      : state.status === 'unsupported'
        ? 'PC에서 사용 가능'
        : state.status === 'error'
          ? '기본 요약'
          : generatedText
            ? '요약 완료'
            : isBusy
              ? getStatsInsightLoadingLabel(state)
              : '기본 요약';

  return (
    <div className="ai-glow-border rounded-lg">
      <div className="ai-glass overflow-hidden rounded-lg">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-400">AI 요약</p>
            <p className="mt-1 truncate text-sm font-bold text-white">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                isBusy
                  ? 'animate-pulse bg-sky-300 shadow-[0_0_18px_rgb(125_211_252/0.85)]'
                  : state.status === 'error'
                    ? 'bg-amber-300'
                    : state.status === 'done'
                      ? 'bg-emerald-300'
                      : 'bg-slate-500',
              )}
            />
            <span className="max-w-[180px] truncate text-xs font-semibold text-slate-300/80">
              {meta}
            </span>
          </div>
        </div>

        {shouldShowSkeleton ? <StatsInsightProgress state={state} /> : null}

        <div className="min-h-[300px] px-4 py-5 sm:px-5" aria-live="polite">
          {shouldShowSkeleton ? (
            <StatsInsightGeneratingState />
          ) : (
            <StatsInsightStructuredList
              candidates={insightPack.candidates}
              fallbackText={insightPack.fallbackText}
              text={displayText}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const getStatsInsightLoadingLabel = (state: ReturnType<typeof useQwenInsightNarrator>['state']) =>
  state.status === 'generating' ? '요약을 정리하고 있습니다.' : '분석을 준비하고 있습니다.';

const getStatsInsightProgress = (state: ReturnType<typeof useQwenInsightNarrator>['state']) => {
  if (state.status === 'generating') {
    return Math.max(90, state.progress ?? 90);
  }

  if (state.status === 'loading') {
    return state.progress ?? 8;
  }

  return 6;
};

const StatsInsightProgress = ({
  state,
}: {
  state: ReturnType<typeof useQwenInsightNarrator>['state'];
}) => {
  const progress = Math.round(Math.min(96, Math.max(6, getStatsInsightProgress(state))));

  return (
    <div className="border-b border-white/10 bg-black/10 px-4 py-3 sm:px-5">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300/85">
        <span className="truncate">{getStatsInsightLoadingLabel(state)}</span>
        <span className="shrink-0 tabular-nums">{progress}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 via-emerald-300 to-amber-300 shadow-[0_0_22px_rgb(56_189_248/0.35)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

interface ParsedStatsInsightItem {
  text: string;
  title?: string;
  tone: StatsInsightTone;
}

const isStatsInsightTone = (value: unknown): value is StatsInsightTone =>
  value === 'neutral' || value === 'positive' || value === 'warning';

const normalizeStatsInsightTone = (value: unknown): StatsInsightTone => {
  if (isStatsInsightTone(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return 'neutral';
  }

  if (/강점|positive|good|best/i.test(value)) {
    return 'positive';
  }

  if (/주의|warning|risk|weak|bad/i.test(value)) {
    return 'warning';
  }

  return 'neutral';
};

const getStatsInsightToneFromText = (value: string): StatsInsightTone => {
  if (/^\s*(?:\[[^\]]*주의[^\]]*\]|주의[:\s]|리스크|낮은|흔들)/.test(value)) {
    return 'warning';
  }

  if (/^\s*(?:\[[^\]]*강점[^\]]*\]|강점[:\s]|높은|좋은|유리)/.test(value)) {
    return 'positive';
  }

  return 'neutral';
};

const isUsableStatsInsightText = (value: string) => {
  const trimmedValue = value.trim();

  return (
    trimmedValue.length > 0 &&
    !trimmedValue.includes('\uFFFD') &&
    !/^(?:최종\s*결론|결론|주요\s*전략)\s*[:：]?/i.test(stripInsightLineMarker(trimmedValue))
  );
};

const extractStatsInsightJsonText = (value: string) => {
  const cleanedValue = value
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const startIndex = cleanedValue.indexOf('{');
  const endIndex = cleanedValue.lastIndexOf('}');

  if (startIndex >= 0 && endIndex > startIndex) {
    return cleanedValue.slice(startIndex, endIndex + 1);
  }

  const arrayStartIndex = cleanedValue.indexOf('[');
  const arrayEndIndex = cleanedValue.lastIndexOf(']');

  if (arrayStartIndex >= 0 && arrayEndIndex > arrayStartIndex) {
    return cleanedValue.slice(arrayStartIndex, arrayEndIndex + 1);
  }

  return null;
};

const normalizeStatsInsightCandidateId = (value: string) =>
  value
    .trim()
    .replace(/^["'`]+/, '')
    .replace(/["'`,.;\s]+$/g, '');

const toParsedStatsInsightItem = (candidate: StatsInsightCandidate): ParsedStatsInsightItem => ({
  text: candidate.description,
  title: candidate.title,
  tone: candidate.tone,
});

const parseStatsInsightCandidateReferences = (
  value: string,
  candidates: StatsInsightCandidate[],
) => {
  if (candidates.length === 0) {
    return [];
  }

  const cleanedValue = value
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const usedCandidateIds = new Set<string>();

  return candidates
    .map((candidate) => ({
      candidate,
      index: cleanedValue.indexOf(candidate.id),
    }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index)
    .map(({ candidate }) => {
      if (usedCandidateIds.has(candidate.id)) {
        return null;
      }

      usedCandidateIds.add(candidate.id);
      return toParsedStatsInsightItem(candidate);
    })
    .filter((item): item is ParsedStatsInsightItem => item !== null)
    .slice(0, 5);
};

const getCandidateIdFromInsightValue = (value: unknown) => {
  if (typeof value === 'string') {
    return normalizeStatsInsightCandidateId(value);
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const valueRecord = value as {
    candidate_id?: unknown;
    candidateId?: unknown;
    candidateID?: unknown;
    id?: unknown;
  };
  const candidateId =
    valueRecord.candidateId ??
    valueRecord.candidate_id ??
    valueRecord.candidateID ??
    valueRecord.id;

  return typeof candidateId === 'string' ? normalizeStatsInsightCandidateId(candidateId) : null;
};

const createStatsInsightCandidateMap = (candidates: StatsInsightCandidate[]) =>
  new Map(candidates.map((candidate) => [candidate.id, candidate]));

const parseStatsInsightSchema = (
  value: string,
  candidates: StatsInsightCandidate[],
): ParsedStatsInsightItem[] => {
  const jsonText = extractStatsInsightJsonText(value);

  if (!jsonText) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(jsonText) as unknown;
    const candidateById = createStatsInsightCandidateMap(candidates);
    const usedCandidateIds = new Set<string>();
    const insightValues =
      typeof parsedValue === 'object' && parsedValue !== null && 'insights' in parsedValue
        ? (parsedValue as { insights?: unknown }).insights
        : parsedValue;

    if (!Array.isArray(insightValues)) {
      return [];
    }

    return insightValues
      .map((item): ParsedStatsInsightItem | null => {
        const candidateId = getCandidateIdFromInsightValue(item);

        if (candidateId) {
          const candidate = candidateById.get(candidateId);

          if (candidate && !usedCandidateIds.has(candidate.id)) {
            usedCandidateIds.add(candidate.id);

            return toParsedStatsInsightItem(candidate);
          }
        }

        if (candidates.length > 0) {
          return null;
        }

        if (typeof item !== 'object' || item === null) {
          return null;
        }

        const itemRecord = item as {
          description?: unknown;
          summary?: unknown;
          text?: unknown;
          title?: unknown;
          tone?: unknown;
        };
        const textValue = itemRecord.text ?? itemRecord.summary ?? itemRecord.description;

        if (typeof textValue !== 'string' || !isUsableStatsInsightText(textValue)) {
          return null;
        }

        return {
          text: stripInsightLineMarker(textValue),
          title: typeof itemRecord.title === 'string' ? itemRecord.title.trim() : undefined,
          tone: normalizeStatsInsightTone(itemRecord.tone),
        };
      })
      .filter((item): item is ParsedStatsInsightItem => item !== null)
      .slice(0, 5);
  } catch {
    return [];
  }
};

const getStatsInsightTextLines = (value: string) => {
  const normalizedValue = value.replace(/\r/g, '\n').trim();
  const newlineLines = normalizedValue
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (newlineLines.length > 1) {
    return mergeNumberOnlyInsightLines(newlineLines);
  }

  const inlineNumberedLines = normalizedValue
    .split(/\s+(?=\d+[.)]\s+)/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (inlineNumberedLines.length > 1) {
    return inlineNumberedLines;
  }

  return (
    normalizedValue
      .match(/[^.!?]+(?:[.!?]+|$)/g)
      ?.map((line) => line.trim())
      .filter(Boolean) ?? []
  );
};

const stripInsightLineMarker = (value: string) =>
  value
    .replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, '')
    .replace(/^\*+\s*/, '')
    .replace(/\*+$/g, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim();

const mergeNumberOnlyInsightLines = (lines: string[]) => {
  const mergedLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^\d+[.)]?$/.test(line) && lines[index + 1]) {
      mergedLines.push(`${line}. ${lines[index + 1]}`);
      index += 1;
      continue;
    }

    mergedLines.push(line);
  }

  return mergedLines;
};

const parseStatsInsightItems = (value: string, candidates: StatsInsightCandidate[]) => {
  const schemaItems = parseStatsInsightSchema(value, candidates);

  if (schemaItems.length > 0) {
    return schemaItems;
  }

  const candidateReferenceItems = parseStatsInsightCandidateReferences(value, candidates);

  if (candidateReferenceItems.length > 0) {
    return candidateReferenceItems;
  }

  if (candidates.length > 0) {
    return [];
  }

  return getStatsInsightTextLines(value)
    .filter(isUsableStatsInsightText)
    .map(
      (line): ParsedStatsInsightItem => ({
        text: stripInsightLineMarker(line),
        tone: getStatsInsightToneFromText(line),
      }),
    )
    .filter((item) => isUsableStatsInsightText(item.text))
    .slice(0, 5);
};

const StatsInsightStructuredList = ({
  candidates,
  fallbackText,
  text,
}: {
  candidates: StatsInsightCandidate[];
  fallbackText: string;
  text: string;
}) => {
  const parsedItems = parseStatsInsightItems(text, candidates);
  const items =
    parsedItems.length > 0 ? parsedItems : parseStatsInsightItems(fallbackText, candidates);

  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => (
        <li
          key={`${index}-${item.title ?? item.text}`}
          className="group flex gap-3 rounded-md border border-white/10 bg-white/[0.045] px-3 py-2.5 transition-[border-color,background-color] duration-200 hover:border-sky-300/25 hover:bg-white/[0.07]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-sky-300/25 bg-sky-300/10 text-xs font-black text-sky-100">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              {item.title ? (
                <span className="text-xs font-bold text-slate-200">{item.title}</span>
              ) : null}
              <Badge
                variant="outline"
                className={cn('h-5 px-1.5 text-[10px]', insightToneBadgeClassNames[item.tone])}
              >
                {insightToneLabels[item.tone]}
              </Badge>
            </span>
            <span className="mt-1 block break-words text-sm font-semibold leading-6 text-slate-100 sm:text-[15px]">
              {item.text}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
};

const StatsInsightGeneratingState = () => (
  <div className="space-y-5">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-sky-300/25 bg-sky-300/10 text-sky-100 shadow-[0_0_28px_rgb(56_189_248/0.2)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
      <div className="min-w-0 flex-1">
        <SkeletonBlock className="h-4 w-48 max-w-full" />
        <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
      </div>
    </div>
    <div className="space-y-3">
      <SkeletonBlock className="h-4 w-[94%]" />
      <SkeletonBlock className="h-4 w-[88%]" />
      <SkeletonBlock className="h-4 w-[72%]" />
      <SkeletonBlock className="h-4 w-[82%]" />
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <SkeletonBlock className="h-3 w-14" />
          <SkeletonBlock className="mt-2 h-5 w-20" />
        </div>
      ))}
    </div>
  </div>
);

const StatsInsightSignalPanel = ({
  neutralCandidateCount,
  positiveCandidateCount,
  topCandidate,
  totalCandidateCount,
  warningCandidateCount,
}: {
  neutralCandidateCount: number;
  positiveCandidateCount: number;
  topCandidate: StatsInsightCandidate | null;
  totalCandidateCount: number;
  warningCandidateCount: number;
}) => {
  const getWidth = (count: number) =>
    totalCandidateCount === 0 ? 0 : Math.round((count / totalCandidateCount) * 100);

  return (
    <aside className="border-t border-white/10 bg-black/20 p-4 sm:p-5 xl:border-l xl:border-t-0">
      <div className="space-y-4">
        <div className="ai-glass overflow-hidden rounded-lg">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-400">최상위 신호</p>
              <p className="mt-1 break-words text-sm font-bold text-white">
                {topCandidate ? topCandidate.title : '표본 대기'}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'shrink-0',
                topCandidate
                  ? insightToneBadgeClassNames[topCandidate.tone]
                  : 'border-white/15 bg-white/10 text-slate-300',
              )}
            >
              {topCandidate ? insightToneLabels[topCandidate.tone] : '대기'}
            </Badge>
          </div>

          <div className="p-4">
            {topCandidate ? (
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
                      insightToneIconClassNames[topCandidate.tone],
                    )}
                  >
                    {topCandidate.tone === 'warning' ? (
                      <TriangleAlert className="h-5 w-5" />
                    ) : topCandidate.tone === 'positive' ? (
                      <Target className="h-5 w-5" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                  </div>
                  <p className="min-w-0 break-words text-sm font-semibold leading-7 text-slate-300/85">
                    {topCandidate.description}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {topCandidate.details.map((detail) => (
                    <div
                      key={`${topCandidate.id}-${detail.label}`}
                      className="min-w-0 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2.5"
                    >
                      <p className="truncate text-[11px] font-semibold text-slate-400">
                        {detail.label}
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-white">{detail.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/15 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-slate-300/80">
                  표본이 더 쌓이면 최상위 신호가 표시됩니다.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="ai-glass rounded-lg p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-400">신호 분포</p>
              <p className="mt-1 truncate text-sm font-bold text-white">
                {totalCandidateCount}개 후보
              </p>
            </div>
            <Sparkles className="h-4 w-4 shrink-0 text-sky-200" />
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10">
            {totalCandidateCount === 0 ? (
              <div className="h-full w-full bg-slate-500/30" />
            ) : (
              <>
                <div
                  className="h-full bg-emerald-300 shadow-[0_0_18px_rgb(110_231_183/0.55)]"
                  style={{ width: `${getWidth(positiveCandidateCount)}%` }}
                />
                <div
                  className="h-full bg-amber-300 shadow-[0_0_18px_rgb(253_230_138/0.45)]"
                  style={{ width: `${getWidth(warningCandidateCount)}%` }}
                />
                <div
                  className="h-full bg-slate-400/50"
                  style={{ width: `${getWidth(neutralCandidateCount)}%` }}
                />
              </>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-emerald-200">강점</p>
              <p className="mt-1 text-sm font-bold text-white">{positiveCandidateCount}</p>
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-amber-200">주의</p>
              <p className="mt-1 text-sm font-bold text-white">{warningCandidateCount}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-2">
              <p className="text-[11px] font-semibold text-slate-400">관찰</p>
              <p className="mt-1 text-sm font-bold text-white">{neutralCandidateCount}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

const StatsInsightCandidateCard = ({
  candidate,
  index,
}: {
  candidate: StatsInsightCandidate;
  index: number;
}) => (
  <div
    className={cn(
      'group relative overflow-hidden rounded-lg border shadow-[0_16px_55px_-42px_rgb(2_6_23/0.9)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-sky-300/35 hover:shadow-[0_22px_80px_-48px_rgb(56_189_248/0.55)]',
      insightToneClassNames[candidate.tone],
    )}
  >
    <div
      className={cn('absolute inset-x-0 top-0 h-1', insightToneAccentClassNames[candidate.tone])}
    />
    <div className="p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
            insightToneIconClassNames[candidate.tone],
          )}
        >
          {candidate.tone === 'warning' ? (
            <TriangleAlert className="h-5 w-5" />
          ) : candidate.tone === 'positive' ? (
            <Target className="h-5 w-5" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400">#{index + 1}</span>
            <Badge
              variant="outline"
              className={cn('shrink-0', insightToneBadgeClassNames[candidate.tone])}
            >
              {insightToneLabels[candidate.tone]}
            </Badge>
          </div>
          <h3 className="mt-2 break-words text-sm font-bold leading-snug text-white">
            {candidate.title}
          </h3>
          <p className="mt-2 break-words text-xs font-semibold leading-relaxed text-slate-300/80">
            {candidate.description}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {candidate.details.slice(0, 4).map((detail) => (
          <div
            key={`${candidate.id}-${detail.label}`}
            className="min-w-0 rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-2"
          >
            <p className="truncate text-[11px] font-semibold text-slate-400">{detail.label}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-slate-100">{detail.value}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

interface PositionSummaryStripProps {
  activeRole: MatchRole | 'all';
  onRoleChange: (value: MatchRole | 'all') => void;
  stats: Array<{
    draws: number;
    label: string;
    losses: number;
    pickRate: number;
    total: number;
    value: MatchRole;
    winRate: number | null;
    wins: number;
  }>;
}

const PositionSummaryStrip = ({ activeRole, onRoleChange, stats }: PositionSummaryStripProps) => {
  const total = stats.reduce((sum, stat) => sum + stat.total, 0);
  const wins = stats.reduce((sum, stat) => sum + stat.wins, 0);
  const losses = stats.reduce((sum, stat) => sum + stat.losses, 0);
  const draws = stats.reduce((sum, stat) => sum + stat.draws, 0);
  const decisive = wins + losses;
  const allWinRate = decisive === 0 ? null : Math.round((wins / decisive) * 100);

  const items = [
    {
      detail: `${wins}승 ${losses}패 ${draws}무`,
      label: '전체',
      pickRate: total === 0 ? 0 : 100,
      total,
      value: 'all' as const,
      winRate: allWinRate,
    },
    ...stats.map((stat) => ({
      detail: `${stat.wins}승 ${stat.losses}패 ${stat.draws}무`,
      label: getMatchRoleLabel(stat.value),
      pickRate: stat.pickRate,
      total: stat.total,
      value: stat.value,
      winRate: stat.winRate,
    })),
  ];

  return (
    <div className="grid overflow-hidden rounded-lg border border-border/70 bg-card/55 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={cn(
            'min-w-0 border-b border-border/60 px-3.5 py-3 text-left transition-colors last:border-b-0 sm:odd:border-r xl:border-b-0 xl:border-r xl:last:border-r-0',
            activeRole === item.value
              ? 'bg-primary/[0.08] text-foreground'
              : 'hover:bg-secondary/60',
          )}
          onClick={() => onRoleChange(item.value)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">{item.label}</p>
              <p className="mt-1 truncate text-base font-bold">
                {item.total.toLocaleString('ko-KR')}경기 · {formatWinRate(item.winRate)}
              </p>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background">
              {item.value === 'all' ? (
                <BarChart3 className="h-4 w-4 text-primary" />
              ) : (
                <MatchRoleIcon role={item.value} />
              )}
            </div>
          </div>
          <p className="mt-2 truncate text-xs font-semibold text-muted-foreground">
            {item.detail} · 비중 {formatShare(item.pickRate)}
          </p>
        </button>
      ))}
    </div>
  );
};

interface StatsFilterPanelProps {
  activeFilterCount: number;
  accountFilter: string;
  className?: string;
  customPeriodEndDate: string;
  customPeriodStartDate: string;
  currentSeasonId?: string | null;
  includeMode?: boolean;
  label: string;
  matchRoleFilter: MatchRole | 'all';
  modeFilter: ModeId | 'all';
  onAccountFilterChange: (value: string) => void;
  onCustomPeriodEndDateChange: (value: string) => void;
  onCustomPeriodStartDateChange: (value: string) => void;
  onMatchRoleFilterChange: (value: MatchRole | 'all') => void;
  onModeFilterChange: (value: ModeId | 'all') => void;
  onPeriodFilterChange: (value: PeriodFilter) => void;
  onQueueFilterChange: (value: QueueType | 'all') => void;
  onSeasonFilterChange: (value: SeasonFilterValue) => void;
  periodFilter: PeriodFilter;
  playerAccounts: PlayerAccount[];
  queueFilter: QueueType | 'all';
  seasonFilter: SeasonFilterValue;
  seasons: CompetitiveSeason[];
  title: string;
}

const statsFilterSelectTriggerClassName =
  'h-10 w-full border-border/70 bg-card text-xs font-bold shadow-sm sm:h-9';

const statsFilterThreeColumnClassName =
  'xl:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1.1fr)_minmax(280px,1fr)]';

const StatsFilterPanel = ({
  activeFilterCount,
  accountFilter,
  className,
  customPeriodEndDate,
  customPeriodStartDate,
  currentSeasonId,
  includeMode = true,
  label,
  matchRoleFilter,
  modeFilter,
  onAccountFilterChange,
  onCustomPeriodEndDateChange,
  onCustomPeriodStartDateChange,
  onMatchRoleFilterChange,
  onModeFilterChange,
  onPeriodFilterChange,
  onQueueFilterChange,
  onSeasonFilterChange,
  periodFilter,
  playerAccounts,
  queueFilter,
  seasonFilter,
  seasons,
  title,
}: StatsFilterPanelProps) => {
  const filterStatusLabel =
    activeFilterCount > 0
      ? `${activeFilterCount}개 적용`
      : getSeasonFilterLabel(seasons, 'current', currentSeasonId);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_20px_70px_-58px_hsl(var(--foreground)/0.45)]',
        className,
      )}
    >
      <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] px-3.5 py-3 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="metric-label">{label}</p>
            <h2 className="mt-1 truncate text-base font-bold">{title}</h2>
          </div>
          <Badge
            variant={activeFilterCount > 0 ? 'secondary' : 'outline'}
            className={cn(
              'w-fit shrink-0',
              activeFilterCount > 0
                ? 'border-primary/20 bg-primary/10 text-primary'
                : 'bg-card text-muted-foreground',
            )}
          >
            {filterStatusLabel}
          </Badge>
        </div>
      </div>

      <div className="grid gap-2.5 p-3 sm:p-4">
        <div className={cn('grid gap-2.5 lg:grid-cols-3', statsFilterThreeColumnClassName)}>
          <FilterSelect label="시즌">
            <Select value={seasonFilter} onValueChange={(value) => onSeasonFilterChange(value)}>
              <SelectTrigger className={statsFilterSelectTriggerClassName}>
                <SelectValue placeholder="시즌 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">
                  {getSeasonFilterLabel(seasons, 'current', currentSeasonId)}
                </SelectItem>
                <SelectItem value="all">전체 시즌</SelectItem>
                <SelectItem value="unassigned">시즌 미지정</SelectItem>
                {seasons
                  .filter((season) => season.id !== currentSeasonId)
                  .map((season) => (
                    <SelectItem key={season.id} value={season.id}>
                      {season.displayName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FilterSelect>

          <FilterGroup
            label="기간"
            footer={
              periodFilter === 'custom' ? (
                <StatsDateRangePicker
                  endDate={customPeriodEndDate}
                  startDate={customPeriodStartDate}
                  onEndDateChange={onCustomPeriodEndDateChange}
                  onStartDateChange={onCustomPeriodStartDateChange}
                />
              ) : null
            }
          >
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
              <SelectTrigger className={statsFilterSelectTriggerClassName}>
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
        </div>

        <div
          className={cn(
            'grid gap-2.5',
            includeMode
              ? statsFilterThreeColumnClassName
              : 'xl:grid-cols-[minmax(230px,1fr)_minmax(280px,0.9fr)]',
          )}
        >
          <FilterGroup label="포지션">
            <FilterButton
              active={matchRoleFilter === 'all'}
              onClick={() => onMatchRoleFilterChange('all')}
            >
              전체
            </FilterButton>
            {matchRoleOptions.map((role) => (
              <FilterButton
                key={role.value}
                active={matchRoleFilter === role.value}
                onClick={() => onMatchRoleFilterChange(role.value)}
              >
                <MatchRoleLabel role={role.value} />
              </FilterButton>
            ))}
          </FilterGroup>

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

          <FilterGroup label="큐" wrap={false}>
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
};

interface FilterButtonProps {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}

const FilterButton = ({ active, children, onClick }: FilterButtonProps) => (
  <button
    type="button"
    aria-pressed={active}
    className={cn(
      'inline-flex h-9 min-w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-bold transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
      active
        ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_8px_24px_-20px_hsl(var(--primary)/0.9)]'
        : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-card hover:text-foreground',
    )}
    onClick={onClick}
  >
    {children}
  </button>
);

interface FilterGroupProps {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  label: string;
  wrap?: boolean;
}

const FilterGroup = ({ children, className, footer, label, wrap = true }: FilterGroupProps) => (
  <div
    className={cn(
      'min-w-0 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-2.5 py-2.5',
      className,
    )}
  >
    <p className="metric-label mb-2 px-0.5">{label}</p>
    <div
      className={cn(
        'mobile-scroll -mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5',
        wrap ? 'lg:flex-wrap lg:overflow-visible lg:pb-0' : 'lg:flex-nowrap lg:pb-0',
      )}
    >
      {children}
    </div>
    {footer}
  </div>
);

const FilterSelect = ({ children, className, label }: FilterGroupProps) => (
  <div
    className={cn(
      'min-w-0 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-2.5 py-2.5',
      className,
    )}
  >
    <p className="metric-label mb-2 px-0.5">{label}</p>
    {children}
  </div>
);

interface StatsDateRangePickerProps {
  endDate: string;
  onEndDateChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  startDate: string;
}

const calendarWeekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

const StatsDateRangePicker = ({
  endDate,
  onEndDateChange,
  onStartDateChange,
  startDate,
}: StatsDateRangePickerProps) => {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getMonthStart(parseDateValue(startDate) ?? new Date()),
  );
  const hasRange = Boolean(startDate || endDate);
  const triggerLabel =
    startDate && endDate
      ? `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`
      : startDate
        ? `${formatDateLabel(startDate)}부터`
        : endDate
          ? `${formatDateLabel(endDate)}까지`
          : '날짜 범위 선택';

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      setVisibleMonth(getMonthStart(parseDateValue(startDate || endDate) ?? new Date()));
    }
  };

  const handleDateSelect = (dateValue: string) => {
    if (!startDate || (startDate && endDate)) {
      onStartDateChange(dateValue);
      onEndDateChange('');
      return;
    }

    if (dateValue < startDate) {
      onStartDateChange(dateValue);
      onEndDateChange(startDate);
      return;
    }

    onEndDateChange(dateValue);
  };

  const clearRange = () => {
    onStartDateChange('');
    onEndDateChange('');
  };

  return (
    <div className="mt-2">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 text-left text-xs font-bold shadow-sm transition-[border-color,box-shadow] hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
              hasRange ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{triggerLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-[min(calc(100vw-1.5rem),640px)] overflow-hidden rounded-lg p-0"
          sideOffset={8}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2.5">
            <div className="min-w-0">
              <p className="metric-label">직접 기간</p>
              <p className="mt-0.5 truncate text-sm font-bold">{triggerLabel}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {[visibleMonth, addMonths(visibleMonth, 1)].map((month) => (
              <StatsCalendarMonth
                key={formatDateValue(month)}
                endDate={endDate}
                month={month}
                startDate={startDate}
                onDateSelect={handleDateSelect}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2 text-muted-foreground"
              disabled={!hasRange}
              onClick={clearRange}
            >
              초기화
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              완료
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

interface StatsCalendarMonthProps {
  endDate: string;
  month: Date;
  onDateSelect: (value: string) => void;
  startDate: string;
}

const StatsCalendarMonth = ({
  endDate,
  month,
  onDateSelect,
  startDate,
}: StatsCalendarMonthProps) => {
  const today = formatDateValue(new Date());
  const monthDays = getCalendarMonthDays(month);
  const range = getNormalizedDateRange(startDate, endDate);

  return (
    <div className="min-w-0">
      <p className="px-1 text-sm font-bold">{formatMonthLabel(month)}</p>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {calendarWeekdayLabels.map((label) => (
          <span
            key={label}
            className="flex h-7 items-center justify-center text-[11px] font-bold text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {monthDays.map((date) => {
          const dateValue = formatDateValue(date);
          const isOutsideMonth = date.getMonth() !== month.getMonth();
          const isBoundary =
            Boolean(range.start) && (dateValue === range.start || dateValue === range.end);
          const isInRange =
            Boolean(range.start && range.end) && dateValue > range.start && dateValue < range.end;
          const isToday = dateValue === today;

          return (
            <button
              key={dateValue}
              type="button"
              className={cn(
                'flex h-9 min-w-0 items-center justify-center rounded-md text-xs font-bold transition-[background-color,color,box-shadow] hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                isOutsideMonth && 'text-muted-foreground/45',
                isInRange && 'bg-primary/10 text-primary hover:bg-primary/15',
                isBoundary && 'bg-primary text-primary-foreground hover:bg-primary',
                isToday && !isBoundary && 'text-primary ring-1 ring-primary/25',
              )}
              onClick={() => onDateSelect(dateValue)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

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
  const renderedNames = new Set(rows.map((entry) => String(entry.name ?? entry.dataKey ?? '값')));
  const extraRows = getTooltipExtraRows(contextPayload, renderedNames);

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
        {extraRows.length > 0 ? (
          <div className="space-y-1.5 border-t border-border/50 pt-2">
            {extraRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
              >
                <span className="min-w-0 break-words text-xs font-semibold leading-snug text-muted-foreground">
                  {row.label}
                </span>
                <span className="whitespace-nowrap text-right text-xs font-bold">{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

interface ChartShellProps {
  children: ReactNode;
  className?: string;
}

const ChartShell = ({ children, className }: ChartShellProps) => (
  <div className={cn('h-[320px] min-w-0 rounded-md bg-transparent p-0.5 sm:p-2', className)}>
    <ResponsiveContainer height="100%" width="100%">
      {children}
    </ResponsiveContainer>
  </div>
);

const chartSkeletonHeights = [
  'h-[42%]',
  'h-[68%]',
  'h-[54%]',
  'h-[82%]',
  'h-[61%]',
  'h-[73%]',
  'h-[48%]',
  'h-[88%]',
  'h-[58%]',
  'h-[76%]',
];

const chartSkeletonWidths = [
  'w-[72%]',
  'w-[58%]',
  'w-[84%]',
  'w-[66%]',
  'w-[78%]',
  'w-[52%]',
  'w-[88%]',
  'w-[63%]',
];

const StatsSectionSkeleton = ({ section }: { section: StatsSection }) => (
  <section className="min-w-0 space-y-4">
    <StatsFilterPanelSkeleton includeMode={section !== 'modes'} />
    {section === 'maps' ? <MapStatsSkeleton /> : null}
    {section === 'modes' ? <ModeStatsSkeleton /> : null}
    {section === 'heroes' ? <HeroStatsSkeleton /> : null}
    {section === 'time' ? <TimeStatsSkeleton /> : null}
    {section === 'order' ? <OrderStatsSkeleton /> : null}
    {section === 'summary' ? <SummaryStatsSkeleton /> : null}
  </section>
);

const StatsFilterPanelSkeleton = ({ includeMode }: { includeMode: boolean }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
    <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] px-3.5 py-3 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="mt-2 h-5 w-36" />
        </div>
        <SkeletonBlock className="h-6 w-20 shrink-0" />
      </div>
    </div>
    <div className="grid gap-2.5 p-3 sm:p-4">
      <div className={cn('grid gap-2.5 lg:grid-cols-3', statsFilterThreeColumnClassName)}>
        {Array.from({ length: 3 }, (_, groupIndex) => (
          <StatsFilterGroupSkeleton key={groupIndex} single={groupIndex !== 1} />
        ))}
      </div>
      <div
        className={cn(
          'grid gap-2.5',
          includeMode
            ? 'xl:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1.1fr)_minmax(280px,1fr)]'
            : 'xl:grid-cols-[minmax(230px,1fr)_minmax(280px,0.9fr)]',
        )}
      >
        {Array.from({ length: includeMode ? 3 : 2 }, (_, groupIndex) => (
          <StatsFilterGroupSkeleton key={groupIndex} />
        ))}
      </div>
    </div>
  </div>
);

const StatsFilterGroupSkeleton = ({ single = false }: { single?: boolean }) => (
  <div className="rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-2.5 py-2.5">
    <SkeletonBlock className="mb-2 h-3 w-12" />
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: single ? 1 : 4 }, (_, itemIndex) => (
        <SkeletonBlock
          key={itemIndex}
          className={cn('h-9', single ? 'w-full' : itemIndex === 0 ? 'w-20' : 'w-16')}
        />
      ))}
    </div>
  </div>
);

const MapStatsSkeleton = () => (
  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="space-y-4">
      <StatsChartPanelSkeleton heightClassName="h-[360px] sm:h-[420px]" variant="horizontal" />
      <StatsAtlasSkeleton />
    </div>
    <aside className="space-y-4">
      <StatsMetricStackSkeleton />
      <StatsImageFeatureSkeleton />
    </aside>
  </div>
);

const ModeStatsSkeleton = () => (
  <div className="space-y-4">
    <StatsMetricGridSkeleton />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <StatsChartPanelSkeleton heightClassName="h-[220px] sm:h-[260px]" />
      <StatsListPanelSkeleton rows={4} />
    </div>
  </div>
);

const HeroStatsSkeleton = () => (
  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="space-y-4">
      <StatsHeroSpotlightSkeleton />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <StatsChartPanelSkeleton heightClassName="h-[280px] sm:h-[320px]" />
        <StatsListPanelSkeleton rows={3} />
      </div>
      <StatsMediaRowsSkeleton />
    </div>
    <aside className="space-y-4">
      <StatsMetricStackSkeleton />
      <StatsImageFeatureSkeleton />
    </aside>
  </div>
);

const TimeStatsSkeleton = () => (
  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="space-y-4">
      <StatsSignalPanelSkeleton sideWidthClassName="lg:grid-cols-[minmax(0,1fr)_320px]" />
      <StatsChartPanelSkeleton heightClassName="h-[280px] sm:h-[340px]" />
      <StatsBoardPanelSkeleton cells={24} />
    </div>
    <aside className="space-y-4">
      <StatsMetricStackSkeleton />
      <StatsListPanelSkeleton rows={5} />
    </aside>
  </div>
);

const OrderStatsSkeleton = () => (
  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="space-y-4">
      <StatsSignalPanelSkeleton sideWidthClassName="lg:grid-cols-[minmax(0,1fr)_340px]" />
      <StatsChartPanelSkeleton heightClassName="h-[280px] sm:h-[340px]" />
      <StatsBoardPanelSkeleton cells={9} />
    </div>
    <aside className="space-y-4">
      <StatsMetricStackSkeleton />
      <StatsListPanelSkeleton rows={3} />
    </aside>
  </div>
);

const SummaryStatsSkeleton = () => (
  <div className="space-y-4">
    <StatsMetricGridSkeleton />
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="border-b border-border/60 bg-[hsl(var(--surface-2))] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-2 h-6 w-44" />
          </div>
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-8 w-24" />
            <SkeletonBlock className="h-8 w-32" />
            <SkeletonBlock className="h-8 w-28" />
          </div>
        </div>
      </div>
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="border-b border-border/60 p-4 sm:p-5 xl:border-b-0 xl:border-r">
          <SkeletonBlock className="h-[220px] w-full" />
        </div>
        <div className="grid gap-3 p-4 sm:p-5">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock key={index} className="h-28 w-full" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const StatsMetricGridSkeleton = () => (
  <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/70 bg-card/55 md:grid-cols-4">
    {Array.from({ length: 4 }, (_, index) => (
      <StatsMetricSkeletonCell
        key={index}
        className="border-b border-border/60 odd:border-r last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
      />
    ))}
  </div>
);

const StatsMetricStackSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/55">
    {Array.from({ length: 4 }, (_, index) => (
      <StatsMetricSkeletonCell key={index} className="border-b border-border/60 last:border-b-0" />
    ))}
  </div>
);

const StatsMetricSkeletonCell = ({ className }: { className?: string }) => (
  <div className={cn('bg-card/55 p-3.5 sm:p-5', className)}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <SkeletonBlock className="h-3 w-16" />
        <SkeletonBlock className="mt-3 h-6 w-28 max-w-full" />
      </div>
      <SkeletonBlock className="h-8 w-8 shrink-0" />
    </div>
    <SkeletonBlock className="mt-3 h-3 w-36 max-w-full" />
  </div>
);

const StatsChartPanelSkeleton = ({
  heightClassName,
  variant = 'vertical',
}: {
  heightClassName: string;
  variant?: 'horizontal' | 'vertical';
}) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <SkeletonBlock className="h-3 w-20" />
      <SkeletonBlock className="mt-2 h-5 w-44 max-w-full" />
    </div>
    <div className="section-pad">
      <div
        className={cn(
          'relative overflow-hidden rounded-md border border-border/60 bg-[hsl(var(--surface-2))] p-4',
          heightClassName,
        )}
      >
        <div className="absolute inset-x-4 bottom-4 top-4 grid grid-rows-5 gap-0">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="border-t border-border/50" />
          ))}
        </div>
        <div
          className={cn(
            'relative z-10 flex h-full gap-3',
            variant === 'horizontal' ? 'flex-col justify-center' : 'items-end',
          )}
        >
          {Array.from({ length: variant === 'horizontal' ? 8 : 10 }, (_, index) => (
            <SkeletonBlock
              key={index}
              className={
                variant === 'horizontal'
                  ? cn('h-6', chartSkeletonWidths[index % chartSkeletonWidths.length])
                  : cn(
                      'w-full min-w-0 flex-1 rounded-b-none rounded-t-md',
                      chartSkeletonHeights[index % chartSkeletonHeights.length],
                    )
              }
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const StatsAtlasSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
      <div>
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="mt-2 h-5 w-40" />
      </div>
      <SkeletonBlock className="h-6 w-14" />
    </div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid bg-border/60 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="bg-card">
            <SkeletonBlock className="aspect-[16/10] rounded-none" />
            <div className="space-y-2 px-3 py-3">
              <SkeletonBlock className="h-2 rounded-full" />
              <div className="flex items-center justify-between gap-2">
                <SkeletonBlock className="h-3 w-12" />
                <SkeletonBlock className="h-3 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border/70 bg-[hsl(var(--surface-2))] lg:border-l lg:border-t-0">
        <SkeletonBlock className="aspect-[16/9] rounded-none" />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-3 divide-x divide-border/70 border-y border-border/70 bg-card">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="px-2 py-3">
                <SkeletonBlock className="mx-auto h-3 w-10" />
                <SkeletonBlock className="mx-auto mt-2 h-4 w-12" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-3 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);

const StatsHeroSpotlightSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
      <SkeletonBlock className="min-h-[250px] rounded-none sm:min-h-[310px]" />
      <div className="border-t border-border/70 bg-[hsl(var(--surface-2))] lg:border-l lg:border-t-0">
        <div className="grid grid-cols-3 divide-x divide-border/70 border-b border-border/70 bg-card">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="px-2 py-3">
              <SkeletonBlock className="mx-auto h-3 w-10" />
              <SkeletonBlock className="mx-auto mt-2 h-4 w-12" />
            </div>
          ))}
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-3 rounded-full" />
          <div className="grid grid-cols-[44px_minmax(0,1fr)_64px] items-center gap-3 border-t border-border/70 pt-4">
            <SkeletonBlock className="h-11 w-11" />
            <div className="min-w-0">
              <SkeletonBlock className="h-4 w-28 max-w-full" />
              <SkeletonBlock className="mt-2 h-3 w-20" />
            </div>
            <SkeletonBlock className="h-6 w-14" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const StatsSignalPanelSkeleton = ({ sideWidthClassName }: { sideWidthClassName: string }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className={cn('grid', sideWidthClassName)}>
      <div className="section-pad bg-[hsl(var(--surface-2))]">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="mt-4 h-11 w-52 max-w-full sm:h-14" />
        <SkeletonBlock className="mt-3 h-4 w-64 max-w-full" />
        <SkeletonBlock className="mt-6 h-2.5 rounded-full" />
      </div>
      <div className="border-t border-border/70 lg:border-l lg:border-t-0">
        <div className="grid grid-cols-3 divide-x divide-border/70 border-b border-border/70 bg-card">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="px-2 py-3">
              <SkeletonBlock className="mx-auto h-3 w-10" />
              <SkeletonBlock className="mx-auto mt-2 h-4 w-12" />
            </div>
          ))}
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_60px] items-center gap-3 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2.5"
            >
              <div className="min-w-0">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="mt-2 h-4 w-28 max-w-full" />
              </div>
              <SkeletonBlock className="h-6 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const StatsBoardPanelSkeleton = ({ cells }: { cells: number }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
      <div>
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="mt-2 h-5 w-44 max-w-full" />
      </div>
      <SkeletonBlock className="h-6 w-14" />
    </div>
    <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: cells }, (_, index) => (
        <div key={index} className="min-h-[118px] bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <SkeletonBlock className="h-4 w-14" />
            <SkeletonBlock className="h-4 w-10" />
          </div>
          <SkeletonBlock className="mt-6 h-7 w-16" />
          <SkeletonBlock className="mt-4 h-2 rounded-full" />
          <SkeletonBlock className="mt-2 h-2 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);

const StatsImageFeatureSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <SkeletonBlock className="aspect-[16/10] rounded-none" />
    <div className="section-pad">
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="mt-3 h-5 w-36" />
      <SkeletonBlock className="mt-3 h-4 w-48 max-w-full" />
    </div>
  </div>
);

const StatsListPanelSkeleton = ({ rows }: { rows: number }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <SkeletonBlock className="h-3 w-20" />
      <SkeletonBlock className="mt-2 h-5 w-40 max-w-full" />
    </div>
    <div className="px-4 py-1 sm:px-5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="border-b border-border/60 py-4 last:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-4 w-32 max-w-full" />
              <SkeletonBlock className="mt-2 h-3 w-24" />
            </div>
            <SkeletonBlock className="h-6 w-14" />
          </div>
          <SkeletonBlock className="mt-3 h-2 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);

const StatsMediaRowsSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <SkeletonBlock className="h-3 w-20" />
      <SkeletonBlock className="mt-2 h-5 w-36" />
    </div>
    <div className="grid gap-x-6 px-4 py-1 sm:px-5 lg:grid-cols-2">
      {Array.from({ length: 10 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[44px_minmax(0,1fr)_64px] items-center gap-3 border-b border-border/60 py-3 last:border-b-0 lg:[&:nth-last-child(2)]:border-b-0"
        >
          <SkeletonBlock className="h-11 w-11" />
          <div className="min-w-0">
            <SkeletonBlock className="h-4 w-32 max-w-full" />
            <SkeletonBlock className="mt-2 h-3 w-20" />
          </div>
          <SkeletonBlock className="h-5 w-12" />
        </div>
      ))}
    </div>
  </div>
);

type SummaryLike = ReturnType<typeof summarizeResults>;

interface ResultSplitBarProps {
  className?: string;
  summary: SummaryLike;
}

const ResultSplitBar = ({ className, summary }: ResultSplitBarProps) => {
  const total = Math.max(1, summary.total);

  return (
    <div className={cn('flex h-2 overflow-hidden rounded-full bg-secondary', className)}>
      <div className="bg-primary" style={{ width: `${(summary.wins / total) * 100}%` }} />
      <div
        className="bg-muted-foreground/40"
        style={{ width: `${(summary.draws / total) * 100}%` }}
      />
      <div className="bg-destructive" style={{ width: `${(summary.losses / total) * 100}%` }} />
    </div>
  );
};

type MapStatItem = SummaryLike & {
  label: string;
  modeId: ModeId;
  pickRate: number;
  value: string;
};

type HeroStatItem = SummaryLike & {
  label: string;
  pickRate: number;
  role: HeroRole;
  value: string;
};

type RoleStatItem = SummaryLike & {
  label: string;
  pickRate: number;
  value: HeroRole;
};

type ModeRecentFormItem = SummaryLike & {
  label: string;
  matches: Match[];
  trend: number | null;
  value: ModeId;
};

type TimeStatItem = SummaryLike & {
  hour: number;
};

type OrderStatItem = SummaryLike & {
  order: number;
};

interface MapAtlasPanelProps {
  isLoading: boolean;
  onSelectMap: (mapId: string) => void;
  selectedMap: MapStatItem | null;
  stats: MapStatItem[];
}

const MapAtlasPanel = ({ isLoading, onSelectMap, selectedMap, stats }: MapAtlasPanelProps) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
      <div>
        <p className="metric-label">전장 보드</p>
        <h2 className="mt-1 text-lg font-bold">이미지로 보는 승률 지형</h2>
      </div>
      <Badge variant="outline" className="shrink-0 bg-transparent">
        {stats.length.toLocaleString('ko-KR')} 전장
      </Badge>
    </div>

    {stats.length > 0 && selectedMap ? (
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid bg-border/60 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <MapAtlasTile
              key={stat.value}
              selected={stat.value === selectedMap.value}
              stat={stat}
              onSelect={() => onSelectMap(stat.value)}
            />
          ))}
        </div>

        <MapAtlasDetail stat={selectedMap} />
      </div>
    ) : (
      <div className="section-pad">
        <TabEmpty
          icon={MapIcon}
          isLoading={isLoading}
          title="필터에 해당하는 전장 기록이 없습니다."
        />
      </div>
    )}
  </div>
);

interface MapAtlasTileProps {
  onSelect: () => void;
  selected: boolean;
  stat: MapStatItem;
}

const MapAtlasTile = ({ onSelect, selected, stat }: MapAtlasTileProps) => (
  <button
    type="button"
    aria-pressed={selected}
    className={cn(
      'group min-w-0 bg-card text-left transition-[background-color,box-shadow,transform] hover:bg-[hsl(var(--surface-2))]',
      selected && 'relative z-10 bg-primary/[0.06] shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
    )}
    onClick={onSelect}
  >
    <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
      <img
        alt={stat.label}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        loading="lazy"
        src={getMapScreenshotPath(stat.value)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/10" />
      <div className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
        {getModeLabel(stat.modeId)}
      </div>
      <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{stat.label}</p>
          <p className="mt-0.5 text-[10px] font-semibold opacity-80">
            {stat.wins}승 {stat.losses}패 {stat.draws}무
          </p>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums">{formatWinRate(stat.winRate)}</p>
      </div>
    </div>

    <div className="space-y-2 px-3 py-3">
      <ResultSplitBar summary={stat} className="h-1.5" />
      <div className="flex items-center justify-between gap-2 text-xs font-bold tabular-nums text-muted-foreground">
        <span>{stat.total}경기</span>
        <span>선택률 {formatShare(stat.pickRate)}</span>
      </div>
    </div>
  </button>
);

const MapAtlasDetail = ({ stat }: { stat: MapStatItem }) => (
  <aside className="border-t border-border/70 bg-[hsl(var(--surface-2))] lg:border-l lg:border-t-0">
    <div className="relative aspect-[16/9] overflow-hidden bg-secondary">
      <img
        alt={stat.label}
        className="h-full w-full object-cover"
        loading="lazy"
        src={getMapScreenshotPath(stat.value)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 text-white">
        <p className="text-xs font-bold opacity-80">{getModeLabel(stat.modeId)}</p>
        <h3 className="mt-1 truncate text-2xl font-bold">{stat.label}</h3>
      </div>
    </div>

    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-3 divide-x divide-border/70 border-y border-border/70 bg-card">
        <MapDetailMetric label="승률" value={formatWinRate(stat.winRate)} />
        <MapDetailMetric label="경기" value={stat.total.toLocaleString('ko-KR')} />
        <MapDetailMetric label="선택률" value={formatShare(stat.pickRate)} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="metric-label">결과 분포</p>
          <p className="text-xs font-semibold text-muted-foreground">
            {stat.wins}승 {stat.losses}패 {stat.draws}무
          </p>
        </div>
        <ResultSplitBar summary={stat} className="h-2.5" />
      </div>

      <div className="grid gap-2 border-t border-border/70 pt-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-muted-foreground">승리</span>
          <span className="font-bold tabular-nums">{stat.wins}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-muted-foreground">패배</span>
          <span className="font-bold tabular-nums">{stat.losses}</span>
        </div>
        {stat.draws > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-muted-foreground">무승부</span>
            <span className="font-bold tabular-nums">{stat.draws}</span>
          </div>
        ) : null}
      </div>
    </div>
  </aside>
);

const MapDetailMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 px-2 py-3 text-center">
    <p className="metric-label">{label}</p>
    <p className="mt-1 truncate text-sm font-bold tabular-nums">{value}</p>
  </div>
);

const HeroSpotlightPanel = ({
  bestHero,
  topHero,
}: {
  bestHero: HeroStatItem | null;
  topHero: HeroStatItem | null;
}) => {
  if (!topHero) {
    return null;
  }

  const shouldShowBestHero = bestHero && bestHero.value !== topHero.value;

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[250px] overflow-hidden bg-secondary sm:min-h-[310px]">
          <img
            alt={topHero.label}
            className="absolute inset-0 h-full w-full object-cover object-top"
            src={getHeroPortraitPath(topHero.value)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
          <div className="absolute left-4 top-4 rounded-md border border-white/20 bg-black/35 px-2.5 py-1 text-[11px] font-black text-white backdrop-blur-md">
            최다 사용
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white sm:p-5 lg:p-6">
            <p className="text-xs font-bold text-white/75">{roleLabels[topHero.role]}</p>
            <h2 className="mt-1 text-3xl font-black tracking-normal sm:text-4xl">
              {topHero.label}
            </h2>
            <p className="mt-2 text-sm font-semibold text-white/75 sm:text-base">
              {topHero.wins}승 {topHero.losses}패 {topHero.draws}무 · {topHero.total}경기 · 선택률{' '}
              {formatShare(topHero.pickRate)}
            </p>
          </div>
        </div>

        <div className="flex flex-col border-t border-border/70 bg-[hsl(var(--surface-2))] lg:border-l lg:border-t-0">
          <div className="grid grid-cols-3 divide-x divide-border/70 border-b border-border/70 bg-card">
            <HeroMetric label="승률" value={formatWinRate(topHero.winRate)} />
            <HeroMetric label="선택률" value={formatShare(topHero.pickRate)} />
            <HeroMetric label="경기" value={topHero.total.toLocaleString('ko-KR')} />
          </div>

          <div className="flex-1 space-y-4 p-4 sm:p-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="metric-label">주력 영웅 결과</p>
                <p className="text-xs font-semibold text-muted-foreground">
                  {topHero.wins}승 {topHero.losses}패 {topHero.draws}무
                </p>
              </div>
              <ResultSplitBar summary={topHero} className="h-2.5" />
            </div>

            {shouldShowBestHero ? (
              <div className="border-t border-border/70 pt-4">
                <p className="metric-label">고승률 영웅</p>
                <div className="mt-2 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3">
                  <img
                    alt=""
                    className="h-11 w-11 rounded-md object-cover object-top"
                    src={getHeroPortraitPath(bestHero.value)}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{bestHero.label}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                      {bestHero.total}경기 · {roleLabels[bestHero.role]}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-transparent">
                    {formatWinRate(bestHero.winRate)}
                  </Badge>
                </div>
              </div>
            ) : bestHero ? (
              <div className="rounded-md border border-primary/20 bg-primary/[0.06] p-3">
                <p className="metric-label text-primary">주력/승률 동시 상위</p>
                <p className="mt-1 text-sm font-bold">
                  가장 많이 사용한 영웅이 현재 필터의 최고 승률 영웅입니다.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const HeroMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 px-2 py-3 text-center">
    <p className="metric-label">{label}</p>
    <p className="mt-1 truncate text-sm font-black tabular-nums">{value}</p>
  </div>
);

const HeroRolePanel = ({ roleStats }: { roleStats: RoleStatItem[] }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <p className="metric-label">역할</p>
      <h2 className="mt-1 text-lg font-bold">역할별 사용 흐름</h2>
    </div>
    <div className="px-4 py-1 sm:px-5">
      {roleStats.length > 0 ? (
        roleStats.map((stat) => (
          <div key={stat.value} className="border-b border-border/60 py-4 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">{stat.label}</p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {stat.total}경기 · 경기 비중 {formatShare(stat.pickRate)}
                </p>
              </div>
              <p className="text-lg font-black tabular-nums">{formatWinRate(stat.winRate)}</p>
            </div>
            <div className="mt-3">
              <ResultSplitBar summary={stat} />
            </div>
          </div>
        ))
      ) : (
        <TabEmpty icon={Swords} isLoading={false} title="역할 기록이 없습니다." />
      )}
    </div>
  </div>
);

const HeroRosterPanel = ({ heroStats }: { heroStats: HeroStatItem[] }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="metric-label">영웅 랭킹</p>
        <h3 className="mt-1 text-lg font-bold">상위 영웅 상세</h3>
      </div>
      <Badge variant="outline" className="shrink-0 bg-transparent">
        {heroStats.length.toLocaleString('ko-KR')} 영웅
      </Badge>
    </div>
    <div className="grid gap-x-6 px-4 py-1 sm:px-5 lg:grid-cols-2">
      {heroStats.slice(0, 16).map((stat, index) => (
        <HeroRosterRow key={stat.value} rank={index + 1} stat={stat} />
      ))}
    </div>
  </div>
);

const HeroRosterRow = ({ rank, stat }: { rank: number; stat: HeroStatItem }) => (
  <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 border-b border-border/60 py-3 last:border-b-0 lg:[&:nth-last-child(2)]:border-b-0">
    <div className="relative h-[52px] w-[52px] overflow-hidden rounded-md bg-secondary">
      <img
        alt=""
        className="h-full w-full object-cover object-top"
        loading="lazy"
        src={getHeroPortraitPath(stat.value)}
      />
      <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-black text-white">
        {rank}
      </span>
    </div>
    <div className="min-w-0 py-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{stat.label}</p>
          <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
            {roleLabels[stat.role]} · {stat.total}경기 · 선택률 {formatShare(stat.pickRate)}
          </p>
        </div>
        <Badge variant="outline" className="w-[64px] shrink-0 justify-center bg-transparent">
          {formatWinRate(stat.winRate)}
        </Badge>
      </div>
      <div className="mt-3">
        <ResultSplitBar summary={stat} className="h-1.5" />
      </div>
    </div>
  </div>
);

const HeroBestPanel = ({ hero }: { hero: HeroStatItem }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="aspect-[16/12] bg-secondary">
      <img
        alt={hero.label}
        className="h-full w-full object-cover object-top"
        loading="lazy"
        src={getHeroPortraitPath(hero.value)}
      />
    </div>
    <div className="section-pad">
      <p className="metric-label">최고 승률 영웅</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-lg font-bold">{hero.label}</h3>
        <Badge variant="outline" className="bg-transparent">
          {roleLabels[hero.role]}
        </Badge>
      </div>
      <p className="mt-2 text-sm font-semibold text-muted-foreground">
        {hero.wins}승 {hero.losses}패 {hero.draws}무 · {hero.total}경기 · 승률{' '}
        {formatWinRate(hero.winRate)}
      </p>
      <ResultSplitBar summary={hero} className="mt-4 h-2" />
    </div>
  </div>
);

const getWinRateToneClass = (winRate: number | null) => {
  if (winRate === null) {
    return 'border-border/70 bg-card';
  }

  if (winRate >= 60) {
    return 'border-primary/35 bg-primary/[0.07]';
  }

  if (winRate <= 40) {
    return 'border-destructive/35 bg-destructive/[0.06]';
  }

  return 'border-border/70 bg-card';
};

const SignalMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 px-2 py-3 text-center">
    <p className="metric-label">{label}</p>
    <p className="mt-1 truncate text-sm font-black tabular-nums">{value}</p>
  </div>
);

const TimeSpotlightPanel = ({
  bestHour,
  summary,
  topHour,
}: {
  bestHour: TimeStatItem | null;
  summary: SummaryLike;
  topHour: TimeStatItem | null;
}) => {
  const primaryHour = bestHour ?? topHour;

  if (!primaryHour) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="section-pad bg-[hsl(var(--surface-2))]">
          <p className="metric-label">좋은 시간대</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-4xl font-black tracking-normal sm:text-5xl">
                {formatHourRange(primaryHour.hour)}
              </h2>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                {primaryHour.wins}승 {primaryHour.losses}패 {primaryHour.draws}무 ·{' '}
                {primaryHour.total}경기
              </p>
            </div>
            <Badge variant="outline" className="w-fit bg-card text-base">
              승률 {formatWinRate(primaryHour.winRate)}
            </Badge>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="metric-label">결과 구성</p>
              <p className="text-xs font-semibold text-muted-foreground">
                전체 {summary.total.toLocaleString('ko-KR')}경기 중{' '}
                {formatShare(getShare(primaryHour.total, summary.total))}
              </p>
            </div>
            <ResultSplitBar summary={primaryHour} className="h-2.5" />
          </div>
        </div>

        <div className="border-t border-border/70 lg:border-l lg:border-t-0">
          <div className="grid grid-cols-3 divide-x divide-border/70 border-b border-border/70 bg-card">
            <SignalMetric label="승률" value={formatWinRate(primaryHour.winRate)} />
            <SignalMetric label="경기" value={primaryHour.total.toLocaleString('ko-KR')} />
            <SignalMetric
              label="비중"
              value={formatShare(getShare(primaryHour.total, summary.total))}
            />
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <TimeCompareRow label="최다 경기" stat={topHour} />
            <TimeCompareRow label="최고 승률" stat={bestHour} />
          </div>
        </div>
      </div>
    </div>
  );
};

const TimeCompareRow = ({ label, stat }: { label: string; stat: TimeStatItem | null }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2.5">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      <p className="mt-1 truncate text-sm font-bold">
        {stat ? formatHourRange(stat.hour) : '기록 대기'}
      </p>
    </div>
    <div className="text-right">
      <p className="text-sm font-black tabular-nums">{stat ? formatWinRate(stat.winRate) : '--'}</p>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
        {stat ? `${stat.total}경기` : '--'}
      </p>
    </div>
  </div>
);

const TimeClockBoard = ({ maxCount, stats }: { maxCount: number; stats: TimeStatItem[] }) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="metric-label">24시간 보드</p>
        <h3 className="mt-1 text-lg font-bold">빈 시간까지 포함한 플레이 밀도</h3>
      </div>
      <Badge variant="outline" className="shrink-0 bg-transparent">
        24칸
      </Badge>
    </div>
    <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {stats.map((stat) => (
        <TimeClockCell key={stat.hour} maxCount={maxCount} stat={stat} />
      ))}
    </div>
  </div>
);

const TimeClockCell = ({ maxCount, stat }: { maxCount: number; stat: TimeStatItem }) => {
  const intensity = stat.total / maxCount;
  const hasData = stat.total > 0;

  return (
    <div
      className={cn(
        'min-h-[112px] bg-card p-3 transition-colors',
        hasData ? getWinRateToneClass(stat.winRate) : 'text-muted-foreground/60',
      )}
      style={
        hasData
          ? { backgroundColor: `hsl(var(--primary) / ${0.035 + intensity * 0.075})` }
          : undefined
      }
      title={`${formatHourRange(stat.hour)} · ${stat.total}경기 · 승률 ${formatWinRate(stat.winRate)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black tabular-nums">{formatHour(stat.hour)}</p>
        <p className="text-xs font-bold tabular-nums">{hasData ? `${stat.total}경기` : '0'}</p>
      </div>
      <p className="mt-5 text-2xl font-black tabular-nums">{formatWinRate(stat.winRate)}</p>
      <div className="mt-3">
        <ResultSplitBar summary={stat} className="h-1.5" />
      </div>
    </div>
  );
};

const TimeRankPanel = ({ stats }: { stats: TimeStatItem[] }) => {
  const winRateRows = [...stats]
    .filter((stat) => stat.total >= 2 && stat.winRate !== null)
    .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.total - a.total)
    .slice(0, 5);
  const activityRows = [...stats].sort((a, b) => b.total - a.total).slice(0, 4);

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="border-b border-border/60 px-4 py-3 sm:px-5">
        <p className="metric-label">시간대 판단</p>
        <h3 className="mt-1 text-lg font-bold">좋은 시간과 많이 한 시간</h3>
      </div>
      <div className="px-4 py-1 sm:px-5">
        <TimeRankGroup label="승률 상위" stats={winRateRows} />
        <TimeRankGroup label="경기 집중" stats={activityRows} />
      </div>
    </div>
  );
};

const TimeRankGroup = ({ label, stats }: { label: string; stats: TimeStatItem[] }) => (
  <div className="border-b border-border/60 py-4 last:border-b-0">
    <p className="metric-label mb-3">{label}</p>
    {stats.length > 0 ? (
      <div className="space-y-2.5">
        {stats.map((stat) => (
          <div key={`${label}-${stat.hour}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{formatHourRange(stat.hour)}</p>
              <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                {stat.wins}승 {stat.losses}패 {stat.draws}무 · {stat.total}경기
              </p>
            </div>
            <Badge variant="outline" className="w-[64px] justify-center bg-transparent">
              {formatWinRate(stat.winRate)}
            </Badge>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm font-semibold text-muted-foreground">표본 2경기 이상 필요</p>
    )}
  </div>
);

const OrderSpotlightPanel = ({
  bestOrder,
  topOrder,
  worstOrder,
}: {
  bestOrder: OrderStatItem | null;
  topOrder: OrderStatItem | null;
  worstOrder: OrderStatItem | null;
}) => {
  const primaryOrder = bestOrder ?? topOrder;

  if (!primaryOrder) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="section-pad bg-[hsl(var(--surface-2))]">
          <p className="metric-label">세션 안에서 가장 좋은 구간</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-4xl font-black tracking-normal sm:text-5xl">
                {primaryOrder.order}번째 경기
              </h2>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                {primaryOrder.wins}승 {primaryOrder.losses}패 {primaryOrder.draws}무 ·{' '}
                {primaryOrder.total}경기 표본
              </p>
            </div>
            <Badge variant="outline" className="w-fit bg-card text-base">
              승률 {formatWinRate(primaryOrder.winRate)}
            </Badge>
          </div>
          <ResultSplitBar summary={primaryOrder} className="mt-5 h-2.5" />
        </div>

        <div className="border-t border-border/70 lg:border-l lg:border-t-0">
          <div className="grid grid-cols-3 divide-x divide-border/70 border-b border-border/70 bg-card">
            <SignalMetric label="최고" value={bestOrder ? `${bestOrder.order}번째` : '--'} />
            <SignalMetric label="최다" value={topOrder ? `${topOrder.order}번째` : '--'} />
            <SignalMetric label="주의" value={worstOrder ? `${worstOrder.order}번째` : '--'} />
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <OrderCompareRow label="안정 구간" stat={bestOrder} />
            <OrderCompareRow label="흔들림 구간" stat={worstOrder} />
          </div>
        </div>
      </div>
    </div>
  );
};

const OrderCompareRow = ({ label, stat }: { label: string; stat: OrderStatItem | null }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2.5">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      <p className="mt-1 truncate text-sm font-bold">
        {stat ? `${stat.order}번째 경기` : '표본 대기'}
      </p>
    </div>
    <div className="text-right">
      <p className="text-sm font-black tabular-nums">{stat ? formatWinRate(stat.winRate) : '--'}</p>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
        {stat ? `${stat.total}경기` : '--'}
      </p>
    </div>
  </div>
);

const OrderFlowPanel = ({
  bestOrder,
  stats,
  worstOrder,
}: {
  bestOrder: OrderStatItem | null;
  stats: OrderStatItem[];
  worstOrder: OrderStatItem | null;
}) => {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="metric-label">세션 진행도</p>
          <h3 className="mt-1 text-lg font-bold">n번째 경기별 안정감</h3>
        </div>
        <Badge variant="outline" className="shrink-0 bg-transparent">
          {stats.length.toLocaleString('ko-KR')} 구간
        </Badge>
      </div>
      <div className="grid gap-px bg-border/60 sm:grid-cols-2 xl:grid-cols-3">
        {stats.slice(0, 15).map((stat) => (
          <OrderStageCard
            key={stat.order}
            best={bestOrder?.order === stat.order}
            stat={stat}
            worst={worstOrder?.order === stat.order}
          />
        ))}
      </div>
    </div>
  );
};

const OrderStageCard = ({
  best,
  stat,
  worst,
}: {
  best: boolean;
  stat: OrderStatItem;
  worst: boolean;
}) => (
  <div
    className={cn(
      'min-h-[150px] bg-card p-4',
      getWinRateToneClass(stat.winRate),
      best && 'relative z-10 shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
      worst && 'relative z-10 shadow-[inset_0_0_0_2px_hsl(var(--destructive)/0.8)]',
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="metric-label">{best ? '안정' : worst ? '주의' : '구간'}</p>
        <h4 className="mt-1 text-xl font-black">{stat.order}번째</h4>
      </div>
      <Badge variant="outline" className="bg-card/80">
        {stat.total}경기
      </Badge>
    </div>
    <p className="mt-5 text-3xl font-black tabular-nums">{formatWinRate(stat.winRate)}</p>
    <p className="mt-1 text-xs font-semibold text-muted-foreground">
      {stat.wins}승 {stat.losses}패 {stat.draws}무
    </p>
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="metric-label">결과 분포</p>
        <p className="text-[11px] font-semibold text-muted-foreground">{stat.decisive}결정전</p>
      </div>
      <ResultSplitBar summary={stat} className="h-1.5" />
    </div>
  </div>
);

const OrderJudgePanel = ({
  bestOrder,
  stats,
  worstOrder,
}: {
  bestOrder: OrderStatItem | null;
  stats: OrderStatItem[];
  worstOrder: OrderStatItem | null;
}) => {
  const lateStats = stats.filter((stat) => stat.order >= 4);
  const lateSummary =
    lateStats.length > 0
      ? {
          decisive: lateStats.reduce((sum, stat) => sum + stat.decisive, 0),
          draws: lateStats.reduce((sum, stat) => sum + stat.draws, 0),
          losses: lateStats.reduce((sum, stat) => sum + stat.losses, 0),
          total: lateStats.reduce((sum, stat) => sum + stat.total, 0),
          winRate: (() => {
            const wins = lateStats.reduce((sum, stat) => sum + stat.wins, 0);
            const decisive = lateStats.reduce((sum, stat) => sum + stat.decisive, 0);
            return decisive === 0 ? null : Math.round((wins / decisive) * 100);
          })(),
          wins: lateStats.reduce((sum, stat) => sum + stat.wins, 0),
        }
      : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="border-b border-border/60 px-4 py-3 sm:px-5">
        <p className="metric-label">흐름 판단</p>
        <h3 className="mt-1 text-lg font-bold">세션을 끊을 타이밍</h3>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <OrderCompareRow label="계속 밀어볼 구간" stat={bestOrder} />
        <OrderCompareRow label="점검할 구간" stat={worstOrder} />
        {lateSummary ? (
          <div className="rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="metric-label">4번째 이후</p>
              <p className="text-sm font-black tabular-nums">
                {formatWinRate(lateSummary.winRate)}
              </p>
            </div>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {lateSummary.wins}승 {lateSummary.losses}패 {lateSummary.draws}무 ·{' '}
              {lateSummary.total}경기
            </p>
            <ResultSplitBar summary={lateSummary} className="mt-3 h-2" />
          </div>
        ) : null}
      </div>
    </div>
  );
};

const getResultShortLabel = (result: Match['result']) => {
  if (result === 'win') {
    return '승';
  }

  if (result === 'loss') {
    return '패';
  }

  return '무';
};

const getResultChipClassName = (result: Match['result']) => {
  if (result === 'win') {
    return 'border-primary/35 bg-primary/[0.12] text-primary';
  }

  if (result === 'loss') {
    return 'border-destructive/35 bg-destructive/[0.1] text-destructive';
  }

  return 'border-border bg-secondary text-muted-foreground';
};

const getModeTrendClassName = (trend: number | null) => {
  if (trend === null || trend === 0) {
    return 'border-border bg-transparent text-muted-foreground';
  }

  return trend > 0
    ? 'border-primary/30 bg-primary/[0.08] text-primary'
    : 'border-destructive/30 bg-destructive/[0.08] text-destructive';
};

const formatModeTrend = (trend: number | null) => {
  if (trend === null) {
    return '비교 대기';
  }

  if (trend === 0) {
    return '변화 없음';
  }

  return `${trend > 0 ? '+' : ''}${trend}p`;
};

const ModeRecentFormPanel = ({ stats }: { stats: ModeRecentFormItem[] }) => (
  <div className="mt-4 border-t border-border/60 pt-4">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">최근 폼</p>
        <h3 className="mt-1 text-base font-bold">모드별 최근 흐름</h3>
      </div>
      <Badge variant="outline" className="shrink-0 bg-transparent">
        최근 8경기
      </Badge>
    </div>

    <div className="grid gap-2 lg:grid-cols-2">
      {stats.map((stat) => (
        <ModeRecentFormRow key={stat.value} stat={stat} />
      ))}
    </div>
  </div>
);

const ModeRecentFormRow = ({ stat }: { stat: ModeRecentFormItem }) => (
  <div className="rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{stat.label}</p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          {stat.wins}승 {stat.losses}패 {stat.draws}무 · 최근 승률 {formatWinRate(stat.winRate)}
        </p>
      </div>
      <Badge
        variant="outline"
        className={cn('w-[76px] shrink-0 justify-center', getModeTrendClassName(stat.trend))}
      >
        {formatModeTrend(stat.trend)}
      </Badge>
    </div>

    <div className="mt-3 flex flex-wrap gap-1.5">
      {stat.matches.map((match) => (
        <span
          key={match.id}
          className={cn(
            'flex h-7 min-w-7 items-center justify-center rounded-md border px-2 text-xs font-black tabular-nums',
            getResultChipClassName(match.result),
          )}
          title={`${new Date(match.playedAt).toLocaleDateString('ko-KR')} · ${getResultShortLabel(
            match.result,
          )} · ${match.teamScore}-${match.enemyScore}`}
        >
          {getResultShortLabel(match.result)}
        </span>
      ))}
    </div>
  </div>
);

interface ModeInsightRowProps {
  modeMapStats?: {
    maps: Array<
      SummaryLike & {
        label: string;
        pickRate: number;
        value: string;
      }
    >;
  };
  stat: SummaryLike & {
    label: string;
    value: string;
  };
}

const ModeInsightRow = ({ modeMapStats, stat }: ModeInsightRowProps) => {
  const topMaps = modeMapStats?.maps.slice(0, 2) ?? [];

  return (
    <div className="border-b border-border/60 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-bold leading-snug">{stat.label}</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {stat.wins}승 {stat.losses}패 {stat.draws}무 · {stat.total}경기
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums">{formatWinRate(stat.winRate)}</p>
          <p className="mt-1 text-[11px] font-semibold text-muted-foreground">승률</p>
        </div>
      </div>

      <div className="mt-3">
        <ResultSplitBar summary={stat} />
      </div>

      {topMaps.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
          <p className="metric-label">강한 전장</p>
          {topMaps.map((map) => (
            <div
              key={map.value}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs"
            >
              <span className="min-w-0 truncate font-semibold text-muted-foreground">
                {map.label}
              </span>
              <span className="font-bold tabular-nums">
                {formatWinRate(map.winRate)} · {map.total}경기
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

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
