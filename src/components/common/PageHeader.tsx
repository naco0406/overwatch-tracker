import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  actions?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  compact?: boolean;
}

const PageHeader = ({
  actions,
  className,
  compact = false,
  description,
  eyebrow,
  title,
}: PageHeaderProps) => (
  <div
    className={cn(
      'flex flex-col sm:flex-row sm:justify-between',
      compact ? 'gap-2 sm:items-center' : 'gap-3 sm:items-end',
      className,
    )}
  >
    <div className="min-w-0">
      {eyebrow && <p className={cn('metric-label', compact ? 'mb-1' : 'mb-1.5')}>{eyebrow}</p>}
      <h1
        className={cn(
          'break-words font-bold leading-tight tracking-normal text-foreground',
          compact ? 'text-2xl sm:text-[26px]' : 'text-[26px] sm:text-3xl',
        )}
      >
        {title}
      </h1>
      {description && (
        <p
          className={cn(
            'max-w-2xl break-words text-sm leading-relaxed text-muted-foreground',
            compact ? 'mt-1.5' : 'mt-2',
          )}
        >
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="grid w-full shrink-0 grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 sm:flex sm:w-auto sm:items-center [&>button]:min-w-0 sm:[&>button]:flex-none">
        {actions}
      </div>
    )}
  </div>
);

export { PageHeader };
