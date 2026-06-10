import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useMarkCommunityStoryViewed } from '@/hooks/useCommunityPosts';
import { getRichTextPlainText } from '@/lib/richTextHtml';
import { cn } from '@/lib/utils';
import type {
  CommunityPostImage,
  CommunityStoryGroup,
  CommunityStoryPost,
} from '@/types/communityPost';

interface CommunityStoryViewerProps {
  groups: CommunityStoryGroup[];
  initialGroupIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StorySegment {
  image: CommunityPostImage | null;
  key: string;
  post: CommunityStoryPost;
}

const storyDurationMs = 6500;
const storyHeaderGradientStyle: CSSProperties = {
  background:
    'linear-gradient(to bottom, rgba(2, 6, 23, 0.78) 0%, rgba(2, 6, 23, 0.50) 42%, rgba(2, 6, 23, 0.18) 72%, rgba(2, 6, 23, 0) 100%)',
};
const storyCaptionGradientStyle: CSSProperties = {
  background:
    'radial-gradient(120% 90% at 50% 100%, rgba(15, 23, 42, 0.86) 0%, rgba(15, 23, 42, 0.42) 52%, rgba(15, 23, 42, 0) 100%), linear-gradient(to top, rgba(2, 6, 23, 0.95) 0%, rgba(2, 6, 23, 0.78) 36%, rgba(2, 6, 23, 0.34) 70%, rgba(2, 6, 23, 0) 100%)',
};
const storyCaptionTextStyle: CSSProperties = {
  textShadow: '0 2px 14px rgba(0, 0, 0, 0.62)',
};

const getInitial = (value: string) => value.trim().slice(0, 1).toUpperCase();
const createStorySegments = (group?: CommunityStoryGroup): StorySegment[] =>
  group?.posts.flatMap<StorySegment>((post) =>
    post.images.length > 0
      ? post.images.map<StorySegment>((image) => ({
          image,
          key: `${post.id}:${image.id}`,
          post,
        }))
      : [
          {
            image: null,
            key: post.id,
            post,
          },
        ],
  ) ?? [];

const CommunityStoryViewer = ({
  groups,
  initialGroupIndex,
  onOpenChange,
  open,
}: CommunityStoryViewerProps) => {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [progressState, setProgressState] = useState({ key: '', value: 0 });
  const viewedPostIdsRef = useRef(new Set<string>());
  const markViewedMutation = useMarkCommunityStoryViewed();
  const group = groups[groupIndex];
  const segments = useMemo(() => createStorySegments(group), [group]);
  const safeSegmentIndex = Math.min(segmentIndex, Math.max(0, segments.length - 1));
  const segment = segments[safeSegmentIndex];
  const segmentKey = segment?.key;
  const post = segment?.post;
  const captionText = useMemo(
    () => (post ? getRichTextPlainText(post.bodyHtml) || post.bodyText : ''),
    [post],
  );

  useEffect(() => {
    if (!open || !post || viewedPostIdsRef.current.has(post.id)) {
      return;
    }

    viewedPostIdsRef.current.add(post.id);
    markViewedMutation.mutate(post.id);
  }, [markViewedMutation, open, post]);

  const goPrevious = useCallback(() => {
    if (safeSegmentIndex > 0) {
      setSegmentIndex(safeSegmentIndex - 1);
      return;
    }

    if (groupIndex > 0) {
      const previousSegments = createStorySegments(groups[groupIndex - 1]);

      setGroupIndex((current) => current - 1);
      setSegmentIndex(Math.max(0, previousSegments.length - 1));
    }
  }, [groupIndex, groups, safeSegmentIndex]);

  const goNext = useCallback(() => {
    if (safeSegmentIndex < segments.length - 1) {
      setSegmentIndex(safeSegmentIndex + 1);
      return;
    }

    if (groupIndex < groups.length - 1) {
      setGroupIndex((current) => current + 1);
      setSegmentIndex(0);
      return;
    }

    onOpenChange(false);
  }, [groupIndex, groups.length, onOpenChange, safeSegmentIndex, segments.length]);

  const goNextRef = useRef(goNext);

  useEffect(() => {
    goNextRef.current = goNext;
  }, [goNext]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!group) {
      onOpenChange(false);
      return;
    }
  }, [group, onOpenChange, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrevious, open]);

  useEffect(() => {
    if (!open || !segmentKey) {
      return;
    }

    let frameId = 0;
    const startedAt = performance.now();

    const tick = (timestamp: number) => {
      const nextProgress = Math.min(1, (timestamp - startedAt) / storyDurationMs);

      setProgressState({ key: segmentKey, value: nextProgress });

      if (nextProgress >= 1) {
        goNextRef.current();
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [open, segmentKey]);

  const progress = progressState.key === segmentKey ? progressState.value : 0;
  const canGoPrevious = groupIndex > 0 || safeSegmentIndex > 0;
  const isLastStory =
    Boolean(group) && groupIndex === groups.length - 1 && safeSegmentIndex >= segments.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-0.75rem)] max-w-[430px] flex-col gap-0 overflow-hidden border-slate-900 bg-slate-950 p-0 text-white sm:h-[760px] sm:max-h-[calc(100dvh-3rem)] [&>button]:right-3 [&>button]:top-3 [&>button]:z-30 [&>button]:border-white/10 [&>button]:bg-black/20 [&>button]:text-white/75 [&>button:hover]:bg-black/35 [&>button:hover]:text-white">
        <DialogTitle className="sr-only">{group?.author.nickname ?? '스토리'}</DialogTitle>
        <DialogDescription className="sr-only">
          24시간 동안 노출되는 친구 게시글 스토리를 확인합니다.
        </DialogDescription>

        {segment ? (
          <div className="relative h-full min-h-0 overflow-hidden bg-white">
            {segment.image ? (
              <img
                key={segment.key}
                alt=""
                className="h-full w-full select-none object-contain"
                draggable={false}
                src={segment.image.imageUrl}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-slate-900 px-8 text-center text-sm font-semibold text-white/65">
                이미지가 없는 스토리입니다.
              </div>
            )}

            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pb-14 pt-3"
              style={storyHeaderGradientStyle}
            >
              <div className="flex gap-1">
                {segments.map((storySegment, index) => (
                  <span
                    key={storySegment.key}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    <span
                      className="block h-full rounded-full bg-white"
                      style={{
                        width:
                          index < safeSegmentIndex
                            ? '100%'
                            : index === safeSegmentIndex
                              ? `${progress * 100}%`
                              : '0%',
                      }}
                    />
                  </span>
                ))}
              </div>

              <div className="mt-3 flex min-w-0 items-center gap-2 pr-12">
                {group ? (
                  <Avatar className="h-8 w-8 border border-white/20">
                    <AvatarImage
                      alt={group.author.nickname}
                      src={group.author.avatarUrl ?? undefined}
                    />
                    <AvatarFallback className="bg-white/15 text-xs font-black text-white">
                      {getInitial(group.author.nickname)}
                    </AvatarFallback>
                  </Avatar>
                ) : null}
                <p className="truncate text-sm font-bold leading-none text-white drop-shadow">
                  {group?.author.nickname ?? '스토리'}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="absolute inset-y-20 left-0 z-20 w-1/3 cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none"
              disabled={!canGoPrevious}
              aria-label="이전 스토리"
              onClick={goPrevious}
            />
            <button
              type="button"
              className="absolute inset-y-20 right-0 z-20 w-1/3 cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label={isLastStory ? '스토리 닫기' : '다음 스토리'}
              onClick={goNext}
            />

            {captionText ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-5 pt-28 sm:px-5 sm:pt-32"
                style={storyCaptionGradientStyle}
              >
                <p
                  className={cn(
                    'line-clamp-3 whitespace-pre-line break-words text-sm font-semibold leading-[1.625rem] text-white',
                    'sm:text-[15px] sm:leading-7',
                  )}
                  style={storyCaptionTextStyle}
                >
                  {captionText}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center bg-slate-950 text-sm font-semibold text-white/65">
            표시할 스토리가 없습니다.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export { CommunityStoryViewer };
