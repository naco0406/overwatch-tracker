import { getMatchRoleLabel } from '@/data/matchOptions';
import { getRoleIconPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { MatchRole } from '@/types/match';

interface MatchRoleIconProps {
  className?: string;
  role: MatchRole;
}

export const MatchRoleIcon = ({ className, role }: MatchRoleIconProps) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-slate-900/10 bg-slate-950',
      className,
    )}
  >
    <img alt="" className="h-[72%] w-[72%] object-contain" src={getRoleIconPath(role)} />
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
    className={cn(
      'inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 text-xs font-bold text-foreground',
      className,
    )}
  >
    <MatchRoleIcon className="h-3.5 w-3.5" role={role} />
    <span className="truncate">{getMatchRoleLabel(role)}</span>
  </span>
);
