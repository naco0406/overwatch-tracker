import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Gauge,
  Globe2,
  Layers3,
  ListOrdered,
  Loader2,
  MapIcon,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  TriangleAlert,
  UsersRound,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
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
import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchRoleIcon, MatchRoleLabel } from '@/components/match/MatchRoleBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  getFavoriteEsportsTeamEvents,
  getNextFavoriteEsportsTeamEvent,
  isFavoriteEsportsTeamEvent,
} from '@/lib/externalEsports';
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
import type { ExternalDataOverview, ExternalSource } from '@/types/externalData';
import type { Match, MatchRole, ModeId, QueueType } from '@/types/match';
import { getPlayerAccountLabel, type PlayerAccount } from '@/types/playerAccount';
import type { FavoriteEsportsTeam } from '@/types/userSettings';

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
    title: '요약',
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

const externalSourceTypeLabels = {
  official_api: '공식 API',
  official_web: '공식 웹',
  third_party_api: '서드파티 API',
  third_party_web: '서드파티 웹',
} satisfies Record<ExternalSource['sourceType'], string>;

const externalEventStatusLabels = {
  canceled: '취소',
  completed: '종료',
  live: '진행 중',
  postponed: '연기',
  scheduled: '예정',
} as const;

const externalRegionLabels = {
  all: '전체',
  americas: '미주',
  asia: '아시아',
  china: '중국',
  europe: '유럽',
  emea: 'EMEA',
  global: '글로벌',
  japan: '일본',
  korea: '한국',
  na: '북미',
  north_america: '북미',
  owwc: '월드컵',
  pacific: '퍼시픽',
} as const;

const externalSourcePriority = {
  blizzard_hero_rates: 0,
  overfast: 1,
  official_esports: 2,
  owtics: 3,
  blizzard_heroes: 4,
} satisfies Record<string, number>;

export const formatExternalDateTime = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
};

export const getLatestExternalTimestamp = (values: string[]) => {
  const latestTime = values.reduce((latest, value) => {
    const time = new Date(value).getTime();

    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, Number.NEGATIVE_INFINITY);

  return Number.isFinite(latestTime) ? new Date(latestTime).toISOString() : null;
};

const formatExternalTtl = (seconds: number) => {
  if (seconds >= 86400) {
    return `${Math.round(seconds / 86400)}일`;
  }

  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)}시간`;
  }

  return `${Math.max(1, Math.round(seconds / 60))}분`;
};

const formatExternalPercent = (value: number | null) =>
  value === null ? '--' : `${value.toFixed(1)}%`;

const formatExternalSignedPercent = (value: number | null) => {
  if (value === null) {
    return '--';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const getExternalSourceTypeLabel = (value: ExternalSource['sourceType']) =>
  externalSourceTypeLabels[value] ?? value;

const getExternalRegionLabel = (value: string) =>
  value in externalRegionLabels
    ? externalRegionLabels[value as keyof typeof externalRegionLabels]
    : value || '미지정';

const getExternalHeroLabel = (heroId: string) =>
  heroOptions.find((hero) => hero.value === heroId)?.label ?? heroId;

const getExternalHeroOption = (heroId: string) =>
  heroOptions.find((hero) => hero.value === heroId) ?? null;

const getExternalHeroPortraitSrc = (heroId: string) => {
  const hero = getExternalHeroOption(heroId);

  return hero ? getHeroPortraitPath(hero.value) : null;
};

const getExternalRoleLabel = (role: string) => {
  if (role === 'all') {
    return '전체';
  }

  return role in roleLabels ? roleLabels[role as keyof typeof roleLabels] : role;
};

const getExternalEventStatusLabel = (status: string) =>
  status in externalEventStatusLabels
    ? externalEventStatusLabels[status as keyof typeof externalEventStatusLabels]
    : status;

const getExternalEsportsMatchPath = (event: ExternalEsportsEventItem) =>
  `/external-data/esports/matches/${encodeURIComponent(event.id)}`;

const externalScheduleLogoWellStyle = {
  background:
    'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.20), transparent 58%), linear-gradient(145deg, hsl(222 20% 15%), hsl(220 16% 8%))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -12px 28px rgba(0,0,0,0.18)',
} satisfies CSSProperties;

const externalScheduleLogoImageClassName =
  'h-full w-full object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)] drop-shadow-[0_0_10px_rgba(0,0,0,0.45)]';

const getExternalEventMetadataString = (event: ExternalEsportsEventItem, key: string) => {
  const value = event.metadata?.[key];

  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

const getExternalEventTeamLogoUrl = (event: ExternalEsportsEventItem, side: 'A' | 'B') =>
  getExternalEventMetadataString(event, side === 'A' ? 'teamALogoUrl' : 'teamBLogoUrl');

const getExternalEventCompetitionLogoUrl = (event: ExternalEsportsEventItem) =>
  getExternalEventMetadataString(event, 'competitionLogoUrl');

const getExternalEventTeamCode = (event: ExternalEsportsEventItem, side: 'A' | 'B') =>
  getExternalEventMetadataString(event, side === 'A' ? 'teamAAbbreviation' : 'teamBAbbreviation') ||
  (side === 'A' ? event.teamA : event.teamB);

const getExternalTeamInitials = (teamName: string) =>
  teamName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'T';

const getExternalSourcePriority = (sourceId: string) =>
  sourceId in externalSourcePriority
    ? externalSourcePriority[sourceId as keyof typeof externalSourcePriority]
    : 99;

const getExternalSourceLabel = (sourceId: string, sources: ExternalSource[]) =>
  sources.find((source) => source.id === sourceId)?.displayName ?? sourceId;

const getExternalCompactSourceLabel = (sourceId: string) => {
  if (sourceId === 'official_esports') {
    return '공식';
  }

  if (sourceId === 'owtics') {
    return 'OWTICS';
  }

  if (sourceId === 'blizzard_hero_rates') {
    return '공식 메타';
  }

  return sourceId;
};

const getExternalFreshnessLabel = (value: string | null) => {
  if (!value) {
    return '수집 대기';
  }

  const diffMs = Date.now() - new Date(value).getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return formatExternalDateTime(value);
  }

  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 60) {
    return `${Math.max(1, diffMinutes)}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  return `${Math.floor(diffHours / 24)}일 전`;
};

const compareExternalTimestampAsc = (left: string | null, right: string | null) =>
  new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();

const formatExternalFullDate = (value: string) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateValue(value) : new Date(value);

  if (!date || Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
    year: 'numeric',
  }).format(date);
};

const formatExternalEventTime = (value: string | null) => {
  if (!value) {
    return '시간 미정';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '시간 미정';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatExternalMonthYear = (date: Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    year: 'numeric',
  }).format(date);

const formatExternalWeekRange = (start: Date) => {
  const end = addDays(start, 6);

  return `${formatExternalFullDate(formatDateValue(start))} - ${formatExternalFullDate(
    formatDateValue(end),
  )}`;
};

const getExternalWatchLinkLabel = (value: string) => {
  if (/twitch\.tv/i.test(value)) {
    return 'Twitch';
  }

  if (/youtu\.?be|youtube\.com/i.test(value)) {
    return 'YouTube';
  }

  if (/owtics\.gg/i.test(value)) {
    return 'OWTICS';
  }

  return '보기';
};

const getExternalHeroRole = (heroId: string, fallbackRole?: string) => {
  const hero = getExternalHeroOption(heroId);

  if (hero) {
    return hero.role;
  }

  return fallbackRole === 'tank' || fallbackRole === 'damage' || fallbackRole === 'support'
    ? fallbackRole
    : null;
};

const getExternalRoleFilterLabel = (value: ExternalHeroRoleFilter) =>
  value === 'all' ? '전체' : getExternalRoleLabel(value);

const getExternalEventDateKey = (event: ExternalEsportsEventItem) => {
  if (!event.startsAt) {
    return null;
  }

  const date = new Date(event.startsAt);

  return Number.isNaN(date.getTime()) ? null : formatDateValue(date);
};

const getExternalEventStatusCounts = (events: ExternalEsportsEventItem[]) =>
  events.reduce(
    (counts, event) => {
      if (event.status === 'completed') {
        counts.completed += 1;
      } else if (event.status === 'live') {
        counts.live += 1;
      } else {
        counts.scheduled += 1;
      }

      return counts;
    },
    { completed: 0, live: 0, scheduled: 0 },
  );

const formatExternalTimeUntil = (value: string | null, now: number) => {
  if (!value) {
    return '시간 미정';
  }

  const startsAt = new Date(value).getTime();

  if (!Number.isFinite(startsAt)) {
    return '시간 미정';
  }

  const diffMinutes = Math.round((startsAt - now) / 60000);

  if (diffMinutes <= 0) {
    return '곧 시작';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 후`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;

  if (diffHours < 24) {
    return remainingMinutes > 0
      ? `${diffHours}시간 ${remainingMinutes}분 후`
      : `${diffHours}시간 후`;
  }

  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;

  return remainingHours > 0 ? `${diffDays}일 ${remainingHours}시간 후` : `${diffDays}일 후`;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(date.getDate() + amount);

  return next;
};

const getWeekStart = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(date.getDate() - date.getDay());

  return start;
};

const getExternalCalendarDays = (visibleDate: Date, mode: ExternalScheduleViewMode) => {
  if (mode === 'week') {
    const weekStart = getWeekStart(visibleDate);

    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }

  return getCalendarMonthDays(visibleDate);
};

const formatExternalDateRangeLabel = (visibleDate: Date, mode: ExternalScheduleViewMode) =>
  mode === 'week'
    ? formatExternalWeekRange(getWeekStart(visibleDate))
    : formatExternalMonthYear(visibleDate);

const getExternalEventSortTime = (event: ExternalEsportsEventItem) => {
  const time = new Date(event.startsAt ?? 0).getTime();

  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
};

const getExternalScheduleRegionValue = (event: ExternalEsportsEventItem) =>
  event.region?.trim() || 'unknown';

const getExternalScheduleRegionPriority = (value: ExternalScheduleRegionFilter) => {
  const regionOrder = [
    'all',
    'korea',
    'japan',
    'pacific',
    'china',
    'asia',
    'na',
    'north_america',
    'emea',
    'europe',
    'americas',
    'owwc',
    'global',
    'unknown',
  ];
  const index = regionOrder.indexOf(value);

  return index >= 0 ? index : regionOrder.length;
};

const createExternalScheduleRegionOptions = (
  events: ExternalEsportsEventItem[],
  now: number,
): ExternalScheduleRegionOption[] => {
  const regions = events.reduce((map, event) => {
    const value = getExternalScheduleRegionValue(event);
    const current = map.get(value) ?? { count: 0, upcomingCount: 0 };
    const startsAt = event.startsAt ? new Date(event.startsAt).getTime() : null;

    current.count += 1;

    if (startsAt !== null && Number.isFinite(startsAt) && startsAt >= now) {
      current.upcomingCount += 1;
    }

    map.set(value, current);

    return map;
  }, new Map<string, { count: number; upcomingCount: number }>());

  const regionOptions = Array.from(regions, ([value, counts]) => ({
    count: counts.count,
    label: value === 'unknown' ? '미지정' : getExternalRegionLabel(value),
    upcomingCount: counts.upcomingCount,
    value,
  })).sort((left, right) => {
    const priorityDelta =
      getExternalScheduleRegionPriority(left.value) -
      getExternalScheduleRegionPriority(right.value);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.label.localeCompare(right.label, 'ko-KR');
  });

  return [
    {
      count: events.length,
      label: '전체',
      upcomingCount: regionOptions.reduce((sum, option) => sum + option.upcomingCount, 0),
      value: 'all',
    },
    ...regionOptions,
  ];
};

const createExternalScheduleSourceOptions = (
  events: ExternalEsportsEventItem[],
): ExternalScheduleSourceOption[] => {
  const sourceOptions = Array.from(
    events.reduce((map, event) => {
      map.set(event.sourceId, (map.get(event.sourceId) ?? 0) + 1);

      return map;
    }, new Map<string, number>()),
    ([value, count]) => ({
      count,
      label: getExternalCompactSourceLabel(value),
      value,
    }),
  ).sort(
    (left, right) =>
      getExternalSourcePriority(left.value) - getExternalSourcePriority(right.value) ||
      left.label.localeCompare(right.label, 'ko-KR'),
  );

  return [
    {
      count: events.length,
      label: '전체',
      value: 'all',
    },
    ...sourceOptions,
  ];
};

const filterExternalScheduleEvents = (
  events: ExternalEsportsEventItem[],
  regionFilter: ExternalScheduleRegionFilter,
) =>
  regionFilter === 'all'
    ? events
    : events.filter((event) => getExternalScheduleRegionValue(event) === regionFilter);

const filterExternalScheduleEventsBySource = (
  events: ExternalEsportsEventItem[],
  sourceFilter: ExternalScheduleSourceFilter,
) => (sourceFilter === 'all' ? events : events.filter((event) => event.sourceId === sourceFilter));

const filterExternalScheduleEventsByQuery = (events: ExternalEsportsEventItem[], query: string) => {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');

  if (!normalizedQuery) {
    return events;
  }

  return events.filter((event) =>
    [
      event.teamA,
      event.teamB,
      event.stage,
      event.series,
      event.tournament,
      event.region ? getExternalRegionLabel(event.region) : '',
      getExternalCompactSourceLabel(event.sourceId),
    ].some((value) => value.toLocaleLowerCase('ko-KR').includes(normalizedQuery)),
  );
};

const getExternalScheduleStatusFilterValue = (
  status: string,
): Exclude<ExternalScheduleStatusFilter, 'all'> => {
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'live') {
    return 'live';
  }

  return 'scheduled';
};

const filterExternalScheduleEventsByStatus = (
  events: ExternalEsportsEventItem[],
  statusFilter: ExternalScheduleStatusFilter,
) =>
  statusFilter === 'all'
    ? events
    : events.filter((event) => getExternalScheduleStatusFilterValue(event.status) === statusFilter);

const getExternalUpcomingEvents = (events: ExternalEsportsEventItem[], now: number, limit = 8) =>
  events
    .filter((event) => event.startsAt && new Date(event.startsAt).getTime() >= now)
    .sort((left, right) => compareExternalTimestampAsc(left.startsAt, right.startsAt))
    .slice(0, limit);

const sortExternalHeroRows = (rows: ExternalHeroMetaRow[], sortMode: ExternalHeroSortMode) =>
  [...rows].sort((left, right) => {
    if (sortMode === 'name') {
      return left.name.localeCompare(right.name, 'ko-KR');
    }

    if (sortMode === 'win') {
      const winDelta = (right.winRate ?? -1) - (left.winRate ?? -1);

      if (winDelta !== 0) {
        return winDelta;
      }

      return (right.pickRate ?? -1) - (left.pickRate ?? -1);
    }

    const pickDelta = (right.pickRate ?? -1) - (left.pickRate ?? -1);

    if (pickDelta !== 0) {
      return pickDelta;
    }

    return (right.winRate ?? -1) - (left.winRate ?? -1);
  });

const filterExternalHeroRows = (rows: ExternalHeroMetaRow[], query: string) => {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');

  if (!normalizedQuery) {
    return rows;
  }

  return rows.filter((hero) =>
    [hero.heroId, hero.name, hero.regionLabel, hero.roleLabel, hero.sourceLabel].some((value) =>
      value.toLocaleLowerCase('ko-KR').includes(normalizedQuery),
    ),
  );
};

const getExternalHeroScatterRoleClassName = (role: MatchRole | null) => {
  if (role === 'tank') {
    return 'border-amber-200 bg-amber-300 shadow-[0_0_0_3px_rgb(252_211_77/0.14)]';
  }

  if (role === 'damage') {
    return 'border-rose-200 bg-rose-300 shadow-[0_0_0_3px_rgb(251_113_133/0.14)]';
  }

  if (role === 'support') {
    return 'border-emerald-200 bg-emerald-300 shadow-[0_0_0_3px_rgb(52_211_153/0.14)]';
  }

  return 'border-slate-200 bg-slate-300';
};

const getExternalHeroScatterPosition = (value: number, minValue: number, maxValue: number) => {
  if (maxValue <= minValue) {
    return 50;
  }

  return Math.min(97, Math.max(3, ((value - minValue) / (maxValue - minValue)) * 94 + 3));
};

const getExternalHeroMetricRangeWidth = (
  value: number | null,
  minValue: number,
  maxValue: number,
) => {
  if (value === null || maxValue <= minValue) {
    return 0;
  }

  return Math.min(100, Math.max(0, ((value - minValue) / (maxValue - minValue)) * 100));
};

const getExternalNiceAxisStep = (range: number, targetTickCount = 4) => {
  if (!Number.isFinite(range) || range <= 0) {
    return 1;
  }

  const rawStep = range / targetTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 2.5) {
    return 2.5 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
};

const getExternalRoundedAxisValue = (value: number) => Number(value.toFixed(2));

const createExternalHeroScatterAxis = (
  values: Array<number | null>,
  {
    fallbackMax,
    fallbackMin,
    ignoreZero = false,
    minPadding,
    minRange,
  }: {
    fallbackMax: number;
    fallbackMin: number;
    ignoreZero?: boolean;
    minPadding: number;
    minRange: number;
  },
): ExternalHeroScatterAxis => {
  const numericValues = getExternalValidPercentValues(values, { ignoreZero });
  const rawMin = numericValues.length > 0 ? Math.min(...numericValues) : fallbackMin;
  const rawMax = numericValues.length > 0 ? Math.max(...numericValues) : fallbackMax;
  const rawRange = Math.max(0, rawMax - rawMin);
  const padding = Math.max(minPadding, rawRange * 0.16);
  let min = rawMin - padding;
  let max = rawMax + padding;

  if (max - min < minRange) {
    const center = (rawMin + rawMax) / 2;

    min = center - minRange / 2;
    max = center + minRange / 2;
  }

  min = Math.max(0, min);
  max = Math.min(100, max);

  if (max - min < minRange) {
    if (min <= 0) {
      max = Math.min(100, min + minRange);
    } else if (max >= 100) {
      min = Math.max(0, max - minRange);
    }
  }

  const step = getExternalNiceAxisStep(max - min);
  const niceMin = Math.max(0, Math.floor(min / step) * step);
  const niceMax = Math.min(100, Math.ceil(max / step) * step);
  const safeMax = niceMax <= niceMin ? Math.min(100, niceMin + step) : niceMax;
  const ticks: number[] = [];

  for (let tick = niceMin; tick <= safeMax + step / 2; tick += step) {
    ticks.push(getExternalRoundedAxisValue(tick));
  }

  if (ticks.length < 2) {
    ticks.push(getExternalRoundedAxisValue(safeMax));
  }

  return {
    max: getExternalRoundedAxisValue(safeMax),
    min: getExternalRoundedAxisValue(niceMin),
    rawMax: getExternalRoundedAxisValue(rawMax),
    rawMin: getExternalRoundedAxisValue(rawMin),
    ticks,
  };
};

const createExternalHeroScatterAxisFromDomain = (
  baseAxis: ExternalHeroScatterAxis,
  min: number,
  max: number,
): ExternalHeroScatterAxis => {
  const safeMin = Math.max(0, Math.min(100, Math.min(min, max)));
  const safeMax = Math.max(safeMin + 0.1, Math.min(100, Math.max(min, max)));
  const step = getExternalNiceAxisStep(safeMax - safeMin);
  const ticks: number[] = [];
  const firstTick = Math.ceil(safeMin / step) * step;

  ticks.push(getExternalRoundedAxisValue(safeMin));

  for (let tick = firstTick; tick < safeMax; tick += step) {
    const roundedTick = getExternalRoundedAxisValue(tick);

    if (roundedTick > safeMin && roundedTick < safeMax) {
      ticks.push(roundedTick);
    }
  }

  ticks.push(getExternalRoundedAxisValue(safeMax));

  return {
    max: getExternalRoundedAxisValue(safeMax),
    min: getExternalRoundedAxisValue(safeMin),
    rawMax: baseAxis.rawMax,
    rawMin: baseAxis.rawMin,
    ticks: Array.from(new Set(ticks)),
  };
};

const isExternalMetricInsideAxis = (value: number | null, axis: ExternalHeroScatterAxis) =>
  value !== null && value >= axis.min && value <= axis.max;

const clampExternalHeroAxisDomain = ({
  baseAxis,
  max,
  min,
  minRange,
}: {
  baseAxis: ExternalHeroScatterAxis;
  max: number;
  min: number;
  minRange: number;
}) => {
  const baseRange = Math.max(0.1, baseAxis.max - baseAxis.min);
  const targetRange = Math.min(baseRange, Math.max(minRange, max - min));
  let nextMin = min;
  let nextMax = min + targetRange;

  if (nextMin < baseAxis.min) {
    nextMin = baseAxis.min;
    nextMax = nextMin + targetRange;
  }

  if (nextMax > baseAxis.max) {
    nextMax = baseAxis.max;
    nextMin = nextMax - targetRange;
  }

  return {
    max: getExternalRoundedAxisValue(Math.min(baseAxis.max, nextMax)),
    min: getExternalRoundedAxisValue(Math.max(baseAxis.min, nextMin)),
  };
};

const zoomExternalHeroAxisDomain = ({
  axis,
  baseAxis,
  centerRatio,
  minRange,
  scale,
}: {
  axis: ExternalHeroScatterAxis;
  baseAxis: ExternalHeroScatterAxis;
  centerRatio: number;
  minRange: number;
  scale: number;
}) => {
  const safeCenterRatio = Math.min(0.95, Math.max(0.05, centerRatio));
  const currentRange = axis.max - axis.min;
  const baseRange = baseAxis.max - baseAxis.min;
  const targetRange = Math.min(baseRange, Math.max(minRange, currentRange * scale));
  const centerValue = axis.min + currentRange * safeCenterRatio;

  return clampExternalHeroAxisDomain({
    baseAxis,
    max: centerValue + targetRange * (1 - safeCenterRatio),
    min: centerValue - targetRange * safeCenterRatio,
    minRange,
  });
};

const getExternalHeroSignalFocusDomain = ({
  avgPick,
  avgWin,
  basePickAxis,
  baseWinAxis,
  pickMinRange,
  signalFilter,
  winMinRange,
}: {
  avgPick: number | null;
  avgWin: number | null;
  basePickAxis: ExternalHeroScatterAxis;
  baseWinAxis: ExternalHeroScatterAxis;
  pickMinRange: number;
  signalFilter: ExternalHeroSignalFilter;
  winMinRange: number;
}): ExternalHeroScatterZoomDomain | null => {
  if (signalFilter === 'all' || avgPick === null || avgWin === null) {
    return null;
  }

  const pickPadding = Math.max(0.8, (basePickAxis.max - basePickAxis.min) * 0.08);
  const winPadding = Math.max(0.6, (baseWinAxis.max - baseWinAxis.min) * 0.08);
  let pickMin = basePickAxis.min;
  let pickMax = basePickAxis.max;
  let winMin = baseWinAxis.min;
  let winMax = baseWinAxis.max;

  if (signalFilter === 'core') {
    pickMin = avgPick - pickPadding;
    winMin = avgWin - winPadding;
  } else if (signalFilter === 'efficient') {
    pickMax = avgPick + pickPadding;
    winMin = avgWin - winPadding;
  } else if (signalFilter === 'overheated') {
    pickMin = avgPick - pickPadding;
    winMax = avgWin + winPadding;
  } else {
    pickMax = avgPick + pickPadding;
    winMax = avgWin + winPadding;
  }

  const pickDomain = clampExternalHeroAxisDomain({
    baseAxis: basePickAxis,
    max: pickMax,
    min: pickMin,
    minRange: pickMinRange,
  });
  const winDomain = clampExternalHeroAxisDomain({
    baseAxis: baseWinAxis,
    max: winMax,
    min: winMin,
    minRange: winMinRange,
  });

  return {
    pickMax: pickDomain.max,
    pickMin: pickDomain.min,
    winMax: winDomain.max,
    winMin: winDomain.min,
  };
};

const getExternalHeroMetricRank = (
  rows: ExternalHeroMetaRow[],
  heroId: string,
  metric: 'pickRate' | 'winRate',
) => {
  const sortedRows = [...rows]
    .filter((hero) => hero[metric] !== null)
    .sort((left, right) => (right[metric] ?? -1) - (left[metric] ?? -1));
  const index = sortedRows.findIndex((hero) => hero.heroId === heroId);

  return index >= 0 ? index + 1 : null;
};

const getExternalHeroSignalKey = (
  hero: ExternalHeroMetaRow,
  rows: ExternalHeroMetaRow[],
): Exclude<ExternalHeroSignalFilter, 'all'> => {
  const avgPickRate = getExternalAverage(rows.map((row) => row.pickRate));
  const avgWinRate = getExternalAverage(
    rows.map((row) => row.winRate),
    { ignoreZero: true },
  );

  if (
    hero.pickRate === null ||
    hero.winRate === null ||
    avgPickRate === null ||
    avgWinRate === null
  ) {
    return 'watch';
  }

  if (hero.pickRate >= avgPickRate && hero.winRate >= avgWinRate) {
    return 'core';
  }

  if (hero.pickRate < avgPickRate && hero.winRate >= avgWinRate) {
    return 'efficient';
  }

  if (hero.pickRate >= avgPickRate && hero.winRate < avgWinRate) {
    return 'overheated';
  }

  return 'watch';
};

const externalHeroSignalLabels = {
  all: '전체',
  core: '핵심 메타',
  efficient: '고효율 픽',
  overheated: '과열 픽',
  watch: '관찰 구간',
} satisfies Record<ExternalHeroSignalFilter, string>;

const getExternalHeroSignalLabel = (hero: ExternalHeroMetaRow, rows: ExternalHeroMetaRow[]) =>
  externalHeroSignalLabels[getExternalHeroSignalKey(hero, rows)];

const filterExternalHeroRowsBySignal = (
  rows: ExternalHeroMetaRow[],
  signalFilter: ExternalHeroSignalFilter,
  contextRows = rows,
) =>
  signalFilter === 'all'
    ? rows
    : rows.filter((hero) => getExternalHeroSignalKey(hero, contextRows) === signalFilter);

const getExternalHeroSignalCounts = (rows: ExternalHeroMetaRow[]) =>
  rows.reduce(
    (counts, hero) => {
      counts[getExternalHeroSignalKey(hero, rows)] += 1;

      return counts;
    },
    { core: 0, efficient: 0, overheated: 0, watch: 0 },
  );

const getExternalHeroPeerRows = (hero: ExternalHeroMetaRow, rows: ExternalHeroMetaRow[]) =>
  rows
    .filter((row) => row.heroId !== hero.heroId && row.role === hero.role)
    .map((row) => ({
      distance:
        Math.abs((row.pickRate ?? 0) - (hero.pickRate ?? 0)) +
        Math.abs((row.winRate ?? 0) - (hero.winRate ?? 0)),
      row,
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || (right.row.pickRate ?? -1) - (left.row.pickRate ?? -1),
    )
    .slice(0, 3)
    .map((item) => item.row);

const getExternalHeroCoverageLabel = (hero: ExternalHeroMetaRow) => {
  if (hero.snapshotCount >= 4 && hero.sourceCount >= 2) {
    return '표본 양호';
  }

  if (hero.snapshotCount >= 2) {
    return '표본 보통';
  }

  return '표본 적음';
};

const roundExternalMetric = (value: number | null) =>
  value === null ? null : Number(value.toFixed(1));

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

const percentageTooltipKeys = new Set(['승률', '선택률', '픽률']);

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

  if (!renderedNames.has('픽률') && typeof datum.픽률 === 'number') {
    rows.push({ label: '픽률', value: String(formatTooltipValue(datum.픽률, '픽률')) });
  }

  if (typeof datum.sourceLabel === 'string') {
    rows.push({ label: '소스', value: datum.sourceLabel });
  }

  if (typeof datum.regionLabel === 'string') {
    rows.push({ label: '지역', value: datum.regionLabel });
  }

  if (typeof datum.roleLabel === 'string') {
    rows.push({ label: '포지션', value: datum.roleLabel });
  }

  if (typeof datum.snapshotCount === 'number') {
    rows.push({
      label: '표본',
      value: datum.snapshotCount.toLocaleString('ko-KR'),
    });
  }

  if (typeof datum.상태 === 'string') {
    rows.push({ label: '상태', value: datum.상태 });
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

export interface MetricCellProps {
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

export const MetricGrid = ({
  className,
  metrics,
}: {
  className?: string;
  metrics: MetricCellProps[];
}) => (
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

export type ExternalHeroRateItem = ExternalDataOverview['heroRates'][number];
export type ExternalEsportsEventItem = ExternalDataOverview['esportsEvents'][number];

type ExternalHeroRoleFilter = 'all' | MatchRole;
type ExternalHeroSignalFilter = 'all' | 'core' | 'efficient' | 'overheated' | 'watch';
type ExternalHeroSortMode = 'name' | 'pick' | 'win';
type ExternalScheduleViewMode = 'month' | 'week';
type ExternalScheduleRegionFilter = 'all' | string;
type ExternalScheduleSourceFilter = 'all' | string;
type ExternalScheduleStatusFilter = 'all' | 'completed' | 'live' | 'scheduled';

interface ExternalHeroMetaRow {
  heroId: string;
  latestAt: string | null;
  name: string;
  pickRate: number | null;
  regionLabel: string;
  role: MatchRole | null;
  roleLabel: string;
  sourceCount: number;
  sourceLabel: string;
  snapshotCount: number;
  winRate: number | null;
}

interface ExternalHeroScatterAxis {
  max: number;
  min: number;
  rawMax: number;
  rawMin: number;
  ticks: number[];
}

interface ExternalHeroScatterZoomDomain {
  pickMax: number;
  pickMin: number;
  winMax: number;
  winMin: number;
}

interface ExternalHeroScatterTooltipState {
  heroId: string;
  x: number;
  y: number;
}

interface ExternalHeroScatterPanState {
  height: number;
  pickMax: number;
  pickMin: number;
  startX: number;
  startY: number;
  width: number;
  winMax: number;
  winMin: number;
}

interface ExternalScheduleRegionOption {
  count: number;
  label: string;
  upcomingCount: number;
  value: ExternalScheduleRegionFilter;
}

interface ExternalScheduleSourceOption {
  count: number;
  label: string;
  value: ExternalScheduleSourceFilter;
}

export interface ExternalSourceCardModel {
  detail: string;
  eventCount: number;
  heroRateCount: number;
  latestAt: string | null;
  primaryLabel: string;
  source: ExternalSource;
  statusLabel: string;
}

export interface ExternalDataOverviewPanelProps {
  error: unknown;
  isConfigured: boolean;
  isFetching: boolean;
  isLoading: boolean;
  metrics: MetricCellProps[];
  overview?: ExternalDataOverview;
  onRefresh: () => void;
}

export const ExternalDataOverviewPanel = ({
  error,
  isConfigured,
  isFetching,
  isLoading,
  metrics,
  onRefresh,
  overview,
}: ExternalDataOverviewPanelProps) => {
  const sources = overview?.sources ?? [];
  const heroRates = overview?.heroRates ?? [];
  const esportsEvents = overview?.esportsEvents ?? [];
  const warnings = overview?.warnings ?? [];
  const sourceCards = createExternalSourceCards(sources, heroRates, esportsEvents);

  if (!isConfigured) {
    return (
      <div className="space-y-4">
        <MetricGrid metrics={metrics} />
        <EmptyState
          icon={Database}
          title="외부 데이터 API 주소가 없습니다."
          description="Cloudflare Pages 환경 변수 VITE_EXTERNAL_DATA_API_URL을 설정하면 이 화면에서 Worker 데이터를 확인할 수 있습니다."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MetricGrid metrics={metrics} />

      <ExternalDataControlBar
        esportsEvents={esportsEvents}
        heroRates={heroRates}
        isFetching={isFetching}
        onRefresh={onRefresh}
      />

      {error ? (
        <EmptyState
          action={
            <Button variant="outline" className="bg-transparent" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </Button>
          }
          icon={TriangleAlert}
          title="외부 데이터를 불러오지 못했습니다."
          description={error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.'}
        />
      ) : (
        <>
          {warnings.length > 0 ? <ExternalDataWarningsPanel warnings={warnings} /> : null}

          <div className="grid gap-4 2xl:grid-cols-[minmax(360px,0.92fr)_minmax(0,1.08fr)] 2xl:items-start">
            <ExternalEsportsSchedulePanel esportsEvents={esportsEvents} isLoading={isLoading} />
            <ExternalHeroMetaPanel heroRates={heroRates} isLoading={isLoading} sources={sources} />
          </div>

          <ExternalDataKindPanel
            isLoading={isLoading}
            sourceCards={sourceCards}
            sources={sources}
          />
        </>
      )}
    </div>
  );
};

export const createExternalSourceCards = (
  sources: ExternalSource[],
  heroRates: ExternalHeroRateItem[],
  esportsEvents: ExternalEsportsEventItem[],
): ExternalSourceCardModel[] =>
  [...sources]
    .sort((left, right) => getExternalSourcePriority(left.id) - getExternalSourcePriority(right.id))
    .map((source) => {
      const sourceHeroRates = heroRates.filter((snapshot) => snapshot.sourceId === source.id);
      const sourceEvents = esportsEvents.filter((event) => event.sourceId === source.id);
      const latestAt = getLatestExternalTimestamp([
        ...sourceHeroRates.map((snapshot) => snapshot.fetchedAt),
        ...sourceEvents.map((event) => event.fetchedAt),
      ]);

      if (source.id === 'blizzard_hero_rates') {
        return {
          detail: '공식 영웅 픽률·승률',
          eventCount: sourceEvents.length,
          heroRateCount: sourceHeroRates.length,
          latestAt,
          primaryLabel: '영웅 메타',
          source,
          statusLabel: sourceHeroRates.length > 0 ? '수집됨' : '대기',
        };
      }

      if (source.id === 'overfast') {
        const regions = new Set(sourceHeroRates.map((snapshot) => snapshot.region));

        return {
          detail:
            regions.size > 0
              ? `${Array.from(regions).map(getExternalRegionLabel).join(', ')} 경쟁전 통계`
              : '경쟁전 통계·프로필',
          eventCount: sourceEvents.length,
          heroRateCount: sourceHeroRates.length,
          latestAt,
          primaryLabel: '경쟁전 보강',
          source,
          statusLabel: sourceHeroRates.length > 0 ? '수집됨' : '대기',
        };
      }

      if (source.id === 'official_esports') {
        return {
          detail: '공식 경기 일정·방송 링크',
          eventCount: sourceEvents.length,
          heroRateCount: sourceHeroRates.length,
          latestAt,
          primaryLabel: 'e스포츠',
          source,
          statusLabel: sourceEvents.length > 0 ? '수집됨' : '대기',
        };
      }

      if (source.id === 'owtics') {
        const eventRegions = new Set(sourceEvents.map((event) => event.region).filter(Boolean));

        return {
          detail:
            eventRegions.size > 0
              ? `${Array.from(eventRegions).map(getExternalRegionLabel).join(', ')} 일정 보강`
              : '아시아·한국 경기 일정 보강',
          eventCount: sourceEvents.length,
          heroRateCount: sourceHeroRates.length,
          latestAt,
          primaryLabel: '아시아 일정',
          source,
          statusLabel: sourceEvents.length > 0 ? '수집됨' : '대기',
        };
      }

      return {
        detail: '영웅 roster와 마스터 데이터',
        eventCount: sourceEvents.length,
        heroRateCount: sourceHeroRates.length,
        latestAt,
        primaryLabel: '마스터 데이터',
        source,
        statusLabel: '연결됨',
      };
    });

const getExternalValidPercentValues = (
  values: Array<number | null>,
  { ignoreZero = false }: { ignoreZero?: boolean } = {},
) =>
  values.filter(
    (value): value is number =>
      value !== null &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100 &&
      (!ignoreZero || value > 0),
  );

const getExternalAverage = (values: Array<number | null>, options?: { ignoreZero?: boolean }) => {
  const numericValues = getExternalValidPercentValues(values, options);

  if (numericValues.length === 0) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
};

const createExternalHeroMetaRows = (
  heroRates: ExternalHeroRateItem[],
  sources: ExternalSource[],
  roleFilter: ExternalHeroRoleFilter,
): ExternalHeroMetaRow[] => {
  const filteredHeroRates = heroRates.filter((snapshot) => {
    if (roleFilter === 'all') {
      return true;
    }

    return getExternalHeroRole(snapshot.heroId, snapshot.role) === roleFilter;
  });
  const groups = filteredHeroRates.reduce(
    (map, snapshot) => {
      const current = map.get(snapshot.heroId) ?? {
        latestAt: null as string | null,
        pickRates: [] as Array<number | null>,
        regions: new Set<string>(),
        role: getExternalHeroRole(snapshot.heroId, snapshot.role),
        roles: new Set<string>(),
        sourceIds: new Set<string>(),
        snapshots: 0,
        winRates: [] as Array<number | null>,
      };

      current.snapshots += 1;
      current.pickRates.push(snapshot.pickRate);
      current.winRates.push(snapshot.winRate);
      current.regions.add(snapshot.region);
      current.roles.add(snapshot.role);
      current.sourceIds.add(snapshot.sourceId);
      current.role = current.role ?? getExternalHeroRole(snapshot.heroId, snapshot.role);
      current.latestAt = getLatestExternalTimestamp(
        [current.latestAt, snapshot.fetchedAt].filter((value): value is string => Boolean(value)),
      );
      map.set(snapshot.heroId, current);

      return map;
    },
    new Map<
      string,
      {
        latestAt: string | null;
        pickRates: Array<number | null>;
        regions: Set<string>;
        role: MatchRole | null;
        roles: Set<string>;
        sourceIds: Set<string>;
        snapshots: number;
        winRates: Array<number | null>;
      }
    >(),
  );

  return Array.from(groups, ([heroId, group]) => {
    const sourceLabels = Array.from(group.sourceIds).map((sourceId) =>
      getExternalSourceLabel(sourceId, sources),
    );
    const regionLabels = Array.from(group.regions).map(getExternalRegionLabel);
    const roleLabelsForHero = Array.from(group.roles).map(getExternalRoleLabel);

    return {
      heroId,
      latestAt: group.latestAt,
      name: getExternalHeroLabel(heroId),
      pickRate: roundExternalMetric(getExternalAverage(group.pickRates)),
      regionLabel: regionLabels.slice(0, 3).join(', ') || '미지정',
      role: group.role,
      roleLabel: roleLabelsForHero.slice(0, 2).join(', ') || '미지정',
      snapshotCount: group.snapshots,
      sourceCount: group.sourceIds.size,
      sourceLabel:
        sourceLabels.length > 2
          ? `${sourceLabels.slice(0, 2).join(', ')} 외 ${sourceLabels.length - 2}`
          : sourceLabels.join(', ') || '소스 없음',
      winRate: roundExternalMetric(getExternalAverage(group.winRates, { ignoreZero: true })),
    };
  }).sort((left, right) => {
    const pickDelta = (right.pickRate ?? -1) - (left.pickRate ?? -1);

    if (pickDelta !== 0) {
      return pickDelta;
    }

    return (right.winRate ?? -1) - (left.winRate ?? -1);
  });
};

export const ExternalDataControlBar = ({
  esportsEvents,
  heroRates,
  isFetching,
  onRefresh,
}: {
  esportsEvents: ExternalEsportsEventItem[];
  heroRates: ExternalHeroRateItem[];
  isFetching: boolean;
  onRefresh: () => void;
}) => {
  const latestAt = getLatestExternalTimestamp([
    ...heroRates.map((snapshot) => snapshot.fetchedAt),
    ...esportsEvents.map((event) => event.fetchedAt),
  ]);

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="grid gap-px bg-border/60 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5 bg-transparent">
                  <Activity className="h-3.5 w-3.5" />
                  {isFetching ? '동기화 중' : '동기화 완료'}
                </Badge>
                <span className="text-xs font-bold text-muted-foreground">
                  최근 수집 {getExternalFreshnessLabel(latestAt)}
                </span>
              </div>
              <h2 className="mt-3 text-lg font-bold">외부 데이터 브라우저</h2>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                수집된 영웅 메타와 공식 경기 일정을 탐색합니다.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full bg-transparent sm:w-auto"
              disabled={isFetching}
              onClick={onRefresh}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              새로고침
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border/60 bg-card lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
          <ExternalCompactMetric
            label="영웅 메타"
            value={heroRates.length.toLocaleString('ko-KR')}
          />
          <ExternalCompactMetric
            label="일정 데이터"
            value={esportsEvents.length.toLocaleString('ko-KR')}
          />
        </div>
      </div>
    </div>
  );
};

const ExternalCompactMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="px-4 py-3">
    <p className="metric-label">{label}</p>
    <p className="mt-1 text-xl font-bold">{value}</p>
  </div>
);

export const ExternalDataWarningsPanel = ({
  warnings,
}: {
  warnings: NonNullable<ExternalDataOverview['warnings']>;
}) => (
  <div className="rounded-lg border border-amber-300/30 bg-amber-300/[0.08] px-4 py-3 sm:px-5">
    <div className="flex items-start gap-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-100">
          일부 외부 데이터 경로가 아직 준비되지 않았습니다.
        </p>
        <div className="mt-2 grid gap-1.5">
          {warnings.map((warning) => (
            <p
              key={`${warning.endpoint}-${warning.status ?? 'unknown'}`}
              className="break-words text-xs font-semibold text-amber-100/80"
            >
              {warning.endpoint}
              {warning.status ? ` · ${warning.status}` : ''} · {warning.message}
            </p>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const getExternalSourceDataKindLabel = (card: ExternalSourceCardModel) => {
  const kinds = [
    card.heroRateCount > 0 ? '영웅 메타' : '',
    card.eventCount > 0 ? '경기 일정' : '',
  ].filter(Boolean);

  if (kinds.length > 0) {
    return kinds.join(', ');
  }

  if (card.source.id === 'overfast') {
    return '프로필 준비 중';
  }

  if (card.source.id === 'blizzard_heroes') {
    return '마스터 데이터';
  }

  return card.primaryLabel;
};

const ExternalCompactSourceCard = ({ card }: { card: ExternalSourceCardModel }) => {
  const { source } = card;

  return (
    <div className="min-w-0 bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="gap-1 bg-transparent text-[11px]">
              {source.isOfficial ? (
                <ShieldCheck className="h-3 w-3" />
              ) : (
                <Globe2 className="h-3 w-3" />
              )}
              {source.isOfficial ? '공식' : '서드파티'}
            </Badge>
            <Badge variant="outline" className="bg-transparent text-[11px]">
              {card.statusLabel}
            </Badge>
          </div>
          <h3 className="mt-2 truncate text-sm font-bold">{source.displayName}</h3>
        </div>
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <a href={source.baseUrl} target="_blank" rel="noreferrer" aria-label={source.displayName}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
      <div className="mt-3 grid gap-1.5 text-xs font-semibold text-muted-foreground">
        <p className="truncate">최근 {getExternalFreshnessLabel(card.latestAt)}</p>
        <p className="truncate">제공 {getExternalSourceDataKindLabel(card)}</p>
        <p className="truncate">
          {getExternalSourceTypeLabel(source.sourceType)} · TTL{' '}
          {formatExternalTtl(source.defaultTtlSeconds)}
        </p>
      </div>
    </div>
  );
};

const ExternalPreparedDataCard = ({
  detail,
  icon: Icon,
  label,
  status,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  status: string;
}) => (
  <div className="min-w-0 bg-card p-3.5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <p className="mt-2 truncate text-sm font-bold">{status}</p>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-primary">
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-muted-foreground">
      {detail}
    </p>
  </div>
);

export const ExternalHeroMetaPanel = ({
  heroRates,
  isLoading,
  sources,
}: {
  heroRates: ExternalHeroRateItem[];
  isLoading: boolean;
  sources: ExternalSource[];
}) => {
  const [roleFilter, setRoleFilter] = useState<ExternalHeroRoleFilter>('all');
  const [heroQuery, setHeroQuery] = useState('');
  const [signalFilter, setSignalFilter] = useState<ExternalHeroSignalFilter>('all');
  const [sortMode, setSortMode] = useState<ExternalHeroSortMode>('pick');
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const allHeroRows = createExternalHeroMetaRows(heroRates, sources, 'all');
  const heroRows =
    roleFilter === 'all' ? allHeroRows : createExternalHeroMetaRows(heroRates, sources, roleFilter);
  const searchedHeroRows = filterExternalHeroRows(heroRows, heroQuery);
  const visibleHeroRows = sortExternalHeroRows(
    filterExternalHeroRowsBySignal(searchedHeroRows, signalFilter, heroRows),
    sortMode,
  );
  const signalCounts = getExternalHeroSignalCounts(heroRows);
  const topPick =
    [...heroRows]
      .filter((hero) => hero.pickRate !== null)
      .sort((left, right) => (right.pickRate ?? -1) - (left.pickRate ?? -1))[0] ??
    heroRows[0] ??
    null;
  const topWin =
    [...heroRows]
      .filter((hero) => hero.winRate !== null)
      .sort((left, right) => (right.winRate ?? -1) - (left.winRate ?? -1))[0] ??
    heroRows[0] ??
    null;
  const selectedHero = selectedHeroId
    ? (visibleHeroRows.find((hero) => hero.heroId === selectedHeroId) ?? null)
    : null;
  const latestAt = getLatestExternalTimestamp(heroRates.map((snapshot) => snapshot.fetchedAt));
  const handleRoleChange = (value: ExternalHeroRoleFilter) => {
    setRoleFilter(value);
    setSelectedHeroId(null);
  };
  const handleQueryChange = (value: string) => {
    setHeroQuery(value);
    setSelectedHeroId(null);
  };
  const handleSignalChange = (value: ExternalHeroSignalFilter) => {
    setSignalFilter(value);
    setSelectedHeroId(null);
  };
  const focusHero = (heroId: string) => {
    setHeroQuery('');
    setSignalFilter('all');
    setSelectedHeroId(heroId);
  };
  const toggleHeroSelection = (heroId: string) => {
    setSelectedHeroId((currentHeroId) => (currentHeroId === heroId ? null : heroId));
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="metric-label">영웅 메타</p>
            <h2 className="mt-1 text-lg font-bold">역할별 픽률과 승률</h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              많이 쓰이는 영웅과 승률이 좋은 영웅을 비교합니다.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <ExternalHeroRoleTabs value={roleFilter} onChange={handleRoleChange} />
            <Badge variant="outline" className="w-fit gap-1.5 bg-transparent">
              <Gauge className="h-3.5 w-3.5" />
              {getExternalFreshnessLabel(latestAt)}
            </Badge>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
          <ExternalRowsSkeleton rows={8} />
          <ExternalRowsSkeleton rows={4} />
        </div>
      ) : heroRows.length > 0 ? (
        <div>
          <div className="grid gap-px border-b border-border/60 bg-border/60 lg:grid-cols-2">
            <ExternalHeroFeatureCard
              hero={topPick}
              icon={Target}
              metricLabel="픽률"
              metricValue={formatExternalPercent(topPick?.pickRate ?? null)}
              title="픽률 상위 영웅"
              onSelect={focusHero}
            />
            <ExternalHeroFeatureCard
              hero={topWin}
              icon={Trophy}
              metricLabel="승률"
              metricValue={formatExternalPercent(topWin?.winRate ?? null)}
              title="승률 상위 영웅"
              onSelect={focusHero}
            />
          </div>

          <ExternalHeroMetaToolbar
            query={heroQuery}
            sortMode={sortMode}
            totalRows={heroRows.length}
            visibleRows={visibleHeroRows.length}
            onQueryChange={handleQueryChange}
            onSortModeChange={setSortMode}
          />
          <ExternalHeroSignalBoard
            counts={signalCounts}
            value={signalFilter}
            onChange={handleSignalChange}
          />
          {selectedHero ? (
            <ExternalHeroSpotlight
              hero={selectedHero}
              rows={visibleHeroRows}
              onClear={() => setSelectedHeroId(null)}
              onSelectHero={toggleHeroSelection}
            />
          ) : null}
          <ExternalHeroMetaScatterPlot
            contextRows={heroRows}
            rows={visibleHeroRows}
            selectedHeroId={selectedHero?.heroId ?? null}
            signalFilter={signalFilter}
            onSelectHero={toggleHeroSelection}
          />
          <ExternalHeroComparisonTable
            contextRows={heroRows}
            rows={visibleHeroRows}
            selectedHeroId={selectedHero?.heroId ?? null}
            totalRows={visibleHeroRows.length}
            onSelectHero={toggleHeroSelection}
          />
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <InlineEmptyState
            title={`${getExternalRoleFilterLabel(roleFilter)} 영웅 메타가 없습니다.`}
            description="다른 역할을 선택하거나 수집이 완료된 뒤 다시 확인해주세요."
          />
        </div>
      )}
    </section>
  );
};

const externalHeroRoleOptions = [
  { label: '전체', value: 'all' },
  ...matchRoleOptions,
] satisfies Array<{ label: string; value: ExternalHeroRoleFilter }>;

const externalHeroSortOptions = [
  { label: '픽률', value: 'pick' },
  { label: '승률', value: 'win' },
  { label: '이름', value: 'name' },
] satisfies Array<{ label: string; value: ExternalHeroSortMode }>;

const ExternalHeroRoleTabs = ({
  onChange,
  value,
}: {
  onChange: (value: ExternalHeroRoleFilter) => void;
  value: ExternalHeroRoleFilter;
}) => (
  <div className="grid grid-cols-4 overflow-hidden rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-1">
    {externalHeroRoleOptions.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        className={cn(
          'h-8 min-w-0 rounded-[5px] px-2 text-xs font-bold transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
          value === option.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
        )}
        onClick={() => onChange(option.value)}
      >
        <span className="truncate">{option.label}</span>
      </button>
    ))}
  </div>
);

const ExternalHeroSpotlight = ({
  hero,
  onClear,
  onSelectHero,
  rows,
}: {
  hero: ExternalHeroMetaRow;
  onClear: () => void;
  onSelectHero: (heroId: string) => void;
  rows: ExternalHeroMetaRow[];
}) => {
  const pickRank = hero ? getExternalHeroMetricRank(rows, hero.heroId, 'pickRate') : null;
  const winRank = hero ? getExternalHeroMetricRank(rows, hero.heroId, 'winRate') : null;
  const pickAxis = createExternalHeroScatterAxis(
    rows.map((row) => row.pickRate),
    {
      fallbackMax: 45,
      fallbackMin: 0,
      minPadding: 1.5,
      minRange: 8,
    },
  );
  const winAxis = createExternalHeroScatterAxis(
    rows.map((row) => row.winRate),
    {
      fallbackMax: 55,
      fallbackMin: 45,
      ignoreZero: true,
      minPadding: 0.8,
      minRange: 6,
    },
  );
  const peerRows = hero ? getExternalHeroPeerRows(hero, rows) : [];

  return (
    <div className="border-b border-border/60 bg-card px-4 py-4 sm:px-5">
      <div className="grid gap-4 xl:grid-cols-[168px_minmax(0,1fr)] xl:items-stretch">
        <div className="relative min-h-[168px] overflow-hidden rounded-md border border-border/70 bg-[hsl(var(--surface-2))]">
          <ExternalHeroPortrait
            heroId={hero.heroId}
            className="h-full min-h-[168px] w-full rounded-none border-0"
            imageClassName="object-cover object-top"
            iconClassName="h-8 w-8"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent px-3 pb-3 pt-10">
            <Badge variant="outline" className="bg-card/90">
              {getExternalHeroSignalLabel(hero, rows)}
            </Badge>
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="metric-label">선택한 영웅</p>
              <h3 className="mt-1 truncate text-2xl font-black">{hero.name}</h3>
              <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">
                {hero.roleLabel}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Badge variant="outline" className="bg-card">
                픽률 #{pickRank ?? '--'}
              </Badge>
              <Badge variant="outline" className="bg-card">
                승률 #{winRank ?? '--'}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="선택 해제"
                title="선택 해제"
                onClick={onClear}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ExternalHeroSpotlightMetric
              label="픽률"
              value={formatExternalPercent(hero.pickRate)}
              width={getExternalHeroMetricRangeWidth(hero.pickRate, pickAxis.min, pickAxis.max)}
            />
            <ExternalHeroSpotlightMetric
              label="승률"
              value={formatExternalPercent(hero.winRate)}
              width={getExternalHeroMetricRangeWidth(hero.winRate, winAxis.min, winAxis.max)}
            />
          </div>

          {peerRows.length > 0 ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="metric-label">가까운 비교군</p>
                <span className="text-[11px] font-bold text-muted-foreground">동일 역할 기준</span>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {peerRows.map((peer) => (
                  <button
                    key={peer.heroId}
                    type="button"
                    className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                    onClick={() => onSelectHero(peer.heroId)}
                  >
                    <ExternalHeroPortrait heroId={peer.heroId} className="h-9 w-9" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black">{peer.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground">
                        픽 {formatExternalPercent(peer.pickRate)} · 승{' '}
                        {formatExternalPercent(peer.winRate)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const ExternalHeroSpotlightMetric = ({
  label,
  value,
  width,
}: {
  label: string;
  value: string;
  width: number;
}) => (
  <div className="rounded-md border border-border/60 bg-card px-3 py-3">
    <div className="flex items-center justify-between gap-3">
      <p className="metric-label">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/60">
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${Math.min(100, Math.max(0, width))}%` }}
      />
    </div>
  </div>
);

const externalHeroSignalOptions = [
  { description: '현재 조건의 모든 영웅', value: 'all' },
  { description: '픽률과 승률이 모두 평균 이상', value: 'core' },
  { description: '픽률은 낮지만 승률은 평균 이상', value: 'efficient' },
  { description: '픽률은 높지만 승률은 평균 이하', value: 'overheated' },
  { description: '추가 표본을 볼 필요가 있는 구간', value: 'watch' },
] satisfies Array<{ description: string; value: ExternalHeroSignalFilter }>;

const ExternalHeroSignalBoard = ({
  counts,
  onChange,
  value,
}: {
  counts: ReturnType<typeof getExternalHeroSignalCounts>;
  onChange: (value: ExternalHeroSignalFilter) => void;
  value: ExternalHeroSignalFilter;
}) => {
  const totalCount = counts.core + counts.efficient + counts.overheated + counts.watch;

  return (
    <div className="border-b border-border/60 bg-card px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="metric-label">메타 구간</p>
        <h3 className="mt-1 text-base font-bold">구간별 영웅</h3>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {externalHeroSignalOptions.map((option) => {
          const isActive = value === option.value;
          const count = option.value === 'all' ? totalCount : counts[option.value];

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              className={cn(
                'min-w-0 rounded-md border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                isActive
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border/60 bg-[hsl(var(--surface-2))] hover:border-primary/30',
              )}
              onClick={() => onChange(option.value)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-black">
                    {externalHeroSignalLabels[option.value]}
                  </p>
                  <Badge variant="outline" className="shrink-0 bg-card text-[11px]">
                    {count.toLocaleString('ko-KR')}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ExternalHeroMetaToolbar = ({
  onQueryChange,
  onSortModeChange,
  query,
  sortMode,
  totalRows,
  visibleRows,
}: {
  onQueryChange: (value: string) => void;
  onSortModeChange: (value: ExternalHeroSortMode) => void;
  query: string;
  sortMode: ExternalHeroSortMode;
  totalRows: number;
  visibleRows: number;
}) => {
  const rowCountLabel =
    visibleRows === totalRows
      ? `${totalRows.toLocaleString('ko-KR')}명`
      : `${visibleRows.toLocaleString('ko-KR')}명`;

  return (
    <div className="border-b border-border/60 bg-card px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 bg-[hsl(var(--surface-2))] pl-9 pr-9 text-sm font-semibold"
            placeholder="영웅 이름 검색"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              aria-label="검색어 지우기"
              onClick={() => onQueryChange('')}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-1">
            {externalHeroSortOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sortMode === option.value}
                className={cn(
                  'h-8 min-w-[54px] rounded-[5px] px-2 text-xs font-bold transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                  sortMode === option.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
                onClick={() => onSortModeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Badge variant="outline" className="h-9 bg-transparent">
            영웅 {rowCountLabel}
          </Badge>
        </div>
      </div>
    </div>
  );
};

const ExternalHeroMetaScatterPlot = ({
  contextRows,
  onSelectHero,
  rows,
  selectedHeroId,
  signalFilter,
}: {
  contextRows: ExternalHeroMetaRow[];
  onSelectHero: (heroId: string) => void;
  rows: ExternalHeroMetaRow[];
  selectedHeroId: string | null;
  signalFilter: ExternalHeroSignalFilter;
}) => {
  const [tooltipState, setTooltipState] = useState<ExternalHeroScatterTooltipState | null>(null);
  const [zoomState, setZoomState] = useState<{
    domain: ExternalHeroScatterZoomDomain | null;
    signalFilter: ExternalHeroSignalFilter;
  }>({ domain: null, signalFilter: 'all' });
  const panStateRef = useRef<ExternalHeroScatterPanState | null>(null);
  const zoomDomain = zoomState.signalFilter === signalFilter ? zoomState.domain : null;
  const setActiveZoomDomain = (domain: ExternalHeroScatterZoomDomain | null) => {
    setZoomState({ domain, signalFilter });
  };
  const plottableRows = rows.filter(
    (hero) =>
      getExternalValidPercentValues([hero.pickRate]).length > 0 &&
      getExternalValidPercentValues([hero.winRate], { ignoreZero: true }).length > 0,
  );
  const contextPlottableRows = contextRows.filter(
    (hero) =>
      getExternalValidPercentValues([hero.pickRate]).length > 0 &&
      getExternalValidPercentValues([hero.winRate], { ignoreZero: true }).length > 0,
  );
  const contextPickValues = contextPlottableRows.map((hero) => hero.pickRate);
  const contextWinValues = contextPlottableRows.map((hero) => hero.winRate);
  const basePickAxis = createExternalHeroScatterAxis(contextPickValues, {
    fallbackMax: 45,
    fallbackMin: 0,
    minPadding: 1.5,
    minRange: 8,
  });
  const baseWinAxis = createExternalHeroScatterAxis(contextWinValues, {
    fallbackMax: 55,
    fallbackMin: 45,
    ignoreZero: true,
    minPadding: 0.8,
    minRange: 6,
  });
  const pickMinRange = Math.max(1.5, (basePickAxis.max - basePickAxis.min) * 0.22);
  const winMinRange = Math.max(1.2, (baseWinAxis.max - baseWinAxis.min) * 0.22);
  const avgPick = roundExternalMetric(getExternalAverage(contextPickValues));
  const avgWin = roundExternalMetric(getExternalAverage(contextWinValues, { ignoreZero: true }));
  const focusDomain = getExternalHeroSignalFocusDomain({
    avgPick,
    avgWin,
    basePickAxis,
    baseWinAxis,
    pickMinRange,
    signalFilter,
    winMinRange,
  });
  const activeDomain = zoomDomain ?? focusDomain;
  const clampedActiveDomain = activeDomain
    ? {
        pick: clampExternalHeroAxisDomain({
          baseAxis: basePickAxis,
          max: activeDomain.pickMax,
          min: activeDomain.pickMin,
          minRange: pickMinRange,
        }),
        win: clampExternalHeroAxisDomain({
          baseAxis: baseWinAxis,
          max: activeDomain.winMax,
          min: activeDomain.winMin,
          minRange: winMinRange,
        }),
      }
    : null;
  const pickAxis = clampedActiveDomain
    ? createExternalHeroScatterAxisFromDomain(
        basePickAxis,
        clampedActiveDomain.pick.min,
        clampedActiveDomain.pick.max,
      )
    : basePickAxis;
  const winAxis = clampedActiveDomain
    ? createExternalHeroScatterAxisFromDomain(
        baseWinAxis,
        clampedActiveDomain.win.min,
        clampedActiveDomain.win.max,
      )
    : baseWinAxis;
  const isZoomed =
    pickAxis.min !== basePickAxis.min ||
    pickAxis.max !== basePickAxis.max ||
    winAxis.min !== baseWinAxis.min ||
    winAxis.max !== baseWinAxis.max;
  const hasManualZoom = zoomDomain !== null;
  const avgPickPosition =
    avgPick === null || !isExternalMetricInsideAxis(avgPick, pickAxis)
      ? null
      : getExternalHeroScatterPosition(avgPick, pickAxis.min, pickAxis.max);
  const avgWinPosition =
    avgWin === null || !isExternalMetricInsideAxis(avgWin, winAxis)
      ? null
      : getExternalHeroScatterPosition(avgWin, winAxis.min, winAxis.max);
  const tooltipHero = tooltipState
    ? (plottableRows.find((hero) => hero.heroId === tooltipState.heroId) ?? null)
    : null;
  const visiblePlottableRows = plottableRows.filter(
    (hero) =>
      isExternalMetricInsideAxis(hero.pickRate, pickAxis) &&
      isExternalMetricInsideAxis(hero.winRate, winAxis),
  );
  const contextSignalCounts = getExternalHeroSignalCounts(contextRows);
  const visibleCountLabel =
    signalFilter === 'all'
      ? `${visiblePlottableRows.length.toLocaleString('ko-KR')}명`
      : `${externalHeroSignalLabels[signalFilter]} ${visiblePlottableRows.length.toLocaleString(
          'ko-KR',
        )}명`;
  const updateZoom = (scale: number, pickCenterRatio = 0.5, winCenterRatio = 0.5) => {
    const nextPick = zoomExternalHeroAxisDomain({
      axis: pickAxis,
      baseAxis: basePickAxis,
      centerRatio: pickCenterRatio,
      minRange: pickMinRange,
      scale,
    });
    const nextWin = zoomExternalHeroAxisDomain({
      axis: winAxis,
      baseAxis: baseWinAxis,
      centerRatio: winCenterRatio,
      minRange: winMinRange,
      scale,
    });
    const nextIsBase =
      nextPick.min === basePickAxis.min &&
      nextPick.max === basePickAxis.max &&
      nextWin.min === baseWinAxis.min &&
      nextWin.max === baseWinAxis.max;

    setActiveZoomDomain(
      nextIsBase
        ? null
        : {
            pickMax: nextPick.max,
            pickMin: nextPick.min,
            winMax: nextWin.max,
            winMin: nextWin.min,
          },
    );
  };
  const panZoomDomain = (deltaX: number, deltaY: number) => {
    const panState = panStateRef.current;

    if (!panState || !isZoomed) {
      return;
    }

    const pickRange = panState.pickMax - panState.pickMin;
    const winRange = panState.winMax - panState.winMin;
    const pickDelta = -(deltaX / Math.max(1, panState.width)) * pickRange;
    const winDelta = (deltaY / Math.max(1, panState.height)) * winRange;
    const nextPick = clampExternalHeroAxisDomain({
      baseAxis: basePickAxis,
      max: panState.pickMax + pickDelta,
      min: panState.pickMin + pickDelta,
      minRange: pickMinRange,
    });
    const nextWin = clampExternalHeroAxisDomain({
      baseAxis: baseWinAxis,
      max: panState.winMax + winDelta,
      min: panState.winMin + winDelta,
      minRange: winMinRange,
    });

    setActiveZoomDomain({
      pickMax: nextPick.max,
      pickMin: nextPick.min,
      winMax: nextWin.max,
      winMin: nextWin.min,
    });
  };

  return (
    <div className="border-b border-border/60 bg-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="metric-label">메타 분포</p>
          <h3 className="mt-1 text-base font-bold">픽률 vs 승률</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant="outline" className="h-8 bg-transparent">
            {visibleCountLabel}
          </Badge>
          <Badge variant="outline" className="hidden h-8 bg-transparent sm:inline-flex">
            기준 고정 · 핵심 {contextSignalCounts.core.toLocaleString('ko-KR')} · 고효율{' '}
            {contextSignalCounts.efficient.toLocaleString('ko-KR')}
          </Badge>
          <div className="flex overflow-hidden rounded-md border border-border/70 bg-[hsl(var(--surface-2))]">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              aria-label="그래프 확대"
              onClick={() => updateZoom(0.72)}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none border-x border-border/60"
              aria-label="그래프 축소"
              onClick={() => updateZoom(1.35)}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              aria-label="직접 조정한 확대 초기화"
              disabled={!hasManualZoom}
              onClick={() => setActiveZoomDomain(null)}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          {matchRoleOptions.map((role) => (
            <span
              key={role.value}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full border',
                  getExternalHeroScatterRoleClassName(role.value),
                )}
              />
              {role.label}
            </span>
          ))}
        </div>
      </div>

      {plottableRows.length > 0 ? (
        <>
          <div
            className="relative mt-3 h-[320px] rounded-md border border-border/70 bg-[hsl(var(--surface-2))]"
            aria-label="픽률과 승률 분포"
            onMouseLeave={() => setTooltipState(null)}
          >
            <span className="pointer-events-none absolute left-2 top-2 text-[11px] font-black text-muted-foreground">
              승률
            </span>
            <span className="pointer-events-none absolute bottom-2 right-4 text-[11px] font-black text-muted-foreground">
              픽률
            </span>

            <div
              className={cn(
                'absolute bottom-12 left-12 right-4 top-7 overflow-hidden rounded-md border border-border/60 bg-card/55 touch-none',
                isZoomed && 'cursor-grab active:cursor-grabbing',
              )}
              onPointerDown={(event) => {
                if (!isZoomed || event.button !== 0) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                const bounds = event.currentTarget.getBoundingClientRect();

                panStateRef.current = {
                  height: bounds.height,
                  pickMax: pickAxis.max,
                  pickMin: pickAxis.min,
                  startX: event.clientX,
                  startY: event.clientY,
                  width: bounds.width,
                  winMax: winAxis.max,
                  winMin: winAxis.min,
                };
              }}
              onPointerMove={(event) => {
                if (!panStateRef.current) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                panZoomDomain(
                  event.clientX - panStateRef.current.startX,
                  event.clientY - panStateRef.current.startY,
                );
              }}
              onPointerUp={(event) => {
                panStateRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                panStateRef.current = null;
              }}
              onWheel={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                const pickCenterRatio = Math.min(
                  0.95,
                  Math.max(0.05, (event.clientX - bounds.left) / bounds.width),
                );
                const winCenterRatio = Math.min(
                  0.95,
                  Math.max(0.05, 1 - (event.clientY - bounds.top) / bounds.height),
                );
                const wheelSteps = Math.min(4, Math.max(-4, event.deltaY / 100));
                const scale = Math.exp(wheelSteps * 0.18);

                updateZoom(scale, pickCenterRatio, winCenterRatio);
              }}
            >
              {avgPickPosition !== null && avgWinPosition !== null ? (
                <>
                  {signalFilter === 'all' ? (
                    <>
                      <span
                        className="absolute right-0 top-0 bg-primary/[0.055]"
                        style={{ bottom: `${avgWinPosition}%`, left: `${avgPickPosition}%` }}
                      />
                      <span
                        className="absolute left-0 top-0 bg-[hsl(var(--success))]/[0.055]"
                        style={{
                          bottom: `${avgWinPosition}%`,
                          right: `${100 - avgPickPosition}%`,
                        }}
                      />
                      <span
                        className="absolute bottom-0 right-0 bg-amber-400/[0.055]"
                        style={{ left: `${avgPickPosition}%`, top: `${100 - avgWinPosition}%` }}
                      />
                      <span className="absolute right-2 top-2 rounded-md border border-border/50 bg-card/85 px-2 py-1 text-[11px] font-black text-foreground">
                        핵심
                      </span>
                      <span className="absolute left-2 top-2 rounded-md border border-border/50 bg-card/80 px-2 py-1 text-[11px] font-bold text-muted-foreground">
                        고효율
                      </span>
                      <span className="absolute bottom-2 right-2 rounded-md border border-border/50 bg-card/80 px-2 py-1 text-[11px] font-bold text-muted-foreground">
                        과열
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className={cn(
                          'absolute rounded-sm border border-primary/15',
                          signalFilter === 'core' && 'bg-primary/[0.09]',
                          signalFilter === 'efficient' && 'bg-[hsl(var(--success))]/[0.09]',
                          signalFilter === 'overheated' && 'bg-amber-400/[0.1]',
                          signalFilter === 'watch' && 'bg-muted/40',
                        )}
                        style={
                          signalFilter === 'core'
                            ? {
                                bottom: `${avgWinPosition}%`,
                                left: `${avgPickPosition}%`,
                                right: 0,
                                top: 0,
                              }
                            : signalFilter === 'efficient'
                              ? {
                                  bottom: `${avgWinPosition}%`,
                                  left: 0,
                                  right: `${100 - avgPickPosition}%`,
                                  top: 0,
                                }
                              : signalFilter === 'overheated'
                                ? {
                                    bottom: 0,
                                    left: `${avgPickPosition}%`,
                                    right: 0,
                                    top: `${100 - avgWinPosition}%`,
                                  }
                                : {
                                    bottom: 0,
                                    left: 0,
                                    right: `${100 - avgPickPosition}%`,
                                    top: `${100 - avgWinPosition}%`,
                                  }
                        }
                      />
                      <span className="absolute left-2 top-2 rounded-md border border-border/50 bg-card/90 px-2 py-1 text-[11px] font-black text-foreground">
                        {externalHeroSignalLabels[signalFilter]}
                      </span>
                    </>
                  )}
                </>
              ) : null}

              {pickAxis.ticks.map((tick) => (
                <span
                  key={`pick-grid-${tick}`}
                  className="absolute bottom-0 top-0 border-l border-border/50"
                  style={{
                    left: `${getExternalHeroScatterPosition(tick, pickAxis.min, pickAxis.max)}%`,
                  }}
                />
              ))}
              {winAxis.ticks.map((tick) => (
                <span
                  key={`win-grid-${tick}`}
                  className="absolute left-0 right-0 border-t border-border/50"
                  style={{
                    bottom: `${getExternalHeroScatterPosition(tick, winAxis.min, winAxis.max)}%`,
                  }}
                />
              ))}
              {avgPickPosition !== null ? (
                <span
                  className="absolute bottom-0 top-0 border-l border-dashed border-primary/60"
                  style={{ left: `${avgPickPosition}%` }}
                />
              ) : null}
              {avgWinPosition !== null ? (
                <span
                  className="absolute left-0 right-0 border-t border-dashed border-primary/60"
                  style={{ bottom: `${avgWinPosition}%` }}
                />
              ) : null}

              {visiblePlottableRows.map((hero) => {
                const left = getExternalHeroScatterPosition(
                  hero.pickRate ?? 0,
                  pickAxis.min,
                  pickAxis.max,
                );
                const bottom = getExternalHeroScatterPosition(
                  hero.winRate ?? 0,
                  winAxis.min,
                  winAxis.max,
                );
                const isSelected = hero.heroId === selectedHeroId;
                const pointScale =
                  pickAxis.max > pickAxis.min
                    ? ((hero.pickRate ?? 0) - pickAxis.min) / (pickAxis.max - pickAxis.min)
                    : 0.5;
                const pointSize = isSelected ? 18 : Math.max(9, Math.min(15, 9 + pointScale * 6));
                const updateTooltipFromPointer = (
                  clientX: number,
                  clientY: number,
                  bounds: DOMRect,
                ) => {
                  const tooltipWidth = Math.min(288, Math.max(220, bounds.width - 16));
                  const tooltipHeight = 152;

                  setTooltipState({
                    heroId: hero.heroId,
                    x: Math.min(
                      bounds.width - tooltipWidth - 8,
                      Math.max(8, clientX - bounds.left + 14),
                    ),
                    y: Math.min(
                      bounds.height - tooltipHeight - 8,
                      Math.max(8, clientY - bounds.top + 14),
                    ),
                  });
                };

                return (
                  <button
                    key={hero.heroId}
                    type="button"
                    className={cn(
                      'absolute z-10 -translate-x-1/2 translate-y-1/2 rounded-full border transition-[box-shadow,transform,width,height] hover:z-20 hover:scale-150 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                      isSelected && 'z-30 scale-125 ring-2 ring-primary/45',
                      getExternalHeroScatterRoleClassName(hero.role),
                    )}
                    style={{
                      bottom: `${bottom}%`,
                      height: pointSize,
                      left: `${left}%`,
                      width: pointSize,
                    }}
                    aria-label={`${hero.name} 선택`}
                    onBlur={() => setTooltipState(null)}
                    onFocus={(event) => {
                      const bounds = event.currentTarget.parentElement?.getBoundingClientRect();

                      if (!bounds) {
                        return;
                      }

                      updateTooltipFromPointer(
                        bounds.left + event.currentTarget.offsetLeft,
                        bounds.top + event.currentTarget.offsetTop,
                        bounds,
                      );
                    }}
                    onMouseMove={(event) => {
                      const bounds = event.currentTarget.parentElement?.getBoundingClientRect();

                      if (!bounds) {
                        return;
                      }

                      updateTooltipFromPointer(event.clientX, event.clientY, bounds);
                    }}
                    onMouseLeave={() => setTooltipState(null)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={() => onSelectHero(hero.heroId)}
                  />
                );
              })}

              {tooltipHero && tooltipState ? (
                <ExternalHeroScatterTooltip
                  hero={tooltipHero}
                  rows={contextRows}
                  x={tooltipState.x}
                  y={tooltipState.y}
                />
              ) : null}
            </div>

            <div className="pointer-events-none absolute bottom-5 left-12 right-4 h-4">
              {pickAxis.ticks.map((tick) => (
                <span
                  key={`pick-label-${tick}`}
                  className="absolute -translate-x-1/2 text-[10px] font-bold text-muted-foreground"
                  style={{
                    left: `${getExternalHeroScatterPosition(tick, pickAxis.min, pickAxis.max)}%`,
                  }}
                >
                  {formatExternalPercent(tick)}
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-12 left-2 top-7 w-9">
              {winAxis.ticks.map((tick) => (
                <span
                  key={`win-label-${tick}`}
                  className="absolute right-0 translate-y-1/2 text-right text-[10px] font-bold text-muted-foreground"
                  style={{
                    bottom: `${getExternalHeroScatterPosition(tick, winAxis.min, winAxis.max)}%`,
                  }}
                >
                  {formatExternalPercent(tick)}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <InlineEmptyState
          className="mt-3"
          title="분포를 만들 데이터가 없습니다."
          description="픽률과 승률이 함께 있는 영웅이 표시됩니다."
        />
      )}
    </div>
  );
};

const ExternalHeroScatterTooltip = ({
  hero,
  rows,
  x,
  y,
}: {
  hero: ExternalHeroMetaRow;
  rows: ExternalHeroMetaRow[];
  x: number;
  y: number;
}) => (
  <div
    className="pointer-events-none absolute z-50 w-72 max-w-[calc(100%-1rem)] rounded-md border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur"
    style={{ left: x, top: y }}
  >
    <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
      <ExternalHeroPortrait heroId={hero.heroId} className="h-11 w-11" />
      <div className="min-w-0">
        <p className="truncate text-sm font-black">{hero.name}</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
          {hero.roleLabel} · {getExternalHeroSignalLabel(hero, rows)}
        </p>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-md border border-border/60 bg-card px-2.5 py-2">
        <p className="metric-label">픽률</p>
        <p className="mt-1 text-sm font-black">{formatExternalPercent(hero.pickRate)}</p>
      </div>
      <div className="rounded-md border border-border/60 bg-card px-2.5 py-2">
        <p className="metric-label">승률</p>
        <p className="mt-1 text-sm font-black">{formatExternalPercent(hero.winRate)}</p>
      </div>
    </div>
    <p className="mt-2 truncate text-[11px] font-semibold text-muted-foreground">
      {getExternalHeroCoverageLabel(hero)} · {hero.regionLabel}
    </p>
  </div>
);

const ExternalHeroFeatureCard = ({
  hero,
  icon: Icon,
  metricLabel,
  metricValue,
  onSelect,
  title,
}: {
  hero: ExternalHeroMetaRow | null;
  icon: LucideIcon;
  metricLabel: string;
  metricValue: string;
  onSelect: (heroId: string) => void;
  title: string;
}) => (
  <button
    type="button"
    className="min-w-0 bg-card p-4 text-left transition-colors hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:p-5"
    disabled={!hero}
    onClick={() => {
      if (hero) {
        onSelect(hero.heroId);
      }
    }}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">{title}</p>
        <h3 className="mt-1 truncate text-lg font-bold">{hero?.name ?? '--'}</h3>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-primary">
        <Icon className="h-4 w-4" />
      </div>
    </div>

    {hero ? (
      <div className="mt-4 grid grid-cols-[116px_minmax(0,1fr)] gap-4">
        <ExternalHeroPortrait heroId={hero.heroId} className="h-28 w-28" />
        <div className="min-w-0 self-center">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-transparent">
              {hero.roleLabel}
            </Badge>
            <Badge variant="outline" className="bg-transparent">
              {metricLabel} {metricValue}
            </Badge>
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-muted-foreground">
            승률 {formatExternalPercent(hero.winRate)} · 픽률 {formatExternalPercent(hero.pickRate)}
          </p>
        </div>
      </div>
    ) : (
      <InlineEmptyState
        className="mt-4"
        title="표시할 영웅 데이터 없음"
        description="픽률 데이터가 수집되면 영웅 프로필이 표시됩니다."
      />
    )}
  </button>
);

const ExternalHeroComparisonTable = ({
  contextRows,
  onSelectHero,
  rows,
  selectedHeroId,
  totalRows,
}: {
  contextRows: ExternalHeroMetaRow[];
  onSelectHero: (heroId: string) => void;
  rows: ExternalHeroMetaRow[];
  selectedHeroId: string | null;
  totalRows: number;
}) => {
  const initialVisibleRows = 10;
  const visibleRowStep = 10;
  const rowSignature = rows.map((row) => row.heroId).join('|');
  const [visibleState, setVisibleState] = useState({
    limit: initialVisibleRows,
    rowSignature: '',
  });
  const visibleLimit =
    visibleState.rowSignature === rowSignature ? visibleState.limit : initialVisibleRows;
  const visibleTableRows = rows.slice(0, visibleLimit);
  const canShowMore = visibleLimit < rows.length;
  const canCollapse = visibleLimit > initialVisibleRows;
  const maxPickRate = Math.max(1, ...rows.map((row) => row.pickRate ?? 0));
  const avgWinRate = roundExternalMetric(
    getExternalAverage(
      contextRows.map((row) => row.winRate),
      { ignoreZero: true },
    ),
  );

  return (
    <div className="bg-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="metric-label">영웅별 비교</p>
          <h3 className="mt-1 text-base font-bold">픽률 막대와 승률</h3>
        </div>
        <Badge variant="outline" className="w-fit bg-transparent">
          표시 {visibleTableRows.length.toLocaleString('ko-KR')} /{' '}
          {totalRows.toLocaleString('ko-KR')}명
        </Badge>
      </div>

      {rows.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-md border border-border/70">
          <div className="hidden grid-cols-[minmax(220px,1.35fr)_minmax(170px,1fr)_112px] gap-3 border-b border-border/60 bg-[hsl(var(--surface-2))] px-3 py-2 text-xs font-bold text-muted-foreground lg:grid">
            <span>영웅</span>
            <span>픽률</span>
            <span className="text-right">승률 / 평균차</span>
          </div>
          <div>
            {visibleTableRows.map((hero) => {
              const winDelta =
                hero.winRate !== null && avgWinRate !== null
                  ? roundExternalMetric(hero.winRate - avgWinRate)
                  : null;

              return (
                <button
                  key={hero.heroId}
                  type="button"
                  className={cn(
                    'grid w-full gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 lg:grid-cols-[minmax(220px,1.35fr)_minmax(170px,1fr)_112px] lg:items-center',
                    selectedHeroId === hero.heroId && 'bg-primary/[0.08]',
                  )}
                  onClick={() => onSelectHero(hero.heroId)}
                >
                  <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[44px_minmax(0,1fr)]">
                    <ExternalHeroPortrait heroId={hero.heroId} className="h-11 w-11" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{hero.name}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
                        {hero.roleLabel}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-transparent lg:hidden">
                      {formatExternalPercent(hero.winRate)}
                    </Badge>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3 text-xs font-bold">
                      <span className="text-muted-foreground">픽률</span>
                      <span>{formatExternalPercent(hero.pickRate)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/60">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${((hero.pickRate ?? 0) / maxPickRate) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="hidden text-right lg:block">
                    <p className="text-sm font-black">{formatExternalPercent(hero.winRate)}</p>
                    <p
                      className={cn(
                        'mt-0.5 text-[11px] font-bold',
                        winDelta === null
                          ? 'text-muted-foreground'
                          : winDelta >= 0
                            ? 'text-[hsl(var(--success))]'
                            : 'text-amber-500',
                      )}
                    >
                      평균 {formatExternalSignedPercent(winDelta)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          {canShowMore || canCollapse ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-[hsl(var(--surface-2))] px-3 py-3">
              <span className="text-xs font-bold text-muted-foreground">
                {rows.length.toLocaleString('ko-KR')}명 중{' '}
                {visibleTableRows.length.toLocaleString('ko-KR')}명 표시
              </span>
              <div className="flex flex-wrap gap-2">
                {canCollapse ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setVisibleState({
                        limit: initialVisibleRows,
                        rowSignature,
                      })
                    }
                  >
                    접기
                  </Button>
                ) : null}
                {canShowMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-card"
                    onClick={() =>
                      setVisibleState({
                        limit: Math.min(rows.length, visibleLimit + visibleRowStep),
                        rowSignature,
                      })
                    }
                  >
                    더보기
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <InlineEmptyState
          className="mt-3"
          title="검색 결과가 없습니다."
          description="검색어를 지우거나 다른 역할을 선택해주세요."
        />
      )}
    </div>
  );
};

const ExternalHeroPortrait = ({
  className,
  heroId,
  iconClassName,
  imageClassName,
}: {
  className?: string;
  heroId: string;
  iconClassName?: string;
  imageClassName?: string;
}) => {
  const src = getExternalHeroPortraitSrc(heroId);
  const label = getExternalHeroLabel(heroId);

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-[hsl(var(--surface-2))]',
        className,
      )}
    >
      <Swords className={cn('absolute h-5 w-5 text-muted-foreground', iconClassName)} />
      {src ? (
        <img
          alt={label}
          className={cn('relative z-10 h-full w-full object-cover object-top', imageClassName)}
          src={src}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
    </div>
  );
};

export const ExternalEsportsSchedulePanel = ({
  esportsEvents,
  isLoading,
}: {
  esportsEvents: ExternalEsportsEventItem[];
  isLoading: boolean;
}) => {
  const [now] = useState(() => Date.now());
  const { data: userSettings } = useUserSettings();
  const [calendarMode, setCalendarMode] = useState<ExternalScheduleViewMode>('month');
  const [regionFilter, setRegionFilter] = useState<ExternalScheduleRegionFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<ExternalScheduleSourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<ExternalScheduleStatusFilter>('all');
  const [eventQuery, setEventQuery] = useState('');
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(null);
  const [calendarCursor, setCalendarCursor] = useState<Date | null>(null);
  const regionOptions = useMemo(
    () => createExternalScheduleRegionOptions(esportsEvents, now),
    [esportsEvents, now],
  );
  const activeRegionFilter =
    regionFilter === 'all' || regionOptions.some((option) => option.value === regionFilter)
      ? regionFilter
      : 'all';
  const regionFilteredEvents = useMemo(
    () => filterExternalScheduleEvents(esportsEvents, activeRegionFilter),
    [esportsEvents, activeRegionFilter],
  );
  const sourceOptions = useMemo(
    () => createExternalScheduleSourceOptions(regionFilteredEvents),
    [regionFilteredEvents],
  );
  const activeSourceFilter =
    sourceFilter === 'all' || sourceOptions.some((option) => option.value === sourceFilter)
      ? sourceFilter
      : 'all';
  const queryFilteredEvents = useMemo(
    () =>
      filterExternalScheduleEventsByQuery(
        filterExternalScheduleEventsBySource(regionFilteredEvents, activeSourceFilter),
        eventQuery,
      ),
    [activeSourceFilter, eventQuery, regionFilteredEvents],
  );
  const statusCountsForFilter = getExternalEventStatusCounts(queryFilteredEvents);
  const filteredEvents = useMemo(
    () => filterExternalScheduleEventsByStatus(queryFilteredEvents, statusFilter),
    [queryFilteredEvents, statusFilter],
  );
  const favoriteTeam = userSettings?.favoriteEsportsTeam ?? null;
  const favoriteEvents = useMemo(
    () => getFavoriteEsportsTeamEvents(filteredEvents, favoriteTeam),
    [favoriteTeam, filteredEvents],
  );
  const eventsByDate = useMemo(() => {
    const groups = new Map<string, ExternalEsportsEventItem[]>();

    filteredEvents.forEach((event) => {
      const dateKey = getExternalEventDateKey(event);

      if (!dateKey) {
        return;
      }

      const events = groups.get(dateKey) ?? [];
      events.push(event);
      groups.set(dateKey, events);
    });

    groups.forEach((events) => {
      events.sort(
        (left, right) => getExternalEventSortTime(left) - getExternalEventSortTime(right),
      );
    });

    return groups;
  }, [filteredEvents]);
  const upcomingEvents = filteredEvents
    .filter((event) => event.startsAt && new Date(event.startsAt).getTime() >= now)
    .sort((left, right) => compareExternalTimestampAsc(left.startsAt, right.startsAt));
  const nextEvent = upcomingEvents[0] ?? null;
  const nextFavoriteEvent = getNextFavoriteEsportsTeamEvent(filteredEvents, favoriteTeam, now);
  const primaryNextEvent = nextFavoriteEvent ?? nextEvent;
  const upcomingRailEvents = getExternalUpcomingEvents(filteredEvents, now, 8);
  const favoriteUpcomingRailEvents = getExternalUpcomingEvents(favoriteEvents, now, 8);
  const preferredEvent =
    nextFavoriteEvent ??
    nextEvent ??
    [...filteredEvents]
      .filter((event) => event.startsAt)
      .sort((left, right) => getExternalEventSortTime(left) - getExternalEventSortTime(right))[0] ??
    null;
  const preferredDate =
    preferredEvent?.startsAt && !Number.isNaN(new Date(preferredEvent.startsAt).getTime())
      ? new Date(preferredEvent.startsAt)
      : null;
  const selectedDate =
    selectedDateOverride ??
    (preferredDate ? formatDateValue(preferredDate) : formatDateValue(new Date()));
  const selectedDateValue = parseDateValue(selectedDate) ?? preferredDate ?? new Date();
  const visibleDate =
    calendarCursor ??
    (calendarMode === 'week' ? getWeekStart(selectedDateValue) : getMonthStart(selectedDateValue));
  const latestAt = getLatestExternalTimestamp(esportsEvents.map((event) => event.fetchedAt));
  const selectedEvents = [...(eventsByDate.get(selectedDate) ?? [])].sort((left, right) => {
    const leftFavorite = isFavoriteEsportsTeamEvent(left, favoriteTeam);
    const rightFavorite = isFavoriteEsportsTeamEvent(right, favoriteTeam);

    if (leftFavorite !== rightFavorite) {
      return leftFavorite ? -1 : 1;
    }

    return getExternalEventSortTime(left) - getExternalEventSortTime(right);
  });
  const calendarDays = getExternalCalendarDays(visibleDate, calendarMode);
  const nextEventDateKey = primaryNextEvent ? getExternalEventDateKey(primaryNextEvent) : null;
  const selectedRegionLabel =
    regionOptions.find((option) => option.value === activeRegionFilter)?.label ??
    getExternalRegionLabel(activeRegionFilter);

  const moveCalendar = (direction: -1 | 1) => {
    setCalendarCursor(
      calendarMode === 'week'
        ? addDays(visibleDate, direction * 7)
        : addMonths(visibleDate, direction),
    );
  };
  const goToDate = (date: Date) => {
    const dateKey = formatDateValue(date);

    setSelectedDateOverride(dateKey);
    setCalendarCursor(calendarMode === 'week' ? getWeekStart(date) : getMonthStart(date));
  };
  const goToToday = () => {
    goToDate(new Date());
  };
  const goToNextEvent = () => {
    if (!primaryNextEvent?.startsAt) {
      return;
    }

    const date = new Date(primaryNextEvent.startsAt);

    if (!Number.isNaN(date.getTime())) {
      goToDate(date);
    }
  };
  const selectCalendarDate = (dateKey: string) => {
    const date = parseDateValue(dateKey);

    setSelectedDateOverride(dateKey);

    if (date) {
      setCalendarCursor(calendarMode === 'week' ? getWeekStart(date) : getMonthStart(date));
    }
  };
  const changeCalendarMode = (mode: ExternalScheduleViewMode) => {
    setCalendarMode(mode);
    setCalendarCursor(
      mode === 'week' ? getWeekStart(selectedDateValue) : getMonthStart(selectedDateValue),
    );
  };
  const changeRegionFilter = (value: ExternalScheduleRegionFilter) => {
    setRegionFilter(value);
    setSourceFilter('all');
    setStatusFilter('all');
    setEventQuery('');
    setSelectedDateOverride(null);
    setCalendarCursor(null);
  };
  const changeSourceFilter = (value: ExternalScheduleSourceFilter) => {
    setSourceFilter(value);
    setStatusFilter('all');
    setSelectedDateOverride(null);
    setCalendarCursor(null);
  };
  const changeStatusFilter = (value: ExternalScheduleStatusFilter) => {
    setStatusFilter(value);
    setSelectedDateOverride(null);
    setCalendarCursor(null);
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="metric-label">e스포츠</p>
            <h2 className="mt-1 text-lg font-bold">경기 일정 캘린더</h2>
          </div>
          <Badge variant="outline" className="w-fit gap-1.5 bg-transparent">
            <CalendarCheck2 className="h-3.5 w-3.5" />
            {getExternalFreshnessLabel(latestAt)}
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 p-4 sm:p-5">
          <ExternalRowsSkeleton rows={6} />
        </div>
      ) : esportsEvents.length > 0 ? (
        <div>
          <ExternalNextEventFeature
            event={primaryNextEvent}
            favoriteTeam={nextFavoriteEvent ? favoriteTeam : null}
            now={now}
          />
          <ExternalScheduleCalendar
            days={calendarDays}
            eventsByDate={eventsByDate}
            favoriteTeam={favoriteTeam}
            hasNextEvent={Boolean(primaryNextEvent)}
            mode={calendarMode}
            nextEventDateKey={nextEventDateKey}
            selectedDate={selectedDate}
            visibleDate={visibleDate}
            onGoToNextEvent={goToNextEvent}
            onGoToToday={goToToday}
            onModeChange={changeCalendarMode}
            onMove={moveCalendar}
            onSelectDate={selectCalendarDate}
          />
          <ExternalSelectedDateEvents
            dateKey={selectedDate}
            events={selectedEvents}
            favoriteTeam={favoriteTeam}
            regionLabel={selectedRegionLabel}
          />
          {favoriteTeam && favoriteUpcomingRailEvents.length > 0 ? (
            <ExternalUpcomingMatchRail
              events={favoriteUpcomingRailEvents}
              favoriteTeam={favoriteTeam}
              title={`${favoriteTeam.name} 경기`}
              onSelectDate={goToDate}
            />
          ) : null}
          <ExternalScheduleRegionTabs
            options={regionOptions}
            value={activeRegionFilter}
            onChange={changeRegionFilter}
          />
          <ExternalScheduleExplorerBar
            query={eventQuery}
            sourceOptions={sourceOptions}
            sourceValue={activeSourceFilter}
            statusCounts={statusCountsForFilter}
            statusValue={statusFilter}
            totalEvents={regionFilteredEvents.length}
            visibleEvents={filteredEvents.length}
            onQueryChange={setEventQuery}
            onSourceChange={changeSourceFilter}
            onStatusChange={changeStatusFilter}
          />
          <ExternalUpcomingMatchRail events={upcomingRailEvents} onSelectDate={goToDate} />
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <InlineEmptyState
            title="e스포츠 일정 데이터가 없습니다."
            description="수집이 완료되면 경기 일정과 경기 상태가 표시됩니다."
          />
        </div>
      )}
    </section>
  );
};

const ExternalScheduleExplorerBar = ({
  onQueryChange,
  onSourceChange,
  onStatusChange,
  query,
  sourceOptions,
  sourceValue,
  statusCounts,
  statusValue,
  totalEvents,
  visibleEvents,
}: {
  onQueryChange: (value: string) => void;
  onSourceChange: (value: ExternalScheduleSourceFilter) => void;
  onStatusChange: (value: ExternalScheduleStatusFilter) => void;
  query: string;
  sourceOptions: ExternalScheduleSourceOption[];
  sourceValue: ExternalScheduleSourceFilter;
  statusCounts: { completed: number; live: number; scheduled: number };
  statusValue: ExternalScheduleStatusFilter;
  totalEvents: number;
  visibleEvents: number;
}) => {
  const eventCountLabel =
    visibleEvents === totalEvents
      ? `${totalEvents.toLocaleString('ko-KR')}경기`
      : `${visibleEvents.toLocaleString('ko-KR')}경기`;
  const statusOptions = [
    {
      count: statusCounts.scheduled + statusCounts.live + statusCounts.completed,
      label: '전체',
      value: 'all',
    },
    { count: statusCounts.scheduled, label: '예정', value: 'scheduled' },
    { count: statusCounts.live, label: '진행', value: 'live' },
    { count: statusCounts.completed, label: '종료', value: 'completed' },
  ] satisfies Array<{ count: number; label: string; value: ExternalScheduleStatusFilter }>;

  return (
    <div className="border-b border-border/60 bg-card px-4 py-3 sm:px-5">
      <div className="grid gap-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto] xl:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 bg-[hsl(var(--surface-2))] pl-9 pr-9 text-sm font-semibold"
              placeholder="팀, 스테이지, 대회 검색"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                aria-label="검색어 지우기"
                onClick={() => onQueryChange('')}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-1">
              {sourceOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={sourceValue === option.value}
                  className={cn(
                    'h-8 shrink-0 rounded-[5px] px-2.5 text-xs font-bold transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                    sourceValue === option.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground',
                  )}
                  onClick={() => onSourceChange(option.value)}
                >
                  {option.label} {option.count.toLocaleString('ko-KR')}
                </button>
              ))}
            </div>
            <Badge variant="outline" className="h-9 bg-transparent">
              경기 {eventCountLabel}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-4 overflow-hidden rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-1">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={statusValue === option.value}
              className={cn(
                'h-8 min-w-0 rounded-[5px] px-2 text-xs font-bold transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                statusValue === option.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
              onClick={() => onStatusChange(option.value)}
            >
              <span className="truncate">
                {option.label} {option.count.toLocaleString('ko-KR')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const ExternalUpcomingMatchRail = ({
  events,
  favoriteTeam = null,
  onSelectDate,
  title = '다가오는 경기',
}: {
  events: ExternalEsportsEventItem[];
  favoriteTeam?: FavoriteEsportsTeam | null;
  onSelectDate: (date: Date) => void;
  title?: string;
}) => (
  <div className="border-b border-border/60 bg-card px-4 py-4 sm:px-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="metric-label">타임라인</p>
        <h3 className="mt-1 text-base font-bold">{title}</h3>
      </div>
      <Badge variant="outline" className="w-fit bg-transparent">
        {events.length.toLocaleString('ko-KR')}개 표시
      </Badge>
    </div>

    {events.length > 0 ? (
      <div className="-mx-1 mt-3 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {events.map((event) => {
          const startsAt = event.startsAt ? new Date(event.startsAt) : null;
          const isValidDate = startsAt !== null && !Number.isNaN(startsAt.getTime());
          const isFavoriteEvent = isFavoriteEsportsTeamEvent(event, favoriteTeam);

          return (
            <button
              key={event.id}
              type="button"
              className={cn(
                'min-w-[248px] rounded-md border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:min-w-[268px] sm:p-3',
                isFavoriteEvent
                  ? 'border-primary/45 bg-primary/[0.08]'
                  : 'border-border/70 bg-[hsl(var(--surface-2))]',
              )}
              disabled={!isValidDate}
              onClick={() => {
                if (startsAt && isValidDate) {
                  onSelectDate(startsAt);
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ExternalScheduleCompetitionMark event={event} />
                  {isFavoriteEvent ? (
                    <Badge variant="outline" className="bg-card text-[11px]">
                      <Star className="h-3 w-3 fill-primary text-primary" />
                      응원팀
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="bg-card text-[11px]">
                    {formatExternalEventTime(event.startsAt)}
                  </Badge>
                </div>
                <Badge variant="outline" className="shrink-0 bg-card text-[11px]">
                  {event.region
                    ? getExternalRegionLabel(event.region)
                    : getExternalCompactSourceLabel(event.sourceId)}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-[36px_minmax(0,1fr)_auto_minmax(0,1fr)_36px] items-center gap-2">
                <ExternalScheduleLogo
                  label={event.teamA || 'TBD'}
                  size="sm"
                  url={getExternalEventTeamLogoUrl(event, 'A')}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{event.teamA || 'TBD'}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-bold text-muted-foreground">
                    {getExternalEventTeamCode(event, 'A')}
                  </span>
                </span>
                <span className="rounded-md border border-border/60 bg-card px-1.5 py-1 text-[10px] font-black text-muted-foreground">
                  vs
                </span>
                <span className="min-w-0 text-right">
                  <span className="block truncate text-sm font-black">{event.teamB || 'TBD'}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-bold text-muted-foreground">
                    {getExternalEventTeamCode(event, 'B')}
                  </span>
                </span>
                <ExternalScheduleLogo
                  label={event.teamB || 'TBD'}
                  size="sm"
                  url={getExternalEventTeamLogoUrl(event, 'B')}
                />
              </div>
              <p className="mt-2.5 truncate text-xs font-semibold text-muted-foreground">
                {event.stage || event.series || event.tournament || '대회 정보 없음'}
              </p>
            </button>
          );
        })}
      </div>
    ) : (
      <InlineEmptyState
        className="mt-3"
        title="다가오는 경기가 없습니다."
        description="필터를 조정하거나 다른 지역을 선택해주세요."
      />
    )}
  </div>
);

const ExternalScheduleRegionTabs = ({
  onChange,
  options,
  value,
}: {
  onChange: (value: ExternalScheduleRegionFilter) => void;
  options: ExternalScheduleRegionOption[];
  value: ExternalScheduleRegionFilter;
}) => (
  <div className="border-b border-border/60 bg-card px-4 py-3 sm:px-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="metric-label">지역</p>
        <h3 className="mt-1 text-base font-bold">리그/지역별 일정</h3>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:justify-end">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={cn(
              'min-w-[92px] shrink-0 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
              value === option.value
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border/70 bg-[hsl(var(--surface-2))] text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="block truncate text-xs font-black">{option.label}</span>
            <span className="mt-1 block truncate text-[11px] font-bold">
              {option.count.toLocaleString('ko-KR')}경기
              {option.upcomingCount > 0
                ? ` · 예정 ${option.upcomingCount.toLocaleString('ko-KR')}`
                : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

const externalScheduleLogoSizeClassNames = {
  lg: 'h-16 w-16',
  md: 'h-12 w-12',
  sm: 'h-9 w-9',
  xs: 'h-6 w-6',
} satisfies Record<'lg' | 'md' | 'sm' | 'xs', string>;

const externalScheduleLogoPaddingClassNames = {
  lg: 'p-2',
  md: 'p-1.5',
  sm: 'p-1',
  xs: 'p-0.5',
} satisfies Record<'lg' | 'md' | 'sm' | 'xs', string>;

const ExternalScheduleLogo = ({
  className,
  label,
  size = 'md',
  url,
}: {
  className?: string;
  label: string;
  size?: keyof typeof externalScheduleLogoSizeClassNames;
  url: string;
}) => (
  <span
    className={cn(
      'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 text-white/80 ring-1 ring-black/20',
      externalScheduleLogoSizeClassNames[size],
      className,
    )}
    style={externalScheduleLogoWellStyle}
  >
    {url ? (
      <img
        src={url}
        alt={label}
        loading="lazy"
        className={cn(
          externalScheduleLogoImageClassName,
          externalScheduleLogoPaddingClassNames[size],
        )}
      />
    ) : (
      <span className={cn('font-black', size === 'xs' ? 'text-[9px]' : 'text-xs')}>
        {getExternalTeamInitials(label)}
      </span>
    )}
  </span>
);

const ExternalScheduleTeamIdentity = ({
  align = 'left',
  event,
  side,
  size = 'md',
}: {
  align?: 'left' | 'right';
  event: ExternalEsportsEventItem;
  side: 'A' | 'B';
  size?: 'lg' | 'md' | 'sm';
}) => {
  const teamName = side === 'A' ? event.teamA || 'TBD' : event.teamB || 'TBD';
  const teamCode = getExternalEventTeamCode(event, side);
  const logoUrl = getExternalEventTeamLogoUrl(event, side);
  const gridClassName =
    size === 'lg'
      ? 'grid-cols-[56px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)]'
      : size === 'md'
        ? 'grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[48px_minmax(0,1fr)]'
        : 'grid-cols-[36px_minmax(0,1fr)]';
  const reverseGridClassName =
    size === 'lg'
      ? 'sm:grid-cols-[minmax(0,1fr)_64px]'
      : size === 'md'
        ? 'sm:grid-cols-[minmax(0,1fr)_48px]'
        : 'sm:grid-cols-[minmax(0,1fr)_36px]';

  return (
    <div
      className={cn(
        'grid min-w-0 items-center',
        size === 'lg' ? 'gap-3' : 'gap-2.5',
        gridClassName,
        align === 'right' && cn(reverseGridClassName, 'sm:text-right'),
      )}
    >
      <ExternalScheduleLogo
        className={cn(align === 'right' && 'sm:order-2')}
        label={teamName}
        size={size}
        url={logoUrl}
      />
      <div className="min-w-0">
        <p
          className={cn(
            'truncate font-black text-muted-foreground',
            size === 'lg' ? 'text-[11px]' : 'text-[10px]',
          )}
        >
          {teamCode}
        </p>
        <p
          className={cn(
            'mt-0.5 break-words font-black leading-tight',
            size === 'lg' ? 'text-xl sm:text-2xl' : size === 'md' ? 'text-base' : 'text-sm',
          )}
        >
          {teamName}
        </p>
      </div>
    </div>
  );
};

const ExternalScheduleMatchupBlock = ({
  event,
  size = 'md',
}: {
  event: ExternalEsportsEventItem;
  size?: 'lg' | 'md';
}) => {
  const scoreLabel =
    event.status === 'completed' && event.scoreA !== null && event.scoreB !== null
      ? `${event.scoreA} - ${event.scoreB}`
      : 'vs';

  return (
    <div
      className={cn(
        'grid min-w-0 items-center',
        size === 'lg'
          ? 'gap-3 lg:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)]'
          : 'gap-2.5 sm:grid-cols-[minmax(0,1fr)_62px_minmax(0,1fr)]',
      )}
    >
      <ExternalScheduleTeamIdentity event={event} side="A" size={size === 'lg' ? 'lg' : 'sm'} />
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-border/70 bg-card text-center',
          size === 'lg' ? 'min-h-16 px-3' : 'min-h-11 px-2',
        )}
      >
        <div>
          <p className={cn('font-black leading-none', size === 'lg' ? 'text-2xl' : 'text-sm')}>
            {scoreLabel}
          </p>
          <p className="mt-1 text-[10px] font-bold text-muted-foreground">
            {event.status === 'completed' ? 'FINAL' : 'MATCH'}
          </p>
        </div>
      </div>
      <ExternalScheduleTeamIdentity
        align="right"
        event={event}
        side="B"
        size={size === 'lg' ? 'lg' : 'sm'}
      />
    </div>
  );
};

const ExternalScheduleCompetitionMark = ({ event }: { event: ExternalEsportsEventItem }) => {
  const logoUrl = getExternalEventCompetitionLogoUrl(event);

  if (!logoUrl) {
    return null;
  }

  return (
    <ExternalScheduleLogo
      className="rounded-[6px]"
      label={event.series || event.tournament || 'Competition'}
      size="xs"
      url={logoUrl}
    />
  );
};

const ExternalNextEventFeature = ({
  event,
  favoriteTeam,
  now,
}: {
  event: ExternalEsportsEventItem | null;
  favoriteTeam: FavoriteEsportsTeam | null;
  now: number;
}) => (
  <div className="border-b border-border/60 bg-[hsl(var(--surface-2))] px-4 py-3.5 sm:px-5 sm:py-4">
    {event ? (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_248px] lg:items-stretch xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 rounded-md border border-border/70 bg-card/70 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ExternalScheduleCompetitionMark event={event} />
            <Badge variant="outline" className="bg-card">
              {favoriteTeam ? `${favoriteTeam.name} 다음 경기` : '다음 경기'}
            </Badge>
            {favoriteTeam ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Star className="h-3 w-3 fill-primary text-primary" />
                응원팀
              </Badge>
            ) : null}
            <Badge variant="outline" className="bg-card">
              {getExternalCompactSourceLabel(event.sourceId)}
            </Badge>
            {event.region ? (
              <Badge variant="outline" className="bg-card">
                {getExternalRegionLabel(event.region)}
              </Badge>
            ) : null}
          </div>
          <div className="mt-3.5">
            <ExternalScheduleMatchupBlock event={event} size="lg" />
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-muted-foreground">
            {[event.stage, event.series, event.tournament].filter(Boolean).join(' · ') ||
              '대회 정보 없음'}
          </p>
        </div>
        <div className="flex flex-col rounded-md border border-border/70 bg-card p-3.5">
          <p className="metric-label">시작</p>
          <p className="mt-1 text-lg font-black">
            {event.startsAt ? formatExternalEventTime(event.startsAt) : '미정'}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
            {event.startsAt ? formatExternalFullDate(event.startsAt) : '일정 미정'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-transparent">
              {formatExternalTimeUntil(event.startsAt, now)}
            </Badge>
            <Badge variant="outline" className="bg-transparent">
              {getExternalEventStatusLabel(event.status)}
            </Badge>
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-3.5">
            <Button asChild variant="default" size="sm">
              <Link to={getExternalEsportsMatchPath(event)}>
                <Swords className="h-4 w-4" />
                매치 상세
              </Link>
            </Button>
            <ExternalWatchLinks urls={event.watchUrls} />
          </div>
        </div>
      </div>
    ) : (
      <div className="min-w-0">
        <p className="metric-label">다음 경기</p>
        <h3 className="mt-1 text-xl font-bold">예정된 경기가 없습니다.</h3>
      </div>
    )}
  </div>
);

const ExternalScheduleCalendar = ({
  days,
  eventsByDate,
  favoriteTeam,
  hasNextEvent,
  mode,
  nextEventDateKey,
  onGoToNextEvent,
  onGoToToday,
  onModeChange,
  onMove,
  onSelectDate,
  selectedDate,
  visibleDate,
}: {
  days: Date[];
  eventsByDate: Map<string, ExternalEsportsEventItem[]>;
  favoriteTeam: FavoriteEsportsTeam | null;
  hasNextEvent: boolean;
  mode: ExternalScheduleViewMode;
  nextEventDateKey: string | null;
  onGoToNextEvent: () => void;
  onGoToToday: () => void;
  onModeChange: (mode: ExternalScheduleViewMode) => void;
  onMove: (direction: -1 | 1) => void;
  onSelectDate: (dateKey: string) => void;
  selectedDate: string;
  visibleDate: Date;
}) => {
  const today = formatDateValue(new Date());

  return (
    <div className="border-b border-border/60 bg-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="metric-label">캘린더</p>
          <h3 className="mt-1 text-base font-bold">
            {formatExternalDateRangeLabel(visibleDate, mode)}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" size="sm" className="bg-transparent" onClick={onGoToToday}>
            오늘
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent"
            disabled={!hasNextEvent}
            onClick={onGoToNextEvent}
          >
            다음 경기
          </Button>
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-1">
            {(['month', 'week'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  'h-8 min-w-[54px] rounded-[5px] px-2 text-xs font-bold transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                  mode === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                )}
                onClick={() => onModeChange(option)}
              >
                {option === 'month' ? '월간' : '주간'}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-border/70 bg-card">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onMove(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onMove(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {calendarWeekdayLabels.map((label) => (
          <span
            key={label}
            className="flex h-7 items-center justify-center text-[11px] font-bold text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {days.map((date) => {
          const dateKey = formatDateValue(date);
          const events = eventsByDate.get(dateKey) ?? [];
          const isOutsideMonth = mode === 'month' && date.getMonth() !== visibleDate.getMonth();
          const isSelected = dateKey === selectedDate;
          const isToday = dateKey === today;
          const isNextEventDate = dateKey === nextEventDateKey;
          const hasFavoriteEvent = events.some((event) =>
            isFavoriteEsportsTeamEvent(event, favoriteTeam),
          );

          return (
            <ExternalScheduleCalendarDay
              key={dateKey}
              date={date}
              events={events}
              hasFavoriteEvent={hasFavoriteEvent}
              isNextEventDate={isNextEventDate}
              isOutsideMonth={isOutsideMonth}
              isSelected={isSelected}
              isToday={isToday}
              mode={mode}
              onSelect={() => onSelectDate(dateKey)}
            />
          );
        })}
      </div>
      <ExternalScheduleLegend />
    </div>
  );
};

const ExternalScheduleCalendarDay = ({
  date,
  events,
  hasFavoriteEvent,
  isNextEventDate,
  isOutsideMonth,
  isSelected,
  isToday,
  mode,
  onSelect,
}: {
  date: Date;
  events: ExternalEsportsEventItem[];
  hasFavoriteEvent: boolean;
  isNextEventDate: boolean;
  isOutsideMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  mode: ExternalScheduleViewMode;
  onSelect: () => void;
}) => {
  const counts = getExternalEventStatusCounts(events);
  const hasEvents = events.length > 0;

  return (
    <button
      type="button"
      className={cn(
        'relative flex min-w-0 flex-col items-start rounded-md border border-border/50 bg-[hsl(var(--surface-2))] p-1.5 text-left transition-[border-color,background-color,box-shadow] hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:p-2',
        mode === 'week' ? 'min-h-[104px]' : 'min-h-[72px] sm:min-h-[78px]',
        isOutsideMonth && 'opacity-45',
        hasEvents && 'bg-card',
        isNextEventDate && !isSelected && 'border-primary/55 bg-primary/[0.07]',
        hasFavoriteEvent && !isSelected && 'border-primary/45 bg-primary/[0.06]',
        isSelected &&
          'border-primary/70 bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]',
        isToday && !isSelected && 'border-primary/30',
      )}
      aria-label={`${formatExternalFullDate(formatDateValue(date))} ${events.length.toLocaleString(
        'ko-KR',
      )}경기`}
      onClick={onSelect}
    >
      <span className="flex w-full items-start justify-between gap-1">
        <span className="text-xs font-black">{date.getDate()}</span>
        <span className="flex items-center gap-1">
          {hasFavoriteEvent ? (
            <Star className="h-3 w-3 fill-primary text-primary" aria-label="응원팀 경기" />
          ) : null}
          {hasEvents ? (
            <span className="rounded-md border border-border/60 bg-[hsl(var(--surface-2))] px-1.5 py-0.5 text-[10px] font-black tabular-nums">
              {events.length}
            </span>
          ) : null}
        </span>
      </span>
      <span className="mt-auto flex w-full items-end justify-between gap-2">
        <span className="truncate text-[10px] font-bold text-muted-foreground">
          {hasEvents ? '경기' : ''}
        </span>
        <ExternalEventStatusDots counts={counts} />
      </span>
    </button>
  );
};

const ExternalEventStatusDots = ({
  counts,
}: {
  counts: { completed: number; live: number; scheduled: number };
}) => (
  <span className="mt-1 flex h-2.5 items-center gap-1">
    {counts.scheduled > 0 ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
    {counts.live > 0 ? <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))]" /> : null}
    {counts.completed > 0 ? <span className="h-2 w-2 rounded-full bg-muted-foreground/55" /> : null}
  </span>
);

const ExternalScheduleLegend = () => (
  <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-muted-foreground">
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-primary" />
      예정
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
      진행
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/55" />
      종료
    </span>
  </div>
);

const ExternalSelectedDateEvents = ({
  dateKey,
  events,
  favoriteTeam,
  regionLabel,
}: {
  dateKey: string;
  events: ExternalEsportsEventItem[];
  favoriteTeam: FavoriteEsportsTeam | null;
  regionLabel: string;
}) => {
  const counts = getExternalEventStatusCounts(events);
  const favoriteCount = events.filter((event) =>
    isFavoriteEsportsTeamEvent(event, favoriteTeam),
  ).length;

  return (
    <div className="bg-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="metric-label">선택 날짜</p>
          <h3 className="mt-1 text-base font-bold">{formatExternalFullDate(dateKey)}</h3>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{regionLabel} 일정</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Badge variant="outline" className="w-fit bg-transparent">
            {events.length.toLocaleString('ko-KR')}경기
          </Badge>
          {events.length > 0 ? (
            <>
              {favoriteCount > 0 ? (
                <Badge variant="outline" className="w-fit gap-1 bg-transparent">
                  <Star className="h-3 w-3 fill-primary text-primary" />
                  응원팀 {favoriteCount.toLocaleString('ko-KR')}
                </Badge>
              ) : null}
              <Badge variant="outline" className="w-fit bg-transparent">
                예정 {counts.scheduled.toLocaleString('ko-KR')}
              </Badge>
              <Badge variant="outline" className="w-fit bg-transparent">
                진행 {counts.live.toLocaleString('ko-KR')}
              </Badge>
              <Badge variant="outline" className="w-fit bg-transparent">
                종료 {counts.completed.toLocaleString('ko-KR')}
              </Badge>
            </>
          ) : null}
        </div>
      </div>

      {events.length > 0 ? (
        <div className="mt-3 grid gap-2.5">
          {events.map((event) => (
            <ExternalEsportsEventRow key={event.id} event={event} favoriteTeam={favoriteTeam} />
          ))}
        </div>
      ) : (
        <InlineEmptyState
          className="mt-4"
          title="선택한 날짜에 경기가 없습니다."
          description="캘린더에서 경기 수가 표시된 날짜를 선택해주세요."
        />
      )}
    </div>
  );
};

export const ExternalDataKindPanel = ({
  isLoading,
  sourceCards,
  sources,
}: {
  isLoading: boolean;
  sourceCards: ExternalSourceCardModel[];
  sources: ExternalSource[];
}) => {
  const pendingCards = [
    {
      detail: sources.some((source) => source.id === 'overfast')
        ? '공개 프로필 데이터가 연결되면 작게 표시합니다.'
        : '프로필 소스 연결 후 표시합니다.',
      icon: UsersRound,
      label: '플레이어 프로필',
      status: '준비 중',
    },
    {
      detail: '영웅 목록과 로컬 기준 데이터 비교는 작은 상태로만 유지합니다.',
      icon: Layers3,
      label: '마스터 데이터',
      status: sources.some((source) => source.id === 'blizzard_heroes') ? '연결됨' : '대기',
    },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="border-b border-border/60 px-4 py-3 sm:px-5">
        <p className="metric-label">보조 정보</p>
        <h2 className="mt-1 text-lg font-bold">소스와 준비 중인 데이터</h2>
      </div>
      <div className="grid gap-px bg-border/60 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {isLoading
          ? Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="bg-card p-3.5">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-3 h-5 w-32" />
                <SkeletonBlock className="mt-3 h-3 w-32" />
              </div>
            ))
          : [
              ...sourceCards.map((card) => (
                <ExternalCompactSourceCard key={card.source.id} card={card} />
              )),
              ...pendingCards.map((card) => (
                <ExternalPreparedDataCard key={card.label} {...card} />
              )),
            ]}
      </div>
    </section>
  );
};

const ExternalEsportsEventRow = ({
  event,
  favoriteTeam,
}: {
  event: ExternalEsportsEventItem;
  favoriteTeam?: FavoriteEsportsTeam | null;
}) => {
  const isFavoriteEvent = isFavoriteEsportsTeamEvent(event, favoriteTeam);

  return (
    <article
      className={cn(
        'rounded-md border p-2.5 transition-colors hover:border-primary/30 sm:p-3',
        isFavoriteEvent
          ? 'border-primary/45 bg-primary/[0.07]'
          : 'border-border/70 bg-[hsl(var(--surface-2))]',
      )}
    >
      <div className="grid gap-3 xl:grid-cols-[88px_minmax(0,1fr)_132px] xl:items-start">
        <div className="min-w-0 rounded-md border border-border/60 bg-card px-2.5 py-2">
          <p className="text-sm font-black">{formatExternalEventTime(event.startsAt)}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                event.status === 'completed'
                  ? 'bg-muted-foreground/55'
                  : event.status === 'live'
                    ? 'bg-[hsl(var(--success))]'
                    : 'bg-primary',
              )}
            />
            <span className="truncate text-[11px] font-bold text-muted-foreground">
              {getExternalEventStatusLabel(event.status)}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ExternalScheduleCompetitionMark event={event} />
            {isFavoriteEvent ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Star className="h-3 w-3 fill-primary text-primary" />
                응원팀
              </Badge>
            ) : null}
            <Badge variant="outline" className="bg-card">
              {getExternalCompactSourceLabel(event.sourceId)}
            </Badge>
            {event.region ? (
              <Badge variant="outline" className="bg-card">
                {getExternalRegionLabel(event.region)}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 truncate text-xs font-semibold text-muted-foreground">
            {event.stage || 'Stage 미정'}
          </p>
          <div className="mt-2.5">
            <ExternalScheduleMatchupBlock event={event} />
          </div>
          <p className="mt-2 truncate text-xs font-semibold text-muted-foreground">
            {event.series || event.tournament || '대회 정보 없음'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 xl:flex-col xl:items-stretch">
          <Button asChild variant="default" size="sm" className="xl:w-full">
            <Link to={getExternalEsportsMatchPath(event)}>
              <Swords className="h-4 w-4" />
              상세
            </Link>
          </Button>
          <ExternalWatchLinks urls={event.watchUrls} className="xl:w-full" />
        </div>
      </div>
    </article>
  );
};

const ExternalWatchLinks = ({ className, urls }: { className?: string; urls: string[] }) => (
  <>
    {urls.slice(0, 2).map((url) => (
      <Button key={url} asChild variant="outline" size="sm" className={cn('bg-card', className)}>
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" />
          {getExternalWatchLinkLabel(url)}
        </a>
      </Button>
    ))}
  </>
);

const ExternalRowsSkeleton = ({ rows }: { rows: number }) => (
  <div>
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="border-b border-border/60 py-4 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-36 max-w-full" />
            <SkeletonBlock className="mt-2 h-3 w-52 max-w-full" />
          </div>
          <SkeletonBlock className="h-6 w-16" />
        </div>
      </div>
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

const StatsSectionSkeleton = ({ section }: { section: StatsSection }) => {
  return (
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
};

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
