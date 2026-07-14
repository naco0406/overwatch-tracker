import type {
  ExternalDataOverview,
  ExternalDataWarning,
  ExternalEsportsEvent,
  ExternalSource,
  GlobalHeroRateSnapshot,
} from '@/types/externalData';

interface ExternalSourcesResponse {
  sources?: ExternalSource[];
}

interface GlobalHeroRatesResponse {
  heroRates?: GlobalHeroRateSnapshot[];
}

interface ExternalEsportsEventsResponse {
  esportsEvents?: ExternalEsportsEvent[];
}

export type ExternalCollectTarget =
  | 'all'
  | 'esports-events'
  | 'global-hero-rates'
  | 'official-esports-events'
  | 'owtics-esports-events';

export interface ExternalCollectRequest {
  assetLimit?: number;
  detailLimit?: number;
  detailOffset?: number;
  heroInput?: string;
  heroMap?: string;
  heroRegion?: string;
  heroRole?: string;
  heroRq?: string;
  heroTier?: string;
  target?: ExternalCollectTarget;
}

export interface ExternalHeroRatesRequest {
  from?: string;
  gamemode?: string;
  heroId?: string;
  inputMethod?: string;
  limit?: number;
  mapId?: string;
  region?: string;
  role?: string;
  sourceId?: string;
  tier?: string;
  to?: string;
}

export interface ExternalCollectResponse {
  ok: boolean;
  results: Array<{
    error?: string;
    finishedAt?: string;
    insertedCount?: number;
    jobKey?: string;
    metadata?: Record<string, unknown>;
    sourceId?: string;
    startedAt?: string;
    status?: string;
  }>;
  summary?: {
    failed: number;
    inserted: number;
    jobs: number;
  };
}

class ExternalDataApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ExternalDataApiError';
    this.status = status;
  }
}

const getExternalDataApiBaseUrl = () =>
  import.meta.env.VITE_EXTERNAL_DATA_API_URL?.replace(/\/+$/, '') ?? '';

const isExternalDataApiConfigured = () => getExternalDataApiBaseUrl().length > 0;

const getResponseErrorMessage = (body: unknown, fallback: string) => {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: unknown }).error;

    if (typeof error === 'string' && error.trim()) {
      return error;
    }
  }

  return fallback;
};

const fetchExternalJson = async <TResponse>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> => {
  const baseUrl = getExternalDataApiBaseUrl();

  if (!baseUrl) {
    throw new ExternalDataApiError('외부 데이터 API 주소가 설정되지 않았습니다.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new ExternalDataApiError(
      getResponseErrorMessage(body, '외부 데이터를 불러오지 못했습니다.'),
      response.status,
    );
  }

  return body as TResponse;
};

const optionalExternalFetch = async <TData>(
  endpoint: string,
  label: string,
  fallback: TData,
  select: (body: unknown) => TData,
): Promise<{ data: TData; warning: ExternalDataWarning | null }> => {
  try {
    const body = await fetchExternalJson<unknown>(endpoint);

    return {
      data: select(body),
      warning: null,
    };
  } catch (error) {
    const isPendingWorkerRoute = error instanceof ExternalDataApiError && error.status === 501;

    return {
      data: fallback,
      warning: {
        endpoint,
        message: isPendingWorkerRoute
          ? `${label} 조회 기능이 아직 배포된 Worker에 반영되지 않았습니다.`
          : error instanceof Error
            ? error.message
            : `${label} 데이터를 불러오지 못했습니다.`,
        status: error instanceof ExternalDataApiError ? error.status : undefined,
      },
    };
  }
};

const listExternalSources = async () => {
  const body = await fetchExternalJson<ExternalSourcesResponse>('/external/sources');

  return Array.isArray(body.sources) ? body.sources : [];
};

const getEsportsEventsPath = () => {
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  return `/external/esports-events?from=${encodeURIComponent(from)}&limit=800`;
};

const getHeroRatesPath = () => {
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    from,
    limit: '20000',
  });

  return `/external/global-hero-rates?${params.toString()}`;
};

const getExternalHeroRatesPath = ({
  from,
  gamemode,
  heroId,
  inputMethod,
  limit = 20000,
  mapId,
  region,
  role,
  sourceId,
  tier,
  to,
}: ExternalHeroRatesRequest = {}) => {
  const params = new URLSearchParams({
    from: from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    limit: String(limit),
  });

  const appendParam = (key: string, value?: string) => {
    if (typeof value === 'string' && value.trim()) {
      params.set(key, value);
    }
  };

  appendParam('gamemode', gamemode);
  appendParam('heroId', heroId);
  appendParam('inputMethod', inputMethod);
  appendParam('mapId', mapId);
  appendParam('region', region);
  appendParam('role', role);
  appendParam('sourceId', sourceId);
  appendParam('tier', tier);
  appendParam('to', to);

  return `/external/global-hero-rates?${params.toString()}`;
};

const getExternalHeroRates = async (
  request: ExternalHeroRatesRequest = {},
): Promise<GlobalHeroRateSnapshot[]> => {
  const body = await fetchExternalJson<GlobalHeroRatesResponse>(getExternalHeroRatesPath(request));

  return Array.isArray(body.heroRates) ? body.heroRates : [];
};

const getExternalDataOverview = async (): Promise<ExternalDataOverview> => {
  const sources = await listExternalSources();
  const [heroRatesResult, esportsEventsResult] = await Promise.all([
    optionalExternalFetch<GlobalHeroRateSnapshot[]>(getHeroRatesPath(), '영웅 메타', [], (body) => {
      const response = body as GlobalHeroRatesResponse;

      return Array.isArray(response.heroRates) ? response.heroRates : [];
    }),
    optionalExternalFetch<ExternalEsportsEvent[]>(getEsportsEventsPath(), 'e스포츠', [], (body) => {
      const response = body as ExternalEsportsEventsResponse;

      return Array.isArray(response.esportsEvents) ? response.esportsEvents : [];
    }),
  ]);

  return {
    esportsEvents: esportsEventsResult.data,
    heroRates: heroRatesResult.data,
    sources,
    warnings: [heroRatesResult.warning, esportsEventsResult.warning].filter(
      (warning): warning is ExternalDataWarning => warning !== null,
    ),
  };
};

const collectExternalData = async ({
  assetLimit,
  detailLimit,
  detailOffset,
  heroInput,
  heroMap,
  heroRegion,
  heroRole,
  heroRq,
  heroTier,
  target = 'all',
}: ExternalCollectRequest = {}): Promise<ExternalCollectResponse> => {
  const params = new URLSearchParams({
    trigger: 'ui',
  });

  if (typeof detailLimit === 'number') {
    params.set('detailLimit', String(detailLimit));
  }

  if (typeof detailOffset === 'number') {
    params.set('detailOffset', String(detailOffset));
  }

  if (typeof assetLimit === 'number') {
    params.set('assetLimit', String(assetLimit));
  }

  if (typeof heroInput === 'string' && heroInput.trim()) {
    params.set('heroInput', heroInput);
  }

  if (typeof heroMap === 'string' && heroMap.trim()) {
    params.set('heroMap', heroMap);
  }

  if (typeof heroRegion === 'string' && heroRegion.trim()) {
    params.set('heroRegion', heroRegion);
  }

  if (typeof heroRole === 'string' && heroRole.trim()) {
    params.set('heroRole', heroRole);
  }

  if (typeof heroRq === 'string' && heroRq.trim()) {
    params.set('heroRq', heroRq);
  }

  if (typeof heroTier === 'string' && heroTier.trim()) {
    params.set('heroTier', heroTier);
  }

  return fetchExternalJson<ExternalCollectResponse>(`/external/collect/${target}?${params}`, {
    method: 'POST',
  });
};

export {
  collectExternalData,
  ExternalDataApiError,
  getExternalDataApiBaseUrl,
  getExternalDataOverview,
  getExternalHeroRates,
  isExternalDataApiConfigured,
  listExternalSources,
};
