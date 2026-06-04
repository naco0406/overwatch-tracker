import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SkeletonBlockProps {
  className?: string;
}

const SkeletonBlock = ({ className }: SkeletonBlockProps) => (
  <div
    aria-hidden="true"
    className={cn(
      'relative overflow-hidden rounded-md bg-secondary/80',
      'before:absolute before:inset-0 before:-translate-x-full before:animate-[skeleton-shimmer_1.7s_ease-in-out_infinite]',
      'before:bg-gradient-to-r before:from-transparent before:via-background/60 before:to-transparent',
      className,
    )}
  />
);

interface InlineEmptyStateProps {
  action?: ReactNode;
  className?: string;
  description?: string;
  title: string;
}

const InlineEmptyState = ({ action, className, description, title }: InlineEmptyStateProps) => (
  <div
    className={cn(
      'rounded-md border border-dashed border-border/70 bg-[hsl(var(--surface-2))] p-4',
      className,
    )}
  >
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        {description ? (
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  </div>
);

export { InlineEmptyState, SkeletonBlock };
