export interface GeminiEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export interface GeminiJsonResult<T> {
  model: string;
  value: T;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

const defaultGeminiModel = 'gemini-3.1-flash-lite';

export const createJsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  });

export const readJsonBody = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Response('Invalid JSON body.', { status: 400 });
  }
};

export const assertGeminiKey = (env: GeminiEnv) => {
  if (!env.GEMINI_API_KEY) {
    throw new Response('GEMINI_API_KEY is not configured.', { status: 503 });
  }
};

export const generateGeminiJson = async <T>(
  env: GeminiEnv,
  prompt: string,
): Promise<GeminiJsonResult<T>> => {
  assertGeminiKey(env);

  const model = env.GEMINI_MODEL || defaultGeminiModel;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
            role: 'user',
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );

  if (!response.ok) {
    throw new Response('Gemini API request failed.', { status: 502 });
  }

  const data = (await response.json()) as GeminiGenerateContentResponse;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Response('Gemini API returned an empty response.', { status: 502 });
  }

  try {
    return {
      model,
      value: JSON.parse(text) as T,
    };
  } catch {
    throw new Response('Gemini API returned invalid JSON.', { status: 502 });
  }
};

export const handleApiError = (error: unknown) => {
  if (error instanceof Response) {
    return error;
  }

  return createJsonResponse({ error: 'Unexpected API error.' }, { status: 500 });
};
