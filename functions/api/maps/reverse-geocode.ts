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

interface GooglePlace {
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  googleMapsUri?: string;
  id?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
}

interface GoogleNearbySearchResponse {
  places?: GooglePlace[];
}

interface GoogleApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

type ReverseGeocodeResult = {
  address: string;
  googleMapsUrl: string;
  placeId: string | null;
  shortLabel: string;
  source: 'coordinates' | 'google_geocoding' | 'google_places';
};

const reverseLookupTypes = [
  'airport',
  'atm',
  'cafe',
  'convenience_store',
  'hotel',
  'pharmacy',
  'restaurant',
  'shopping_mall',
  'store',
  'subway_station',
  'tourist_attraction',
  'train_station',
  'transit_station',
];

const placesFieldMask = [
  'places.displayName',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.id',
  'places.location',
].join(',');

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

const createCoordinateQuery = (latitude: number, longitude: number) => `${latitude},${longitude}`;

const createGoogleMapsCoordinateUrl = (latitude: number, longitude: number) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    createCoordinateQuery(latitude, longitude),
  )}`;

const createCoordinateFallback = (latitude: number, longitude: number): ReverseGeocodeResult => ({
  address: createCoordinateQuery(latitude, longitude),
  googleMapsUrl: createGoogleMapsCoordinateUrl(latitude, longitude),
  placeId: null,
  shortLabel: '좌표 기준 위치',
  source: 'coordinates',
});

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

const readJsonResponse = async <T>(response: Response) => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const parseGoogleApiError = async (response: Response) => {
  const data = await readJsonResponse<GoogleApiErrorResponse>(response);

  return data?.error?.message ?? response.statusText;
};

const resolveWithGeocoding = async (
  apiKey: string,
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult | null> => {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'ko');
  url.searchParams.set('latlng', createCoordinateQuery(latitude, longitude));

  const response = await fetch(url.toString());
  const data = await readJsonResponse<GoogleGeocodeResponse>(response);

  if (!response.ok || data?.status !== 'OK') {
    return null;
  }

  const result = data.results?.[0];

  if (!result) {
    return null;
  }

  return {
    address: result.formatted_address ?? '',
    googleMapsUrl: createGoogleMapsCoordinateUrl(latitude, longitude),
    placeId: result.place_id ?? null,
    shortLabel: createShortLabel(result),
    source: 'google_geocoding',
  };
};

const getDistanceMeters = (
  origin: { latitude: number; longitude: number },
  destination?: { latitude?: number; longitude?: number },
) => {
  if (typeof destination?.latitude !== 'number' || typeof destination.longitude !== 'number') {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusMeters = 6_371_000;
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  const deltaLatitude = toRadians(destination.latitude - origin.latitude);
  const deltaLongitude = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return Math.round(
    earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
};

const resolveWithNearbyPlace = async (
  apiKey: string,
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult | null> => {
  const origin = { latitude, longitude };
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    body: JSON.stringify({
      includedTypes: reverseLookupTypes,
      languageCode: 'ko',
      locationRestriction: {
        circle: {
          center: origin,
          radius: 500,
        },
      },
      maxResultCount: 5,
      rankPreference: 'DISTANCE',
      regionCode: 'JP',
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': placesFieldMask,
    },
    method: 'POST',
  });

  if (!response.ok) {
    await parseGoogleApiError(response);
    return null;
  }

  const data = await readJsonResponse<GoogleNearbySearchResponse>(response);
  const place = (data?.places ?? [])
    .filter((item) => item.displayName?.text || item.formattedAddress)
    .sort(
      (left, right) =>
        getDistanceMeters(origin, left.location) - getDistanceMeters(origin, right.location),
    )[0];

  if (!place) {
    return null;
  }

  const placeName = place.displayName?.text ?? null;
  const address = place.formattedAddress ?? createCoordinateQuery(latitude, longitude);

  return {
    address,
    googleMapsUrl: place.googleMapsUri ?? createGoogleMapsCoordinateUrl(latitude, longitude),
    placeId: place.id ?? null,
    shortLabel: placeName ?? address,
    source: 'google_places',
  };
};

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GoogleMapsEnv>) => {
  try {
    const body = await readJsonBody<ReverseGeocodeRequest>(request);
    const latitude = toFiniteNumber(body.latitude);
    const longitude = toFiniteNumber(body.longitude);

    if (latitude === null || longitude === null) {
      return createJsonResponse({ error: 'latitude and longitude are required.' }, { status: 400 });
    }

    const geocodingResult = await resolveWithGeocoding(
      env.GOOGLE_MAPS_SERVER_KEY,
      latitude,
      longitude,
    ).catch(() => null);
    const nearbyPlaceResult =
      geocodingResult ??
      (await resolveWithNearbyPlace(env.GOOGLE_MAPS_SERVER_KEY, latitude, longitude).catch(
        () => null,
      ));
    const result = nearbyPlaceResult ?? createCoordinateFallback(latitude, longitude);

    return createJsonResponse(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return createJsonResponse({ error: 'Unexpected API error.' }, { status: 500 });
  }
};
