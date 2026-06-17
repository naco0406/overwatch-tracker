const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173';
const DEFAULT_CACHE_TTL_SECONDS = 300;
const BLIZZARD_HERO_RATES_URL = 'https://overwatch.blizzard.com/en-us/rates/';
const ESPORTS_SCHEDULE_URL = 'https://esports.overwatch.com/en-us/schedule';
const OWTICS_CALENDAR_URL = 'https://owtics.gg/en-US/esports/calendar';
const OVERFAST_HERO_STATS_URL = 'https://overfast-api.tekrop.fr/heroes/stats';
const HERO_RATE_REGIONS = ['americas', 'asia', 'europe'];
const OWTICS_ESPORTS_REGIONS = new Set(['asia', 'china', 'japan', 'korea', 'pacific']);

const SOURCE_ALLOWLIST = new Set([
  'esports.overwatch.com',
  'overfast-api.tekrop.fr',
  'overwatch.blizzard.com',
  'owtics.gg',
]);

const SOURCE_SELECT_COLUMNS = [
  'id',
  'display_name',
  'base_url',
  'source_type',
  'is_enabled',
  'is_official',
  'default_ttl_seconds',
  'notes',
  'updated_at',
].join(',');

const GLOBAL_HERO_RATE_SELECT_COLUMNS = [
  'id',
  'source_id',
  'patch_label',
  'region',
  'input_method',
  'gamemode',
  'tier',
  'map_id',
  'role',
  'hero_id',
  'pick_rate',
  'win_rate',
  'sample_state',
  'fetched_at',
].join(',');

const COLLECTOR_JOB_NAMES = {
  all: 'external_collect_all',
  blizzardHeroRates: 'external_collect_blizzard_hero_rates',
  esportsEvents: 'external_collect_esports_events',
  owticsEsportsEvents: 'external_collect_owtics_esports_events',
  overfastHeroRates: 'external_collect_overfast_hero_rates',
};

const fetchRunStatus = {
  blocked: 'blocked',
  parseError: 'parse_error',
  sourceError: 'source_error',
  success: 'success',
};

const ESPORTS_EVENT_SELECT_COLUMNS = [
  'id',
  'source_id',
  'external_event_id',
  'series',
  'tournament',
  'stage',
  'region',
  'status',
  'starts_at',
  'team_a',
  'team_b',
  'score_a',
  'score_b',
  'watch_urls',
  'metadata',
  'fetched_at',
].join(',');

const normalizeBaseUrl = (value) => value.replace(/\/+$/, '');

const getRequiredEnv = (env, key) => {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing ${key}`);
  }

  return value;
};

const parseAllowedOrigins = (env) =>
  (env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const getAllowedOrigin = (request, env) => {
  const origin = request.headers.get('Origin');

  if (!origin) {
    return null;
  }

  return parseAllowedOrigins(env).includes(origin) ? origin : null;
};

const buildCorsHeaders = (origin) => {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
};

const jsonResponse = (body, init = {}, origin = null) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...buildCorsHeaders(origin),
      ...(init.headers ?? {}),
    },
  });

const getBearerToken = (request) => {
  const authorization = request.headers.get('Authorization') ?? '';
  const [scheme, token] = authorization.split(' ');

  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

const getSupabaseRestHeaders = (env, preferServiceRole = true) => {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = getRequiredEnv(env, 'SUPABASE_ANON_KEY');
  const apiKey = preferServiceRole && serviceRoleKey ? serviceRoleKey : anonKey;

  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
};

const supabaseRestFetch = async (env, path, init = {}) => {
  const supabaseUrl = normalizeBaseUrl(getRequiredEnv(env, 'SUPABASE_URL'));
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...getSupabaseRestHeaders(env),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status}`);
  }

  return response.json();
};

const supabaseRestMutate = async (env, path, init = {}) => {
  const supabaseUrl = normalizeBaseUrl(getRequiredEnv(env, 'SUPABASE_URL'));
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getSupabaseRestHeaders(env),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status}${text ? ` ${text}` : ''}`);
  }

  return text ? JSON.parse(text) : null;
};

const verifySupabaseUser = async (request, env) => {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  const supabaseUrl = normalizeBaseUrl(getRequiredEnv(env, 'SUPABASE_URL'));
  const supabaseAnonKey = getRequiredEnv(env, 'SUPABASE_ANON_KEY');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();

  return typeof user?.id === 'string' ? user : null;
};

const assertAllowedSourceUrl = (sourceUrl) => {
  const url = new URL(sourceUrl);

  if (url.protocol !== 'https:' || !SOURCE_ALLOWLIST.has(url.hostname)) {
    throw new Error('External source is not allowed.');
  }

  return url;
};

const fetchAllowedSource = async (sourceUrl, init = {}) => {
  const url = assertAllowedSourceUrl(sourceUrl);
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'User-Agent': 'NACO external-data collector',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`External source request failed: ${response.status}`);
  }

  return response;
};

const fetchAllowedJson = async (sourceUrl, init = {}) => {
  const response = await fetchAllowedSource(sourceUrl, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });

  return response.json();
};

const fetchAllowedText = async (sourceUrl, init = {}) => {
  const response = await fetchAllowedSource(sourceUrl, {
    ...init,
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      ...(init.headers ?? {}),
    },
  });

  return response.text();
};

const rowToExternalSource = (row) => ({
  baseUrl: row.base_url,
  defaultTtlSeconds: row.default_ttl_seconds,
  displayName: row.display_name,
  id: row.id,
  isEnabled: row.is_enabled,
  isOfficial: row.is_official,
  notes: row.notes,
  sourceType: row.source_type,
  updatedAt: row.updated_at,
});

const toNullableNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
};

const rowToGlobalHeroRateSnapshot = (row) => ({
  fetchedAt: row.fetched_at,
  gamemode: row.gamemode,
  heroId: row.hero_id,
  id: row.id,
  inputMethod: row.input_method,
  mapId: row.map_id,
  patchLabel: row.patch_label,
  pickRate: toNullableNumber(row.pick_rate),
  region: row.region,
  role: row.role,
  sampleState: row.sample_state,
  sourceId: row.source_id,
  tier: row.tier,
  winRate: toNullableNumber(row.win_rate),
});

const rowToExternalEsportsEvent = (row) => ({
  externalEventId: row.external_event_id,
  fetchedAt: row.fetched_at,
  id: row.id,
  metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  region: row.region,
  scoreA: row.score_a,
  scoreB: row.score_b,
  series: row.series,
  sourceId: row.source_id,
  stage: row.stage,
  startsAt: row.starts_at,
  status: row.status,
  teamA: row.team_a,
  teamB: row.team_b,
  tournament: row.tournament,
  watchUrls: Array.isArray(row.watch_urls) ? row.watch_urls : [],
});

const decodeHtmlEntities = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const parseMaybeNumber = (value) => {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeRole = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return ['damage', 'support', 'tank'].includes(normalized) ? normalized : 'all';
};

const normalizeBlizzardRegion = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (normalized === 'americas' || normalized === 'asia' || normalized === 'europe') {
    return normalized;
  }

  return 'global';
};

const parseBlizzardRatesFilters = (html) => {
  const selectedMatch = html.match(/data-selected="([^"]+)"/);
  const selected = selectedMatch ? JSON.parse(decodeHtmlEntities(selectedMatch[1])) : {};
  const roleQueueMatch = html.match(/class="herostats-filters"[^>]*data-rq="([^"]+)"/);

  return {
    gamemode: roleQueueMatch?.[1] === '2' ? 'competitive' : 'quickplay',
    inputMethod: 'mouse_keyboard',
    region: normalizeBlizzardRegion(selected.region),
    tier:
      String(selected.tier ?? 'All')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_') || 'all',
  };
};

const parseBlizzardHeroRates = (html, fetchedAt = new Date().toISOString()) => {
  const allRowsMatch = html.match(/<blz-data-table[^>]*\sallrows="([^"]+)"/);

  if (!allRowsMatch) {
    throw new Error('Blizzard hero rates table was not found.');
  }

  const rawRows = JSON.parse(decodeHtmlEntities(allRowsMatch[1]));

  if (!Array.isArray(rawRows)) {
    throw new Error('Blizzard hero rates table is not an array.');
  }

  const filters = parseBlizzardRatesFilters(html);

  return rawRows
    .map((row) => {
      const heroId = typeof row?.id === 'string' ? row.id : '';
      const pickRate = parseMaybeNumber(row?.cells?.pickrate);
      const winRate = parseMaybeNumber(row?.cells?.winrate);

      if (!heroId) {
        return null;
      }

      return {
        fetched_at: fetchedAt,
        gamemode: filters.gamemode,
        hero_id: heroId,
        input_method: filters.inputMethod,
        map_id: 'all',
        patch_label: 'current',
        pick_rate: pickRate,
        region: filters.region,
        role: normalizeRole(row?.hero?.role),
        sample_state: pickRate === null && winRate === null ? 'unavailable' : 'available',
        source_id: 'blizzard_hero_rates',
        tier: filters.tier,
        win_rate: winRate,
      };
    })
    .filter(Boolean);
};

const getOverfastHeroStatsUrl = (region) => {
  const url = new URL(OVERFAST_HERO_STATS_URL);
  url.searchParams.set('platform', 'pc');
  url.searchParams.set('gamemode', 'competitive');
  url.searchParams.set('region', region);
  url.searchParams.set('order_by', 'hero:asc');

  return url.toString();
};

const mapOverfastHeroStats = (items, region, fetchedAt = new Date().toISOString()) => {
  if (!Array.isArray(items)) {
    throw new Error('OverFast hero stats response is not an array.');
  }

  return items
    .map((item) => {
      const heroId = typeof item?.hero === 'string' ? item.hero : '';
      const pickRate = parseMaybeNumber(item?.pickrate);
      const winRate = parseMaybeNumber(item?.winrate);

      if (!heroId) {
        return null;
      }

      return {
        fetched_at: fetchedAt,
        gamemode: 'competitive',
        hero_id: heroId,
        input_method: 'mouse_keyboard',
        map_id: 'all',
        patch_label: 'current',
        pick_rate: pickRate,
        region,
        role: 'all',
        sample_state: pickRate === null && winRate === null ? 'unavailable' : 'available',
        source_id: 'overfast',
        tier: 'all',
        win_rate: winRate,
      };
    })
    .filter(Boolean);
};

const decodeNextFlightText = (html) =>
  Array.from(html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g))
    .map((match) => {
      try {
        return JSON.parse(`"${match[1]}"`);
      } catch (_error) {
        return '';
      }
    })
    .join('');

const extractJsonArrayAfterMarker = (text, marker) => {
  const markerIndex = text.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const startIndex = text.indexOf('[', markerIndex + marker.length);

  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const getFirstArrayValue = (value) => (Array.isArray(value) ? value[0] : value);

const normalizeEsportsStatus = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (normalized === 'completed') {
    return 'completed';
  }

  if (normalized === 'live') {
    return 'live';
  }

  if (normalized === 'postponed') {
    return 'postponed';
  }

  if (normalized === 'canceled' || normalized === 'cancelled') {
    return 'canceled';
  }

  return 'scheduled';
};

const parseEsportsScore = (value) => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const parseOfficialEsportsEvents = (html, fetchedAt = new Date().toISOString()) => {
  const nextText = decodeNextFlightText(html);
  const airtableMatchesJson = extractJsonArrayAfterMarker(nextText, '"airtableMatches":');
  const recordsJson = extractJsonArrayAfterMarker(nextText, '"records":');

  if (!airtableMatchesJson && !recordsJson) {
    throw new Error('Official esports records were not found.');
  }

  const records = airtableMatchesJson
    ? JSON.parse(airtableMatchesJson).flatMap((group) =>
        Array.isArray(group?.matches) ? group.matches : [],
      )
    : JSON.parse(recordsJson);

  if (!Array.isArray(records)) {
    throw new Error('Official esports records payload is not an array.');
  }

  return records
    .map((record) => {
      const fields = record?.fields;

      if (!fields || typeof fields !== 'object') {
        return null;
      }

      const externalEventId =
        typeof fields.matchId === 'string'
          ? fields.matchId
          : typeof record.id === 'string'
            ? record.id
            : '';
      const teamA = String(getFirstArrayValue(fields.team1Name) ?? '');
      const teamB = String(getFirstArrayValue(fields.team2Name) ?? '');
      const twitchUrl =
        typeof fields['Twitch Stream Link'] === 'string' ? fields['Twitch Stream Link'] : '';
      const youtubeUrl =
        typeof fields['YouTube Stream Link'] === 'string' ? fields['YouTube Stream Link'] : '';

      if (!externalEventId || (!teamA && !teamB)) {
        return null;
      }

      return {
        external_event_id: externalEventId,
        fetched_at: fetchedAt,
        metadata: {
          event: fields.event ?? '',
          rawStatus: fields.matchStatus ?? '',
          source: 'official_schedule_page',
          team1Id: getFirstArrayValue(fields.team1Id) ?? '',
          team2Id: getFirstArrayValue(fields.team2Id) ?? '',
        },
        region: String(fields.region ?? ''),
        score_a: parseEsportsScore(fields['Team 1 Score'] ?? fields.team1Score),
        score_b: parseEsportsScore(fields['Team 2 Score'] ?? fields.team2Score),
        series: String(fields.event ?? ''),
        source_id: 'official_esports',
        stage: String(fields['Stage Name'] ?? ''),
        starts_at: typeof fields.datetime === 'string' ? fields.datetime : null,
        status: normalizeEsportsStatus(fields.matchStatus),
        team_a: teamA,
        team_b: teamB,
        tournament: 'Overwatch Champions Series',
        watch_urls: [twitchUrl, youtubeUrl].filter(Boolean),
      };
    })
    .filter(Boolean);
};

const decodeReactRouterStreamChunks = (html) => {
  const chunks = [];
  const pattern = /streamController\.enqueue\("((?:\\.|[^"\\])*)"\)/g;
  let match;

  while ((match = pattern.exec(html))) {
    try {
      chunks.push(JSON.parse(`"${match[1]}"`));
    } catch {
      // Ignore malformed script chunks and let the caller fail if no records are parsed.
    }
  }

  return chunks;
};

const parseStreamChunkJson = (chunk) => {
  const json = chunk.replace(/^P\d+:/, '').trim();

  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const collectJsonObjects = (value, predicate, results = []) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.includes('"__typename"')) {
      try {
        collectJsonObjects(JSON.parse(trimmed), predicate, results);
      } catch {
        // Ignore non-JSON strings in the React Router stream.
      }
    }

    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonObjects(item, predicate, results));
    return results;
  }

  if (value && typeof value === 'object') {
    if (predicate(value)) {
      results.push(value);
    }

    Object.values(value).forEach((item) => collectJsonObjects(item, predicate, results));
  }

  return results;
};

const extractOwticsMatches = (html) =>
  decodeReactRouterStreamChunks(html)
    .map(parseStreamChunkJson)
    .filter(Boolean)
    .flatMap((chunk) =>
      collectJsonObjects(
        chunk,
        (value) => value?.__typename === 'Match' && typeof value?.id === 'string',
      ),
    );

const normalizeOwticsRegion = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeOwticsStatus = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (normalized === 'completed') {
    return 'completed';
  }

  if (normalized === 'ongoing' || normalized === 'live') {
    return 'live';
  }

  if (normalized === 'postponed') {
    return 'postponed';
  }

  if (normalized === 'canceled' || normalized === 'cancelled') {
    return 'canceled';
  }

  return 'scheduled';
};

const parseOwticsScore = (value) => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const getOwticsTeamLabel = (team) => String(team?.name || team?.abbreviation || '').trim();

const getOwticsMatchUrl = (detailsUrl) => {
  if (typeof detailsUrl !== 'string' || !detailsUrl) {
    return '';
  }

  if (detailsUrl.startsWith('https://')) {
    return detailsUrl;
  }

  return `https://owtics.gg/en-US${detailsUrl.startsWith('/') ? detailsUrl : `/${detailsUrl}`}`;
};

const parseOwticsEsportsEvents = (html, fetchedAt = new Date().toISOString()) => {
  const matches = extractOwticsMatches(html);
  const seen = new Set();

  return matches
    .map((match) => {
      if (seen.has(match.id)) {
        return null;
      }

      seen.add(match.id);

      const competition =
        match.competition && typeof match.competition === 'object' ? match.competition : {};
      const region = normalizeOwticsRegion(competition.region);

      if (!OWTICS_ESPORTS_REGIONS.has(region)) {
        return null;
      }

      const detailsUrl = getOwticsMatchUrl(match.detailsUrl);
      const result = match.result && typeof match.result === 'object' ? match.result : {};
      const status = normalizeOwticsStatus(match.status);
      const scoreA =
        status === 'completed'
          ? parseOwticsScore(result.teamAScore)
          : status === 'live'
            ? parseOwticsScore(match.liveScoreA)
            : null;
      const scoreB =
        status === 'completed'
          ? parseOwticsScore(result.teamBScore)
          : status === 'live'
            ? parseOwticsScore(match.liveScoreB)
            : null;
      const teamA = getOwticsTeamLabel(match.teamA);
      const teamB = getOwticsTeamLabel(match.teamB);

      if (!teamA && !teamB && !match.scheduledAt) {
        return null;
      }

      return {
        external_event_id: match.id,
        fetched_at: fetchedAt,
        metadata: {
          competitionId: competition.id ?? '',
          competitionLogoUrl: competition.logoUrl ?? '',
          competitionSlug: competition.slug ?? '',
          detailsUrl,
          source: 'owtics_calendar',
          teamALogoUrl: match.teamA?.logoUrl ?? '',
          teamBLogoUrl: match.teamB?.logoUrl ?? '',
        },
        region,
        score_a: scoreA,
        score_b: scoreB,
        series: String(competition.title ?? ''),
        source_id: 'owtics',
        stage: String(competition.series ?? ''),
        starts_at: typeof match.scheduledAt === 'string' ? match.scheduledAt : null,
        status,
        team_a: teamA,
        team_b: teamB,
        tournament: String(competition.title ?? 'OWTICS.GG'),
        watch_urls: detailsUrl ? [detailsUrl] : [],
      };
    })
    .filter(Boolean);
};

const handleHealth = (origin) =>
  jsonResponse(
    {
      ok: true,
      service: 'external-data',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    origin,
  );

const handleSources = async (request, env, origin) => {
  const cache = caches.default;
  const cacheTtlSeconds = Number(env.SOURCES_CACHE_TTL_SECONDS ?? DEFAULT_CACHE_TTL_SECONDS);
  const cacheUrl = new URL('/external/sources', request.url);
  cacheUrl.searchParams.set('origin', origin ?? '');
  const cacheKey = new Request(cacheUrl.toString(), {
    method: 'GET',
  });
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  const rows = await supabaseRestFetch(
    env,
    `external_sources?select=${SOURCE_SELECT_COLUMNS}&is_enabled=eq.true&order=display_name.asc`,
  );
  const response = jsonResponse(
    {
      sources: rows.map(rowToExternalSource),
    },
    {
      headers: {
        'Cache-Control': `public, max-age=${cacheTtlSeconds}`,
      },
    },
    origin,
  );

  await cache.put(cacheKey, response.clone());

  return response;
};

const getLimitParam = (request, fallback, max) => {
  const url = new URL(request.url);
  const value = Number(url.searchParams.get('limit') ?? fallback);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.floor(value)));
};

const handleGlobalHeroRates = async (request, env, origin) => {
  const limit = getLimitParam(request, 96, 300);
  const rows = await supabaseRestFetch(
    env,
    `global_hero_rate_snapshots?select=${GLOBAL_HERO_RATE_SELECT_COLUMNS}&order=fetched_at.desc&limit=${limit}`,
  );

  return jsonResponse(
    {
      heroRates: rows.map(rowToGlobalHeroRateSnapshot),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    origin,
  );
};

const handleEsportsEvents = async (request, env, origin) => {
  const limit = getLimitParam(request, 160, 300);
  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const fromFilter =
    fromParam === 'all'
      ? ''
      : `&starts_at=gte.${encodeURIComponent(
          fromParam || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        )}`;
  const rows = await supabaseRestFetch(
    env,
    `external_esports_events?select=${ESPORTS_EVENT_SELECT_COLUMNS}${fromFilter}&order=starts_at.asc&limit=${limit}`,
  );

  return jsonResponse(
    {
      esportsEvents: rows.map(rowToExternalEsportsEvent),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    origin,
  );
};

const insertFetchRun = async (
  env,
  {
    errorMessage = '',
    finishedAt,
    httpStatus = null,
    jobKey,
    metadata = {},
    requestUrl,
    sourceId,
    startedAt,
    status,
  },
) =>
  supabaseRestMutate(env, 'external_fetch_runs', {
    body: JSON.stringify({
      cache_status: 'refresh',
      error_message: errorMessage,
      finished_at: finishedAt,
      http_status: httpStatus,
      job_key: jobKey,
      metadata,
      request_url: requestUrl,
      source_id: sourceId,
      started_at: startedAt,
      status,
    }),
    headers: {
      Prefer: 'return=minimal',
    },
    method: 'POST',
  }).catch(() => null);

const insertHeroRateSnapshots = async (env, rows) => {
  if (rows.length === 0) {
    return [];
  }

  const inserted = await supabaseRestMutate(env, 'global_hero_rate_snapshots', {
    body: JSON.stringify(rows),
    headers: {
      Prefer: 'return=representation',
    },
    method: 'POST',
  });

  return Array.isArray(inserted) ? inserted : [];
};

const upsertEsportsEvents = async (env, rows) => {
  if (rows.length === 0) {
    return [];
  }

  const inserted = await supabaseRestMutate(
    env,
    'external_esports_events?on_conflict=source_id,external_event_id',
    {
      body: JSON.stringify(rows),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      method: 'POST',
    },
  );

  return Array.isArray(inserted) ? inserted : [];
};

const collectWithFetchRun = async (env, job) => {
  const startedAt = new Date().toISOString();

  try {
    const result = await job.run(startedAt);
    const finishedAt = new Date().toISOString();

    await insertFetchRun(env, {
      finishedAt,
      httpStatus: result.httpStatus ?? 200,
      jobKey: job.jobKey,
      metadata: result.metadata ?? {},
      requestUrl: job.requestUrl,
      sourceId: job.sourceId,
      startedAt,
      status: fetchRunStatus.success,
    });

    return {
      ...result,
      finishedAt,
      jobKey: job.jobKey,
      sourceId: job.sourceId,
      startedAt,
      status: fetchRunStatus.success,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'External collection failed.';
    const status =
      message.includes('not found') || message.includes('not an array')
        ? fetchRunStatus.parseError
        : fetchRunStatus.sourceError;

    await insertFetchRun(env, {
      errorMessage: message,
      finishedAt,
      jobKey: job.jobKey,
      metadata: {
        trigger: job.trigger,
      },
      requestUrl: job.requestUrl,
      sourceId: job.sourceId,
      startedAt,
      status,
    });

    return {
      error: message,
      finishedAt,
      insertedCount: 0,
      jobKey: job.jobKey,
      sourceId: job.sourceId,
      startedAt,
      status,
    };
  }
};

const collectBlizzardHeroRates = (env, trigger) =>
  collectWithFetchRun(env, {
    jobKey: COLLECTOR_JOB_NAMES.blizzardHeroRates,
    requestUrl: BLIZZARD_HERO_RATES_URL,
    run: async (startedAt) => {
      const html = await fetchAllowedText(BLIZZARD_HERO_RATES_URL);
      const rows = parseBlizzardHeroRates(html, startedAt);
      const inserted = await insertHeroRateSnapshots(env, rows);

      return {
        insertedCount: inserted.length,
        metadata: {
          parsedCount: rows.length,
          trigger,
        },
      };
    },
    sourceId: 'blizzard_hero_rates',
    trigger,
  });

const collectOverfastHeroRates = async (env, trigger) => {
  const results = [];

  for (const region of HERO_RATE_REGIONS) {
    const requestUrl = getOverfastHeroStatsUrl(region);
    const result = await collectWithFetchRun(env, {
      jobKey: `${COLLECTOR_JOB_NAMES.overfastHeroRates}_${region}`,
      requestUrl,
      run: async (startedAt) => {
        const items = await fetchAllowedJson(requestUrl);
        const rows = mapOverfastHeroStats(items, region, startedAt);
        const inserted = await insertHeroRateSnapshots(env, rows);

        return {
          insertedCount: inserted.length,
          metadata: {
            parsedCount: rows.length,
            region,
            trigger,
          },
        };
      },
      sourceId: 'overfast',
      trigger,
    });

    results.push(result);
  }

  return results;
};

const collectOfficialEsportsEvents = (env, trigger) =>
  collectWithFetchRun(env, {
    jobKey: COLLECTOR_JOB_NAMES.esportsEvents,
    requestUrl: ESPORTS_SCHEDULE_URL,
    run: async (startedAt) => {
      const html = await fetchAllowedText(ESPORTS_SCHEDULE_URL);
      const rows = parseOfficialEsportsEvents(html, startedAt);
      const inserted = await upsertEsportsEvents(env, rows);

      return {
        insertedCount: inserted.length,
        metadata: {
          parsedCount: rows.length,
          trigger,
        },
      };
    },
    sourceId: 'official_esports',
    trigger,
  });

const collectOwticsEsportsEvents = (env, trigger) =>
  collectWithFetchRun(env, {
    jobKey: COLLECTOR_JOB_NAMES.owticsEsportsEvents,
    requestUrl: OWTICS_CALENDAR_URL,
    run: async (startedAt) => {
      const html = await fetchAllowedText(OWTICS_CALENDAR_URL);
      const rows = parseOwticsEsportsEvents(html, startedAt);
      const inserted = await upsertEsportsEvents(env, rows);

      return {
        insertedCount: inserted.length,
        metadata: {
          parsedCount: rows.length,
          regions: Array.from(new Set(rows.map((row) => row.region))).sort(),
          trigger,
        },
      };
    },
    sourceId: 'owtics',
    trigger,
  });

const collectEsportsEvents = async (env, trigger) => {
  const results = await Promise.all([
    collectOfficialEsportsEvents(env, trigger),
    collectOwticsEsportsEvents(env, trigger),
  ]);

  return results;
};

const collectGlobalHeroRates = async (env, trigger = 'manual') => {
  const [blizzardResult, overfastResults] = await Promise.all([
    collectBlizzardHeroRates(env, trigger),
    collectOverfastHeroRates(env, trigger),
  ]);

  return [blizzardResult, ...overfastResults];
};

const collectAllExternalData = async (env, trigger = 'manual') => {
  const [heroRateResults, esportsResults] = await Promise.all([
    collectGlobalHeroRates(env, trigger),
    collectEsportsEvents(env, trigger),
  ]);

  return [...heroRateResults, ...esportsResults];
};

const summarizeCollectionResults = (results) => ({
  failed: results.filter((result) => result.status !== fetchRunStatus.success).length,
  inserted: results.reduce((sum, result) => sum + (result.insertedCount ?? 0), 0),
  jobs: results.length,
});

const handleCollect = async (request, env, origin) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, { status: 405 }, origin);
  }

  const url = new URL(request.url);
  const target = url.pathname.replace('/external/collect/', '');
  const trigger = url.searchParams.get('trigger') || 'manual';
  let results;

  if (target === 'all') {
    results = await collectAllExternalData(env, trigger);
  } else if (target === 'global-hero-rates') {
    results = await collectGlobalHeroRates(env, trigger);
  } else if (target === 'esports-events') {
    results = await collectEsportsEvents(env, trigger);
  } else {
    return jsonResponse({ error: 'Unknown collection target.' }, { status: 404 }, origin);
  }

  return jsonResponse(
    {
      ok: results.every((result) => result.status === fetchRunStatus.success),
      results,
      summary: summarizeCollectionResults(results),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
      status: results.some((result) => result.status !== fetchRunStatus.success) ? 207 : 200,
    },
    origin,
  );
};

const requireUser = async (request, env, origin) => {
  const user = await verifySupabaseUser(request, env);

  if (!user) {
    return {
      response: jsonResponse({ error: 'Authentication is required.' }, { status: 401 }, origin),
      user: null,
    };
  }

  return { response: null, user };
};

const notImplemented = (origin) =>
  jsonResponse(
    {
      error: 'This external data route is not implemented yet.',
    },
    { status: 501 },
    origin,
  );

export default {
  async fetch(request, env) {
    const origin = getAllowedOrigin(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (!origin) {
        return jsonResponse({ error: 'Origin is not allowed.' }, { status: 403 });
      }

      return new Response(null, {
        headers: buildCorsHeaders(origin),
        status: 204,
      });
    }

    if (request.headers.get('Origin') && !origin) {
      return jsonResponse({ error: 'Origin is not allowed.' }, { status: 403 });
    }

    try {
      if (request.method === 'GET' && url.pathname === '/external/health') {
        return handleHealth(origin);
      }

      if (request.method === 'GET' && url.pathname === '/external/sources') {
        return handleSources(request, env, origin);
      }

      if (request.method === 'GET' && url.pathname === '/external/global-hero-rates') {
        return handleGlobalHeroRates(request, env, origin);
      }

      if (request.method === 'GET' && url.pathname === '/external/esports-events') {
        return handleEsportsEvents(request, env, origin);
      }

      if (url.pathname.startsWith('/external/collect/')) {
        return handleCollect(request, env, origin);
      }

      if (url.pathname.startsWith('/external/player-accounts/')) {
        const { response } = await requireUser(request, env, origin);

        if (response) {
          return response;
        }

        return notImplemented(origin);
      }

      if (url.pathname.startsWith('/external/')) {
        return notImplemented(origin);
      }

      return jsonResponse({ error: 'Not found.' }, { status: 404 }, origin);
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : 'External data request failed.',
        },
        { status: 500 },
        origin,
      );
    }
  },

  async scheduled(_controller, env) {
    await collectAllExternalData(env, 'cron');
  },
};

export {
  assertAllowedSourceUrl,
  collectAllExternalData,
  parseBlizzardHeroRates,
  parseOwticsEsportsEvents,
  parseOfficialEsportsEvents,
};
