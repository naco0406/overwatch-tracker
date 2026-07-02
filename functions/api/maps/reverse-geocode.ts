interface PagesFunctionContext<Env> {
  env: Env;
  request: Request;
}

interface GoogleMapsEnv {
  GOOGLE_MAPS_SERVER_KEY: string;
}

interface ReverseGeocodeRequest {
  latitude?: unknown;
  longitude?: unknown;
}

interface GoogleGeocodeComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

interface GoogleGeocodeResult {
  address_components?: GoogleGeocodeComponent[];
  formatted_address?: string;
  place_id?: string;
  types?: string[];
}

interface GoogleGeocodeResponse {
  error_message?: string;
  results?: GoogleGeocodeResult[];
  status?: string;
}

const createJsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  });

const readJsonBody = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Response('Invalid JSON body.', { status: 400 });
  }
};

const toFiniteNumber = (value: unknown) => {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
};

const getComponentName = (components: GoogleGeocodeComponent[] | undefined, type: string) =>
  components?.find((component) => component.types?.includes(type))?.long_name ?? null;

const createShortLabel = (result: GoogleGeocodeResult) => {
  const components = result.address_components;
  const ward =
    getComponentName(components, 'sublocality_level_1') ??
    getComponentName(components, 'locality') ??
    getComponentName(components, 'administrative_area_level_2');
  const area =
    getComponentName(components, 'sublocality_level_2') ??
    getComponentName(components, 'neighborhood') ??
    getComponentName(components, 'route');

  return [ward, area].filter(Boolean).join(' · ') || result.formatted_address || '현재 위치';
};

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GoogleMapsEnv>) => {
  try {
    const body = await readJsonBody<ReverseGeocodeRequest>(request);
    const latitude = toFiniteNumber(body.latitude);
    const longitude = toFiniteNumber(body.longitude);

    if (latitude === null || longitude === null) {
      return createJsonResponse({ error: 'latitude and longitude are required.' }, { status: 400 });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('key', env.GOOGLE_MAPS_SERVER_KEY);
    url.searchParams.set('language', 'ko');
    url.searchParams.set('latlng', `${latitude},${longitude}`);

    const response = await fetch(url.toString());
    const data = (await response.json()) as GoogleGeocodeResponse;

    if (!response.ok || data.status !== 'OK') {
      return createJsonResponse(
        {
          error: 'Google Geocoding API request failed.',
          upstreamMessage: data.error_message ?? data.status ?? response.statusText,
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const result = data.results?.[0];

    if (!result) {
      return createJsonResponse({ error: 'Address was not found.' }, { status: 404 });
    }

    return createJsonResponse({
      address: result.formatted_address ?? '',
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${latitude},${longitude}`,
      )}`,
      placeId: result.place_id ?? null,
      shortLabel: createShortLabel(result),
      source: 'google_geocoding',
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return createJsonResponse({ error: 'Unexpected API error.' }, { status: 500 });
  }
};
