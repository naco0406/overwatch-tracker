import { supabase } from '@/supabase/client';
import { getCurrentUserOrThrow } from '@/supabase/currentUser';
import type { Database, Json } from '@/supabase/database.types';
import type {
  FriendRecentFormItem,
  FriendRequest,
  FriendRequestDirection,
  FriendRequestStatus,
  FriendStats,
  FriendStatsMap,
  FriendStatsMode,
  FriendStatsProfile,
  FriendStatsSummary,
  FriendSummary,
  ProfileRelationship,
  ProfileSearchResult,
  UserProfile,
} from '@/types/community';
import type { MatchResult, ModeId } from '@/types/match';

type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
type UserProfileInsert = Database['public']['Tables']['user_profiles']['Insert'];
type FriendRequestRow = Database['public']['Functions']['list_friend_requests']['Returns'][number];
type FriendSummaryRow = Database['public']['Functions']['list_friends']['Returns'][number];
type FriendStatsRow = Database['public']['Functions']['get_friend_stats']['Returns'][number];
type ProfileSearchRow = Database['public']['Functions']['search_user_profiles']['Returns'][number];

interface SaveUserProfileInput {
  avatarUrl?: string | null;
  isDiscoverable?: boolean;
  nickname: string;
}

const relationshipValues: ProfileRelationship[] = ['friend', 'none', 'received', 'sent'];
const requestDirectionValues: FriendRequestDirection[] = ['incoming', 'outgoing'];
const requestStatusValues: FriendRequestStatus[] = ['accepted', 'canceled', 'declined', 'pending'];
const matchResultValues: MatchResult[] = ['draw', 'loss', 'win'];
const modeValues: ModeId[] = ['control', 'escort', 'flashpoint', 'hybrid', 'push'];

const normalizeNickname = (nickname: string) => nickname.trim();

const sanitizeNickname = (nickname: string | null) => {
  if (!nickname || nickname.includes('@')) {
    return null;
  }

  return nickname;
};

const normalizeAvatarUrl = (avatarUrl?: string | null) => {
  const normalized = avatarUrl?.trim() ?? '';

  return normalized || null;
};

const sanitizeAvatarUrl = (avatarUrl: string | null) => {
  if (!avatarUrl) {
    return null;
  }

  try {
    const url = new URL(avatarUrl);

    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const ensureAvatarUrl = (avatarUrl?: string | null) => {
  const normalized = normalizeAvatarUrl(avatarUrl);

  if (!normalized) {
    return null;
  }

  if (normalized.length > 500) {
    throw new Error('프로필 이미지 URL은 500자 이하로 입력하세요.');
  }

  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error('프로필 이미지 URL을 다시 확인하세요.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('프로필 이미지 URL은 https:// 주소만 사용할 수 있습니다.');
  }

  return url.toString();
};

const ensureNickname = (nickname: string) => {
  const normalized = normalizeNickname(nickname);

  if (!normalized) {
    throw new Error('닉네임을 입력하세요.');
  }

  if (normalized.length < 2 || normalized.length > 20) {
    throw new Error('닉네임은 2자 이상 20자 이하로 입력하세요.');
  }

  if (!/^[A-Za-z0-9가-힣_]+$/.test(normalized)) {
    throw new Error('닉네임은 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다.');
  }

  return normalized;
};

const toProfileSaveError = (error: { code?: string; message?: string }) => {
  if (error.code === '23505' && error.message?.includes('user_profiles_normalized_nickname_key')) {
    return new Error('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력하세요.');
  }

  if (error.code === '23514' && error.message?.includes('avatar_url')) {
    return new Error('프로필 이미지 URL은 https:// 주소만 사용할 수 있습니다.');
  }

  if (error.code === '23514') {
    return new Error('닉네임은 2~20자의 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다.');
  }

  return new Error(error.message ?? '프로필 저장에 실패했습니다.');
};

const asRecord = (value: Json): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: Json): Json[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const asNullableString = (value: unknown) => (typeof value === 'string' ? value : null);

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asRelationship = (value: string): ProfileRelationship =>
  relationshipValues.includes(value as ProfileRelationship)
    ? (value as ProfileRelationship)
    : 'none';

const asRequestDirection = (value: string): FriendRequestDirection =>
  requestDirectionValues.includes(value as FriendRequestDirection)
    ? (value as FriendRequestDirection)
    : 'outgoing';

const asRequestStatus = (value: string): FriendRequestStatus =>
  requestStatusValues.includes(value as FriendRequestStatus)
    ? (value as FriendRequestStatus)
    : 'pending';

const asModeId = (value: unknown): ModeId | null =>
  typeof value === 'string' && modeValues.includes(value as ModeId) ? (value as ModeId) : null;

const asMatchResult = (value: unknown): MatchResult | null =>
  typeof value === 'string' && matchResultValues.includes(value as MatchResult)
    ? (value as MatchResult)
    : null;

const rowToProfile = (row: UserProfileRow): UserProfile => ({
  avatarUpdatedAt: row.avatar_updated_at,
  avatarUrl: sanitizeAvatarUrl(row.avatar_url),
  createdAt: row.created_at,
  isDiscoverable: row.is_discoverable,
  nickname: sanitizeNickname(row.nickname),
  updatedAt: row.updated_at,
  userId: row.user_id,
});

const rowToSearchResult = (row: ProfileSearchRow): ProfileSearchResult => ({
  createdAt: row.created_at,
  nickname: row.nickname,
  relationship: asRelationship(row.relationship),
  requestId: row.request_id,
  userId: row.user_id,
});

const rowToFriendRequest = (row: FriendRequestRow): FriendRequest => ({
  createdAt: row.created_at,
  direction: asRequestDirection(row.direction),
  nickname: row.nickname,
  requestId: row.request_id,
  respondedAt: row.responded_at,
  status: asRequestStatus(row.status),
  userId: row.user_id,
});

const rowToFriendSummary = (row: FriendSummaryRow): FriendSummary => ({
  draws: row.draws,
  friendId: row.friend_id,
  friendsSince: row.friends_since,
  losses: row.losses,
  nickname: row.nickname,
  totalMatches: row.total_matches,
  winRate: row.win_rate,
  wins: row.wins,
});

const parseStatsMode = (value: Json): FriendStatsMode | null => {
  const record = asRecord(value);
  const modeId = asModeId(record.modeId);

  if (!modeId) {
    return null;
  }

  return {
    draws: asNumber(record.draws),
    losses: asNumber(record.losses),
    modeId,
    totalMatches: asNumber(record.totalMatches),
    winRate: asNumber(record.winRate),
    wins: asNumber(record.wins),
  };
};

const parseStatsMap = (value: Json): FriendStatsMap | null => {
  const record = asRecord(value);
  const modeId = asModeId(record.modeId);
  const mapId = asNullableString(record.mapId);

  if (!mapId || !modeId) {
    return null;
  }

  return {
    draws: asNumber(record.draws),
    losses: asNumber(record.losses),
    mapId,
    modeId,
    totalMatches: asNumber(record.totalMatches),
    winRate: asNumber(record.winRate),
    wins: asNumber(record.wins),
  };
};

const parseRecentFormItem = (value: Json): FriendRecentFormItem | null => {
  const result = asMatchResult(asRecord(value).result);

  return result ? { result } : null;
};

const rowToFriendStats = (row: FriendStatsRow): FriendStats => {
  const profileRecord = asRecord(row.profile);
  const summaryRecord = asRecord(row.summary);
  const profile: FriendStatsProfile = {
    nickname: asString(profileRecord.nickname, '친구'),
    userId: asString(profileRecord.userId),
  };
  const summary: FriendStatsSummary = {
    bestMapId: asNullableString(summaryRecord.bestMapId),
    bestModeId: asModeId(summaryRecord.bestModeId),
    draws: asNumber(summaryRecord.draws),
    losses: asNumber(summaryRecord.losses),
    totalMatches: asNumber(summaryRecord.totalMatches),
    winRate: asNumber(summaryRecord.winRate),
    wins: asNumber(summaryRecord.wins),
  };

  return {
    maps: asArray(row.maps)
      .map(parseStatsMap)
      .filter((map): map is FriendStatsMap => Boolean(map)),
    modes: asArray(row.modes)
      .map(parseStatsMode)
      .filter((mode): mode is FriendStatsMode => Boolean(mode)),
    profile,
    recentForm: asArray(row.recent_form)
      .map(parseRecentFormItem)
      .filter((form): form is FriendRecentFormItem => Boolean(form)),
    summary,
  };
};

export const getOwnProfile = async () => {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? rowToProfile(data) : null;
};

export const saveOwnProfile = async (input: SaveUserProfileInput) => {
  const user = await getCurrentUserOrThrow();
  const avatarUrl = input.avatarUrl === undefined ? undefined : ensureAvatarUrl(input.avatarUrl);
  const row: UserProfileInsert = {
    is_discoverable: input.isDiscoverable ?? true,
    nickname: ensureNickname(input.nickname),
    user_id: user.id,
  };

  if (avatarUrl !== undefined) {
    row.avatar_updated_at = new Date().toISOString();
    row.avatar_url = avatarUrl;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw toProfileSaveError(error);
  }

  return rowToProfile(data);
};

export const searchProfiles = async (query: string) => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const { data, error } = await supabase.rpc('search_user_profiles', {
    p_limit: 10,
    p_query: normalizedQuery,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map(rowToSearchResult);
};

export const listFriendRequests = async () => {
  const { data, error } = await supabase.rpc('list_friend_requests');

  if (error) {
    throw error;
  }

  return (data ?? []).map(rowToFriendRequest);
};

export const listFriends = async () => {
  const { data, error } = await supabase.rpc('list_friends');

  if (error) {
    throw error;
  }

  return (data ?? []).map(rowToFriendSummary);
};

export const sendFriendRequest = async (recipientId: string) => {
  const { data, error } = await supabase.rpc('send_friend_request', {
    p_recipient_id: recipientId,
  });

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
};

export const acceptFriendRequest = async (requestId: string) => {
  const { data, error } = await supabase.rpc('accept_friend_request', {
    p_request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
};

export const declineFriendRequest = async (requestId: string) => {
  const { error } = await supabase.rpc('decline_friend_request', {
    p_request_id: requestId,
  });

  if (error) {
    throw error;
  }
};

export const cancelFriendRequest = async (requestId: string) => {
  const { error } = await supabase.rpc('cancel_friend_request', {
    p_request_id: requestId,
  });

  if (error) {
    throw error;
  }
};

export const removeFriend = async (friendId: string) => {
  const { error } = await supabase.rpc('remove_friend', {
    p_friend_id: friendId,
  });

  if (error) {
    throw error;
  }
};

export const getFriendStats = async (friendId: string) => {
  const { data, error } = await supabase.rpc('get_friend_stats', {
    p_friend_id: friendId,
  });

  if (error) {
    throw error;
  }

  const row = data?.[0];

  if (!row) {
    throw new Error('친구 통계를 찾을 수 없습니다.');
  }

  return rowToFriendStats(row);
};
