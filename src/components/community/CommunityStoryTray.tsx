import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { CommunityStoryGroup } from '@/types/communityPost';

interface CommunityStoryTrayProps {
  groups: CommunityStoryGroup[];
  isLoading?: boolean;
  onSelect: (index: number) => void;
}

const getInitial = (value: string) => value.trim().slice(0, 1).toUpperCase();

const CommunityStoryTray = ({ groups, isLoading = false, onSelect }: CommunityStoryTrayProps) => {
  if (!isLoading && groups.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden" aria-label="친구 스토리">
      <div className="mobile-scroll flex gap-3 overflow-x-auto px-0.5 pb-1 pt-0.5">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex w-[74px] shrink-0 flex-col items-center gap-2 py-1">
                <div className="rounded-full bg-secondary p-[3px]">
                  <div className="h-[62px] w-[62px] rounded-full bg-muted" />
                </div>
                <div className="h-3 w-12 rounded bg-secondary" />
              </div>
            ))
          : groups.map((group, index) => (
              <button
                key={group.author.userId}
                type="button"
                className="group/story flex w-[74px] shrink-0 flex-col items-center gap-2 rounded-md py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                aria-label={`${group.author.nickname} 스토리 보기`}
                onClick={() => onSelect(index)}
              >
                <span
                  className={cn(
                    'rounded-full p-[2px] transition-transform duration-150 group-hover/story:scale-[1.04] group-active/story:scale-[0.98]',
                    group.hasUnseen
                      ? 'bg-[conic-gradient(from_180deg,hsl(var(--primary)),hsl(var(--accent)),hsl(var(--primary)))]'
                      : 'bg-border/70',
                  )}
                >
                  <span className="block rounded-full bg-background p-[2px]">
                    <Avatar className="h-[62px] w-[62px] rounded-full">
                      <AvatarImage
                        alt={group.author.nickname}
                        src={group.author.avatarUrl ?? undefined}
                      />
                      <AvatarFallback className="rounded-full bg-primary/10 text-sm font-black text-primary">
                        {getInitial(group.author.nickname)}
                      </AvatarFallback>
                    </Avatar>
                  </span>
                </span>
                <span
                  className={cn(
                    'w-full truncate text-center text-[11px] font-semibold leading-none',
                    group.hasUnseen ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {group.author.nickname}
                </span>
              </button>
            ))}
      </div>
    </section>
  );
};

export { CommunityStoryTray };
