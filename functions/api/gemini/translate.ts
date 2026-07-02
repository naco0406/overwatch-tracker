import {
  createJsonResponse,
  generateGeminiJson,
  handleApiError,
  readJsonBody,
  type GeminiEnv,
} from '../../_shared/gemini';

interface PagesFunctionContext<Env> {
  env: Env;
  request: Request;
}

interface TranslateRequest {
  context?: unknown;
  sourceLanguage?: unknown;
  targetLanguage?: unknown;
  text?: unknown;
}

interface TranslateResponse {
  notes: string[];
  translatedText: string;
}

const buildTranslatePrompt = (body: TranslateRequest) =>
  [
    '여행 상황 번역을 JSON으로만 반환하세요.',
    '스키마: {"translatedText":"...","notes":["..."]}',
    '직역보다 현장에서 자연스럽고 짧은 표현을 우선하세요.',
    '',
    `sourceLanguage: ${String(body.sourceLanguage ?? '')}`,
    `targetLanguage: ${String(body.targetLanguage ?? '')}`,
    `context: ${String(body.context ?? '')}`,
    `text: ${String(body.text ?? '').slice(0, 4_000)}`,
  ].join('\n');

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GeminiEnv>) => {
  try {
    const body = await readJsonBody<TranslateRequest>(request);

    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      return createJsonResponse({ error: 'text is required.' }, { status: 400 });
    }

    const { model, value } = await generateGeminiJson<TranslateResponse>(
      env,
      buildTranslatePrompt(body),
    );

    return createJsonResponse({
      ...value,
      model,
      provider: 'gemini',
    });
  } catch (error) {
    return handleApiError(error);
  }
};
