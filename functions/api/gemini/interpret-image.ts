import { createJsonResponse, handleApiError, type GeminiEnv } from '../../_shared/gemini';

interface PagesFunctionContext<Env> {
  env: Env;
  request: Request;
}

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GeminiEnv>) => {
  try {
    if (!env.GEMINI_API_KEY) {
      return createJsonResponse({ error: 'GEMINI_API_KEY is not configured.' }, { status: 503 });
    }

    await request.arrayBuffer();

    return createJsonResponse(
      {
        error:
          'Image interpretation skeleton is ready. Add multipart/base64 parsing and Gemini Vision request handling here.',
      },
      { status: 501 },
    );
  } catch (error) {
    return handleApiError(error);
  }
};
