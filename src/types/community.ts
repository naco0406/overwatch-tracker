import type { MatchResult, ModeId } from '@/types/match';

export interface UserProfile {
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
  nickname: string;
  userId: string;
}

export interface FriendStatsSummary {
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

export interface FriendRecentFormItem {
  result: MatchResult;
}

export interface FriendStats {
  maps: FriendStatsMap[];
  modes: FriendStatsMode[];
  profile: FriendStatsProfile;
  recentForm: FriendRecentFormItem[];
  summary: FriendStatsSummary;
}
