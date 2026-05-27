import { cn } from '@/lib/utils';

interface MiniTrendProps {
  values: number[];
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

const toneClasses = {
  primary: 'bg-primary',
  success: 'bg-[hsl(var(--success))]',
  warning: 'bg-[hsl(var(--warning))]',
  danger: 'bg-[hsl(var(--danger))]',
};

const MiniTrend = ({ className, tone = 'primary', values }: MiniTrendProps) => (
  <div className={cn('flex h-16 items-end gap-1.5', className)} aria-hidden="true">
    {values.map((value, index) => (
      <div
        key={`${value}-${index}`}
        className={cn('w-full rounded-sm opacity-90', toneClasses[tone])}
        style={{ height: `${Math.max(10, Math.min(100, value))}%` }}
      />
    ))}
  </div>
);

export { MiniTrend };
