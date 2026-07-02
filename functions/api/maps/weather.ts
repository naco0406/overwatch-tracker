interface PagesFunctionContext<Env> {
  env: Env;
  request: Request;
}

interface GoogleMapsEnv {
  GOOGLE_MAPS_SERVER_KEY: string;
}

interface WeatherRequest {
  days?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

interface GoogleApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GoogleWeatherValue {
  degrees?: number;
  unit?: string;
}

interface GoogleWeatherCondition {
  description?: {
    languageCode?: string;
    text?: string;
  };
  iconBaseUri?: string;
  type?: string;
}

interface GoogleCurrentWeatherResponse {
  cloudCover?: number;
  currentTime?: string;
  feelsLikeTemperature?: GoogleWeatherValue;
  isDaytime?: boolean;
  precipitation?: {
    probability?: {
      percent?: number;
      type?: string;
    };
    qpf?: {
      quantity?: number;
      unit?: string;
    };
  };
  relativeHumidity?: number;
  temperature?: GoogleWeatherValue;
  timeZone?: {
    id?: string;
  };
  uvIndex?: number;
  weatherCondition?: GoogleWeatherCondition;
  wind?: {
    gust?: {
      unit?: string;
      value?: number;
    };
    speed?: {
      unit?: string;
      value?: number;
    };
  };
}

interface GoogleForecastDay {
  daytimeForecast?: {
    precipitation?: {
      probability?: {
        percent?: number;
      };
    };
    uvIndex?: number;
    weatherCondition?: GoogleWeatherCondition;
    wind?: {
      speed?: {
        unit?: string;
        value?: number;
      };
    };
  };
  displayDate?: {
    day?: number;
    month?: number;
    year?: number;
  };
  interval?: {
    endTime?: string;
    startTime?: string;
  };
  maxTemperature?: GoogleWeatherValue;
  minTemperature?: GoogleWeatherValue;
}

interface GoogleDailyWeatherResponse {
  forecastDays?: GoogleForecastDay[];
  timeZone?: {
    id?: string;
  };
}

interface OpenMeteoResponse {
  current?: {
    apparent_temperature?: number;
    cloud_cover?: number;
    interval?: number;
    is_day?: number;
    precipitation?: number;
    relative_humidity_2m?: number;
    temperature_2m?: number;
    time?: string;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    precipitation_probability_max?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    time?: string[];
    uv_index_max?: Array<number | null>;
    weather_code?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
  };
  hourly?: {
    precipitation_probability?: Array<number | null>;
    time?: string[];
    uv_index?: Array<number | null>;
  };
  timezone?: string;
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

const getForecastDays = (value: unknown) => {
  const days = toFiniteNumber(value);

  if (!days) {
    return 3;
  }

  return Math.min(Math.max(Math.round(days), 1), 5);
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

const appendWeatherParams = (url: URL, key: string, latitude: number, longitude: number) => {
  url.searchParams.set('key', key);
  url.searchParams.set('location.latitude', String(latitude));
  url.searchParams.set('location.longitude', String(longitude));
  url.searchParams.set('languageCode', 'ko');
};

const requestGoogleWeather = async <T>(url: URL) => {
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Response(
      JSON.stringify({
        error: 'Google Weather API request failed.',
        upstreamMessage: await parseGoogleError(response),
        upstreamStatus: response.status,
      }),
      {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        status: 502,
      },
    );
  }

  return (await response.json()) as T;
};

const normalizeDate = (displayDate?: GoogleForecastDay['displayDate']) => {
  if (!displayDate?.year || !displayDate.month || !displayDate.day) {
    return null;
  }

  return `${displayDate.year}-${String(displayDate.month).padStart(2, '0')}-${String(
    displayDate.day,
  ).padStart(2, '0')}`;
};

const getOpenMeteoCondition = (code: number | null | undefined) => {
  if (code === null || code === undefined) {
    return {
      description: null,
      type: null,
    };
  }

  if (code === 0) {
    return { description: '맑음', type: 'CLEAR' };
  }

  if ([1, 2].includes(code)) {
    return { description: '구름 조금', type: 'PARTLY_CLOUDY' };
  }

  if (code === 3) {
    return { description: '흐림', type: 'CLOUDY' };
  }

  if ([45, 48].includes(code)) {
    return { description: '안개', type: 'FOG' };
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return { description: '이슬비', type: 'DRIZZLE' };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { description: '비', type: 'RAIN' };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { description: '눈', type: 'SNOW' };
  }

  if ([95, 96, 99].includes(code)) {
    return { description: '뇌우', type: 'THUNDERSTORM' };
  }

  return { description: '날씨 확인', type: `OPEN_METEO_${code}` };
};

const getArrayValue = <T>(items: T[] | undefined, index: number) => items?.[index] ?? null;

const getNearestHourlyIndex = (times: string[] | undefined, targetTime: string | undefined) => {
  if (!times?.length || !targetTime) {
    return 0;
  }

  const targetHour = targetTime.slice(0, 13);
  const exactIndex = times.findIndex((time) => time.slice(0, 13) === targetHour);

  return exactIndex >= 0 ? exactIndex : 0;
};

const requestOpenMeteoWeather = async (latitude: number, longitude: number, days: number) => {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'wind_speed_10m',
    ].join(','),
  );
  url.searchParams.set('hourly', ['precipitation_probability', 'uv_index'].join(','));
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'uv_index_max',
      'wind_speed_10m_max',
    ].join(','),
  );
  url.searchParams.set('forecast_days', String(days));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('precipitation_unit', 'mm');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Response(
      JSON.stringify({
        error: 'Open-Meteo weather request failed.',
        upstreamMessage: await response.text(),
        upstreamStatus: response.status,
      }),
      {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        status: 502,
      },
    );
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const hourlyIndex = getNearestHourlyIndex(data.hourly?.time, data.current?.time);
  const currentCondition = getOpenMeteoCondition(data.current?.weather_code);

  return {
    current: {
      cloudCover: data.current?.cloud_cover ?? null,
      condition: currentCondition.description,
      conditionType: currentCondition.type,
      currentTime: data.current?.time ?? null,
      feelsLikeCelsius: data.current?.apparent_temperature ?? null,
      humidity: data.current?.relative_humidity_2m ?? null,
      iconUrl: null,
      isDaytime: typeof data.current?.is_day === 'number' ? data.current.is_day === 1 : null,
      precipitationProbability: getArrayValue(data.hourly?.precipitation_probability, hourlyIndex),
      temperatureCelsius: data.current?.temperature_2m ?? null,
      uvIndex: getArrayValue(data.hourly?.uv_index, hourlyIndex),
      windKph: data.current?.wind_speed_10m ?? null,
    },
    forecastDays:
      data.daily?.time?.map((date, index) => {
        const condition = getOpenMeteoCondition(getArrayValue(data.daily?.weather_code, index));

        return {
          condition: condition.description,
          conditionType: condition.type,
          date,
          iconUrl: null,
          maxTemperatureCelsius: getArrayValue(data.daily?.temperature_2m_max, index),
          minTemperatureCelsius: getArrayValue(data.daily?.temperature_2m_min, index),
          precipitationProbability: getArrayValue(data.daily?.precipitation_probability_max, index),
          uvIndex: getArrayValue(data.daily?.uv_index_max, index),
          windKph: getArrayValue(data.daily?.wind_speed_10m_max, index),
        };
      }) ?? [],
    source: 'open_meteo',
    timeZone: data.timezone ?? null,
  };
};

const normalizeGoogleWeather = (
  current: GoogleCurrentWeatherResponse,
  forecast: GoogleDailyWeatherResponse,
) => ({
  current: {
    cloudCover: current.cloudCover ?? null,
    condition: current.weatherCondition?.description?.text ?? null,
    conditionType: current.weatherCondition?.type ?? null,
    currentTime: current.currentTime ?? null,
    feelsLikeCelsius: current.feelsLikeTemperature?.degrees ?? null,
    humidity: current.relativeHumidity ?? null,
    iconUrl: current.weatherCondition?.iconBaseUri
      ? `${current.weatherCondition.iconBaseUri}.png`
      : null,
    isDaytime: current.isDaytime ?? null,
    precipitationProbability: current.precipitation?.probability?.percent ?? null,
    temperatureCelsius: current.temperature?.degrees ?? null,
    uvIndex: current.uvIndex ?? null,
    windKph: current.wind?.speed?.value ?? null,
  },
  forecastDays:
    forecast.forecastDays?.map((day) => ({
      condition: day.daytimeForecast?.weatherCondition?.description?.text ?? null,
      conditionType: day.daytimeForecast?.weatherCondition?.type ?? null,
      date: normalizeDate(day.displayDate),
      iconUrl: day.daytimeForecast?.weatherCondition?.iconBaseUri
        ? `${day.daytimeForecast.weatherCondition.iconBaseUri}.png`
        : null,
      maxTemperatureCelsius: day.maxTemperature?.degrees ?? null,
      minTemperatureCelsius: day.minTemperature?.degrees ?? null,
      precipitationProbability: day.daytimeForecast?.precipitation?.probability?.percent ?? null,
      uvIndex: day.daytimeForecast?.uvIndex ?? null,
      windKph: day.daytimeForecast?.wind?.speed?.value ?? null,
    })) ?? [],
  source: 'google_weather',
  timeZone: current.timeZone?.id ?? forecast.timeZone?.id ?? null,
});

const isGoogleWeatherUnsupportedLocation = async (error: Response) => {
  const data = (await error
    .clone()
    .json()
    .catch(() => null)) as {
    upstreamMessage?: string;
    upstreamStatus?: number;
  } | null;

  return (
    data?.upstreamStatus === 404 && data.upstreamMessage?.toLowerCase().includes('not supported')
  );
};

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GoogleMapsEnv>) => {
  let fallbackLatitude: number | null = null;
  let fallbackLongitude: number | null = null;
  let fallbackDays = 3;

  try {
    const body = await readJsonBody<WeatherRequest>(request);
    const latitude = toFiniteNumber(body.latitude);
    const longitude = toFiniteNumber(body.longitude);

    if (latitude === null || longitude === null) {
      return createJsonResponse({ error: 'latitude and longitude are required.' }, { status: 400 });
    }

    const forecastDays = getForecastDays(body.days);
    fallbackLatitude = latitude;
    fallbackLongitude = longitude;
    fallbackDays = forecastDays;

    const currentUrl = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
    appendWeatherParams(currentUrl, env.GOOGLE_MAPS_SERVER_KEY, latitude, longitude);

    const forecastUrl = new URL('https://weather.googleapis.com/v1/forecast/days:lookup');
    appendWeatherParams(forecastUrl, env.GOOGLE_MAPS_SERVER_KEY, latitude, longitude);
    forecastUrl.searchParams.set('days', String(forecastDays));
    forecastUrl.searchParams.set('pageSize', String(forecastDays));

    const [current, forecast] = await Promise.all([
      requestGoogleWeather<GoogleCurrentWeatherResponse>(currentUrl),
      requestGoogleWeather<GoogleDailyWeatherResponse>(forecastUrl),
    ]);

    return createJsonResponse(normalizeGoogleWeather(current, forecast));
  } catch (error) {
    if (error instanceof Response) {
      if (await isGoogleWeatherUnsupportedLocation(error)) {
        try {
          if (fallbackLatitude !== null && fallbackLongitude !== null) {
            return createJsonResponse(
              await requestOpenMeteoWeather(fallbackLatitude, fallbackLongitude, fallbackDays),
            );
          }
        } catch (fallbackError) {
          if (fallbackError instanceof Response) {
            return fallbackError;
          }
        }
      }

      return error;
    }

    return createJsonResponse({ error: 'Unexpected API error.' }, { status: 500 });
  }
};
