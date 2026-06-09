import type { AccountType, MatchRole, QueueType } from '@/types/match';

export type RoiConfig = Record<string, unknown>;

export interface UserSettings {
  createdAt: string;
  defaultAccount: AccountType;
  defaultMatchRole: MatchRole;
  defaultPlayerAccountId: string | null;
  defaultQueueType: QueueType;
  roiConfig?: RoiConfig;
  updatedAt: string;
  userId: string;
}

export interface UserSettingsUpdateInput {
  defaultAccount?: AccountType;
  defaultMatchRole?: MatchRole;
  defaultPlayerAccountId?: string | null;
  defaultQueueType?: QueueType;
  roiConfig?: RoiConfig | null;
}
