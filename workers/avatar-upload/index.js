const ALLOWED_IMAGE_TYPES = new Map([
  ['image/webp', 'webp'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
]);

const DEFAULT_MAX_BYTES = 1024 * 1024;

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

const getContentType = (request) =>
  (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();

const normalizeBaseUrl = (value) => value.replace(/\/+$/, '');

const createObjectKey = (userId, extension) => {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');

  return `avatars/${userId}/${day}-${crypto.randomUUID()}.${extension}`;
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

    if (url.pathname !== '/avatars/upload') {
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

    const maxBytes = Number(env.MAX_AVATAR_BYTES ?? DEFAULT_MAX_BYTES);
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

    const key = createObjectKey(user.id, extension);

    await env.AVATAR_BUCKET.put(key, body, {
      customMetadata: {
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
        key,
        publicUrl: `${publicBaseUrl}/${key}`,
      },
      { status: 201 },
      origin,
    );
  },
};
