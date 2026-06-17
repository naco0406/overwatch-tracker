import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock3,
  Database,
  Globe2,
  Layers3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { heroOptions, roleLabels } from '@/data/matchOptions';
import { getHeroPortraitPath } from '@/data/masterAssets';
import { toast } from '@/hooks/use-toast';
import { useCollectExternalData, useExternalDataOverview } from '@/hooks/useExternalData';
import {
  isExternalDataApiConfigured,
  type ExternalCollectRequest,
  type ExternalCollectResponse,
} from '@/lib/externalDataApi';
import { cn } from '@/lib/utils';
import type {
  ExternalDataOverview,
  ExternalSource,
  ExternalSourceType,
} from '@/types/externalData';
import type { MatchRole } from '@/types/match';
import {
  createExternalSourceCards,
  ExternalDataWarningsPanel,
  ExternalEsportsSchedulePanel,
  ExternalHeroMetaPanel,
  formatExternalDateTime,
  getLatestExternalTimestamp,
  MetricGrid,
  type ExternalEsportsEventItem,
  type ExternalHeroRateItem,
  type ExternalSourceCardModel,
  type MetricCellProps,
} from '@/pages/StatsPage';

const externalDataSections = [
  {
    description: '공식/서드파티 소스, TTL, 제공 데이터, 수집 최신성을 레지스트리로 봅니다.',
    eyebrow: 'Sources',
    label: '데이터 소스 현황',
    title: '데이터 소스 현황',
    value: 'sources',
  },
  {
    description: '공식 일정과 OWTICS 보강 일정을 날짜, 지역, 경기 상태 기준으로 봅니다.',
    eyebrow: 'Esports',
    label: 'e스포츠 일정',
    title: 'e스포츠 일정',
    value: 'esports',
  },
  {
    description: '외부 영웅 픽률과 승률을 역할, 메타 신호, 영웅 초상화 중심으로 봅니다.',
    eyebrow: 'Hero Meta',
    label: '영웅 메타',
    title: '영웅 메타',
    value: 'heroes',
  },
] as const;

const externalDataNavSections = [
  ...externalDataSections,
  {
    label: '오버워치 에셋',
    to: '/external-data/assets',
    value: 'assets',
  },
] as const;

type ExternalDataSection = (typeof externalDataSections)[number]['value'];

interface ExternalHeroSignalRow {
  heroId: string;
  latestAt: string | null;
  name: string;
  pickRate: number | null;
  regionCount: number;
  role: MatchRole | null;
  snapshotCount: number;
  sourceCount: number;
  winRate: number | null;
}

interface ExternalRoleCoverageRow {
  avgPickRate: number | null;
  avgWinRate: number | null;
  count: number;
  label: string;
  role: MatchRole;
}

const externalSourceTypeLabels = {
  official_api: '공식 API',
  official_web: '공식 웹',
  third_party_api: '서드파티 API',
  third_party_web: '서드파티 웹',
} satisfies Record<ExternalSourceType, string>;

const externalRegionLabels = {
  all: '전체',
  americas: '미주',
  asia: '아시아',
  china: '중국',
  emea: 'EMEA',
  europe: '유럽',
  global: '글로벌',
  japan: '일본',
  korea: '한국',
  na: '북미',
  north_america: '북미',
  owwc: '월드컵',
  pacific: '퍼시픽',
} as const;

const externalRoleOrder: MatchRole[] = ['tank', 'damage', 'support'];

const isExternalDataSection = (value: string | undefined): value is ExternalDataSection =>
  externalDataSections.some((section) => section.value === value);

const createExternalMetrics = ({
  isConfigured,
  isLoading,
  overview,
}: {
  isConfigured: boolean;
  isLoading: boolean;
  overview?: ExternalDataOverview;
}): MetricCellProps[] => {
  const sources = overview?.sources ?? [];
  const heroRates = overview?.heroRates ?? [];
  const esportsEvents = overview?.esportsEvents ?? [];
  const officialSourceCount = sources.filter((source) => source.isOfficial).length;
  const latestHeroRateFetchedAt = getLatestExternalTimestamp(
    heroRates.map((snapshot) => snapshot.fetchedAt),
  );
  const latestEsportsFetchedAt = getLatestExternalTimestamp(
    esportsEvents.map((event) => event.fetchedAt),
  );

  return [
    {
      detail: isConfigured
        ? `${officialSourceCount}개 공식 · ${Math.max(0, sources.length - officialSourceCount)}개 서드파티`
        : '환경 변수 설정 필요',
      icon: Globe2,
      label: '연결 소스',
      value: isConfigured ? (isLoading ? '...' : sources.length.toLocaleString('ko-KR')) : '--',
    },
    {
      detail: sources.length > 0 ? '활성화된 소스 기준' : '소스 조회 대기',
      icon: ShieldCheck,
      label: '공식 소스',
      value: isConfigured
        ? isLoading
          ? '...'
          : officialSourceCount.toLocaleString('ko-KR')
        : '--',
    },
    {
      detail: latestHeroRateFetchedAt
        ? `최근 수집 ${formatExternalDateTime(latestHeroRateFetchedAt)}`
        : '영웅 메타 수집 대기',
      icon: BarChart3,
      label: '영웅 메타',
      value: isConfigured ? (isLoading ? '...' : heroRates.length.toLocaleString('ko-KR')) : '--',
    },
    {
      detail: latestEsportsFetchedAt
        ? `최근 수집 ${formatExternalDateTime(latestEsportsFetchedAt)}`
        : '일정 수집 대기',
      icon: CalendarDays,
      label: 'e스포츠',
      value: isConfigured
        ? isLoading
          ? '...'
          : esportsEvents.length.toLocaleString('ko-KR')
        : '--',
    },
  ];
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

const formatExternalPercent = (value: number | null) =>
  value === null ? '--' : `${value.toFixed(1)}%`;

const formatExternalTtl = (seconds: number) => {
  if (seconds >= 86400) {
    return `${Math.round(seconds / 86400)}일`;
  }

  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)}시간`;
  }

  return `${Math.max(1, Math.round(seconds / 60))}분`;
};

const getExternalSourceTypeLabel = (value: ExternalSourceType) =>
  externalSourceTypeLabels[value] ?? value;

const getExternalRegionLabel = (value: string) =>
  value in externalRegionLabels
    ? externalRegionLabels[value as keyof typeof externalRegionLabels]
    : value || '미지정';

const getExternalHeroOption = (heroId: string) =>
  heroOptions.find((hero) => hero.value === heroId) ?? null;

const getExternalHeroLabel = (heroId: string) => getExternalHeroOption(heroId)?.label ?? heroId;

const getExternalHeroRole = (heroId: string, fallbackRole?: string) => {
  const hero = getExternalHeroOption(heroId);

  if (hero) {
    return hero.role;
  }

  return fallbackRole === 'tank' || fallbackRole === 'damage' || fallbackRole === 'support'
    ? fallbackRole
    : null;
};

const getExternalRoleLabel = (role: MatchRole | null) => (role ? roleLabels[role] : '미지정');

const getExternalAverage = (values: Array<number | null>) => {
  const numericValues = values.filter((value): value is number => value !== null);

  if (numericValues.length === 0) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
};

const roundExternalMetric = (value: number | null) =>
  value === null ? null : Math.round(value * 10) / 10;

const getExternalEventTime = (value: string | null) => {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
};

const getLocalDateKey = (value: string | null) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
};

const getExternalEventStatusCounts = (events: ExternalEsportsEventItem[]) =>
  events.reduce(
    (counts, event) => {
      if (event.status === 'completed') {
        counts.completed += 1;
      } else if (event.status === 'live') {
        counts.live += 1;
      } else if (event.status === 'canceled' || event.status === 'postponed') {
        counts.other += 1;
      } else {
        counts.scheduled += 1;
      }

      return counts;
    },
    { completed: 0, live: 0, other: 0, scheduled: 0 },
  );

const getUpcomingEsportsEvents = (events: ExternalEsportsEventItem[], referenceTime: number) =>
  events
    .filter((event) => {
      const time = getExternalEventTime(event.startsAt);

      return (
        event.status !== 'completed' &&
        event.status !== 'canceled' &&
        event.status !== 'postponed' &&
        time !== null &&
        time >= referenceTime - 1000 * 60 * 30
      );
    })
    .sort(
      (left, right) =>
        (getExternalEventTime(left.startsAt) ?? 0) - (getExternalEventTime(right.startsAt) ?? 0),
    );

const getEsportsRegionSummaries = (events: ExternalEsportsEventItem[]) => {
  const summaries = events.reduce((map, event) => {
    const key = event.region || 'unknown';
    const current = map.get(key) ?? {
      completed: 0,
      count: 0,
      live: 0,
      scheduled: 0,
      value: key,
    };

    current.count += 1;

    if (event.status === 'completed') {
      current.completed += 1;
    } else if (event.status === 'live') {
      current.live += 1;
    } else {
      current.scheduled += 1;
    }

    map.set(key, current);

    return map;
  }, new Map<string, { completed: number; count: number; live: number; scheduled: number; value: string }>());

  return Array.from(summaries.values()).sort((left, right) => right.count - left.count);
};

const createExternalHeroSignalRows = (
  heroRates: ExternalHeroRateItem[],
): ExternalHeroSignalRow[] => {
  const groups = heroRates.reduce(
    (map, snapshot) => {
      const current = map.get(snapshot.heroId) ?? {
        latestAt: null as string | null,
        pickRates: [] as Array<number | null>,
        regions: new Set<string>(),
        role: getExternalHeroRole(snapshot.heroId, snapshot.role),
        sourceIds: new Set<string>(),
        snapshots: 0,
        winRates: [] as Array<number | null>,
      };

      current.latestAt = getLatestExternalTimestamp(
        [current.latestAt, snapshot.fetchedAt].filter((value): value is string => Boolean(value)),
      );
      current.pickRates.push(snapshot.pickRate);
      current.regions.add(snapshot.region);
      current.role = current.role ?? getExternalHeroRole(snapshot.heroId, snapshot.role);
      current.snapshots += 1;
      current.sourceIds.add(snapshot.sourceId);
      current.winRates.push(snapshot.winRate);
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
        sourceIds: Set<string>;
        snapshots: number;
        winRates: Array<number | null>;
      }
    >(),
  );

  return Array.from(groups, ([heroId, group]) => ({
    heroId,
    latestAt: group.latestAt,
    name: getExternalHeroLabel(heroId),
    pickRate: roundExternalMetric(getExternalAverage(group.pickRates)),
    regionCount: group.regions.size,
    role: group.role,
    snapshotCount: group.snapshots,
    sourceCount: group.sourceIds.size,
    winRate: roundExternalMetric(getExternalAverage(group.winRates)),
  })).sort((left, right) => {
    const pickDelta = (right.pickRate ?? -1) - (left.pickRate ?? -1);

    if (pickDelta !== 0) {
      return pickDelta;
    }

    return (right.winRate ?? -1) - (left.winRate ?? -1);
  });
};

const createExternalRoleCoverageRows = (
  heroRows: ExternalHeroSignalRow[],
): ExternalRoleCoverageRow[] =>
  externalRoleOrder.map((role) => {
    const rows = heroRows.filter((hero) => hero.role === role);

    return {
      avgPickRate: roundExternalMetric(getExternalAverage(rows.map((hero) => hero.pickRate))),
      avgWinRate: roundExternalMetric(getExternalAverage(rows.map((hero) => hero.winRate))),
      count: rows.length,
      label: roleLabels[role],
      role,
    };
  });

const getExternalSourceDataKindLabels = (card: ExternalSourceCardModel) => {
  const labels = [
    card.heroRateCount > 0 ? `영웅 메타 ${card.heroRateCount.toLocaleString('ko-KR')}` : '',
    card.eventCount > 0 ? `경기 일정 ${card.eventCount.toLocaleString('ko-KR')}` : '',
  ].filter(Boolean);

  if (labels.length > 0) {
    return labels;
  }

  if (card.source.id === 'overfast') {
    return ['프로필 준비 중'];
  }

  if (card.source.id === 'blizzard_heroes') {
    return ['마스터 데이터'];
  }

  return [card.primaryLabel];
};

const getSourceCardLatestAt = (cards: ExternalSourceCardModel[]) =>
  getLatestExternalTimestamp(
    cards.map((card) => card.latestAt).filter((value): value is string => Boolean(value)),
  );

const OWTICS_ASSET_BATCH_SIZE = 12;
const OWTICS_DETAIL_BATCH_SIZE = 4;
const OWTICS_DETAIL_MAX_BATCHES = 120;

const getCollectMetadataNumber = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : null;
  }

  return null;
};

const getOwticsCollectBatchState = (response: ExternalCollectResponse) => {
  const result = response.results.find((item) => item.sourceId === 'owtics');

  if (!result) {
    return null;
  }

  return {
    failed: getCollectMetadataNumber(result.metadata, 'detailFailedCount') ?? 0,
    fetched: getCollectMetadataNumber(result.metadata, 'detailFetchedCount') ?? 0,
    limit: getCollectMetadataNumber(result.metadata, 'detailLimit') ?? OWTICS_DETAIL_BATCH_SIZE,
    offset: getCollectMetadataNumber(result.metadata, 'detailOffset') ?? 0,
    requested: getCollectMetadataNumber(result.metadata, 'detailRequestedCount') ?? 0,
    total: getCollectMetadataNumber(result.metadata, 'detailTotalCount'),
  };
};

const summarizeExternalCollectionResponses = (responses: ExternalCollectResponse[]) => {
  const results = responses.flatMap((response) => response.results);
  const detailFetched = results.reduce(
    (sum, result) => sum + (getCollectMetadataNumber(result.metadata, 'detailFetchedCount') ?? 0),
    0,
  );
  const detailFailed = results.reduce(
    (sum, result) => sum + (getCollectMetadataNumber(result.metadata, 'detailFailedCount') ?? 0),
    0,
  );
  const assetFailed = results.reduce(
    (sum, result) => sum + (getCollectMetadataNumber(result.metadata, 'assetFailedCount') ?? 0),
    0,
  );
  const assetHit = results.reduce(
    (sum, result) => sum + (getCollectMetadataNumber(result.metadata, 'assetHitCount') ?? 0),
    0,
  );
  const assetUploaded = results.reduce(
    (sum, result) => sum + (getCollectMetadataNumber(result.metadata, 'assetUploadedCount') ?? 0),
    0,
  );

  return {
    assetFailed,
    assetHit,
    assetUploaded,
    detailFailed,
    detailFetched,
    failed: results.filter((result) => result.status !== 'success').length,
    inserted: results.reduce((sum, result) => sum + (result.insertedCount ?? 0), 0),
    jobs: results.length,
    ok: responses.every((response) => response.ok),
  };
};

const formatExternalCollectionSummary = (
  summary: ReturnType<typeof summarizeExternalCollectionResponses>,
) => {
  const detailTotal = summary.detailFetched + summary.detailFailed;
  const detailLabel =
    detailTotal > 0 ? ` · OWTICS 상세 ${summary.detailFetched.toLocaleString('ko-KR')}개 보강` : '';
  const assetTotal = summary.assetUploaded + summary.assetHit + summary.assetFailed;
  const assetLabel =
    assetTotal > 0
      ? ` · 로고 ${summary.assetUploaded.toLocaleString('ko-KR')}개 저장 · 캐시 ${summary.assetHit.toLocaleString('ko-KR')}`
      : '';

  return `${summary.jobs.toLocaleString('ko-KR')}개 작업 · ${summary.inserted.toLocaleString('ko-KR')}개 반영 · 실패 ${summary.failed.toLocaleString('ko-KR')}${detailLabel}${assetLabel}`;
};

const ExternalDataPage = () => {
  const { section } = useParams();
  const activeSection = isExternalDataSection(section) ? section : 'sources';
  const activeSectionMeta =
    externalDataSections.find((item) => item.value === activeSection) ?? externalDataSections[0];
  const isConfigured = isExternalDataApiConfigured();
  const { data: overview, error, isFetching, isLoading, refetch } = useExternalDataOverview(true);
  const collectExternalDataMutation = useCollectExternalData();
  const [collectionProgressLabel, setCollectionProgressLabel] = useState<string | null>(null);
  const sources = overview?.sources ?? [];
  const heroRates = overview?.heroRates ?? [];
  const esportsEvents = overview?.esportsEvents ?? [];
  const warnings = overview?.warnings ?? [];
  const sourceCards = createExternalSourceCards(sources, heroRates, esportsEvents);
  const fallbackMetrics = createExternalMetrics({ isConfigured, isLoading, overview });
  const isCollectingExternalData =
    collectExternalDataMutation.isPending || collectionProgressLabel !== null;

  if (section && !isExternalDataSection(section)) {
    return <Navigate to="/external-data/sources" replace />;
  }

  const handleCollectExternalData = async () => {
    const responses: ExternalCollectResponse[] = [];
    const runStep = async (request: ExternalCollectRequest, label: string) => {
      setCollectionProgressLabel(label);
      const response = await collectExternalDataMutation.mutateAsync(request);
      responses.push(response);

      return response;
    };
    const runOwticsDetailBatches = async () => {
      let detailOffset = 0;
      let detailTotal: number | null = null;

      for (let batchIndex = 0; batchIndex < OWTICS_DETAIL_MAX_BATCHES; batchIndex += 1) {
        const rangeStart = detailOffset + 1;
        const rangeEnd =
          detailTotal === null
            ? detailOffset + OWTICS_DETAIL_BATCH_SIZE
            : Math.min(detailOffset + OWTICS_DETAIL_BATCH_SIZE, detailTotal);
        const totalLabel = detailTotal === null ? '' : `/${detailTotal.toLocaleString('ko-KR')}`;
        const response = await runStep(
          {
            assetLimit: OWTICS_ASSET_BATCH_SIZE,
            detailLimit: OWTICS_DETAIL_BATCH_SIZE,
            detailOffset,
            target: 'owtics-esports-events',
          },
          `OWTICS 상세 ${rangeStart.toLocaleString('ko-KR')}-${rangeEnd.toLocaleString('ko-KR')}${totalLabel}`,
        );
        const batchState = getOwticsCollectBatchState(response);

        if (!batchState || batchState.requested <= 0) {
          break;
        }

        detailTotal = batchState.total ?? detailTotal;
        const nextOffset = batchState.offset + batchState.limit;

        if (nextOffset <= detailOffset || (detailTotal !== null && nextOffset >= detailTotal)) {
          break;
        }

        detailOffset = nextOffset;
      }
    };

    try {
      if (activeSection === 'sources' || activeSection === 'heroes') {
        await runStep({ target: 'global-hero-rates' }, '영웅 메타 수집');
      }

      if (activeSection === 'sources' || activeSection === 'esports') {
        await runStep({ target: 'official-esports-events' }, '공식 일정 수집');
        await runOwticsDetailBatches();
      }

      const summary = summarizeExternalCollectionResponses(responses);

      toast({
        title: summary.ok ? '외부 데이터 수집 완료' : '외부 데이터 수집 일부 실패',
        description: formatExternalCollectionSummary(summary),
        variant: summary.ok ? 'default' : 'destructive',
      });
      void refetch();
    } catch (collectError) {
      toast({
        title: '외부 데이터 수집 실패',
        description:
          collectError instanceof Error ? collectError.message : '수집 작업을 실행하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setCollectionProgressLabel(null);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={activeSectionMeta.eyebrow}
        title={activeSectionMeta.title}
        description={activeSectionMeta.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="default"
              disabled={isCollectingExternalData || !isConfigured}
              onClick={() => void handleCollectExternalData()}
            >
              {isCollectingExternalData ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              {collectionProgressLabel ?? '수집 실행'}
            </Button>
            <Button
              variant="outline"
              className="bg-transparent"
              disabled={isFetching || !isConfigured || isCollectingExternalData}
              onClick={() => void refetch()}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              새로고침
            </Button>
          </div>
        }
      />

      <ExternalDataSectionNav activeSection={activeSection} />

      {!isConfigured ? (
        <div className="space-y-4">
          <MetricGrid metrics={fallbackMetrics} />
          <EmptyState
            icon={Database}
            title="외부 데이터 API 주소가 없습니다."
            description="Cloudflare Pages 환경 변수 VITE_EXTERNAL_DATA_API_URL을 설정하면 외부 데이터 페이지를 사용할 수 있습니다."
          />
        </div>
      ) : error ? (
        <EmptyState
          action={
            <Button variant="outline" className="bg-transparent" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </Button>
          }
          icon={Database}
          title="외부 데이터를 불러오지 못했습니다."
          description={error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.'}
        />
      ) : (
        <ExternalDataSectionBody
          activeSection={activeSection}
          esportsEvents={esportsEvents}
          heroRates={heroRates}
          isLoading={isLoading}
          sourceCards={sourceCards}
          sources={sources}
          warnings={warnings}
        />
      )}
    </div>
  );
};

const ExternalDataSectionNav = ({ activeSection }: { activeSection: ExternalDataSection }) => (
  <nav className="mobile-scroll flex gap-2 overflow-x-auto">
    {externalDataNavSections.map((item) => (
      <NavLink
        key={item.value}
        to={item.value === 'assets' ? item.to : `/external-data/${item.value}`}
        className={cn(
          'flex h-10 shrink-0 items-center rounded-md border border-border/70 bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground',
          activeSection === item.value &&
            'border-primary/60 bg-primary text-primary-foreground hover:text-primary-foreground',
        )}
      >
        {item.label}
      </NavLink>
    ))}
  </nav>
);

const ExternalDataSectionBody = ({
  activeSection,
  esportsEvents,
  heroRates,
  isLoading,
  sourceCards,
  sources,
  warnings,
}: {
  activeSection: ExternalDataSection;
  esportsEvents: ExternalDataOverview['esportsEvents'];
  heroRates: ExternalDataOverview['heroRates'];
  isLoading: boolean;
  sourceCards: ExternalSourceCardModel[];
  sources: ExternalSource[];
  warnings: NonNullable<ExternalDataOverview['warnings']>;
}) => {
  if (activeSection === 'esports') {
    return (
      <ExternalEsportsDetailPage
        esportsEvents={esportsEvents}
        isLoading={isLoading}
        sourceCards={sourceCards}
        warnings={warnings}
      />
    );
  }

  if (activeSection === 'heroes') {
    return (
      <ExternalHeroesDetailPage
        heroRates={heroRates}
        isLoading={isLoading}
        sources={sources}
        warnings={warnings}
      />
    );
  }

  return (
    <ExternalSourcesDetailPage
      isLoading={isLoading}
      sourceCards={sourceCards}
      sources={sources}
      warnings={warnings}
    />
  );
};

const ExternalEsportsDetailPage = ({
  esportsEvents,
  isLoading,
  sourceCards,
  warnings,
}: {
  esportsEvents: ExternalEsportsEventItem[];
  isLoading: boolean;
  sourceCards: ExternalSourceCardModel[];
  warnings: NonNullable<ExternalDataOverview['warnings']>;
}) => {
  const [referenceTime] = useState(() => Date.now());
  const metrics = createExternalEsportsMetrics(
    esportsEvents,
    sourceCards,
    isLoading,
    referenceTime,
  );

  return (
    <div className="space-y-4">
      <ExternalEsportsBriefing
        esportsEvents={esportsEvents}
        isLoading={isLoading}
        referenceTime={referenceTime}
        sourceCards={sourceCards}
      />
      <MetricGrid metrics={metrics} />
      {warnings.length > 0 ? <ExternalDataWarningsPanel warnings={warnings} /> : null}
      <ExternalEsportsSchedulePanel esportsEvents={esportsEvents} isLoading={isLoading} />
    </div>
  );
};

const createExternalEsportsMetrics = (
  events: ExternalEsportsEventItem[],
  sourceCards: ExternalSourceCardModel[],
  isLoading: boolean,
  referenceTime: number,
): MetricCellProps[] => {
  const statusCounts = getExternalEventStatusCounts(events);
  const sourceCount = sourceCards.filter((card) => card.eventCount > 0).length;
  const scoreCount = events.filter(
    (event) => event.status === 'completed' && event.scoreA !== null && event.scoreB !== null,
  ).length;
  const regions = new Set(events.map((event) => event.region).filter(Boolean));
  const upcomingEvents = getUpcomingEsportsEvents(events, referenceTime);

  return [
    {
      detail: `${regions.size.toLocaleString('ko-KR')}개 지역 · ${sourceCount.toLocaleString('ko-KR')}개 일정 소스`,
      icon: CalendarDays,
      label: '총 경기',
      value: isLoading ? '...' : events.length.toLocaleString('ko-KR'),
    },
    {
      detail: `진행 ${statusCounts.live.toLocaleString('ko-KR')} · 예정 ${statusCounts.scheduled.toLocaleString('ko-KR')}`,
      icon: Clock3,
      label: '다가오는 경기',
      value: isLoading ? '...' : upcomingEvents.length.toLocaleString('ko-KR'),
    },
    {
      detail: `점수 기록 ${scoreCount.toLocaleString('ko-KR')}경기`,
      icon: Trophy,
      label: '완료 경기',
      value: isLoading ? '...' : statusCounts.completed.toLocaleString('ko-KR'),
    },
    {
      detail:
        sourceCards
          .filter((card) => card.eventCount > 0)
          .map((card) => card.source.displayName)
          .slice(0, 2)
          .join(', ') || '일정 소스 대기',
      icon: Globe2,
      label: '일정 커버리지',
      value: isLoading ? '...' : sourceCount.toLocaleString('ko-KR'),
    },
  ];
};

const ExternalEsportsBriefing = ({
  esportsEvents,
  isLoading,
  referenceTime,
  sourceCards,
}: {
  esportsEvents: ExternalEsportsEventItem[];
  isLoading: boolean;
  referenceTime: number;
  sourceCards: ExternalSourceCardModel[];
}) => {
  const statusCounts = getExternalEventStatusCounts(esportsEvents);
  const totalStatusCount =
    statusCounts.completed + statusCounts.live + statusCounts.other + statusCounts.scheduled;
  const todayKey = getLocalDateKey(new Date(referenceTime).toISOString());
  const todayEventCount = esportsEvents.filter(
    (event) => getLocalDateKey(event.startsAt) === todayKey,
  ).length;
  const nextDayEventCount = getUpcomingEsportsEvents(esportsEvents, referenceTime).filter(
    (event) => {
      const time = getExternalEventTime(event.startsAt);

      return time !== null && time <= referenceTime + 1000 * 60 * 60 * 24;
    },
  ).length;
  const regionSummaries = getEsportsRegionSummaries(esportsEvents).slice(0, 6);
  const eventSourceCards = sourceCards.filter((card) => card.eventCount > 0);

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="grid gap-px bg-border/60 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">일정 운영 보드</p>
              <h2 className="mt-1 text-xl font-black">지역별 경기 밀도와 상태 흐름</h2>
            </div>
            <Badge variant="outline" className="gap-1.5 bg-transparent">
              <Swords className="h-3.5 w-3.5" />
              {statusCounts.live > 0 ? 'LIVE 포함' : 'Calendar'}
            </Badge>
          </div>

          {isLoading && esportsEvents.length === 0 ? (
            <div className="mt-5 grid gap-3">
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-28" />
            </div>
          ) : (
            <>
              <ExternalStatusDistribution
                completed={statusCounts.completed}
                live={statusCounts.live}
                scheduled={statusCounts.scheduled}
                total={totalStatusCount}
              />
              <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/60 sm:grid-cols-3">
                <ExternalBriefMetric
                  label="오늘"
                  value={todayEventCount.toLocaleString('ko-KR')}
                  detail="로컬 날짜 기준"
                />
                <ExternalBriefMetric
                  label="24시간"
                  value={nextDayEventCount.toLocaleString('ko-KR')}
                  detail="다가오는 경기"
                />
                <ExternalBriefMetric
                  label="지역"
                  value={regionSummaries.length.toLocaleString('ko-KR')}
                  detail="표시 커버리지"
                />
              </div>
            </>
          )}
        </div>

        <div className="bg-[hsl(var(--surface-2))] px-4 py-4 sm:px-5">
          <p className="metric-label">커버리지</p>
          <div className="mt-3 grid gap-3">
            {regionSummaries.length > 0 ? (
              regionSummaries.map((region) => (
                <ExternalCoverageRow
                  key={region.value}
                  label={getExternalRegionLabel(region.value)}
                  value={`${region.count.toLocaleString('ko-KR')}경기`}
                  detail={`예정 ${region.scheduled.toLocaleString('ko-KR')} · 종료 ${region.completed.toLocaleString('ko-KR')}`}
                  percent={
                    esportsEvents.length > 0 ? (region.count / esportsEvents.length) * 100 : 0
                  }
                />
              ))
            ) : (
              <InlineEmptyState
                title="지역 커버리지가 없습니다."
                description="일정이 수집되면 지역별 경기 밀도가 표시됩니다."
              />
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {eventSourceCards.map((card) => (
              <Badge key={card.source.id} variant="outline" className="gap-1.5 bg-card">
                {card.source.isOfficial ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : (
                  <Globe2 className="h-3 w-3" />
                )}
                {card.source.displayName}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const ExternalStatusDistribution = ({
  completed,
  live,
  scheduled,
  total,
}: {
  completed: number;
  live: number;
  scheduled: number;
  total: number;
}) => {
  const segments = [
    { className: 'bg-[hsl(var(--success))]', label: '진행', value: live },
    { className: 'bg-primary', label: '예정', value: scheduled },
    { className: 'bg-muted-foreground/45', label: '종료', value: completed },
  ];

  return (
    <div className="mt-5">
      <div className="flex h-3 overflow-hidden rounded-full border border-border/70 bg-[hsl(var(--surface-2))]">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={segment.className}
            style={{ width: `${total > 0 ? Math.max(3, (segment.value / total) * 100) : 0}%` }}
            title={`${segment.label} ${segment.value.toLocaleString('ko-KR')}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {segments.map((segment) => (
          <Badge key={segment.label} variant="outline" className="gap-1.5 bg-transparent">
            <span className={cn('h-2 w-2 rounded-full', segment.className)} />
            {segment.label} {segment.value.toLocaleString('ko-KR')}
          </Badge>
        ))}
      </div>
    </div>
  );
};

const ExternalBriefMetric = ({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) => (
  <div className="min-w-0 bg-[hsl(var(--surface-2))] px-3.5 py-3">
    <p className="metric-label">{label}</p>
    <p className="mt-1 text-xl font-black">{value}</p>
    <p className="mt-1 text-xs font-semibold text-muted-foreground">{detail}</p>
  </div>
);

const ExternalCoverageRow = ({
  detail,
  label,
  percent,
  value,
}: {
  detail: string;
  label: string;
  percent: number;
  value: string;
}) => (
  <div>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black">{label}</p>
        <p className="text-xs font-semibold text-muted-foreground">{detail}</p>
      </div>
      <span className="shrink-0 text-sm font-black">{value}</span>
    </div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/70">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.max(5, percent)}%` }}
      />
    </div>
  </div>
);

const ExternalHeroesDetailPage = ({
  heroRates,
  isLoading,
  sources,
  warnings,
}: {
  heroRates: ExternalHeroRateItem[];
  isLoading: boolean;
  sources: ExternalSource[];
  warnings: NonNullable<ExternalDataOverview['warnings']>;
}) => {
  const heroRows = createExternalHeroSignalRows(heroRates);
  const roleRows = createExternalRoleCoverageRows(heroRows);
  const metrics = createExternalHeroMetrics(heroRates, heroRows, sources, isLoading);

  return (
    <div className="space-y-4">
      <ExternalHeroMetaBriefing
        heroRows={heroRows}
        isLoading={isLoading}
        roleRows={roleRows}
        sources={sources}
      />
      <MetricGrid metrics={metrics} />
      {warnings.length > 0 ? <ExternalDataWarningsPanel warnings={warnings} /> : null}
      <ExternalHeroMetaPanel heroRates={heroRates} isLoading={isLoading} sources={sources} />
    </div>
  );
};

const createExternalHeroMetrics = (
  heroRates: ExternalHeroRateItem[],
  heroRows: ExternalHeroSignalRow[],
  sources: ExternalSource[],
  isLoading: boolean,
): MetricCellProps[] => {
  const topPick = [...heroRows].sort(
    (left, right) => (right.pickRate ?? -1) - (left.pickRate ?? -1),
  )[0];
  const topWin = [...heroRows].sort(
    (left, right) => (right.winRate ?? -1) - (left.winRate ?? -1),
  )[0];
  const sourceCount = new Set(heroRates.map((snapshot) => snapshot.sourceId)).size;
  const regionCount = new Set(heroRates.map((snapshot) => snapshot.region).filter(Boolean)).size;
  const latestAt = getLatestExternalTimestamp(heroRates.map((snapshot) => snapshot.fetchedAt));

  return [
    {
      detail: `${heroRates.length.toLocaleString('ko-KR')}개 snapshot · ${regionCount.toLocaleString('ko-KR')}개 지역`,
      icon: UsersRound,
      label: '분석 영웅',
      value: isLoading ? '...' : heroRows.length.toLocaleString('ko-KR'),
    },
    {
      detail: `전체 ${sources.length.toLocaleString('ko-KR')}개 중 ${sourceCount.toLocaleString('ko-KR')}개 · 최근 ${getExternalFreshnessLabel(latestAt)}`,
      icon: Globe2,
      label: '메타 소스',
      value: isLoading ? '...' : sourceCount.toLocaleString('ko-KR'),
    },
    {
      detail: topPick
        ? `${getExternalRoleLabel(topPick.role)} · 승률 ${formatExternalPercent(topPick.winRate)}`
        : '픽률 대기',
      icon: Target,
      label: '픽률 리더',
      value: isLoading ? '...' : (topPick?.name ?? '--'),
    },
    {
      detail: topWin
        ? `${getExternalRoleLabel(topWin.role)} · 픽률 ${formatExternalPercent(topWin.pickRate)}`
        : '승률 대기',
      icon: Trophy,
      label: '승률 리더',
      value: isLoading ? '...' : (topWin?.name ?? '--'),
    },
  ];
};

const ExternalHeroMetaBriefing = ({
  heroRows,
  isLoading,
  roleRows,
  sources,
}: {
  heroRows: ExternalHeroSignalRow[];
  isLoading: boolean;
  roleRows: ExternalRoleCoverageRow[];
  sources: ExternalSource[];
}) => {
  const topPick =
    [...heroRows].sort((left, right) => (right.pickRate ?? -1) - (left.pickRate ?? -1))[0] ?? null;
  const topWin =
    [...heroRows].sort((left, right) => (right.winRate ?? -1) - (left.winRate ?? -1))[0] ?? null;
  const maxRoleCount = Math.max(1, ...roleRows.map((row) => row.count));
  const heroMetaSources = sources.filter(
    (source) => source.id === 'blizzard_hero_rates' || source.id === 'overfast',
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="grid gap-px bg-border/60 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">메타 랩</p>
              <h2 className="mt-1 text-xl font-black">역할 커버리지와 표본 품질</h2>
            </div>
            <Badge variant="outline" className="gap-1.5 bg-transparent">
              <Sparkles className="h-3.5 w-3.5" />
              {heroRows.length.toLocaleString('ko-KR')} heroes
            </Badge>
          </div>

          {isLoading && heroRows.length === 0 ? (
            <div className="mt-5 grid gap-3">
              <SkeletonBlock className="h-14" />
              <SkeletonBlock className="h-14" />
              <SkeletonBlock className="h-14" />
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {roleRows.map((role) => (
                <ExternalRoleCoverageBar key={role.role} maxCount={maxRoleCount} role={role} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-[hsl(var(--surface-2))] px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">주요 신호</p>
            <div className="flex flex-wrap justify-end gap-1.5">
              {heroMetaSources.map((source) => (
                <Badge key={source.id} variant="outline" className="bg-card text-[11px]">
                  {source.displayName}
                </Badge>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            <ExternalHeroSignalCell
              hero={topPick}
              label="픽률 집중"
              metric={topPick ? formatExternalPercent(topPick.pickRate) : '--'}
            />
            <ExternalHeroSignalCell
              hero={topWin}
              label="승률 효율"
              metric={topWin ? formatExternalPercent(topWin.winRate) : '--'}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

const ExternalRoleCoverageBar = ({
  maxCount,
  role,
}: {
  maxCount: number;
  role: ExternalRoleCoverageRow;
}) => (
  <div>
    <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)_140px] sm:items-center">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
        <span className="text-sm font-black">{role.label}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border/70">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(4, (role.count / maxCount) * 100)}%` }}
        />
      </div>
      <div className="text-left text-xs font-bold text-muted-foreground sm:text-right">
        {role.count.toLocaleString('ko-KR')}명 · 픽 {formatExternalPercent(role.avgPickRate)} · 승{' '}
        {formatExternalPercent(role.avgWinRate)}
      </div>
    </div>
  </div>
);

const ExternalHeroSignalCell = ({
  hero,
  label,
  metric,
}: {
  hero: ExternalHeroSignalRow | null;
  label: string;
  metric: string;
}) => {
  const heroOption = hero ? getExternalHeroOption(hero.heroId) : null;
  const portraitSrc = heroOption ? getHeroPortraitPath(heroOption.value) : null;

  return (
    <div className="grid min-h-[76px] grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-card">
        {portraitSrc ? (
          <img src={portraitSrc} alt={hero?.name ?? label} className="h-full w-full object-cover" />
        ) : (
          <UsersRound className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <p className="mt-1 truncate text-base font-black">{hero?.name ?? '데이터 대기'}</p>
        <p className="truncate text-xs font-semibold text-muted-foreground">
          {hero
            ? `${getExternalRoleLabel(hero.role)} · ${hero.snapshotCount.toLocaleString('ko-KR')} snapshots`
            : '수집 후 표시'}
        </p>
      </div>
      <span className="shrink-0 text-lg font-black">{metric}</span>
    </div>
  );
};

const ExternalSourcesDetailPage = ({
  isLoading,
  sourceCards,
  sources,
  warnings,
}: {
  isLoading: boolean;
  sourceCards: ExternalSourceCardModel[];
  sources: ExternalSource[];
  warnings: NonNullable<ExternalDataOverview['warnings']>;
}) => {
  const metrics = createExternalSourceMetrics(sourceCards, sources, isLoading);

  return (
    <div className="space-y-4">
      <ExternalSourcesBriefing isLoading={isLoading} sourceCards={sourceCards} sources={sources} />
      <MetricGrid metrics={metrics} />
      {warnings.length > 0 ? <ExternalDataWarningsPanel warnings={warnings} /> : null}
      <ExternalSourceRegistry isLoading={isLoading} sourceCards={sourceCards} />
    </div>
  );
};

const createExternalSourceMetrics = (
  sourceCards: ExternalSourceCardModel[],
  sources: ExternalSource[],
  isLoading: boolean,
): MetricCellProps[] => {
  const officialCount = sources.filter((source) => source.isOfficial).length;
  const enabledCount = sources.filter((source) => source.isEnabled).length;
  const heroSourceCount = sourceCards.filter((card) => card.heroRateCount > 0).length;
  const eventSourceCount = sourceCards.filter((card) => card.eventCount > 0).length;
  const latestAt = getSourceCardLatestAt(sourceCards);

  return [
    {
      detail: `${officialCount.toLocaleString('ko-KR')}개 공식 · ${Math.max(0, sources.length - officialCount).toLocaleString('ko-KR')}개 서드파티`,
      icon: Database,
      label: '등록 소스',
      value: isLoading ? '...' : sources.length.toLocaleString('ko-KR'),
    },
    {
      detail: 'Worker 수집 대상 기준',
      icon: Activity,
      label: '활성 소스',
      value: isLoading ? '...' : enabledCount.toLocaleString('ko-KR'),
    },
    {
      detail: `영웅 ${heroSourceCount.toLocaleString('ko-KR')} · 일정 ${eventSourceCount.toLocaleString('ko-KR')}`,
      icon: Layers3,
      label: '제공 데이터',
      value: isLoading ? '...' : (heroSourceCount + eventSourceCount).toLocaleString('ko-KR'),
    },
    {
      detail: latestAt ? formatExternalDateTime(latestAt) : '수집 대기',
      icon: Clock3,
      label: '최근 수집',
      value: isLoading ? '...' : getExternalFreshnessLabel(latestAt),
    },
  ];
};

const ExternalSourcesBriefing = ({
  isLoading,
  sourceCards,
  sources,
}: {
  isLoading: boolean;
  sourceCards: ExternalSourceCardModel[];
  sources: ExternalSource[];
}) => {
  const officialCount = sources.filter((source) => source.isOfficial).length;
  const thirdPartyCount = Math.max(0, sources.length - officialCount);
  const typeSummaries = Object.entries(
    sources.reduce(
      (map, source) => ({
        ...map,
        [source.sourceType]: (map[source.sourceType] ?? 0) + 1,
      }),
      {} as Partial<Record<ExternalSourceType, number>>,
    ),
  ) as Array<[ExternalSourceType, number]>;

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="grid gap-px bg-border/60 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">소스 레지스트리</p>
              <h2 className="mt-1 text-xl font-black">신뢰도, TTL, 제공 데이터 분리</h2>
            </div>
            <Badge variant="outline" className="gap-1.5 bg-transparent">
              <ShieldCheck className="h-3.5 w-3.5" />
              공식 {officialCount.toLocaleString('ko-KR')}
            </Badge>
          </div>

          {isLoading && sourceCards.length === 0 ? (
            <div className="mt-5 grid gap-3">
              <SkeletonBlock className="h-14" />
              <SkeletonBlock className="h-14" />
            </div>
          ) : (
            <div className="mt-5 grid overflow-hidden rounded-md border border-border/70 bg-border/60 sm:grid-cols-3">
              <ExternalBriefMetric
                label="공식"
                value={officialCount.toLocaleString('ko-KR')}
                detail="공식 API/웹"
              />
              <ExternalBriefMetric
                label="서드파티"
                value={thirdPartyCount.toLocaleString('ko-KR')}
                detail="보강 API/웹"
              />
              <ExternalBriefMetric
                label="수집됨"
                value={sourceCards.filter((card) => card.latestAt).length.toLocaleString('ko-KR')}
                detail="최근 수집 기록"
              />
            </div>
          )}
        </div>
        <div className="bg-[hsl(var(--surface-2))] px-4 py-4 sm:px-5">
          <p className="metric-label">타입 분포</p>
          <div className="mt-3 grid gap-2">
            {typeSummaries.length > 0 ? (
              typeSummaries.map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="text-sm font-bold text-muted-foreground">
                    {getExternalSourceTypeLabel(type)}
                  </span>
                  <span className="text-sm font-black">{count.toLocaleString('ko-KR')}</span>
                </div>
              ))
            ) : (
              <InlineEmptyState
                title="소스 타입이 없습니다."
                description="소스 목록이 수집되면 타입 분포가 표시됩니다."
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const ExternalSourceRegistry = ({
  isLoading,
  sourceCards,
}: {
  isLoading: boolean;
  sourceCards: ExternalSourceCardModel[];
}) => (
  <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <p className="metric-label">Registry</p>
      <h2 className="mt-1 text-lg font-bold">소스별 제공 데이터</h2>
    </div>
    <div className="hidden grid-cols-[minmax(220px,1.2fr)_140px_minmax(180px,0.9fr)_130px_90px] gap-3 border-b border-border/60 bg-[hsl(var(--surface-2))] px-4 py-2 text-xs font-bold text-muted-foreground lg:grid">
      <span>소스</span>
      <span>타입</span>
      <span>제공 데이터</span>
      <span>최근 수집</span>
      <span>TTL</span>
    </div>
    {isLoading && sourceCards.length === 0 ? (
      <div className="grid gap-0">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="border-b border-border/60 px-4 py-4 last:border-b-0">
            <SkeletonBlock className="h-5 w-44" />
            <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
          </div>
        ))}
      </div>
    ) : sourceCards.length > 0 ? (
      <div>
        {sourceCards.map((card) => (
          <ExternalSourceRegistryRow key={card.source.id} card={card} />
        ))}
      </div>
    ) : (
      <InlineEmptyState
        className="m-4"
        title="표시할 데이터 소스가 없습니다."
        description="소스 목록이 수집되면 레지스트리가 표시됩니다."
      />
    )}
  </section>
);

const ExternalSourceRegistryRow = ({ card }: { card: ExternalSourceCardModel }) => {
  const { source } = card;
  const dataKindLabels = getExternalSourceDataKindLabels(card);

  return (
    <article className="grid gap-3 border-b border-border/60 px-4 py-4 transition-colors last:border-b-0 hover:bg-[hsl(var(--surface-2))] lg:grid-cols-[minmax(220px,1.2fr)_140px_minmax(180px,0.9fr)_130px_90px] lg:items-center">
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
        <h3 className="mt-2 truncate text-base font-black">{source.displayName}</h3>
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {source.notes || source.baseUrl || source.id}
        </p>
      </div>
      <div className="text-sm font-bold text-muted-foreground">
        {getExternalSourceTypeLabel(source.sourceType)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {dataKindLabels.map((label) => (
          <Badge key={label} variant="outline" className="bg-[hsl(var(--surface-2))]">
            {label}
          </Badge>
        ))}
      </div>
      <div className="text-sm font-bold">
        {card.latestAt ? getExternalFreshnessLabel(card.latestAt) : '대기'}
      </div>
      <div className="text-sm font-bold text-muted-foreground">
        {formatExternalTtl(source.defaultTtlSeconds)}
      </div>
    </article>
  );
};

export { ExternalDataPage };
