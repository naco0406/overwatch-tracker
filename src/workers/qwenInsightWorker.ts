import {
  AutoProcessor,
  ModelRegistry,
  Qwen3_5ForConditionalGeneration,
  Tensor,
  TextStreamer,
  type DataType,
  type DeviceType,
  type Message,
  type Processor,
  type ProgressInfo,
} from '@huggingface/transformers';

import {
  QWEN_STATS_INSIGHT_MODEL,
  type QwenInsightWorkerStatus,
  type QwenInsightWorkerInboundMessage,
  type QwenInsightWorkerOutboundMessage,
} from '@/lib/qwenInsightWorkerProtocol';

const fallbackModelIds = [
  'onnx-community/Qwen3.5-2B-ONNX',
  'onnx-community/Qwen3.5-0.8B-ONNX-OPT',
] as const;
const modelIds = [QWEN_STATS_INSIGHT_MODEL, ...fallbackModelIds] as const;
type QwenInsightGenerator = Awaited<
  ReturnType<typeof Qwen3_5ForConditionalGeneration.from_pretrained>
>;

interface LoadedGenerator {
  device: DeviceType;
  dtype: DataType;
  generator: QwenInsightGenerator;
  model: string;
  processor: Processor;
}

const preferredDtypes = ['q4f16', 'q4', 'q8', 'fp16', 'fp32'] as const satisfies DataType[];
const fallbackDtype = 'q4f16' satisfies DataType;
const maxInsightNewTokens = 220;

let generatorPromise: Promise<LoadedGenerator> | null = null;
let latestRequestId: string | null = null;
const modelStatusSubscriberIds = new Set<string>();

const postWorkerMessage = (message: QwenInsightWorkerOutboundMessage) => {
  self.postMessage(message);
};

const postStatus = (
  id: string,
  message: string,
  status: QwenInsightWorkerStatus,
  options?: { device?: string; dtype?: string; model?: string; progress?: number },
  broadcast = false,
) => {
  const targetIds = broadcast ? new Set([id, ...modelStatusSubscriberIds]) : new Set([id]);

  for (const targetId of targetIds) {
    postWorkerMessage({
      id: targetId,
      message,
      status,
      type: 'status',
      ...options,
    });
  }
};

const hasNavigatorGpu = () =>
  typeof navigator !== 'undefined' &&
  'gpu' in navigator &&
  typeof (navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined';

const getPreferredDtype = async (modelId: string) => {
  try {
    const availableDtypes = await ModelRegistry.get_available_dtypes(modelId);
    return preferredDtypes.find((dtype) => availableDtypes.includes(dtype)) ?? fallbackDtype;
  } catch {
    return fallbackDtype;
  }
};

const getProgressMessage = (progress: ProgressInfo) => {
  if (progress.status === 'progress_total') {
    return {
      message: '분석을 준비하고 있습니다.',
      progress: Math.round(12 + progress.progress * 0.68),
    };
  }

  if (progress.status === 'progress') {
    return { message: '분석을 준비하고 있습니다.', progress: undefined };
  }

  if (progress.status === 'download') {
    return { message: '분석을 준비하고 있습니다.', progress: undefined };
  }

  if (progress.status === 'ready') {
    return { message: '요약을 준비하고 있습니다.', progress: 84 };
  }

  return { message: '분석을 준비하고 있습니다.', progress: undefined };
};

const loadGeneratorForDevice = async ({
  device,
  dtype,
  id,
  modelId,
}: {
  device: DeviceType;
  dtype: DataType;
  id: string;
  modelId: string;
}) => {
  postStatus(
    id,
    '분석을 준비하고 있습니다.',
    'loading',
    {
      device,
      dtype,
      model: modelId,
      progress: 10,
    },
    true,
  );

  const progressCallback = (progress: ProgressInfo) => {
    const { message, progress: progressValue } = getProgressMessage(progress);

    postStatus(
      id,
      message,
      progress.status === 'ready' ? 'ready' : 'downloading',
      {
        device,
        dtype,
        model: modelId,
        progress: progressValue,
      },
      true,
    );
  };

  const [processor, generator] = await Promise.all([
    AutoProcessor.from_pretrained(modelId, {
      progress_callback: progressCallback,
    }),
    Qwen3_5ForConditionalGeneration.from_pretrained(modelId, {
      device,
      dtype,
      progress_callback: progressCallback,
    }),
  ]);

  postStatus(
    id,
    '요약을 준비하고 있습니다.',
    'ready',
    {
      device,
      dtype,
      model: modelId,
      progress: 86,
    },
    true,
  );

  return {
    device,
    dtype,
    generator,
    model: modelId,
    processor,
  };
};

const loadGenerator = async (id: string): Promise<LoadedGenerator> => {
  modelStatusSubscriberIds.add(id);
  postStatus(id, '분석을 준비하고 있습니다.', 'checking', { progress: 8 }, true);

  const primaryDevice = hasNavigatorGpu() ? 'webgpu' : 'wasm';
  let lastError: unknown = null;

  for (const modelId of modelIds) {
    const dtype = await getPreferredDtype(modelId);

    try {
      const loadedGenerator = await loadGeneratorForDevice({
        device: primaryDevice,
        dtype,
        id,
        modelId,
      });
      modelStatusSubscriberIds.clear();
      return loadedGenerator;
    } catch (error) {
      lastError = error;

      if (primaryDevice !== 'webgpu') {
        postStatus(id, '분석을 계속 준비하고 있습니다.', 'loading', {
          dtype,
          model: modelId,
          progress: 18,
        });
        continue;
      }
    }

    postStatus(id, '분석을 계속 준비하고 있습니다.', 'loading', {
      dtype,
      model: modelId,
      progress: 18,
    });

    try {
      const loadedGenerator = await loadGeneratorForDevice({
        device: 'wasm',
        dtype,
        id,
        modelId,
      });
      modelStatusSubscriberIds.clear();
      return loadedGenerator;
    } catch (error) {
      lastError = error;
      postStatus(id, '분석을 계속 준비하고 있습니다.', 'loading', {
        dtype,
        model: modelId,
        progress: 18,
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI 분석 모델을 준비하지 못했습니다.');
};

const getGenerator = async (id: string) => {
  modelStatusSubscriberIds.add(id);
  generatorPromise ??= loadGenerator(id).catch((error) => {
    generatorPromise = null;
    modelStatusSubscriberIds.clear();
    throw error;
  });

  return generatorPromise;
};

const cleanGeneratedText = (value: string) =>
  value
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<\/?think>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const hasCompleteSentenceEnding = (value: string) =>
  /(?:[.!?。！？]|(?:합니다|입니다|습니다|됩니다))$/.test(value.trim());

const removeLikelyTruncatedTrailingLine = (value: string, hitTokenLimit: boolean) => {
  const lines = cleanGeneratedText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '';
  }

  if (lines.join('\n').includes('{')) {
    return lines.join('\n');
  }

  const lastLine = lines.at(-1) ?? '';

  if (lastLine.includes('\uFFFD')) {
    lines.pop();
  } else if (hitTokenLimit && !hasCompleteSentenceEnding(lastLine)) {
    lines.pop();
  }

  return lines.join('\n');
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'AI 분석 생성에 실패했습니다.';

const getInputTokenLength = (inputIds: unknown) =>
  inputIds instanceof Tensor ? (inputIds.dims.at(-1) ?? 0) : 0;

const getGeneratedNewTokenCount = (generatedIds: unknown, inputTokenLength: number) =>
  generatedIds instanceof Tensor
    ? Math.max(0, (generatedIds.dims.at(-1) ?? inputTokenLength) - inputTokenLength)
    : 0;

const readGeneratedText = ({
  generatedIds,
  inputTokenLength,
  processor,
}: {
  generatedIds: unknown;
  inputTokenLength: number;
  processor: Processor;
}) => {
  if (!(generatedIds instanceof Tensor)) {
    return '';
  }

  const generatedTokenLength = generatedIds.dims.at(-1) ?? inputTokenLength;
  const outputTokenIds =
    inputTokenLength > 0
      ? generatedIds.slice(null, [inputTokenLength, generatedTokenLength])
      : generatedIds;

  return processor.batch_decode(outputTokenIds, { skip_special_tokens: true })[0] ?? '';
};

const generateInsight = async (message: QwenInsightWorkerInboundMessage) => {
  if (message.type !== 'generate') {
    return;
  }

  const { id, prompt } = message;
  const { device, dtype, generator, model, processor } = await getGenerator(id);
  let streamedText = '';

  if (id !== latestRequestId) {
    return;
  }

  postStatus(id, '요약 문장을 생성 중입니다.', 'generating', {
    device,
    dtype,
    model,
    progress: 92,
  });

  if (!processor.tokenizer) {
    throw new Error('AI 분석 토크나이저를 준비하지 못했습니다.');
  }

  const streamer = new TextStreamer(processor.tokenizer, {
    callback_function: (text) => {
      if (id !== latestRequestId) {
        return;
      }

      streamedText += text;

      postWorkerMessage({
        id,
        text: cleanGeneratedText(streamedText),
        type: 'chunk',
      });
    },
    skip_prompt: true,
    skip_special_tokens: true,
  });

  const messages: Message[] = [
    {
      content:
        '너는 오버워치 경쟁전 통계 후보 선택기입니다. 추론 과정 없이 JSON 객체만 작성합니다. 출력 스키마는 {"insights":[{"candidateId":"후보 id"}]}입니다. candidateId는 사용자가 제공한 후보 id 값만 사용합니다. title, text, tone 등 다른 필드는 생성하지 않습니다. 마크다운, 코드블록, 서론, 결론, 영어 설명, 단계별 사고, 자기검토 문장은 쓰지 않습니다.',
      role: 'system',
    },
    {
      content: prompt,
      role: 'user',
    },
  ];

  const promptText = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(promptText, null, {
    add_special_tokens: false,
    return_attention_mask: true,
  });
  const inputTokenLength = getInputTokenLength(inputs.input_ids);
  const generatedIds = await generator.generate({
    ...inputs,
    do_sample: false,
    max_new_tokens: maxInsightNewTokens,
    repetition_penalty: 1.12,
    streamer,
  });
  const hitTokenLimit =
    getGeneratedNewTokenCount(generatedIds, inputTokenLength) >= maxInsightNewTokens;
  const text = removeLikelyTruncatedTrailingLine(
    readGeneratedText({ generatedIds, inputTokenLength, processor }) || streamedText,
    hitTokenLimit,
  );

  if (id !== latestRequestId) {
    return;
  }

  postWorkerMessage({
    device,
    dtype,
    id,
    model,
    text,
    type: 'result',
  });
};

self.addEventListener('message', (event: MessageEvent<QwenInsightWorkerInboundMessage>) => {
  if (event.data.type === 'preload') {
    getGenerator(event.data.id).catch((error) => {
      postWorkerMessage({
        error: getErrorMessage(error),
        id: event.data.id,
        type: 'error',
      });
    });

    return;
  }

  latestRequestId = event.data.id;

  generateInsight(event.data).catch((error) => {
    if (event.data.id !== latestRequestId) {
      return;
    }

    postWorkerMessage({
      error: getErrorMessage(error),
      id: event.data.id,
      type: 'error',
    });
  });
});
