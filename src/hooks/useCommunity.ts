import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  getFriendStats,
  getOwnProfile,
  listFriendRequests,
  listFriends,
  removeFriend,
  saveOwnProfile,
  searchProfiles,
  sendFriendRequest,
} from '@/supabase/community';

export const communityQueryKey = ['community'] as const;

export const ownProfileQueryKey = [...communityQueryKey, 'profile'] as const;

export const friendRequestsQueryKey = [...communityQueryKey, 'requests'] as const;

export const friendsQueryKey = [...communityQueryKey, 'friends'] as const;

export const profileSearchQueryKey = (query: string) =>
  [...communityQueryKey, 'search', query.trim()] as const;

export const friendStatsQueryKey = (friendId?: string) =>
  [...communityQueryKey, 'stats', friendId ?? 'none'] as const;

export const useOwnProfile = () =>
  useQuery({
    queryFn: getOwnProfile,
    queryKey: ownProfileQueryKey,
  });

export const useSaveOwnProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveOwnProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(ownProfileQueryKey, profile);
      void queryClient.invalidateQueries({ queryKey: communityQueryKey });
    },
  });
};

export const useProfileSearch = (query: string, enabled: boolean) =>
  useQuery({
    enabled: enabled && query.trim().length > 0,
    queryFn: () => searchProfiles(query),
    queryKey: profileSearchQueryKey(query),
  });

export const useFriendRequests = () =>
  useQuery({
    queryFn: listFriendRequests,
    queryKey: friendRequestsQueryKey,
  });

export const useFriends = () =>
  useQuery({
    queryFn: listFriends,
    queryKey: friendsQueryKey,
  });

export const useFriendStats = (friendId?: string) =>
  useQuery({
    enabled: Boolean(friendId),
    queryFn: () => getFriendStats(friendId as string),
    queryKey: friendStatsQueryKey(friendId),
  });

const useInvalidateCommunity = () => {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: communityQueryKey });
  };
};

export const useSendFriendRequest = () => {
  const invalidateCommunity = useInvalidateCommunity();

  return useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: invalidateCommunity,
  });
};

export const useAcceptFriendRequest = () => {
  const invalidateCommunity = useInvalidateCommunity();

  return useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: invalidateCommunity,
  });
};

export const useDeclineFriendRequest = () => {
  const invalidateCommunity = useInvalidateCommunity();

  return useMutation({
    mutationFn: declineFriendRequest,
    onSuccess: invalidateCommunity,
  });
};

export const useCancelFriendRequest = () => {
  const invalidateCommunity = useInvalidateCommunity();

  return useMutation({
    mutationFn: cancelFriendRequest,
    onSuccess: invalidateCommunity,
  });
};

export const useRemoveFriend = () => {
  const invalidateCommunity = useInvalidateCommunity();

  return useMutation({
    mutationFn: removeFriend,
    onSuccess: invalidateCommunity,
  });
};
