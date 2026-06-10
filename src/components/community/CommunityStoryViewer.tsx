import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CommunityImageCarousel } from '@/components/community/CommunityImageCarousel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMarkCommunityStoryViewed } from '@/hooks/useCommunityPosts';
import { sanitizeRichTextHtml } from '@/lib/richTextHtml';
import { cn } from '@/lib/utils';
import type { CommunityStoryGroup } from '@/types/communityPost';

interface CommunityStoryViewerProps {
  groups: CommunityStoryGroup[];
  initialGroupIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CommunityStoryViewer = ({
  groups,
  initialGroupIndex,
  onOpenChange,
  open,
}: CommunityStoryViewerProps) => {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [postIndex, setPostIndex] = useState(0);
  const viewedPostIdsRef = useRef(new Set<string>());
  const markViewedMutation = useMarkCommunityStoryViewed();
  const group = groups[groupIndex];
  const post = group?.posts[postIndex];

  useEffect(() => {
    if (!open || !post || viewedPostIdsRef.current.has(post.id)) {
      return;
    }

    viewedPostIdsRef.current.add(post.id);
    markViewedMutation.mutate(post.id);
  }, [markViewedMutation, open, post]);

  const goPrevious = () => {
    if (postIndex > 0) {
      setPostIndex((current) => current - 1);
      return;
    }

    if (groupIndex > 0) {
      const previousGroup = groups[groupIndex - 1];

      setGroupIndex((current) => current - 1);
      setPostIndex(Math.max(0, previousGroup.posts.length - 1));
    }
  };

  const goNext = () => {
    if (group && postIndex < group.posts.length - 1) {
      setPostIndex((current) => current + 1);
      return;
    }

    if (groupIndex < groups.length - 1) {
      setGroupIndex((current) => current + 1);
      setPostIndex(0);
      return;
    }

    onOpenChange(false);
  };

  const canGoPrevious = groupIndex > 0 || postIndex > 0;
  const sanitizedHtml = post ? sanitizeRichTextHtml(post.bodyHtml) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-2xl flex-col gap-0 p-0 sm:h-[760px] sm:max-h-[calc(100dvh-3rem)]">
        <DialogHeader className="border-b border-border bg-card px-4 py-4 pr-14 sm:px-5">
          <DialogTitle>{group?.author.nickname ?? '스토리'}</DialogTitle>
          <DialogDescription className="sr-only">
            24시간 동안 노출되는 친구 게시글 스토리를 확인합니다.
          </DialogDescription>
          {group ? (
            <div className="mt-2 flex gap-1">
              {group.posts.map((storyPost, index) => (
                <span
                  key={storyPost.id}
                  className={cn(
                    'h-1 flex-1 rounded-full bg-secondary',
                    index <= postIndex && 'bg-primary',
                  )}
                />
              ))}
            </div>
          ) : null}
        </DialogHeader>

        {post ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--surface-2))]">
            <CommunityImageCarousel className="border-t-0" images={post.images} />
            {post.bodyText ? (
              <div className="p-4 sm:p-5">
                <div
                  className={cn(
                    'rounded-md border border-border bg-card p-4 text-sm font-semibold leading-6',
                    '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:list-disc [&_ol]:list-decimal',
                    '[&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1 [&_u]:underline',
                  )}
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-[hsl(var(--surface-2))] text-sm font-semibold text-muted-foreground">
            표시할 스토리가 없습니다.
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            className="bg-transparent"
            disabled={!canGoPrevious}
            onClick={goPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>
          <Button type="button" onClick={goNext}>
            다음
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { CommunityStoryViewer };
