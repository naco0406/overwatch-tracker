import { Loader2, Trash2 } from 'lucide-react';

import { CommunityImageCarousel } from '@/components/community/CommunityImageCarousel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { sanitizeRichTextHtml } from '@/lib/richTextHtml';
import { cn } from '@/lib/utils';
import type { CommunityPost } from '@/types/communityPost';

interface CommunityPostCardProps {
  currentUserId?: string;
  isDeleting?: boolean;
  post: CommunityPost;
  onDelete: (postId: string) => void;
}

const formatPostTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));

const getInitial = (value: string) => value.trim().slice(0, 1).toUpperCase();

const CommunityPostCard = ({
  currentUserId,
  isDeleting = false,
  onDelete,
  post,
}: CommunityPostCardProps) => {
  const isOwnPost = currentUserId === post.author.userId;
  const sanitizedHtml = sanitizeRichTextHtml(post.bodyHtml);

  return (
    <article className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <header className="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-10 w-10 rounded-md">
            <AvatarImage alt={post.author.nickname} src={post.author.avatarUrl ?? undefined} />
            <AvatarFallback className="rounded-md bg-primary/10 text-sm font-black text-primary">
              {getInitial(post.author.nickname)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{post.author.nickname}</p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">
              {formatPostTime(post.createdAt)}
            </p>
          </div>
        </div>

        {isOwnPost ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            disabled={isDeleting}
            aria-label="게시글 삭제"
            onClick={() => onDelete(post.id)}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        ) : null}
      </header>

      <CommunityImageCarousel images={post.images} />

      {post.bodyText ? (
        <div className="px-3.5 py-3 sm:px-5 sm:py-4">
          <div
            className={cn(
              'text-sm font-semibold leading-6 text-foreground',
              '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:list-disc [&_ol]:list-decimal',
              '[&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1 [&_u]:underline',
            )}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </div>
      ) : null}
    </article>
  );
};

export { CommunityPostCard };
