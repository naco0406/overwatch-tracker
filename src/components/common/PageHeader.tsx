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
      'ow-page-header flex flex-col sm:flex-row sm:justify-between',
      compact ? 'gap-2 sm:items-center' : 'gap-3 sm:items-end',
      className,
    )}
  >
    <div className="min-w-0">
      {eyebrow && (
        <p
          className={cn(
            'metric-label mb-1.5 truncate text-muted-foreground',
            compact ? 'sm:mb-1' : 'sm:mb-2',
          )}
        >
          {eyebrow}
        </p>
      )}
      <h1
        className={cn(
          'break-words font-black leading-none tracking-normal text-foreground',
          compact ? 'text-2xl sm:text-[28px]' : 'text-[30px] sm:text-[38px]',
        )}
      >
        {title}
      </h1>
      {description && (
        <p
          className={cn(
            'max-w-3xl break-words text-sm font-semibold leading-relaxed text-muted-foreground',
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
