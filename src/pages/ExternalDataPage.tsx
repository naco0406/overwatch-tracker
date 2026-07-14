import {
  BarChart3,
  CalendarDays,
  Database,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Swords,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    description: '블리자드 공식 통계로 현재 영웅 픽률, 벤률, 승률을 비교합니다.',
    eyebrow: '영웅 메타',
    label: '영웅 메타',
    title: '영웅 메타',
    value: 'heroes',
  },
  {
    description: '관심 있는 팀과 지역의 오버워치 e스포츠 일정을 한눈에 확인합니다.',
    eyebrow: '오버워치 e스포츠',
    label: 'e스포츠',
    title: 'e스포츠',
    value: 'esports',
  },
  {
    description: '통계가 어디에서 왔고 언제 갱신되었는지 확인합니다.',
    eyebrow: '데이터 안내',
    label: '데이터 안내',
    title: '데이터 안내',
    value: 'sources',
  },
] as const;

type ExternalDataSection = (typeof externalDataSections)[number]['value'];

const externalSourceTypeLabels = {
  official_api: '블리자드 공식',
  official_web: '공식 웹',
  third_party_api: '커뮤니티 데이터',
  third_party_web: '커뮤니티 웹',
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
        ? `${officialSourceCount}개 공식 · ${Math.max(0, sources.length - officialSourceCount)}개 보조 출처`
        : '연결 정보 없음',
      icon: Globe2,
      label: '데이터 출처',
      value: isConfigured ? (isLoading ? '...' : sources.length.toLocaleString('ko-KR')) : '--',
    },
    {
      detail: sources.length > 0 ? '현재 제공 중' : '확인 중',
      icon: ShieldCheck,
      label: '공식 출처',
      value: isConfigured
        ? isLoading
          ? '...'
          : officialSourceCount.toLocaleString('ko-KR')
        : '--',
    },
    {
      detail: latestHeroRateFetchedAt
        ? `${formatExternalDateTime(latestHeroRateFetchedAt)} 업데이트`
        : '업데이트 전',
      icon: BarChart3,
      label: '영웅 메타',
      value: isConfigured ? (isLoading ? '...' : heroRates.length.toLocaleString('ko-KR')) : '--',
    },
    {
      detail: latestEsportsFetchedAt
        ? `${formatExternalDateTime(latestEsportsFetchedAt)} 업데이트`
        : '업데이트 전',
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
    return '업데이트 전';
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
    detailTotal > 0 ? ` · 경기 상세 ${summary.detailFetched.toLocaleString('ko-KR')}개` : '';
  const assetTotal = summary.assetUploaded + summary.assetHit + summary.assetFailed;
  const assetLabel =
    assetTotal > 0 ? ` · 팀 로고 ${summary.assetUploaded.toLocaleString('ko-KR')}개 반영` : '';
  const failedLabel =
    summary.failed > 0 ? ` · 실패 ${summary.failed.toLocaleString('ko-KR')}건` : '';

  return `${summary.inserted.toLocaleString('ko-KR')}개 반영${detailLabel}${assetLabel}${failedLabel}`;
};

const ExternalDataPage = () => {
  const { section } = useParams();
  const activeSection = isExternalDataSection(section) ? section : 'heroes';
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
    return <Navigate to="/external-data/heroes" replace />;
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
        await runStep({ target: 'global-hero-rates' }, '영웅 메타 업데이트');
      }

      if (activeSection === 'sources' || activeSection === 'esports') {
        await runStep({ target: 'official-esports-events' }, '공식 일정 업데이트');
        await runOwticsDetailBatches();
      }

      const summary = summarizeExternalCollectionResponses(responses);

      toast({
        title: summary.ok ? '데이터를 업데이트했어요' : '일부 데이터를 업데이트하지 못했어요',
        description: formatExternalCollectionSummary(summary),
        variant: summary.ok ? 'default' : 'destructive',
      });
      void refetch();
    } catch (collectError) {
      toast({
        title: '데이터를 업데이트하지 못했어요',
        description:
          collectError instanceof Error ? collectError.message : '잠시 후 다시 시도해주세요.',
        variant: 'destructive',
      });
    } finally {
      setCollectionProgressLabel(null);
    }
  };

  return (
    <div className="page-stack">
      {activeSection !== 'heroes' ? (
        <PageHeader
          eyebrow={activeSectionMeta.eyebrow}
          title={activeSectionMeta.title}
          description={activeSectionMeta.description}
          actions={
            <div className="flex flex-wrap gap-2">
              {activeSection === 'sources' ? (
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
                  {collectionProgressLabel ?? '전체 업데이트'}
                </Button>
              ) : null}
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
      ) : null}

      {!isConfigured ? (
        <div className="space-y-4">
          <MetricGrid metrics={fallbackMetrics} />
          <EmptyState
            icon={Database}
            title="영웅 메타를 준비하지 못했어요."
            description="잠시 후 다시 시도해주세요. 문제가 계속되면 데이터 안내를 확인하세요."
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
          title="데이터를 불러오지 못했어요."
          description="잠시 후 다시 시도해주세요."
        />
      ) : (
        <ExternalDataSectionBody
          activeSection={activeSection}
          esportsEvents={esportsEvents}
          heroRates={heroRates}
          isLoading={isLoading}
          onCollected={() => void refetch()}
          sourceCards={sourceCards}
          sources={sources}
          warnings={warnings}
        />
      )}
    </div>
  );
};

const ExternalDataSectionBody = ({
  activeSection,
  esportsEvents,
  heroRates,
  isLoading,
  onCollected,
  sourceCards,
  sources,
  warnings,
}: {
  activeSection: ExternalDataSection;
  esportsEvents: ExternalDataOverview['esportsEvents'];
  heroRates: ExternalDataOverview['heroRates'];
  isLoading: boolean;
  onCollected: () => void;
  sourceCards: ExternalSourceCardModel[];
  sources: ExternalSource[];
  warnings: NonNullable<ExternalDataOverview['warnings']>;
}) => {
  if (activeSection === 'esports') {
    return (
      <ExternalEsportsDetailPage
        esportsEvents={esportsEvents}
        isLoading={isLoading}
        warnings={warnings}
      />
    );
  }

  if (activeSection === 'heroes') {
    return (
      <ExternalHeroesDetailPage
        heroRates={heroRates}
        isLoading={isLoading}
        onCollected={onCollected}
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
  warnings,
}: {
  esportsEvents: ExternalEsportsEventItem[];
  isLoading: boolean;
  warnings: NonNullable<ExternalDataOverview['warnings']>;
}) => {
  const [referenceTime] = useState(() => Date.now());

  return (
    <div className="space-y-4">
      <ExternalEsportsSchedulePanel esportsEvents={esportsEvents} isLoading={isLoading} />
      <ExternalEsportsBriefing
        esportsEvents={esportsEvents}
        isLoading={isLoading}
        referenceTime={referenceTime}
      />
      {warnings.length > 0 ? <ExternalDataWarningsPanel warnings={warnings} /> : null}
    </div>
  );
};

const ExternalEsportsBriefing = ({
  esportsEvents,
  isLoading,
  referenceTime,
}: {
  esportsEvents: ExternalEsportsEventItem[];
  isLoading: boolean;
  referenceTime: number;
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

  return (
    <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
      <div className="grid gap-px bg-border/60 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">일정 요약</p>
              <h2 className="mt-1 text-xl font-black">오늘과 가까운 경기 흐름</h2>
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
          <p className="metric-label">지역별 일정</p>
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
                description="일정이 준비되면 지역별 경기 분포가 표시됩니다."
              />
            )}
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
  onCollected,
  sources,
  warnings,
}: {
  heroRates: ExternalHeroRateItem[];
  isLoading: boolean;
  onCollected: () => void;
  sources: ExternalSource[];
  warnings: NonNullable<ExternalDataOverview['warnings']>;
}) => {
  return (
    <div className="space-y-4">
      <ExternalHeroMetaPanel
        heroRates={heroRates}
        isLoading={isLoading}
        onCollected={onCollected}
        sources={sources}
      />
      {warnings.length > 0 ? <ExternalDataWarningsPanel warnings={warnings} /> : null}
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
  return (
    <div className="space-y-4">
      <ExternalSourcesBriefing isLoading={isLoading} sourceCards={sourceCards} sources={sources} />
      {warnings.length > 0 ? <ExternalDataWarningsPanel warnings={warnings} /> : null}
      <ExternalSourceRegistry isLoading={isLoading} sourceCards={sourceCards} />
    </div>
  );
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
    <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
      <div className="grid gap-px bg-border/60 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">데이터 신뢰도</p>
              <h2 className="mt-1 text-xl font-black">출처와 업데이트 상태</h2>
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
                detail="블리자드 제공"
              />
              <ExternalBriefMetric
                label="보조 출처"
                value={thirdPartyCount.toLocaleString('ko-KR')}
                detail="커뮤니티 데이터"
              />
              <ExternalBriefMetric
                label="업데이트됨"
                value={sourceCards.filter((card) => card.latestAt).length.toLocaleString('ko-KR')}
                detail="최근 반영 기준"
              />
            </div>
          )}
        </div>
        <div className="bg-[hsl(var(--surface-2))] px-4 py-4 sm:px-5">
          <p className="metric-label">출처 구성</p>
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
                title="확인할 출처가 없어요."
                description="데이터가 연결되면 출처 구성이 표시됩니다."
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
  <section className="ow-panel-cap overflow-hidden rounded-[3px] border border-border bg-card">
    <div className="border-b border-border/60 px-4 py-3 sm:px-5">
      <p className="metric-label">출처 상세</p>
      <h2 className="mt-1 text-lg font-bold">어디에서 어떤 데이터를 가져오나요?</h2>
    </div>
    <div className="hidden grid-cols-[minmax(220px,1.2fr)_140px_minmax(180px,0.9fr)_130px_90px] gap-3 border-b border-border/60 bg-[hsl(var(--surface-2))] px-4 py-2 text-xs font-bold text-muted-foreground lg:grid">
      <span>출처</span>
      <span>구분</span>
      <span>제공 데이터</span>
      <span>최근 업데이트</span>
      <span>업데이트 간격</span>
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
        title="표시할 데이터 출처가 없어요."
        description="데이터가 연결되면 출처 정보가 표시됩니다."
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
            {source.isOfficial ? '공식' : '보조 출처'}
          </Badge>
          <Badge variant="outline" className="bg-transparent text-[11px]">
            {card.statusLabel}
          </Badge>
        </div>
        <h3 className="mt-2 truncate text-base font-black">{source.displayName}</h3>
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {source.isOfficial ? '공식 제공 데이터' : '통계와 일정을 보완하는 데이터'}
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
