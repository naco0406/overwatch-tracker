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

interface TripDecisionRequest {
  context?: unknown;
  options?: unknown;
  question?: unknown;
  title?: unknown;
}

interface TripDecisionOption {
  details: string;
  id: string;
  label: string;
}

interface TripDecisionResponse {
  actionPlan: string[];
  cautions: string[];
  optionId: string;
  reasons: string[];
  recommendation: string;
  summary: string;
}

const toStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toDecisionOptions = (value: unknown): TripDecisionOption[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const option = item as Record<string, unknown>;
          const id = typeof option.id === 'string' ? option.id : '';
          const label = typeof option.label === 'string' ? option.label : '';
          const details = typeof option.details === 'string' ? option.details : '';

          return id && label ? { details, id, label } : null;
        })
        .filter((item): item is TripDecisionOption => Boolean(item))
    : [];

const buildTripDecisionPrompt = (body: TripDecisionRequest) => {
  const context = toStringArray(body.context);
  const options = toDecisionOptions(body.options);

  return [
    '도쿄 여행 동선 의사결정 추천을 JSON으로만 반환하세요.',
    '스키마: {"summary":"...","recommendation":"...","optionId":"...","reasons":["..."],"cautions":["..."],"actionPlan":["..."]}',
    '여행자가 현장에서 바로 판단할 수 있게 시간, 이동 피로도, 짐 부담, 예약/도착 리스크를 우선하세요.',
    '과장하지 말고, 확정 예약처럼 말하지 마세요.',
    '',
    `title: ${String(body.title ?? '')}`,
    `question: ${String(body.question ?? '')}`,
    `context: ${context.join(' / ')}`,
    `options: ${options
      .map((option) => `${option.id}: ${option.label} - ${option.details}`)
      .join(' / ')}`,
  ].join('\n');
};

export const onRequestPost = async ({ env, request }: PagesFunctionContext<GeminiEnv>) => {
  try {
    const body = await readJsonBody<TripDecisionRequest>(request);
    const { model, value } = await generateGeminiJson<TripDecisionResponse>(
      env,
      buildTripDecisionPrompt(body),
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
