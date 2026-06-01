import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Command,
  Grid2X2,
  Home,
  LogOut,
  Settings,
  Swords,
  TableProperties,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
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
  const location = useLocation();
  const activeNavItem = navItems.find((item) => isNavItemActive(item, location.pathname));

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
        <div className="mx-3 mb-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2 text-primary">
            <div className="flex min-w-0 items-center gap-2">
              <Command className="h-4 w-4 shrink-0" />
              <p className="truncate text-sm font-semibold">빠른 기록</p>
            </div>
            <span className="text-xs font-bold">Ready</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="status-chip">맵</span>
            <span className="status-chip">스코어</span>
            <span className="status-chip">결과</span>
            <span className="status-chip">OCR</span>
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
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border/70 bg-card/90 px-3 backdrop-blur-xl xl:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Command className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">OW Tracker</span>
          </div>
          <span className="max-w-[48vw] truncate text-xs text-muted-foreground">{user?.email}</span>
        </header>
        {activeNavItem?.children ? (
          <nav className="sticky top-14 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl xl:hidden">
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
        <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-24 pt-5 sm:px-6 xl:px-8 xl:py-8">
          <Outlet />
        </main>
        <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-6 rounded-lg border border-border/70 bg-card/95 p-1 backdrop-blur-xl xl:hidden">
          {navItems.map((item) => {
            const active = isNavItemActive(item, location.pathname);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-semibold text-muted-foreground transition-[background-color,color]',
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
