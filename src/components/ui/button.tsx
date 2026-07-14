import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[3px] border border-transparent text-sm font-black transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-45 motion-reduce:transform-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'ow-action-button bg-accent text-accent-foreground shadow-[0_4px_10px_-8px_hsl(var(--accent)/0.7)] hover:bg-accent/95 hover:shadow-[0_5px_12px_-8px_hsl(var(--accent)/0.68)]',
        destructive:
          'ow-danger-button border-destructive bg-destructive text-destructive-foreground hover:border-destructive/85 hover:bg-destructive/95',
        outline:
          'ow-outline-button border-input bg-card text-foreground shadow-[0_5px_14px_-12px_hsl(var(--foreground)/0.42)] hover:border-foreground/25 hover:bg-secondary/55 hover:text-foreground',
        secondary:
          'border-border/70 bg-secondary text-secondary-foreground hover:border-foreground/15 hover:bg-secondary/75',
        ghost:
          'border-transparent text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground',
        link: 'border-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-8',
        icon: 'ow-icon-button h-10 w-10 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
