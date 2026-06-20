import { getModeLabel } from '@/data/matchOptions';
import { getModeIconPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { ModeId } from '@/types/match';

interface MatchModeIconProps {
  className?: string;
  modeId: ModeId;
}

export const MatchModeIcon = ({ className, modeId }: MatchModeIconProps) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-slate-900/10 bg-slate-950',
      className,
    )}
  >
    <img alt="" className="h-[72%] w-[72%] object-contain" src={getModeIconPath(modeId)} />
  </span>
);

interface MatchModeLabelProps extends MatchModeIconProps {
  iconClassName?: string;
  textClassName?: string;
}

export const MatchModeLabel = ({
  className,
  iconClassName,
  modeId,
  textClassName,
}: MatchModeLabelProps) => (
  <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
    <MatchModeIcon className={iconClassName} modeId={modeId} />
    <span className={cn('truncate', textClassName)}>{getModeLabel(modeId)}</span>
  </span>
);

interface MatchModeBadgeProps {
  className?: string;
  iconClassName?: string;
  modeId: ModeId;
}

export const MatchModeBadge = ({ className, iconClassName, modeId }: MatchModeBadgeProps) => (
  <span
    className={cn(
      'inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 text-xs font-bold text-foreground',
      className,
    )}
  >
    <MatchModeIcon className={cn('h-3.5 w-3.5', iconClassName)} modeId={modeId} />
    <span className="truncate">{getModeLabel(modeId)}</span>
  </span>
);
