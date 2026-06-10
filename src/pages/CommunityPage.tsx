import { Loader2, Plus, Settings, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { CommunityComposerDialog } from '@/components/community/CommunityComposerDialog';
import { CommunityPostCard } from '@/components/community/CommunityPostCard';
import { CommunityStoryTray } from '@/components/community/CommunityStoryTray';
import { CommunityStoryViewer } from '@/components/community/CommunityStoryViewer';
import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  useCommunityFeed,
  useCommunityStories,
  useDeleteCommunityPost,
} from '@/hooks/useCommunityPosts';
import { useAuth } from '@/hooks/useAuth';
import { useFriends, useOwnProfile } from '@/hooks/useCommunity';

const CommunityPage = () => {
  const [composerOpen, setComposerOpen] = useState(false);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useOwnProfile();
  const { data: friends = [], isLoading: isFriendsLoading } = useFriends();
  const feedQuery = useCommunityFeed();
  const storiesQuery = useCommunityStories();
  const deletePostMutation = useDeleteCommunityPost();
  const posts = useMemo(
    () => feedQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [feedQuery.data],
  );
  const stories = storiesQuery.data ?? [];
  const hasNickname = Boolean(profile?.nickname);
  const isInitialFeedLoading = feedQuery.isLoading || isProfileLoading;
  const isPageLoading = isProfileLoading || isFriendsLoading;

  useEffect(() => {
    const element = sentinelRef.current;

    if (!element || !feedQuery.hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !feedQuery.isFetchingNextPage) {
          void feedQuery.fetchNextPage();
        }
      },
      { rootMargin: '480px 0px' },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [feedQuery]);

  const openStoryViewer = (index: number) => {
    setSelectedStoryIndex(index);
    setStoryViewerOpen(true);
  };

  const deletePost = (postId: string) => {
    if (!window.confirm('게시글을 삭제할까요?')) {
      return;
    }

    deletePostMutation.mutate(postId, {
      onError: (error) => {
        toast({
          description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
          title: '게시글 삭제 실패',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <div className="page-stack mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="친구 전용"
        title="커뮤니티"
        actions={
          <Button type="button" disabled={!hasNickname} onClick={() => setComposerOpen(true)}>
            <Plus className="h-4 w-4" />새 게시글
          </Button>
        }
      />

      {!isPageLoading && !hasNickname ? (
        <InlineEmptyState
          action={
            <Button asChild size="sm">
              <NavLink to="/settings/account">
                <Settings className="h-4 w-4" />
                설정
              </NavLink>
            </Button>
          }
          description="커뮤니티를 사용하려면 먼저 닉네임을 설정해야 합니다."
          title="닉네임이 필요합니다"
        />
      ) : null}

      {hasNickname ? (
        <>
          <CommunityStoryTray
            groups={stories}
            isLoading={storiesQuery.isLoading}
            onSelect={openStoryViewer}
          />

          {feedQuery.error ? (
            <InlineEmptyState
              description={
                feedQuery.error instanceof Error
                  ? feedQuery.error.message
                  : '잠시 후 다시 시도하세요.'
              }
              title="피드를 불러오지 못했습니다"
            />
          ) : null}

          {isInitialFeedLoading ? (
            <CommunityFeedSkeleton />
          ) : posts.length > 0 ? (
            <section className="space-y-4">
              {posts.map((post) => (
                <CommunityPostCard
                  key={post.id}
                  currentUserId={user?.id}
                  isDeleting={deletePostMutation.isPending}
                  post={post}
                  onDelete={deletePost}
                />
              ))}
              <div ref={sentinelRef} className="h-6" />
              {feedQuery.isFetchingNextPage ? (
                <div className="flex justify-center py-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : null}
            </section>
          ) : (
            <InlineEmptyState
              action={
                <div className="flex flex-wrap gap-2">
                  {friends.length === 0 ? (
                    <Button asChild variant="outline" size="sm" className="bg-transparent">
                      <NavLink to="/friends">
                        <UsersRound className="h-4 w-4" />
                        친구 찾기
                      </NavLink>
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" onClick={() => setComposerOpen(true)}>
                    <Plus className="h-4 w-4" />
                    작성
                  </Button>
                </div>
              }
              description={
                friends.length === 0
                  ? '친구를 추가하면 서로의 게시글을 볼 수 있습니다.'
                  : '친구들에게 공유할 첫 게시글을 작성해보세요.'
              }
              title="아직 게시글이 없습니다"
            />
          )}
        </>
      ) : null}

      {composerOpen ? (
        <CommunityComposerDialog open={composerOpen} onOpenChange={setComposerOpen} />
      ) : null}

      {storyViewerOpen ? (
        <CommunityStoryViewer
          key={`${selectedStoryIndex}-${storyViewerOpen ? 'open' : 'closed'}`}
          groups={stories}
          initialGroupIndex={selectedStoryIndex}
          open={storyViewerOpen}
          onOpenChange={setStoryViewerOpen}
        />
      ) : null}
    </div>
  );
};

const CommunityFeedSkeleton = () => (
  <section className="space-y-4">
    {Array.from({ length: 3 }).map((_, index) => (
      <article key={index} className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="flex items-center gap-3 px-3.5 py-3 sm:px-5">
          <SkeletonBlock className="h-10 w-10 rounded-md" />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="mt-2 h-3 w-20" />
          </div>
        </div>
        <SkeletonBlock className="h-72 w-full rounded-none" />
        <div className="px-3.5 py-4 sm:px-5">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-2/3" />
        </div>
      </article>
    ))}
  </section>
);

export { CommunityPage };
