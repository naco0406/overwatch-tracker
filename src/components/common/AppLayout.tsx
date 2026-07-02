import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ChevronDown,
  Command,
  Database,
  Home,
  LogOut,
  MessagesSquare,
  MonitorUp,
  Radio,
  Settings,
  ShieldCheck,
  Square,
  TableProperties,
  UserRound,
} from 'lucide-react';
import type { MouseEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TemporaryTokyoTravelBanner } from '@/components/common/TemporaryTokyoTravelBanner';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOwnProfile } from '@/hooks/useCommunity';
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

const primaryNavItems: NavItem[] = [
  { to: '/', label: '홈', icon: Home },
  {
    to: '/records',
    label: '기록',
    icon: TableProperties,
    children: [
      { to: '/records', label: '매치 기록' },
      { to: '/sessions', label: '세션' },
    ],
  },
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
      { to: '/stats/summary', label: '요약' },
    ],
  },
  {
    to: '/external-data/heroes',
    label: '외부 데이터',
    icon: Database,
    children: [
      { to: '/external-data/heroes', label: '영웅 메타' },
      { to: '/external-data/esports', label: 'e스포츠 일정' },
      { to: '/external-data/assets', label: '오버워치 에셋' },
      { to: '/external-data/sources', label: '데이터 소스 현황' },
    ],
  },
  {
    to: '/community',
    label: '커뮤니티',
    icon: MessagesSquare,
    children: [
      { to: '/community', label: '피드' },
      { to: '/friends', label: '친구' },
    ],
  },
];

const settingsNavItem: NavItem = {
  to: '/settings/account',
  label: '설정',
  icon: Settings,
  children: [
    { to: '/settings/account', label: '내 계정' },
    { to: '/settings/battle-net', label: '배틀넷' },
    { to: '/settings/data', label: '데이터' },
  ],
};

const desktopNavItems: NavItem[] = [...primaryNavItems, settingsNavItem];
const mobileNavItems: NavItem[] = primaryNavItems;

const isPathActive = (to: string, pathname: string) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);

const isNavItemActive = (item: NavItem, pathname: string) =>
  isPathActive(item.to, pathname) ||
  Boolean(item.children?.some((child) => isPathActive(child.to, pathname)));

const getAccountInitial = (displayName: string) => displayName.trim().slice(0, 1).toUpperCase();

const AppLayout = () => {
  const { signOut, user } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useOwnProfile();
  const { isLiveAvailable, startCapture, status: liveStatus, stopCapture } = useLiveCapture();
  const location = useLocation();
  const navigate = useNavigate();
  const liveNavItem: NavItem = {
    icon: Radio,
    label: 'LIVE',
    to: '/live',
  };
  const visibleNavItems: NavItem[] = [...desktopNavItems, liveNavItem];
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
  const hasNickname = Boolean(profile?.nickname);
  const accountDisplayName = profile?.nickname ?? '닉네임 미설정';
  const accountSubtitle = profile?.nickname ? user?.email : '내 계정 설정에서 닉네임을 설정하세요';
  const accountAvatarUrl = profile?.avatarUrl ?? null;

  const handleStartLive = async () => {
    navigate('/live');
    await startCapture();
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

  const handleLiveCardClick = () => {
    navigate('/live');
  };

  const handleLiveActionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handleLiveAction();
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
          {desktopNavItems.map((item) => {
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
              'relative rounded-lg border p-3 transition-[background-color,border-color,box-shadow] hover:border-primary/30 hover:shadow-sm',
              isLiveAvailable
                ? 'border-destructive/30 bg-destructive/10'
                : liveActive
                  ? 'border-primary/25 bg-primary/5'
                  : 'border-border/70 bg-[hsl(var(--surface-2))]',
            )}
          >
            <button
              type="button"
              className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="LIVE 맵 추천으로 이동"
              onClick={handleLiveCardClick}
            />
            <div
              className={cn(
                'pointer-events-none relative flex h-10 items-center justify-between gap-3 rounded-md px-2 transition-colors',
                isLiveAvailable
                  ? 'text-destructive'
                  : liveActive
                    ? 'text-primary'
                    : 'text-muted-foreground',
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
            </div>
            <Button
              type="button"
              variant={isLiveAvailable ? 'outline' : 'default'}
              size="sm"
              className={cn(
                'relative z-10 mt-3 w-full justify-start',
                isLiveAvailable &&
                  'border-destructive/30 bg-card text-destructive hover:text-destructive',
              )}
              disabled={liveStatus === 'starting' || liveStatus === 'unsupported'}
              onClick={handleLiveActionClick}
            >
              {isLiveAvailable ? <Square className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
              {liveActionLabel}
            </Button>
          </div>
        </div>
        <div className="border-t border-border/70 p-3">
          <AccountMenu
            avatarUrl={accountAvatarUrl}
            displayName={accountDisplayName}
            email={user?.email}
            hasNickname={hasNickname}
            isProfileLoading={isProfileLoading}
            subtitle={accountSubtitle}
            onSignOut={handleSignOut}
          />
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
          <AccountMenu
            avatarUrl={accountAvatarUrl}
            compact
            displayName={accountDisplayName}
            email={user?.email}
            hasNickname={hasNickname}
            isProfileLoading={isProfileLoading}
            subtitle={accountSubtitle}
            onSignOut={handleSignOut}
          />
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
        <TemporaryTokyoTravelBanner />
        <main className="safe-page-bottom mx-auto flex min-h-screen w-full max-w-none flex-col px-3.5 pt-4 sm:px-6 sm:pt-5 xl:px-8 xl:py-8">
          <Outlet />
        </main>
        <nav className="safe-bottom-nav fixed inset-x-2 z-40 grid grid-cols-5 rounded-lg border border-border/70 bg-card/95 p-1 backdrop-blur-xl xl:hidden">
          {mobileNavItems.map((item) => {
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

interface AccountMenuProps {
  avatarUrl?: string | null;
  compact?: boolean;
  displayName: string;
  email?: string;
  hasNickname: boolean;
  isProfileLoading: boolean;
  showSettingsLinks?: boolean;
  subtitle?: string;
  onSignOut: () => void;
}

const AccountMenu = ({
  avatarUrl,
  compact = false,
  displayName,
  email,
  hasNickname,
  isProfileLoading,
  showSettingsLinks = compact,
  subtitle,
  onSignOut,
}: AccountMenuProps) => {
  const initial = hasNickname ? getAccountInitial(displayName) : '';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-card text-left transition-[background-color,border-color,box-shadow] hover:border-primary/30 hover:bg-secondary/70 hover:shadow-sm',
            compact ? 'h-10 max-w-[54vw] px-2' : 'w-full px-2.5 py-2.5',
          )}
        >
          <ProfileAvatar
            avatarUrl={avatarUrl}
            compact={compact}
            displayName={displayName}
            fallback={initial}
            hasNickname={hasNickname}
          />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block truncate font-black text-foreground',
                compact ? 'max-w-[24vw] text-xs' : 'text-sm',
              )}
            >
              {isProfileLoading ? '불러오는 중' : displayName}
            </span>
            {!compact ? (
              <span className="mt-0.5 block truncate text-xs font-semibold text-muted-foreground">
                {subtitle}
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={compact ? 'end' : 'start'}
        className="w-80 overflow-hidden rounded-lg p-0"
        side={compact ? 'bottom' : 'top'}
        sideOffset={10}
      >
        <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] p-4">
          <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-3">
            <ProfileAvatar
              avatarUrl={avatarUrl}
              displayName={displayName}
              fallback={initial}
              hasNickname={hasNickname}
              large
            />
            <div className="min-w-0">
              <p className="truncate text-base font-black">{displayName}</p>
              <p className="mt-1 truncate text-xs font-bold text-muted-foreground">
                {email ?? '이메일 없음'}
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-1 p-2.5">
          {showSettingsLinks ? (
            <>
              <PopoverClose asChild>
                <NavLink
                  to="/settings/account"
                  className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <UserRound className="h-4 w-4" />내 계정
                </NavLink>
              </PopoverClose>
              <PopoverClose asChild>
                <NavLink
                  to="/settings/battle-net"
                  className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                  배틀넷 계정
                </NavLink>
              </PopoverClose>
              <PopoverClose asChild>
                <NavLink
                  to="/settings/data"
                  className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Database className="h-4 w-4" />
                  데이터
                </NavLink>
              </PopoverClose>
            </>
          ) : null}
          <div className="my-1 border-t border-border/70" />
          <div className="flex items-start gap-2 px-3 py-2 text-xs font-semibold leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="min-w-0">친구에게는 요약 통계만 공개됩니다.</p>
          </div>
          <Button
            variant="outline"
            className="mt-1 w-full justify-start bg-transparent"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  compact?: boolean;
  displayName: string;
  fallback: string;
  hasNickname: boolean;
  large?: boolean;
}

const ProfileAvatar = ({
  avatarUrl,
  compact = false,
  displayName,
  fallback,
  hasNickname,
  large = false,
}: ProfileAvatarProps) => (
  <Avatar
    className={cn(
      'rounded-lg border border-border/70 bg-card shadow-sm',
      large ? 'h-12 w-12' : compact ? 'h-8 w-8' : 'h-10 w-10',
    )}
  >
    <AvatarImage alt={displayName} src={avatarUrl ?? undefined} />
    <AvatarFallback className="rounded-lg bg-primary/10 text-sm font-black text-primary">
      {hasNickname ? fallback : <UserRound className="h-4 w-4" />}
    </AvatarFallback>
  </Avatar>
);

export { AppLayout };
