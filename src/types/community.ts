import type { MatchResult, ModeId } from '@/types/match';

export interface UserProfile {
  avatarUpdatedAt: string | null;
  avatarUrl: string | null;
  createdAt: string;
  isDiscoverable: boolean;
  nickname: string | null;
  updatedAt: string;
  userId: string;
}

export type ProfileRelationship = 'friend' | 'none' | 'received' | 'sent';

export interface ProfileSearchResult {
  createdAt: string;
  nickname: string;
  relationship: ProfileRelationship;
  requestId: string | null;
  userId: string;
}

export type FriendRequestDirection = 'incoming' | 'outgoing';
export type FriendRequestStatus = 'accepted' | 'canceled' | 'declined' | 'pending';

export interface FriendRequest {
  createdAt: string;
  direction: FriendRequestDirection;
  nickname: string;
  requestId: string;
  respondedAt: string | null;
  status: FriendRequestStatus;
  userId: string;
}

export interface FriendSummary {
  avatarUrl: string | null;
  draws: number;
  friendId: string;
  friendsSince: string;
  losses: number;
  nickname: string;
  totalMatches: number;
  winRate: number;
  wins: number;
}

export interface FriendStatsProfile {
  avatarUrl: string | null;
  nickname: string;
  userId: string;
}

export interface FriendStatsSummary {
  bestHeroId: string | null;
  bestMapId: string | null;
  bestModeId: ModeId | null;
  draws: number;
  losses: number;
  totalMatches: number;
  winRate: number;
  wins: number;
}

export interface FriendStatsMode {
  draws: number;
  losses: number;
  modeId: ModeId;
  totalMatches: number;
  winRate: number;
  wins: number;
}

export interface FriendStatsMap {
  draws: number;
  losses: number;
  mapId: string;
  modeId: ModeId;
  totalMatches: number;
  winRate: number;
  wins: number;
}

export interface FriendStatsHero {
  draws: number;
  heroId: string;
  losses: number;
  totalMatches: number;
  winRate: number;
  wins: number;
}

export interface FriendRecentFormItem {
  heroIds: string[];
  mapId: string | null;
  modeId: ModeId | null;
  playedAt: string | null;
  result: MatchResult;
}

export interface FriendStats {
  heroes: FriendStatsHero[];
  maps: FriendStatsMap[];
  modes: FriendStatsMode[];
  profile: FriendStatsProfile;
  recentForm: FriendRecentFormItem[];
  summary: FriendStatsSummary;
}
