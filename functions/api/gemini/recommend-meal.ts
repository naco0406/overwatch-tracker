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

interface RecommendMealRequest {
  area?: unknown;
  avoidCategories?: unknown;
  candidateCategories?: unknown;
  day?: unknown;
  nextSchedule?: unknown;
  previousMeal?: unknown;
  time?: unknown;
}

interface RecommendMealResponse {
  rankedCategories: Array<{
    category: string;
    caution?: string;
    rank: number;
    reason: string;
  }>;
  summary: string;
}

const toStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const buildRecommendMealPrompt = (body: RecommendMealRequest) =>
  [
    '도쿄 여행 식사 추천을 JSON으로만 반환하세요.',
    '스키마: {"summary":"...","rankedCategories":[{"category":"...","rank":1,"reason":"...","caution":"..."}]}',
    '맥락을 반영하되 식당 예약을 확정한 것처럼 말하지 마세요.',
    '',
    `day: ${String(body.day ?? '')}`,
    `area: ${String(body.area ?? '')}`,
    `time: ${String(body.time ?? '')}`,
    `previousMeal: ${String(body.previousMeal ?? '')}`,
    `nextSchedule: ${String(body.nextSchedule ?? '')}`,
    `candidateCategories: ${toStringArray(body.candidateCategories).join(', ')}`,
    `avoidCategories: ${toStringArray(body.avoidCategories).join(', ')}`,
  ].join('\n');

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GeminiEnv>) => {
  try {
    const body = await readJsonBody<RecommendMealRequest>(request);
    const { model, value } = await generateGeminiJson<RecommendMealResponse>(
      env,
      buildRecommendMealPrompt(body),
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
