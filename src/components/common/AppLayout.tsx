import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ChevronDown,
  Crosshair,
  Database,
  Gauge,
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
    to: '/sessions',
    label: '기록',
    icon: TableProperties,
    children: [
      { to: '/sessions', label: '세션' },
      { to: '/records', label: '매치 기록' },
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
    label: '메타',
    icon: Gauge,
    children: [
      { to: '/external-data/heroes', label: '영웅 메타' },
      { to: '/external-data/esports', label: 'e스포츠' },
      { to: '/external-data/assets', label: '게임 자료' },
      { to: '/external-data/sources', label: '데이터 안내' },
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
  const activeSubItem = activeNavItem?.children?.find((child) =>
    isPathActive(child.to, location.pathname),
  );
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
    <div className="ow-shell min-h-screen bg-background">
      <aside className="ow-nav-surface fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/[0.08] xl:flex xl:flex-col">
        <div className="flex h-20 shrink-0 items-center gap-3 px-5">
          <Crosshair className="h-6 w-6 shrink-0 text-white/75" />
          <span className="truncate text-sm font-black text-white">OW TRACKER</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
          {desktopNavItems.map((item) => {
            const active = isNavItemActive(item, location.pathname);

            return (
              <div
                key={item.to}
                className={cn(item === settingsNavItem && 'mt-3 border-t border-white/[0.08] pt-3')}
              >
                <NavLink
                  to={item.to}
                  aria-current={!item.children && active ? 'page' : undefined}
                  aria-expanded={item.children ? active : undefined}
                  className={cn(
                    'group flex h-11 items-center gap-3 rounded-[2px] px-3 text-sm font-extrabold text-white/50 transition-[background-color,color] hover:bg-white/[0.055] hover:text-white',
                    active && 'bg-white/[0.085] text-white hover:bg-white/10',
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0 transition-colors',
                      active ? 'text-white' : 'text-white/35 group-hover:text-white/65',
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </NavLink>

                {item.children && active ? (
                  <div className="ml-[30px] mt-1 space-y-0.5 pl-2">
                    {item.children.map((child) => {
                      const childActive = isPathActive(child.to, location.pathname);

                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          aria-current={childActive ? 'page' : undefined}
                          className={cn(
                            'flex h-8 items-center rounded-[2px] px-3 text-xs font-bold text-white/35 transition-[background-color,color] hover:bg-white/[0.04] hover:text-white/70',
                            childActive && 'bg-white/[0.055] text-white',
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
        <div className="border-t border-white/[0.08] px-3 py-3">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-[2px] p-1.5 transition-colors',
              isLiveAvailable
                ? 'bg-destructive/10'
                : liveActive
                  ? 'bg-white/[0.065]'
                  : 'hover:bg-white/[0.055]',
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[2px] px-2 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="LIVE 맵 추천으로 이동"
              onClick={handleLiveCardClick}
            >
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  isLiveAvailable
                    ? 'ow-status-beacon bg-destructive'
                    : liveActive
                      ? 'bg-white/70'
                      : 'bg-white/30',
                )}
              />
              <span className="min-w-0">
                <span className="block truncate text-xs font-black text-white">LIVE</span>
                <span className="mt-0.5 block truncate text-[10px] font-bold text-white/35">
                  {liveNavStatusLabel}
                </span>
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-9 w-9 shrink-0 bg-transparent text-white/55 hover:bg-white/10 hover:text-white',
                isLiveAvailable && 'text-destructive hover:text-destructive',
              )}
              disabled={liveStatus === 'starting' || liveStatus === 'unsupported'}
              aria-label={liveActionLabel}
              title={liveActionLabel}
              onClick={handleLiveActionClick}
            >
              {isLiveAvailable ? <Square className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="border-t border-white/[0.08] px-3 py-2.5">
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

      <div className="xl:pl-[248px]">
        <header className="ow-nav-surface sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-white/[0.08] px-3.5 xl:hidden">
          <div className="flex items-center gap-2">
            <Crosshair className="h-5 w-5 shrink-0 text-white/75" />
            <div className="min-w-0">
              <span className="block truncate text-sm font-black text-white">OW TRACKER</span>
              {activeNavItem ? (
                <span className="block truncate text-[11px] font-bold text-white/45">
                  {activeSubItem
                    ? `${activeNavItem.label} · ${activeSubItem.label}`
                    : activeNavItem.label}
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
          <nav className="sticky top-16 z-20 border-b border-border bg-card px-3.5 xl:hidden">
            <div className="mobile-scroll flex gap-1 overflow-x-auto">
              {activeNavItem.children.map((child) => {
                const childActive = isPathActive(child.to, location.pathname);

                return (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    aria-current={childActive ? 'page' : undefined}
                    className={cn(
                      'flex h-11 shrink-0 items-center rounded-[2px] px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground',
                      childActive && 'bg-secondary text-foreground',
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
        <main className="safe-page-bottom mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1640px] flex-col px-3.5 pt-4 sm:px-6 sm:pt-5 xl:min-h-screen xl:px-8 xl:py-7 2xl:px-10">
          <Outlet />
        </main>
        <nav className="ow-nav-surface safe-bottom-nav fixed inset-x-2 z-40 grid grid-cols-5 rounded-[3px] border border-white/[0.08] p-1 shadow-[0_18px_42px_-20px_rgb(2_6_23/0.7)] xl:hidden">
          {mobileNavItems.map((item) => {
            const active = isNavItemActive(item, location.pathname);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[54px] min-h-[54px] flex-col items-center justify-center gap-1 rounded-[2px] px-0.5 text-[10px] font-bold text-white/45 transition-[background-color,color] min-[390px]:text-[11px]',
                  active && 'bg-white/[0.09] text-white',
                )}
                aria-label={item.label}
              >
                <item.icon className={cn('h-4 w-4', active ? 'text-white' : 'text-white/35')} />
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
            'group flex min-w-0 items-center gap-3 rounded-[2px] text-left text-white transition-[background-color,border-color]',
            compact
              ? 'h-10 max-w-[54vw] bg-transparent px-2 hover:bg-white/[0.07]'
              : 'w-full bg-transparent px-2 py-2 hover:bg-white/[0.05]',
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
                'block truncate font-black text-white',
                compact ? 'max-w-[24vw] text-xs' : 'text-sm',
              )}
            >
              {isProfileLoading ? '불러오는 중' : displayName}
            </span>
            {!compact ? (
              <span className="mt-0.5 block truncate text-xs font-bold text-white/35">
                {subtitle}
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-white/30 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={compact ? 'end' : 'start'}
        className="w-80 overflow-hidden rounded-[3px] p-0"
        side={compact ? 'bottom' : 'top'}
        sideOffset={10}
      >
        <div className="border-b border-border bg-[hsl(var(--surface-2))] p-4">
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
                  className="flex h-10 items-center gap-3 rounded-[3px] px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <UserRound className="h-4 w-4" />내 계정
                </NavLink>
              </PopoverClose>
              <PopoverClose asChild>
                <NavLink
                  to="/settings/battle-net"
                  className="flex h-10 items-center gap-3 rounded-[3px] px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                  배틀넷 계정
                </NavLink>
              </PopoverClose>
              <PopoverClose asChild>
                <NavLink
                  to="/settings/data"
                  className="flex h-10 items-center gap-3 rounded-[3px] px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
      'rounded-[2px] border shadow-none',
      large ? 'border-border bg-card' : 'border-white/10 bg-white/[0.06]',
      large ? 'h-12 w-12' : compact ? 'h-8 w-8' : 'h-10 w-10',
    )}
  >
    <AvatarImage alt={displayName} src={avatarUrl ?? undefined} />
    <AvatarFallback
      className={cn(
        'rounded-[2px] text-sm font-black',
        large ? 'bg-primary/10 text-primary' : 'bg-white/10 text-white',
      )}
    >
      {hasNickname ? fallback : <UserRound className="h-4 w-4" />}
    </AvatarFallback>
  </Avatar>
);

export { AppLayout };
