import { cn } from '@/lib/utils';

interface MiniTrendProps {
  values: number[];
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

const toneClasses = {
  primary: 'bg-gradient-to-t from-primary to-cyan-300',
  success: 'bg-gradient-to-t from-[hsl(var(--success))] to-emerald-300',
  warning: 'bg-gradient-to-t from-[hsl(var(--warning))] to-amber-300',
  danger: 'bg-gradient-to-t from-[hsl(var(--danger))] to-rose-300',
};

const MiniTrend = ({ className, tone = 'primary', values }: MiniTrendProps) => (
  <div className={cn('flex h-16 items-end gap-1.5', className)} aria-hidden="true">
    {values.map((value, index) => (
      <div
        key={`${value}-${index}`}
        className={cn('w-full rounded-[1px] opacity-90', toneClasses[tone])}
        style={{ height: `${Math.max(10, Math.min(100, value))}%` }}
      />
    ))}
  </div>
);

export { MiniTrend };
