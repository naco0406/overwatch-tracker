import type { AccountType, MatchRole, QueueType } from '@/types/match';

export type RoiConfig = Record<string, unknown>;

export interface FavoriteEsportsTeam {
  aliases?: string[];
  id: string;
  logoUrl?: string | null;
  name: string;
  region?: string | null;
  selectedAt?: string;
  sourceId?: string | null;
}

export interface UserSettings {
  createdAt: string;
  defaultAccount: AccountType;
  defaultMatchRole: MatchRole;
  defaultPlayerAccountId: string | null;
  defaultQueueType: QueueType;
  favoriteEsportsTeam: FavoriteEsportsTeam | null;
  roiConfig?: RoiConfig;
  updatedAt: string;
  userId: string;
}

export interface UserSettingsUpdateInput {
  defaultAccount?: AccountType;
  defaultMatchRole?: MatchRole;
  defaultPlayerAccountId?: string | null;
  defaultQueueType?: QueueType;
  favoriteEsportsTeam?: FavoriteEsportsTeam | null;
  roiConfig?: RoiConfig | null;
}
