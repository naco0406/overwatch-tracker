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

const fetchExternalJson = async <TResponse>(path: string): Promise<TResponse> => {
  const baseUrl = getExternalDataApiBaseUrl();

  if (!baseUrl) {
    throw new ExternalDataApiError('외부 데이터 API 주소가 설정되지 않았습니다.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
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

const getExternalDataOverview = async (): Promise<ExternalDataOverview> => {
  const sources = await listExternalSources();
  const [heroRatesResult, esportsEventsResult] = await Promise.all([
    optionalExternalFetch<GlobalHeroRateSnapshot[]>(
      '/external/global-hero-rates',
      '영웅 메타',
      [],
      (body) => {
        const response = body as GlobalHeroRatesResponse;

        return Array.isArray(response.heroRates) ? response.heroRates : [];
      },
    ),
    optionalExternalFetch<ExternalEsportsEvent[]>(
      '/external/esports-events',
      'e스포츠',
      [],
      (body) => {
        const response = body as ExternalEsportsEventsResponse;

        return Array.isArray(response.esportsEvents) ? response.esportsEvents : [];
      },
    ),
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

export {
  ExternalDataApiError,
  getExternalDataApiBaseUrl,
  getExternalDataOverview,
  isExternalDataApiConfigured,
  listExternalSources,
};
