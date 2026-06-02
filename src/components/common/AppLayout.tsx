import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Command,
  Grid2X2,
  Home,
  LogOut,
  MonitorUp,
  Radio,
  Settings,
  Square,
  Swords,
  TableProperties,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { liveStatusLabel, useLiveCapture } from '@/hooks/useLiveCapture';
import { cn } from '@/lib/utils';

interface NavItem {
  children?: Array<{
    label: string;
    to: string;
  }>;
  icon: LucideIcon;
  label: string;
  to: string;
}

const navItems: NavItem[] = [
  { to: '/', label: '홈', icon: Home },
  { to: '/records', label: '기록', icon: TableProperties },
  { to: '/sessions', label: '세션', icon: Swords },
  {
    to: '/stats/maps',
    label: '통계',
    icon: BarChart3,
    children: [
      { to: '/stats/maps', label: '전장' },
      { to: '/stats/modes', label: '모드' },
      { to: '/stats/heroes', label: '영웅' },
      { to: '/stats/time', label: '시간' },
      { to: '/stats/order', label: '순서' },
    ],
  },
  { to: '/master-data', label: '마스터', icon: Grid2X2 },
  { to: '/settings', label: '설정', icon: Settings },
];

const isPathActive = (to: string, pathname: string) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);

const isNavItemActive = (item: NavItem, pathname: string) =>
  isPathActive(item.to, pathname) ||
  Boolean(item.children?.some((child) => isPathActive(child.to, pathname)));

const AppLayout = () => {
  const { signOut, user } = useAuth();
  const { isLiveAvailable, startCapture, status: liveStatus, stopCapture } = useLiveCapture();
  const location = useLocation();
  const navigate = useNavigate();
  const liveNavItem: NavItem = {
    icon: Radio,
    label: 'LIVE',
    to: '/live',
  };
  const visibleNavItems: NavItem[] = [...navItems, liveNavItem];
  const activeNavItem = visibleNavItems.find((item) => isNavItemActive(item, location.pathname));
  const liveActive = isPathActive('/live', location.pathname);
  const liveActionLabel = isLiveAvailable
    ? '공유 종료'
    : liveStatus === 'starting'
      ? '연결 중'
      : liveStatus === 'error'
        ? '다시 공유'
        : liveStatus === 'unsupported'
          ? '지원 안 함'
          : '화면 공유';
  const liveNavStatusLabel = liveStatus === 'error' ? '재시도' : liveStatusLabel[liveStatus];

  const handleStartLive = async () => {
    const started = await startCapture();

    if (started) {
      navigate('/live');
    }
  };

  const handleStopLive = () => {
    stopCapture('idle');
  };

  const handleLiveAction = () => {
    if (isLiveAvailable) {
      handleStopLive();
      return;
    }

    void handleStartLive();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      toast({
        title: '로그아웃 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-border/70 bg-card/95 backdrop-blur-xl xl:flex xl:flex-col">
        <div className="flex h-16 items-center border-b border-border/70 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Command className="h-5 w-5" />
          </div>
          <div className="ml-3 min-w-0">
            <span className="block truncate text-sm font-semibold">Overwatch Tracker</span>
            <span className="block truncate text-xs text-muted-foreground">Match lab</span>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => {
            const active = isNavItemActive(item, location.pathname);

            return (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  className={cn(
                    'group flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-[background-color,color] hover:bg-secondary hover:text-foreground',
                    active &&
                      'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>

                {item.children && active ? (
                  <div className="ml-5 mt-1 border-l border-border/70 pl-2">
                    {item.children.map((child) => {
                      const childActive = isPathActive(child.to, location.pathname);

                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={cn(
                            'flex h-8 items-center rounded-md px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                            childActive && 'bg-secondary text-foreground',
                          )}
                        >
                          {child.label}
                        </NavLink>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="mx-3 mb-3 border-t border-border/70 pt-3">
          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              isLiveAvailable
                ? 'border-destructive/30 bg-destructive/10'
                : liveActive
                  ? 'border-primary/25 bg-primary/5'
                  : 'border-border/70 bg-[hsl(var(--surface-2))]',
            )}
          >
            <NavLink
              to="/live"
              className={cn(
                'flex h-10 items-center justify-between gap-3 rounded-md px-2 transition-colors',
                isLiveAvailable
                  ? 'text-destructive hover:bg-destructive/10'
                  : liveActive
                    ? 'text-primary hover:bg-primary/10'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    isLiveAvailable
                      ? 'animate-pulse bg-destructive'
                      : liveActive
                        ? 'bg-primary'
                        : 'bg-muted-foreground/50',
                  )}
                />
                <span className="truncate text-sm font-bold">LIVE</span>
              </span>
              <span className="text-xs font-bold">{liveNavStatusLabel}</span>
            </NavLink>
            <Button
              type="button"
              variant={isLiveAvailable ? 'outline' : 'default'}
              size="sm"
              className={cn(
                'mt-3 w-full justify-start',
                isLiveAvailable &&
                  'border-destructive/30 bg-card text-destructive hover:text-destructive',
              )}
              disabled={liveStatus === 'starting' || liveStatus === 'unsupported'}
              onClick={handleLiveAction}
            >
              {isLiveAvailable ? <Square className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
              {liveActionLabel}
            </Button>
          </div>
        </div>
        <div className="border-t border-border/70 p-3">
          <div className="mb-3 rounded-md border border-border/70 bg-secondary/70 px-3 py-2">
            <p className="metric-label">계정</p>
            <p className="mt-1 truncate text-sm">{user?.email}</p>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start bg-transparent"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </Button>
        </div>
      </aside>

      <div className="xl:pl-72">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border/70 bg-card/95 px-3.5 backdrop-blur-xl xl:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Command className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold">OW Tracker</span>
              {activeNavItem ? (
                <span className="block truncate text-[11px] font-semibold text-muted-foreground">
                  {activeNavItem.label}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className="max-w-[36vw] truncate text-xs text-muted-foreground">
              {user?.email}
            </span>
          </div>
        </header>
        {activeNavItem?.children ? (
          <nav className="sticky top-14 z-20 border-b border-border/70 bg-background/95 px-3.5 py-2 backdrop-blur-xl xl:hidden">
            <div className="mobile-scroll flex gap-1 overflow-x-auto">
              {activeNavItem.children.map((child) => {
                const childActive = isPathActive(child.to, location.pathname);

                return (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={cn(
                      'flex h-9 shrink-0 items-center rounded-md px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                      childActive &&
                        'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                    )}
                  >
                    {child.label}
                  </NavLink>
                );
              })}
            </div>
          </nav>
        ) : null}
        <main className="safe-page-bottom mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3.5 pt-4 sm:px-6 sm:pt-5 xl:px-8 xl:py-8">
          <Outlet />
        </main>
        <nav className="safe-bottom-nav fixed inset-x-2 z-40 grid grid-cols-6 rounded-lg border border-border/70 bg-card/95 p-1 backdrop-blur-xl xl:hidden">
          {navItems.map((item) => {
            const active = isNavItemActive(item, location.pathname);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex h-[52px] min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-0.5 text-[10px] font-semibold text-muted-foreground transition-[background-color,color] min-[390px]:text-[11px]',
                  active && 'bg-primary text-primary-foreground',
                )}
                aria-label={item.label}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export { AppLayout };
