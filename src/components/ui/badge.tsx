import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex min-h-6 items-center gap-1.5 rounded-[2px] border px-2.5 py-0.5 text-xs font-black leading-none transition-[background-color,border-color,color] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary hover:bg-primary/15',
        secondary: 'border-border/70 bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15',
        outline: 'ow-game-badge border-border bg-card text-foreground hover:bg-secondary/50',
        success:
          'border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]',
        warning: 'border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.12)] text-amber-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

export { Badge, badgeVariants };
