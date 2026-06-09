import type { Database } from '@/supabase/database.types';

type PublicEnums = Database['public']['Enums'];

export type AccountType = PublicEnums['account_type'];
export type MatchRole = PublicEnums['match_role'];
export type MatchResult = PublicEnums['match_result'];
export type MatchSource = PublicEnums['match_source'];
export type ModeId = PublicEnums['mode_id'];
export type QueueType = PublicEnums['queue_type'];

export interface TeamComp {
  dps?: [string?, string?];
  support?: [string?, string?];
  tank?: string;
}

export type OcrConfidence = Record<string, number>;

export interface Match {
  account: AccountType;
  accountId?: string | null;
  createdAt: string;
  enemyScore: number;
  id: string;
  mapId: string;
  memo: string;
  modeId: ModeId;
  matchRole: MatchRole;
  myHeroes: string[];
  ocrConfidence?: OcrConfidence;
  playedAt: string;
  queueType: QueueType;
  result: MatchResult;
  sessionId: string;
  source: MatchSource;
  tags: string[];
  teamComp?: TeamComp;
  teamScore: number;
  updatedAt: string;
  userId: string;
}

export type MatchDateInput = Date | string;

export interface MatchCreateInput {
  account?: AccountType;
  accountId?: string | null;
  enemyScore: number;
  mapId: string;
  memo?: string;
  modeId: ModeId;
  matchRole?: MatchRole;
  myHeroes?: string[];
  ocrConfidence?: OcrConfidence | null;
  playedAt?: MatchDateInput;
  queueType?: QueueType;
  result: MatchResult;
  sessionId?: string;
  source?: MatchSource;
  tags?: string[];
  teamComp?: TeamComp | null;
  teamScore: number;
}

export interface MatchUpdateInput {
  account?: AccountType;
  accountId?: string | null;
  enemyScore?: number;
  id: string;
  mapId?: string;
  memo?: string;
  modeId?: ModeId;
  matchRole?: MatchRole;
  myHeroes?: string[];
  ocrConfidence?: OcrConfidence | null;
  playedAt?: MatchDateInput;
  queueType?: QueueType;
  result?: MatchResult;
  sessionId?: string;
  source?: MatchSource;
  tags?: string[];
  teamComp?: TeamComp | null;
  teamScore?: number;
}

export interface MatchFilters {
  account?: AccountType;
  accountId?: string;
  heroId?: string;
  mapId?: string;
  matchRole?: MatchRole;
  modeId?: ModeId;
  playedFrom?: MatchDateInput;
  playedTo?: MatchDateInput;
  queueType?: QueueType;
  sessionId?: string;
}
