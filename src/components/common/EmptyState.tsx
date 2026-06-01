import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  description: string;
  icon: LucideIcon;
  title: string;
}

const EmptyState = ({ action, className, description, icon: Icon, title }: EmptyStateProps) => (
  <div
    className={cn(
      'flex min-h-[180px] flex-col justify-center rounded-lg border border-dashed border-border/70 bg-[hsl(var(--surface-2))] p-4',
      className,
    )}
  >
    <div className="grid gap-4 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-md border border-primary/20 bg-card text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-normal">{title}</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="sm:justify-self-end">{action}</div> : null}
    </div>
  </div>
);

export { EmptyState };
