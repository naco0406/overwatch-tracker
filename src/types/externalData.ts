import type { MatchRole, ModeId } from '@/types/match';

export type ExternalSourceType =
  | 'official_api'
  | 'official_web'
  | 'third_party_api'
  | 'third_party_web';

export interface ExternalSource {
  baseUrl: string;
  defaultTtlSeconds: number;
  displayName: string;
  id: string;
  isEnabled: boolean;
  isOfficial: boolean;
  notes: string;
  sourceType: ExternalSourceType;
  updatedAt: string;
}

export type ExternalPlatform = 'console' | 'pc' | 'unknown';
export type ExternalRegion = 'americas' | 'asia' | 'europe' | 'global' | 'unknown';
export type ExternalGameMode = 'all' | 'competitive' | 'quickplay';

export interface ExternalCompetitiveRank {
  division?: string;
  role: MatchRole;
  tier?: string;
}

export interface ExternalPlayerProfile {
  accountId: string;
  avatarUrl: string | null;
  competitiveRanks: ExternalCompetitiveRank[];
  externalPlayerId: string;
  fetchedAt: string;
  id: string;
  isPublic: boolean | null;
  namecardUrl: string | null;
  platform: ExternalPlatform | null;
  publicName: string;
  region: ExternalRegion | null;
  sourceId: string;
  title: string | null;
  userId: string;
}

export interface ExternalPlayerStatsSnapshot {
  accountId: string;
  fetchedAt: string;
  gamemode: ExternalGameMode;
  general: Record<string, unknown>;
  heroes: Record<string, unknown>;
  id: string;
  platform: ExternalPlatform;
  roles: Record<string, unknown>;
  sourceId: string;
  userId: string;
}

export type GlobalHeroRateSampleState = 'available' | 'low_sample' | 'unavailable';

export interface GlobalHeroRateSnapshot {
  fetchedAt: string;
  gamemode: string;
  heroId: string;
  id: string;
  inputMethod: string;
  mapId: string | 'all';
  patchLabel: string;
  banRate: number | null;
  pickRate: number | null;
  region: string;
  role: MatchRole | 'all';
  sampleState: GlobalHeroRateSampleState;
  sourceId: string;
  tier: string;
  winRate: number | null;
}

export type ExternalEsportsEventStatus =
  | 'canceled'
  | 'completed'
  | 'live'
  | 'postponed'
  | 'scheduled';

export interface ExternalEsportsEvent {
  externalEventId: string;
  fetchedAt: string;
  id: string;
  metadata: Record<string, unknown>;
  region: string;
  scoreA: number | null;
  scoreB: number | null;
  series: string;
  sourceId: string;
  stage: string;
  startsAt: string | null;
  status: ExternalEsportsEventStatus;
  teamA: string;
  teamB: string;
  tournament: string;
  watchUrls: string[];
}

export interface ExternalHeroRateComparison {
  heroId: string;
  modeId?: ModeId | 'all';
  myTotalMatches: number;
  myWinRate: number | null;
  source: ExternalSource;
  sourceFetchedAt: string;
  sourcePickRate: number | null;
  sourceWinRate: number | null;
  winRateDelta: number | null;
}

export interface ExternalStatsInsightContext {
  heroComparisons: ExternalHeroRateComparison[];
  notes: string[];
  sources: ExternalSource[];
}

export interface ExternalDataWarning {
  endpoint: string;
  message: string;
  status?: number;
}

export interface ExternalDataOverview {
  esportsEvents: ExternalEsportsEvent[];
  heroRates: GlobalHeroRateSnapshot[];
  sources: ExternalSource[];
  warnings: ExternalDataWarning[];
}
