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

interface StatsInsightRequest {
  prompt?: unknown;
  signature?: unknown;
}

interface StatsInsightResponse {
  insights: Array<{
    candidateId: string;
  }>;
}

const buildStatsInsightPrompt = (prompt: string) =>
  [
    '아래 요청은 오버워치 전적 통계 후보 중 사용자에게 보여줄 핵심 후보를 고르는 작업입니다.',
    '반드시 JSON만 반환하세요. 설명 문장, 마크다운, 코드블록은 쓰지 마세요.',
    '스키마: {"insights":[{"candidateId":"후보 id"}]}',
    '3개에서 5개만 고르고, 후보 id는 입력에 있는 값만 사용하세요.',
    '',
    prompt,
  ].join('\n');

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GeminiEnv>) => {
  try {
    const body = await readJsonBody<StatsInsightRequest>(request);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

    if (!prompt) {
      return createJsonResponse({ error: 'prompt is required.' }, { status: 400 });
    }

    const { model, value } = await generateGeminiJson<StatsInsightResponse>(
      env,
      buildStatsInsightPrompt(prompt.slice(0, 24_000)),
    );

    return createJsonResponse({
      model,
      provider: 'gemini',
      text: JSON.stringify(value),
    });
  } catch (error) {
    return handleApiError(error);
  }
};
