import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { CommunityStoryGroup } from '@/types/communityPost';

interface CommunityStoryTrayProps {
  groups: CommunityStoryGroup[];
  isLoading?: boolean;
  onSelect: (index: number) => void;
}

const getInitial = (value: string) => value.trim().slice(0, 1).toUpperCase();

const CommunityStoryTray = ({ groups, isLoading = false, onSelect }: CommunityStoryTrayProps) => (
  <section className="overflow-hidden rounded-lg border border-border/70 bg-card">
    <div className="mobile-scroll flex gap-3 overflow-x-auto px-3.5 py-3 sm:px-5">
      {isLoading ? (
        Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex w-16 shrink-0 flex-col items-center gap-2">
            <div className="h-14 w-14 rounded-md bg-secondary" />
            <div className="h-3 w-12 rounded bg-secondary" />
          </div>
        ))
      ) : groups.length > 0 ? (
        groups.map((group, index) => (
          <button
            key={group.author.userId}
            type="button"
            className="flex w-16 shrink-0 flex-col items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            onClick={() => onSelect(index)}
          >
            <span className={cn('rounded-md p-0.5', group.hasUnseen ? 'bg-primary' : 'bg-border')}>
              <Avatar className="h-14 w-14 rounded-md border-2 border-card">
                <AvatarImage
                  alt={group.author.nickname}
                  src={group.author.avatarUrl ?? undefined}
                />
                <AvatarFallback className="rounded-md bg-primary/10 text-sm font-black text-primary">
                  {getInitial(group.author.nickname)}
                </AvatarFallback>
              </Avatar>
            </span>
            <span className="w-full truncate text-center text-[11px] font-bold text-muted-foreground">
              {group.author.nickname}
            </span>
          </button>
        ))
      ) : (
        <div className="flex h-16 items-center text-sm font-semibold text-muted-foreground">
          24시간 안에 올라온 스토리가 없습니다.
        </div>
      )}
    </div>
  </section>
);

export { CommunityStoryTray };
