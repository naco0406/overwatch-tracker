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
          'Barcode lookup skeleton is ready. Connect a product database first; Gemini should only assist label/package interpretation.',
      },
      { status: 501 },
    );
  } catch (error) {
    return handleApiError(error);
  }
};
