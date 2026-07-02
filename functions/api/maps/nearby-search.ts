interface PagesFunctionContext<Env> {
  env: Env;
  request: Request;
}

interface GoogleMapsEnv {
  GOOGLE_MAPS_SERVER_KEY: string;
}

interface NearbySearchRequest {
  category?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  radiusMeters?: unknown;
}

interface GooglePlace {
  currentOpeningHours?: {
    openNow?: boolean;
  };
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
  primaryType?: string;
  rating?: number;
  types?: string[];
  userRatingCount?: number;
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

const nearbyCategoryConfigs = {
  atm: {
    includedTypes: ['atm'],
    label: 'ATM',
  },
  cafe: {
    includedTypes: ['cafe'],
    label: '카페',
  },
  convenience_store: {
    includedTypes: ['convenience_store'],
    label: '편의점',
  },
  pharmacy: {
    includedTypes: ['pharmacy'],
    label: '약국',
  },
  station: {
    includedTypes: ['train_station', 'subway_station', 'transit_station'],
    label: '역',
  },
} as const;

type NearbyCategory = keyof typeof nearbyCategoryConfigs;

const fieldMask = [
  'places.currentOpeningHours',
  'places.displayName',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.id',
  'places.location',
  'places.primaryType',
  'places.rating',
  'places.types',
  'places.userRatingCount',
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

const parseGoogleError = async (response: Response) => {
  const text = await response.text();

  try {
    const data = JSON.parse(text) as GoogleApiErrorResponse;

    return data.error?.message ?? text;
  } catch {
    return text;
  }
};

const toFiniteNumber = (value: unknown) => {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
};

const getRadiusMeters = (value: unknown) => {
  const radius = toFiniteNumber(value);

  if (!radius) {
    return 900;
  }

  return Math.min(Math.max(Math.round(radius), 100), 3_000);
};

const getDistanceMeters = (
  origin: { latitude: number; longitude: number },
  destination?: { latitude?: number; longitude?: number },
) => {
  if (typeof destination?.latitude !== 'number' || typeof destination.longitude !== 'number') {
    return null;
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

const normalizePlace = (place: GooglePlace, origin: { latitude: number; longitude: number }) => {
  const name = place.displayName?.text ?? '이름 없는 장소';
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  const googleMapsUrl =
    place.googleMapsUri ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${name} ${place.formattedAddress ?? ''}`.trim(),
    )}`;

  return {
    address: place.formattedAddress ?? '',
    distanceMeters: getDistanceMeters(origin, place.location),
    googleMapsUrl,
    id: place.id ?? googleMapsUrl,
    isOpenNow: place.currentOpeningHours?.openNow ?? null,
    location:
      typeof latitude === 'number' && typeof longitude === 'number'
        ? { latitude, longitude }
        : null,
    name,
    primaryType: place.primaryType ?? place.types?.[0] ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
  };
};

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GoogleMapsEnv>) => {
  try {
    const body = await readJsonBody<NearbySearchRequest>(request);
    const category = String(body.category ?? '') as NearbyCategory;
    const config = nearbyCategoryConfigs[category];
    const latitude = toFiniteNumber(body.latitude);
    const longitude = toFiniteNumber(body.longitude);

    if (!config) {
      return createJsonResponse({ error: 'Unsupported nearby category.' }, { status: 400 });
    }

    if (latitude === null || longitude === null) {
      return createJsonResponse({ error: 'latitude and longitude are required.' }, { status: 400 });
    }

    const origin = { latitude, longitude };
    const radiusMeters = getRadiusMeters(body.radiusMeters);
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      body: JSON.stringify({
        includedTypes: config.includedTypes,
        languageCode: 'ko',
        locationRestriction: {
          circle: {
            center: origin,
            radius: radiusMeters,
          },
        },
        maxResultCount: 8,
        rankPreference: 'DISTANCE',
        regionCode: 'JP',
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      method: 'POST',
    });

    if (!response.ok) {
      return createJsonResponse(
        {
          error: 'Google Places API request failed.',
          upstreamMessage: await parseGoogleError(response),
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const data = (await response.json()) as GoogleNearbySearchResponse;
    const places = (data.places ?? [])
      .map((place) => normalizePlace(place, origin))
      .sort(
        (left, right) => (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity),
      );

    return createJsonResponse({
      category,
      label: config.label,
      places,
      radiusMeters,
      source: 'google_places',
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return createJsonResponse({ error: 'Unexpected API error.' }, { status: 500 });
  }
};
