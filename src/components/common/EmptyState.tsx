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
      'flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-border/90 bg-[hsl(var(--surface-2))] p-8 text-center',
      className,
    )}
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </div>
    <h2 className="mt-4 text-base font-semibold tracking-normal">{title}</h2>
    <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export { EmptyState };
