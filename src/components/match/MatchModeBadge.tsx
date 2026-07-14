import { getModeLabel } from '@/data/matchOptions';
import { getModeIconPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { ModeId } from '@/types/match';

interface MatchModeIconProps {
  className?: string;
  modeId: ModeId;
}

export const MatchModeIcon = ({ className, modeId }: MatchModeIconProps) => (
  <span aria-hidden="true" className={cn('ow-game-icon-shell h-4 w-4', className)}>
    <span className="ow-game-icon-core">
      <img alt="" className="h-[72%] w-[72%] object-contain" src={getModeIconPath(modeId)} />
    </span>
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
      'ow-game-badge inline-flex h-7 max-w-full items-center gap-1.5 rounded-[3px] border border-border bg-secondary/60 px-2 text-xs font-black text-foreground',
      className,
    )}
  >
    <MatchModeIcon className={cn('h-4 w-4', iconClassName)} modeId={modeId} />
    <span className="truncate">{getModeLabel(modeId)}</span>
  </span>
);
