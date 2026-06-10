const ALLOWED_IMAGE_TYPES = new Map([
  ['image/webp', 'webp'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
]);

const DEFAULT_MAX_AVATAR_BYTES = 1024 * 1024;
const DEFAULT_MAX_COMMUNITY_IMAGE_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getRequiredEnv = (env, key) => {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing ${key}`);
  }

  return value;
};

const parseAllowedOrigins = (env) =>
  (env.ALLOWED_ORIGINS ?? '')
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
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Image-Id, X-Post-Draft-Id',
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

const getContentType = (request) =>
  (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();

const normalizeBaseUrl = (value) => value.replace(/\/+$/, '');

const createAvatarObjectKey = (userId, extension) => {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');

  return `avatars/${userId}/${day}-${crypto.randomUUID()}.${extension}`;
};

const getUuidHeader = (request, key) => {
  const value = request.headers.get(key)?.trim();

  return value && UUID_PATTERN.test(value) ? value : null;
};

const createCommunityObjectKey = (userId, draftId, imageId, extension) =>
  `community/${userId}/${draftId}/${imageId}.${extension}`;

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

    const isAvatarUpload = url.pathname === '/avatars/upload';
    const isCommunityImageUpload = url.pathname === '/community/images/upload';

    if (!isAvatarUpload && !isCommunityImageUpload) {
      return jsonResponse({ error: 'Not found.' }, { status: 404 }, origin);
    }

    if (request.method !== 'PUT') {
      return jsonResponse({ error: 'Method not allowed.' }, { status: 405 }, origin);
    }

    if (!origin) {
      return jsonResponse({ error: 'Origin is not allowed.' }, { status: 403 });
    }

    const user = await verifySupabaseUser(request, env);

    if (!user) {
      return jsonResponse({ error: 'Authentication is required.' }, { status: 401 }, origin);
    }

    const contentType = getContentType(request);
    const extension = ALLOWED_IMAGE_TYPES.get(contentType);

    if (!extension) {
      return jsonResponse(
        { error: 'Only WebP, PNG, and JPEG images can be uploaded.' },
        { status: 415 },
        origin,
      );
    }

    const maxBytes = Number(
      isCommunityImageUpload
        ? (env.MAX_COMMUNITY_IMAGE_BYTES ?? DEFAULT_MAX_COMMUNITY_IMAGE_BYTES)
        : (env.MAX_AVATAR_BYTES ?? DEFAULT_MAX_AVATAR_BYTES),
    );
    const contentLength = Number(request.headers.get('Content-Length') ?? 0);

    if (contentLength > maxBytes) {
      return jsonResponse({ error: 'Image is too large.' }, { status: 413 }, origin);
    }

    const body = await request.arrayBuffer();

    if (body.byteLength === 0) {
      return jsonResponse({ error: 'Image is empty.' }, { status: 400 }, origin);
    }

    if (body.byteLength > maxBytes) {
      return jsonResponse({ error: 'Image is too large.' }, { status: 413 }, origin);
    }

    const draftId = isCommunityImageUpload ? getUuidHeader(request, 'X-Post-Draft-Id') : null;
    const imageId = isCommunityImageUpload ? getUuidHeader(request, 'X-Image-Id') : null;

    if (isCommunityImageUpload && (!draftId || !imageId)) {
      return jsonResponse({ error: 'Image metadata is invalid.' }, { status: 400 }, origin);
    }

    const key = isCommunityImageUpload
      ? createCommunityObjectKey(user.id, draftId, imageId, extension)
      : createAvatarObjectKey(user.id, extension);
    const bucket = env.ASSETS_BUCKET;

    if (!bucket) {
      return jsonResponse({ error: 'Upload bucket is not configured.' }, { status: 500 }, origin);
    }

    await bucket.put(key, body, {
      customMetadata: {
        assetType: isCommunityImageUpload ? 'community-image' : 'avatar',
        userId: user.id,
      },
      httpMetadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        contentType,
      },
    });

    const publicBaseUrl = normalizeBaseUrl(getRequiredEnv(env, 'R2_PUBLIC_BASE_URL'));

    return jsonResponse(
      {
        imageUrl: `${publicBaseUrl}/${key}`,
        key,
        objectKey: key,
        publicUrl: `${publicBaseUrl}/${key}`,
      },
      { status: 201 },
      origin,
    );
  },
};
