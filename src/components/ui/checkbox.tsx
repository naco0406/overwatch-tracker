import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, disabled, ...props }, ref) => (
  <label
    className={cn(
      'relative inline-grid h-5 w-5 shrink-0 place-items-center align-middle',
      disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      className,
    )}
  >
    <input
      ref={ref}
      type="checkbox"
      className="peer absolute inset-0 z-10 m-0 cursor-inherit opacity-0"
      disabled={disabled}
      {...props}
    />
    <span
      aria-hidden="true"
      className="grid h-[18px] w-[18px] place-items-center rounded-[3px] border border-input bg-card text-white shadow-[inset_0_-2px_0_hsl(var(--foreground)/0.04)] transition-[background-color,border-color,box-shadow] duration-150 peer-checked:border-primary peer-checked:bg-primary peer-checked:shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] peer-checked:[&_svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
    >
      <Check className="h-3.5 w-3.5 opacity-0 transition-opacity duration-150" strokeWidth={3} />
    </span>
  </label>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
