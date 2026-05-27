import type { AccountType, QueueType } from '@/types/match';

export type RoiConfig = Record<string, unknown>;

export interface UserSettings {
  createdAt: string;
  defaultAccount: AccountType;
  defaultQueueType: QueueType;
  roiConfig?: RoiConfig;
  updatedAt: string;
  userId: string;
}

export interface UserSettingsUpdateInput {
  defaultAccount?: AccountType;
  defaultQueueType?: QueueType;
  roiConfig?: RoiConfig | null;
}
