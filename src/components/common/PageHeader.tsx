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
      <h1 className="truncate text-[28px] font-bold leading-tight tracking-normal text-foreground sm:text-3xl">
        {title}
      </h1>
      {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && (
      <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto [&>button]:min-w-0 [&>button]:flex-1 sm:[&>button]:flex-none">
        {actions}
      </div>
    )}
  </div>
);

export { PageHeader };
