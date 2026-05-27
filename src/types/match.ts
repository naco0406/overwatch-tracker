import type { Database } from '@/supabase/database.types';

type PublicEnums = Database['public']['Enums'];

export type AccountType = PublicEnums['account_type'];
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
  createdAt: string;
  enemyScore: number;
  id: string;
  mapId: string;
  memo: string;
  modeId: ModeId;
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
  enemyScore: number;
  mapId: string;
  memo?: string;
  modeId: ModeId;
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
  enemyScore?: number;
  id: string;
  mapId?: string;
  memo?: string;
  modeId?: ModeId;
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
  heroId?: string;
  mapId?: string;
  modeId?: ModeId;
  playedFrom?: MatchDateInput;
  playedTo?: MatchDateInput;
  queueType?: QueueType;
  sessionId?: string;
}
