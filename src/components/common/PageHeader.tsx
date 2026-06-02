import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  actions?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}

const PageHeader = ({ actions, className, description, eyebrow, title }: PageHeaderProps) => (
  <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
    <div className="min-w-0">
      {eyebrow && <p className="metric-label mb-1.5">{eyebrow}</p>}
      <h1 className="break-words text-[26px] font-bold leading-tight tracking-normal text-foreground sm:text-3xl">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-2xl break-words text-sm leading-relaxed text-muted-foreground">
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
