export const QWEN_STATS_INSIGHT_MODEL = 'onnx-community/Qwen3.5-2B-ONNX-OPT';

export interface QwenInsightPreloadMessage {
  id: string;
  type: 'preload';
}

export interface QwenInsightGenerateMessage {
  id: string;
  prompt: string;
  type: 'generate';
}

export type QwenInsightWorkerInboundMessage =
  | QwenInsightGenerateMessage
  | QwenInsightPreloadMessage;

export type QwenInsightWorkerStatus =
  | 'checking'
  | 'loading'
  | 'downloading'
  | 'generating'
  | 'ready';

export interface QwenInsightStatusMessage {
  device?: string;
  dtype?: string;
  id: string;
  message: string;
  model?: string;
  progress?: number;
  status: QwenInsightWorkerStatus;
  type: 'status';
}

export interface QwenInsightChunkMessage {
  id: string;
  text: string;
  type: 'chunk';
}

export interface QwenInsightResultMessage {
  device: string;
  dtype: string;
  id: string;
  model: string;
  text: string;
  type: 'result';
}

export interface QwenInsightErrorMessage {
  error: string;
  id: string;
  type: 'error';
}

export type QwenInsightWorkerOutboundMessage =
  | QwenInsightChunkMessage
  | QwenInsightErrorMessage
  | QwenInsightResultMessage
  | QwenInsightStatusMessage;
