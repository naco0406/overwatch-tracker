const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173';
const DEFAULT_CACHE_TTL_SECONDS = 300;
const BLIZZARD_HERO_RATES_URL = 'https://overwatch.blizzard.com/en-us/rates/';
const ESPORTS_SCHEDULE_URL = 'https://esports.overwatch.com/en-us/schedule';
const OWTICS_CALENDAR_URL = 'https://owtics.gg/en-US/esports/calendar';
const OVERFAST_HERO_STATS_URL = 'https://overfast-api.tekrop.fr/heroes/stats';
const HERO_RATE_REGIONS = ['americas', 'asia', 'europe'];
const DEFAULT_OWTICS_DETAIL_FETCH_LIMIT = 4;
const DEFAULT_EXTERNAL_ASSET_MAX_BYTES = 1_500_000;
const OWTICS_LOGO_METADATA_KEYS = ['competitionLogoUrl', 'teamALogoUrl', 'teamBLogoUrl'];

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

const getOptionalBaseUrl = (value) =>
  typeof value === 'string' && value.trim() ? normalizeBaseUrl(value.trim()) : '';

const getExternalAssetsBucket = (env) => env.EXTERNAL_ASSETS_BUCKET || env.ASSETS_BUCKET || null;

const getConfiguredExternalAssetsPublicBaseUrl = (env) =>
  getOptionalBaseUrl(env.EXTERNAL_ASSETS_PUBLIC_BASE_URL) ||
  getOptionalBaseUrl(env.R2_PUBLIC_BASE_URL);

const getExternalAssetsPublicBaseUrl = (request, env) =>
  getConfiguredExternalAssetsPublicBaseUrl(env) ||
  normalizeBaseUrl(new URL('/external/assets', request.url).toString());

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

const parseNullableRateNumber = (value) => {
  const numberValue = parseMaybeNumber(value);

  return numberValue !== null && numberValue >= 0 ? numberValue : null;
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
      const pickRate = parseNullableRateNumber(row?.cells?.pickrate);
      const winRate = parseNullableRateNumber(row?.cells?.winrate);

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
      const pickRate = parseNullableRateNumber(item?.pickrate);
      const winRate = parseNullableRateNumber(item?.winrate);

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

const getOwticsMetadataString = (value) =>
  value === null || value === undefined ? '' : String(value).trim();

const getOwticsMatchUrl = (detailsUrl) => {
  if (typeof detailsUrl !== 'string' || !detailsUrl) {
    return '';
  }

  if (detailsUrl.startsWith('https://')) {
    return detailsUrl;
  }

  return `https://owtics.gg/en-US${detailsUrl.startsWith('/') ? detailsUrl : `/${detailsUrl}`}`;
};

const compactOwticsMetadata = (metadata) =>
  Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value === null || value === undefined || value === '') {
        return false;
      }

      if (Array.isArray(value)) {
        return value.length > 0;
      }

      if (typeof value === 'object') {
        return Object.keys(value).length > 0;
      }

      return true;
    }),
  );

const getOwticsRecordString = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (value && typeof value === 'object') {
      const nested = getOwticsRecordString(value, [
        'emoji',
        'flag',
        'code',
        'name',
        'title',
        'label',
      ]);

      if (nested) {
        return nested;
      }
    }
  }

  return '';
};

const normalizeOwticsPlayer = (player, index) => {
  if (!player || typeof player !== 'object') {
    return null;
  }

  const name = getOwticsRecordString(player, [
    'name',
    'handle',
    'username',
    'playerName',
    'displayName',
    'nickname',
  ]);

  if (!name) {
    return null;
  }

  const role = getOwticsRecordString(player, ['role', 'position']);
  const country = getOwticsRecordString(player, [
    'countryCode',
    'country',
    'nationality',
    'nationalityCode',
    'homeCountry',
  ]);
  const flag = getOwticsRecordString(player, ['flag', 'emoji']);

  return compactOwticsMetadata({
    country,
    flag,
    id: getOwticsRecordString(player, ['id', 'slug']) || `${name}-${index}`,
    name,
    role,
  });
};

const collectOwticsArraysByKey = (value, patterns, results = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectOwticsArraysByKey(item, patterns, results));
    return results;
  }

  if (!value || typeof value !== 'object') {
    return results;
  }

  Object.entries(value).forEach(([key, child]) => {
    const normalizedKey = key.toLowerCase();

    if (Array.isArray(child) && patterns.some((pattern) => normalizedKey.includes(pattern))) {
      results.push(child);
    }

    collectOwticsArraysByKey(child, patterns, results);
  });

  return results;
};

const extractOwticsRoster = (team) => {
  const arrays = collectOwticsArraysByKey(team, ['roster', 'player', 'member']);
  const playerGroups = arrays
    .map((items) => items.map(normalizeOwticsPlayer).filter(Boolean))
    .filter((items) => items.length > 0)
    .sort((left, right) => right.length - left.length);

  return playerGroups[0] ?? [];
};

const normalizeOwticsBroadcast = (broadcast, index) => {
  if (!broadcast || typeof broadcast !== 'object') {
    return null;
  }

  const url = getOwticsRecordString(broadcast, ['url', 'href', 'link', 'streamUrl', 'channelUrl']);
  const name = getOwticsRecordString(broadcast, [
    'name',
    'title',
    'channel',
    'channelName',
    'displayName',
  ]);

  if (!url && !name) {
    return null;
  }

  return compactOwticsMetadata({
    id: getOwticsRecordString(broadcast, ['id', 'slug']) || `${name || url}-${index}`,
    language: getOwticsRecordString(broadcast, ['language', 'locale']),
    name: name || url,
    platform: getOwticsRecordString(broadcast, ['platform', 'service']),
    url,
  });
};

const extractOwticsBroadcasts = (value) => {
  const arrays = collectOwticsArraysByKey(value, ['broadcast', 'stream', 'watch', 'channel']);

  return arrays
    .flatMap((items) => items.map(normalizeOwticsBroadcast).filter(Boolean))
    .filter(
      (broadcast, index, broadcasts) =>
        broadcasts.findIndex(
          (item) => item.url === broadcast.url && item.name === broadcast.name,
        ) === index,
    );
};

const findOwticsTeamObject = (objects, fallbackTeam) => {
  if (!fallbackTeam || typeof fallbackTeam !== 'object') {
    return {};
  }

  const id = getOwticsRecordString(fallbackTeam, ['id']);
  const slug = getOwticsRecordString(fallbackTeam, ['slug']);
  const name = getOwticsTeamLabel(fallbackTeam);

  return (
    objects.find((object) => {
      if (object?.__typename !== 'Team') {
        return false;
      }

      return (
        (id && getOwticsRecordString(object, ['id']) === id) ||
        (slug && getOwticsRecordString(object, ['slug']) === slug) ||
        (name && getOwticsTeamLabel(object) === name)
      );
    }) ?? fallbackTeam
  );
};

const extractOwticsMatchDetailMetadata = (html, matchId) => {
  const chunks = decodeReactRouterStreamChunks(html).map(parseStreamChunkJson).filter(Boolean);
  const matches = chunks.flatMap((chunk) =>
    collectJsonObjects(
      chunk,
      (value) => value?.__typename === 'Match' && typeof value?.id === 'string',
    ),
  );
  const objects = chunks.flatMap((chunk) =>
    collectJsonObjects(chunk, (value) => typeof value?.__typename === 'string'),
  );
  const match = matches.find((item) => item.id === matchId) ?? matches[0] ?? {};
  const teamA = findOwticsTeamObject(objects, match.teamA);
  const teamB = findOwticsTeamObject(objects, match.teamB);
  const teamARoster = extractOwticsRoster(teamA);
  const teamBRoster = extractOwticsRoster(teamB);
  const broadcasts = extractOwticsBroadcasts(match);

  return compactOwticsMetadata({
    broadcasts,
    detailParsedAt: new Date().toISOString(),
    rosters:
      teamARoster.length > 0 || teamBRoster.length > 0
        ? compactOwticsMetadata({
            teamA: teamARoster,
            teamB: teamBRoster,
          })
        : undefined,
    teamAAbbreviation: getOwticsRecordString(teamA, ['abbreviation']),
    teamAId: getOwticsRecordString(teamA, ['id']),
    teamALogoUrl: getOwticsRecordString(teamA, ['logoUrl']),
    teamASlug: getOwticsRecordString(teamA, ['slug']),
    teamBAbbreviation: getOwticsRecordString(teamB, ['abbreviation']),
    teamBId: getOwticsRecordString(teamB, ['id']),
    teamBLogoUrl: getOwticsRecordString(teamB, ['logoUrl']),
    teamBSlug: getOwticsRecordString(teamB, ['slug']),
  });
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);

  return results;
};

const getOwticsLogoMetadataSourceKey = (key) => key.replace(/Url$/, 'SourceUrl');

const getOwticsLogoMetadataObjectKey = (key) => key.replace(/Url$/, 'ObjectKey');

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const getExternalAssetExtension = (sourceUrl) => {
  const pathname = new URL(sourceUrl).pathname.toLowerCase();
  const match = pathname.match(/\.([a-z0-9]{2,5})$/);
  const extension = match?.[1] ?? 'img';

  return ['avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(extension)
    ? extension
    : 'img';
};

const getExternalAssetContentType = (contentType) =>
  contentType.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';

const normalizeExternalImageUrl = (sourceUrl) => {
  if (typeof sourceUrl !== 'string' || !sourceUrl.trim()) {
    return '';
  }

  let url;

  try {
    url = new URL(sourceUrl.trim(), 'https://owtics.gg');
  } catch (_error) {
    return '';
  }

  return url.protocol === 'https:' ? url.toString() : '';
};

const createExternalAssetObjectKey = async (sourceId, assetKind, sourceUrl) => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceUrl));
  const hash = toHex(hashBuffer).slice(0, 32);

  return `external/${sourceId}/${assetKind}/${hash}.${getExternalAssetExtension(sourceUrl)}`;
};

const fetchExternalImageAsset = async (sourceUrl, maxBytes) => {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*',
      'User-Agent': 'NACO external-data asset mirror',
    },
  });

  if (!response.ok) {
    throw new Error(`External asset request failed: ${response.status}`);
  }

  const contentType = getExternalAssetContentType(response.headers.get('Content-Type') ?? '');

  if (!contentType.startsWith('image/')) {
    throw new Error(`External asset is not an image: ${contentType}`);
  }

  const contentLength = Number(response.headers.get('Content-Length') ?? 0);

  if (contentLength > maxBytes) {
    throw new Error('External asset is too large.');
  }

  const body = await response.arrayBuffer();

  if (body.byteLength === 0) {
    throw new Error('External asset is empty.');
  }

  if (body.byteLength > maxBytes) {
    throw new Error('External asset is too large.');
  }

  return { body, contentType };
};

const cacheExternalImageAsset = async (env, sourceUrl, assetKind, options) => {
  const bucket = getExternalAssetsBucket(env);
  const publicBaseUrl = options.assetPublicBaseUrl;
  const normalizedUrl = normalizeExternalImageUrl(sourceUrl);

  if (!bucket || !publicBaseUrl || !normalizedUrl) {
    return null;
  }

  const key = await createExternalAssetObjectKey('owtics', assetKind, normalizedUrl);
  const publicUrl = `${publicBaseUrl}/${key}`;
  const existing = await bucket.head(key);

  if (existing) {
    return {
      key,
      publicUrl,
      sourceUrl: normalizedUrl,
      status: 'hit',
    };
  }

  const maxBytes = Number(env.EXTERNAL_ASSET_MAX_BYTES ?? DEFAULT_EXTERNAL_ASSET_MAX_BYTES);
  const asset = await fetchExternalImageAsset(normalizedUrl, maxBytes);

  await bucket.put(key, asset.body, {
    customMetadata: {
      assetKind,
      source: 'owtics',
      sourceUrl: normalizedUrl,
    },
    httpMetadata: {
      cacheControl: 'public, max-age=31536000, immutable',
      contentType: asset.contentType,
    },
  });

  return {
    key,
    publicUrl,
    sourceUrl: normalizedUrl,
    status: 'uploaded',
  };
};

const getOwticsLogoAssetReferences = (rows) => {
  const seen = new Set();
  const references = [];

  rows.forEach((row) => {
    OWTICS_LOGO_METADATA_KEYS.forEach((key) => {
      const sourceUrl = normalizeExternalImageUrl(row.metadata?.[key]);

      if (!sourceUrl || seen.has(sourceUrl)) {
        return;
      }

      seen.add(sourceUrl);
      references.push({
        key,
        kind: key.replace(/Url$/, '').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        sourceUrl,
      });
    });
  });

  return references;
};

const cacheOwticsLogoAssetsForRows = async (rows, env, options = {}) => {
  const bucket = getExternalAssetsBucket(env);
  const enabled = Boolean(bucket && options.assetPublicBaseUrl);
  const references = enabled ? getOwticsLogoAssetReferences(rows) : [];
  const requestedLimit = Number(options.assetLimit ?? env.OWTICS_ASSET_FETCH_LIMIT ?? 12);
  const assetLimit = Math.max(
    0,
    Math.min(16, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 12),
  );
  const selectedReferences = references.slice(0, assetLimit);
  const concurrency = Math.max(
    1,
    Math.min(4, Number(env.OWTICS_ASSET_FETCH_CONCURRENCY ?? 2) || 2),
  );
  const results = await mapWithConcurrency(selectedReferences, concurrency, async (reference) => {
    try {
      return await cacheExternalImageAsset(env, reference.sourceUrl, reference.kind, options);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'External asset cache failed.',
        sourceUrl: reference.sourceUrl,
        status: 'failed',
      };
    }
  });
  const assetsBySourceUrl = new Map(
    results
      .filter((result) => result?.publicUrl && result?.sourceUrl)
      .map((result) => [result.sourceUrl, result]),
  );

  return {
    assetsBySourceUrl,
    enabled,
    failedCount: results.filter((result) => result?.status === 'failed').length,
    hitCount: results.filter((result) => result?.status === 'hit').length,
    limit: assetLimit,
    requestedCount: selectedReferences.length,
    totalCount: references.length,
    uploadedCount: results.filter((result) => result?.status === 'uploaded').length,
  };
};

const applyOwticsLogoAssetCache = (rows, assetResult) =>
  rows.map((row) => {
    if (!assetResult.enabled) {
      return row;
    }

    const metadata = { ...(row.metadata ?? {}) };

    OWTICS_LOGO_METADATA_KEYS.forEach((key) => {
      const sourceUrl = normalizeExternalImageUrl(metadata[key]);

      if (!sourceUrl) {
        return;
      }

      const cachedAsset = assetResult.assetsBySourceUrl.get(sourceUrl);
      metadata[getOwticsLogoMetadataSourceKey(key)] = sourceUrl;

      if (cachedAsset) {
        metadata[key] = cachedAsset.publicUrl;
        metadata[getOwticsLogoMetadataObjectKey(key)] = cachedAsset.key;
        return;
      }

      delete metadata[key];
      delete metadata[getOwticsLogoMetadataObjectKey(key)];
    });

    return {
      ...row,
      metadata: compactOwticsMetadata(metadata),
    };
  });

const enrichOwticsEventsWithDetails = async (rows, env, options = {}) => {
  const detailRows = rows.filter((row) => row.metadata?.detailsUrl);
  const configuredLimit = Number(
    env.OWTICS_DETAIL_FETCH_LIMIT ?? DEFAULT_OWTICS_DETAIL_FETCH_LIMIT,
  );
  const requestedLimit = Number(options.detailLimit ?? configuredLimit);
  const requestedOffset = Number(options.detailOffset ?? 0);
  const detailLimit = Math.max(
    0,
    Math.min(
      12,
      Number.isFinite(requestedLimit)
        ? Math.floor(requestedLimit)
        : DEFAULT_OWTICS_DETAIL_FETCH_LIMIT,
    ),
  );
  const detailOffset = Math.max(
    0,
    Math.min(detailRows.length, Number.isFinite(requestedOffset) ? Math.floor(requestedOffset) : 0),
  );
  const concurrency = Math.max(
    1,
    Math.min(8, Number(env.OWTICS_DETAIL_FETCH_CONCURRENCY ?? 4) || 4),
  );
  const rowsWithDetails = detailRows.slice(detailOffset, detailOffset + detailLimit);
  const detailResults = await mapWithConcurrency(rowsWithDetails, concurrency, async (row) => {
    try {
      const html = await fetchAllowedText(row.metadata.detailsUrl);
      const detailMetadata = extractOwticsMatchDetailMetadata(html, row.external_event_id);
      const broadcastUrls = Array.isArray(detailMetadata.broadcasts)
        ? detailMetadata.broadcasts.map((broadcast) => broadcast.url).filter(Boolean)
        : [];

      return {
        externalEventId: row.external_event_id,
        metadata: detailMetadata,
        watchUrls: broadcastUrls,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'OWTICS detail parse failed.',
        externalEventId: row.external_event_id,
        metadata: {},
        watchUrls: [],
      };
    }
  });
  const detailById = new Map(detailResults.map((result) => [result.externalEventId, result]));

  return {
    detailFetchedCount: detailResults.filter((result) => !result.error).length,
    detailFailedCount: detailResults.filter((result) => result.error).length,
    detailExternalEventIds: detailResults.map((result) => result.externalEventId),
    detailLimit,
    detailOffset,
    detailRequestedCount: rowsWithDetails.length,
    detailTotalCount: detailRows.length,
    rows: rows.map((row) => {
      const detail = detailById.get(row.external_event_id);

      if (!detail) {
        return row;
      }

      return {
        ...row,
        metadata: compactOwticsMetadata({
          ...row.metadata,
          ...detail.metadata,
          detailError: detail.error,
        }),
        watch_urls: Array.from(new Set([...(row.watch_urls ?? []), ...detail.watchUrls])),
      };
    }),
  };
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
          competitionRegion: getOwticsMetadataString(competition.region),
          competitionSeries: getOwticsMetadataString(competition.series),
          competitionTitle: getOwticsMetadataString(competition.title),
          detailsUrl,
          rawStatus: getOwticsMetadataString(match.status),
          source: 'owtics_calendar',
          teamAAbbreviation: getOwticsMetadataString(match.teamA?.abbreviation),
          teamAId: getOwticsMetadataString(match.teamA?.id),
          teamALogoUrl: match.teamA?.logoUrl ?? '',
          teamASlug: getOwticsMetadataString(match.teamA?.slug),
          teamBAbbreviation: getOwticsMetadataString(match.teamB?.abbreviation),
          teamBId: getOwticsMetadataString(match.teamB?.id),
          teamBLogoUrl: match.teamB?.logoUrl ?? '',
          teamBSlug: getOwticsMetadataString(match.teamB?.slug),
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

const appendSupabaseEqFilter = (params, url, searchKey, columnName = searchKey) => {
  const value = url.searchParams.get(searchKey);

  if (!value || value === 'all') {
    return;
  }

  params.set(columnName, `eq.${value}`);
};

const appendSupabaseTimestampFilter = (params, url, searchKey, columnName, operator) => {
  const value = url.searchParams.get(searchKey);

  if (!value || value === 'all') {
    return;
  }

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return;
  }

  params.set(columnName, `${operator}.${new Date(time).toISOString()}`);
};

const getBoundedSearchInteger = (url, key, fallback, min, max) => {
  const value = Number(url.searchParams.get(key) ?? fallback);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
};

const handleGlobalHeroRates = async (request, env, origin) => {
  const url = new URL(request.url);
  const limit = getLimitParam(request, 1200, 5000);
  const params = new URLSearchParams({
    limit: String(limit),
    order: 'fetched_at.desc',
    select: GLOBAL_HERO_RATE_SELECT_COLUMNS,
  });

  appendSupabaseTimestampFilter(params, url, 'from', 'fetched_at', 'gte');
  appendSupabaseTimestampFilter(params, url, 'to', 'fetched_at', 'lte');
  appendSupabaseEqFilter(params, url, 'heroId', 'hero_id');
  appendSupabaseEqFilter(params, url, 'sourceId', 'source_id');
  appendSupabaseEqFilter(params, url, 'region');
  appendSupabaseEqFilter(params, url, 'gamemode');
  appendSupabaseEqFilter(params, url, 'tier');
  appendSupabaseEqFilter(params, url, 'mapId', 'map_id');
  appendSupabaseEqFilter(params, url, 'role');
  const rows = await supabaseRestFetch(env, `global_hero_rate_snapshots?${params.toString()}`);

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
  const limit = getLimitParam(request, 500, 1000);
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

const collectOwticsEsportsEvents = (env, trigger, options = {}) =>
  collectWithFetchRun(env, {
    jobKey: COLLECTOR_JOB_NAMES.owticsEsportsEvents,
    requestUrl: OWTICS_CALENDAR_URL,
    run: async (startedAt) => {
      const html = await fetchAllowedText(OWTICS_CALENDAR_URL);
      const rows = parseOwticsEsportsEvents(html, startedAt);
      const collectionOptions = {
        ...options,
        assetPublicBaseUrl:
          options.assetPublicBaseUrl || getConfiguredExternalAssetsPublicBaseUrl(env),
      };
      const detailResult = await enrichOwticsEventsWithDetails(rows, env, collectionOptions);
      const detailEventIds = new Set(detailResult.detailExternalEventIds);
      const shouldUpsertAllRows = detailResult.detailOffset === 0;
      const assetSourceRows = detailResult.rows.filter((row) =>
        detailEventIds.has(row.external_event_id),
      );
      const assetResult = await cacheOwticsLogoAssetsForRows(
        assetSourceRows,
        env,
        collectionOptions,
      );
      const rowsWithCachedAssets = applyOwticsLogoAssetCache(detailResult.rows, assetResult);
      const rowsToUpsert = shouldUpsertAllRows
        ? rowsWithCachedAssets
        : rowsWithCachedAssets.filter((row) => detailEventIds.has(row.external_event_id));
      const inserted = await upsertEsportsEvents(env, rowsToUpsert);

      return {
        insertedCount: inserted.length,
        metadata: {
          assetCacheEnabled: assetResult.enabled,
          assetFailedCount: assetResult.failedCount,
          assetHitCount: assetResult.hitCount,
          assetRequestedCount: assetResult.requestedCount,
          assetTotalCount: assetResult.totalCount,
          assetUploadedCount: assetResult.uploadedCount,
          detailFailedCount: detailResult.detailFailedCount,
          detailFetchedCount: detailResult.detailFetchedCount,
          detailLimit: detailResult.detailLimit,
          detailOffset: detailResult.detailOffset,
          detailRequestedCount: detailResult.detailRequestedCount,
          detailTotalCount: detailResult.detailTotalCount,
          detailUpsertMode: shouldUpsertAllRows ? 'index_with_detail_batch' : 'detail_batch',
          parsedCount: detailResult.rows.length,
          regions: Array.from(new Set(detailResult.rows.map((row) => row.region))).sort(),
          upsertedRowCount: rowsToUpsert.length,
          trigger,
        },
      };
    },
    sourceId: 'owtics',
    trigger,
  });

const collectEsportsEvents = async (env, trigger, options = {}) => {
  const results = await Promise.all([
    collectOfficialEsportsEvents(env, trigger),
    collectOwticsEsportsEvents(env, trigger, options),
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

const collectAllExternalData = async (env, trigger = 'manual', options = {}) => {
  const [heroRateResults, esportsResults] = await Promise.all([
    collectGlobalHeroRates(env, trigger),
    collectEsportsEvents(env, trigger, options),
  ]);

  return [...heroRateResults, ...esportsResults];
};

const summarizeCollectionResults = (results) => ({
  failed: results.filter((result) => result.status !== fetchRunStatus.success).length,
  inserted: results.reduce((sum, result) => sum + (result.insertedCount ?? 0), 0),
  jobs: results.length,
});

const handleExternalAsset = async (request, env, origin) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed.' }, { status: 405 }, origin);
  }

  const bucket = getExternalAssetsBucket(env);

  if (!bucket) {
    return jsonResponse(
      { error: 'External asset bucket is not configured.' },
      { status: 501 },
      origin,
    );
  }

  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace('/external/assets/', ''));

  if (!key.startsWith('external/') || key.includes('..')) {
    return jsonResponse({ error: 'Invalid asset key.' }, { status: 400 }, origin);
  }

  const object = await bucket.get(key);

  if (!object) {
    return jsonResponse({ error: 'External asset not found.' }, { status: 404 }, origin);
  }

  const headers = new Headers(buildCorsHeaders(origin));
  headers.set(
    'Cache-Control',
    object.httpMetadata?.cacheControl ?? 'public, max-age=86400, stale-while-revalidate=604800',
  );
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');

  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }

  return new Response(request.method === 'HEAD' ? null : object.body, {
    headers,
    status: 200,
  });
};

const handleCollect = async (request, env, origin) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, { status: 405 }, origin);
  }

  const url = new URL(request.url);
  const target = url.pathname.replace('/external/collect/', '');
  const trigger = url.searchParams.get('trigger') || 'manual';
  const options = {
    assetLimit: getBoundedSearchInteger(
      url,
      'assetLimit',
      Number(env.OWTICS_ASSET_FETCH_LIMIT ?? 12) || 12,
      0,
      16,
    ),
    assetPublicBaseUrl: getExternalAssetsPublicBaseUrl(request, env),
    detailLimit: getBoundedSearchInteger(
      url,
      'detailLimit',
      Number(env.OWTICS_DETAIL_FETCH_LIMIT ?? DEFAULT_OWTICS_DETAIL_FETCH_LIMIT) ||
        DEFAULT_OWTICS_DETAIL_FETCH_LIMIT,
      0,
      12,
    ),
    detailOffset: getBoundedSearchInteger(url, 'detailOffset', 0, 0, 100000),
  };
  let results;

  if (target === 'all') {
    results = await collectAllExternalData(env, trigger, options);
  } else if (target === 'global-hero-rates') {
    results = await collectGlobalHeroRates(env, trigger);
  } else if (target === 'esports-events') {
    results = await collectEsportsEvents(env, trigger, options);
  } else if (target === 'official-esports-events') {
    results = [await collectOfficialEsportsEvents(env, trigger)];
  } else if (target === 'owtics-esports-events') {
    results = [await collectOwticsEsportsEvents(env, trigger, options)];
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

      if (url.pathname.startsWith('/external/assets/')) {
        return handleExternalAsset(request, env, origin);
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
