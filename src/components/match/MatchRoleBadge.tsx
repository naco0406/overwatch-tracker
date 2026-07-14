import { getMatchRoleLabel } from '@/data/matchOptions';
import { getRoleIconPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { MatchRole } from '@/types/match';

interface MatchRoleIconProps {
  className?: string;
  role: MatchRole;
}

export const MatchRoleIcon = ({ className, role }: MatchRoleIconProps) => (
  <span aria-hidden="true" className={cn('ow-game-icon-shell h-4 w-4', className)} data-role={role}>
    <span className="ow-game-icon-core">
      <img alt="" className="h-[72%] w-[72%] object-contain" src={getRoleIconPath(role)} />
    </span>
  </span>
);

interface MatchRoleLabelProps extends MatchRoleIconProps {
  textClassName?: string;
}

export const MatchRoleLabel = ({ className, role, textClassName }: MatchRoleLabelProps) => (
  <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
    <MatchRoleIcon role={role} />
    <span className={cn('truncate', textClassName)}>{getMatchRoleLabel(role)}</span>
  </span>
);

interface MatchRoleBadgeProps {
  className?: string;
  role: MatchRole;
}

export const MatchRoleBadge = ({ className, role }: MatchRoleBadgeProps) => (
  <span
    data-role={role}
    className={cn(
      'ow-game-badge inline-flex h-7 max-w-full items-center gap-1.5 rounded-[3px] border border-border bg-secondary/60 px-2 text-xs font-black text-foreground',
      className,
    )}
  >
    <MatchRoleIcon className="h-4 w-4" role={role} />
    <span className="truncate">{getMatchRoleLabel(role)}</span>
  </span>
);
