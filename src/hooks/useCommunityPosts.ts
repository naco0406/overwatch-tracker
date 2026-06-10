import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import {
  createCommunityPost,
  deleteCommunityPost,
  listCommunityFeed,
  listCommunityStories,
  markCommunityStoryViewed,
} from '@/supabase/communityPosts';
import type { CommunityFeedCursor, CreateCommunityPostInput } from '@/types/communityPost';

export const communityPostsQueryKey = ['community-posts'] as const;
export const communityFeedQueryKey = [...communityPostsQueryKey, 'feed'] as const;
export const communityStoriesQueryKey = [...communityPostsQueryKey, 'stories'] as const;
type CommunityFeedPage = Awaited<ReturnType<typeof listCommunityFeed>>;

export const useCommunityFeed = () =>
  useInfiniteQuery<
    CommunityFeedPage,
    Error,
    InfiniteData<CommunityFeedPage>,
    typeof communityFeedQueryKey,
    CommunityFeedCursor | null
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as CommunityFeedCursor | null,
    queryFn: ({ pageParam }) => listCommunityFeed({ cursor: pageParam }),
    queryKey: communityFeedQueryKey,
  });

export const useCommunityStories = () =>
  useQuery({
    queryFn: listCommunityStories,
    queryKey: communityStoriesQueryKey,
  });

export const useCreateCommunityPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCommunityPostInput) => createCommunityPost(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityPostsQueryKey });
    },
  });
};

export const useDeleteCommunityPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCommunityPost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityPostsQueryKey });
    },
  });
};

export const useMarkCommunityStoryViewed = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markCommunityStoryViewed,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityStoriesQueryKey });
    },
  });
};
