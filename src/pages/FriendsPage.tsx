import {
  ArrowLeft,
  Bell,
  Check,
  MapIcon,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  UserMinus,
  UserPlus,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';

import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchModeLabel } from '@/components/match/MatchModeBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getHeroLabel,
  getMapLabel,
  getModeLabel,
  heroOptions,
  roleLabels,
} from '@/data/matchOptions';
import { getHeroPortraitPath } from '@/data/masterAssets';
import { toast } from '@/hooks/use-toast';
import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  useFriendRequests,
  useFriends,
  useFriendStats,
  useOwnProfile,
  useProfileSearch,
  useRemoveFriend,
  useSendFriendRequest,
} from '@/hooks/useCommunity';
import { cn } from '@/lib/utils';
import type {
  FriendRecentFormItem,
  FriendRequest,
  FriendStats,
  FriendStatsHero,
  FriendStatsMap,
  FriendStatsMode,
  FriendSummary,
  ProfileSearchResult,
} from '@/types/community';
import type { MatchResult } from '@/types/match';

const formatPercent = (value: number) => `${Math.round(value * 10) / 10}%`;

const formatCount = (value: number) => value.toLocaleString('ko-KR');

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));

const formatFullDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));

const formatRecentDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ko-KR', {
        day: 'numeric',
        month: 'short',
      }).format(new Date(value))
    : '날짜 없음';

const resultLabel: Record<MatchResult, string> = {
  draw: '무',
  loss: '패',
  win: '승',
};

const resultLongLabel: Record<MatchResult, string> = {
  draw: '무승부',
  loss: '패배',
  win: '승리',
};

const resultTextTone: Record<MatchResult, string> = {
  draw: 'text-muted-foreground',
  loss: 'text-destructive',
  win: 'text-[hsl(var(--success))]',
};

type FriendSort = 'name' | 'oldest' | 'recent';

interface WinRateSortable {
  totalMatches: number;
  winRate: number;
}

interface HeroUsageSortable extends WinRateSortable {
  heroId: string;
}

const heroById = new Map(heroOptions.map((hero) => [hero.value, hero]));

const getInitial = (nickname: string) => nickname.trim().slice(0, 1).toUpperCase() || '?';

const getHeroRoleLabel = (heroId: string) => {
  const role = heroById.get(heroId)?.role;

  return role ? roleLabels[role] : '영웅';
};

const getRecordSummary = (wins: number, losses: number, draws: number) =>
  draws > 0
    ? `${formatCount(wins)}승 ${formatCount(losses)}패 ${formatCount(draws)}무`
    : `${formatCount(wins)}승 ${formatCount(losses)}패`;

const getWinRateSort = (a: WinRateSortable, b: WinRateSortable) =>
  b.winRate - a.winRate || b.totalMatches - a.totalMatches;

const getUsageSort = (a: HeroUsageSortable, b: HeroUsageSortable) =>
  b.totalMatches - a.totalMatches || b.winRate - a.winRate || a.heroId.localeCompare(b.heroId);

const getCurrentStreak = (items: FriendRecentFormItem[]) => {
  const latestResult = items[0]?.result;

  if (!latestResult) {
    return null;
  }

  let count = 0;

  for (const item of items) {
    if (item.result !== latestResult) {
      break;
    }

    count += 1;
  }

  const suffix: Record<MatchResult, string> = {
    draw: '연무',
    loss: '연패',
    win: '연승',
  };

  return {
    count,
    label:
      count > 1
        ? `${formatCount(count)}${suffix[latestResult]}`
        : `직전 ${resultLongLabel[latestResult]}`,
    result: latestResult,
  };
};

const sortFriends = (friends: FriendSummary[], sort: FriendSort) =>
  [...friends].sort((a, b) => {
    if (sort === 'recent') {
      return new Date(b.friendsSince).getTime() - new Date(a.friendsSince).getTime();
    }

    if (sort === 'oldest') {
      return new Date(a.friendsSince).getTime() - new Date(b.friendsSince).getTime();
    }

    return a.nickname.localeCompare(b.nickname, 'ko-KR');
  });

const getSearchRelationshipLabel = (relationship: ProfileSearchResult['relationship']) => {
  if (relationship === 'friend') return '친구';
  if (relationship === 'sent') return '보낸 초대';
  if (relationship === 'received') return '받은 초대';

  return '새 친구';
};

const FriendsPage = () => {
  const navigate = useNavigate();
  const { friendId } = useParams<{ friendId?: string }>();
  const { data: profile, isLoading: isProfileLoading } = useOwnProfile();
  const { data: friends = [], isLoading: isFriendsLoading } = useFriends();
  const { data: requests = [], isLoading: isRequestsLoading } = useFriendRequests();
  const [friendFilter, setFriendFilter] = useState('');
  const [friendSort, setFriendSort] = useState<FriendSort>('name');
  const [searchInput, setSearchInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const declineRequest = useDeclineFriendRequest();
  const cancelRequest = useCancelFriendRequest();
  const removeFriend = useRemoveFriend();
  const hasNickname = Boolean(profile?.nickname);
  const { data: searchResults = [], isFetching: isSearchFetching } = useProfileSearch(
    submittedQuery,
    hasNickname,
  );
  const selectedFriend = friendId
    ? friends.find((friend) => friend.friendId === friendId)
    : undefined;
  const { data: selectedStats, isLoading: isStatsLoading } = useFriendStats(friendId);
  const incomingRequests = requests.filter((request) => request.direction === 'incoming');
  const outgoingRequests = requests.filter((request) => request.direction === 'outgoing');
  const filteredFriends = useMemo(() => {
    const query = friendFilter.trim().toLowerCase();
    const sortedFriends = sortFriends(friends, friendSort);

    if (!query) {
      return sortedFriends;
    }

    return sortedFriends.filter((friend) => friend.nickname.toLowerCase().includes(query));
  }, [friendFilter, friendSort, friends]);
  const isAnyFriendActionPending =
    sendRequest.isPending ||
    acceptRequest.isPending ||
    declineRequest.isPending ||
    cancelRequest.isPending ||
    removeFriend.isPending;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedQuery(searchInput.trim());
  };

  const handleSendRequest = async (targetUserId: string) => {
    try {
      const result = await sendRequest.mutateAsync(targetUserId);

      toast({
        title: result?.status === 'accepted' ? '친구가 되었습니다.' : '친구 신청을 보냈습니다.',
      });
    } catch (error) {
      toast({
        title: '친구 신청 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      const result = await acceptRequest.mutateAsync(requestId);

      toast({ title: '친구 신청을 수락했습니다.' });

      if (result?.friend_id) {
        navigate(`/friends/${result.friend_id}`);
      }
    } catch (error) {
      toast({
        title: '수락 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await declineRequest.mutateAsync(requestId);
      toast({ title: '친구 신청을 거절했습니다.' });
    } catch (error) {
      toast({
        title: '거절 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await cancelRequest.mutateAsync(requestId);
      toast({ title: '친구 신청을 취소했습니다.' });
    } catch (error) {
      toast({
        title: '취소 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveFriend = async (targetFriendId: string, targetNickname: string) => {
    try {
      await removeFriend.mutateAsync(targetFriendId);
      toast({ title: `${targetNickname}님을 친구 목록에서 삭제했습니다.` });
      navigate('/friends');
    } catch (error) {
      toast({
        title: '친구 삭제 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  if (friendId) {
    return (
      <FriendDetailView
        friend={selectedFriend}
        isStatsLoading={isStatsLoading}
        stats={selectedStats}
        onRemoveFriend={handleRemoveFriend}
      />
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="소셜"
        title="친구"
        description="친구 연결과 공유 통계를 한 곳에서 관리합니다."
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
        <FriendDirectoryPanel
          className="order-3 xl:order-1"
          filter={friendFilter}
          friends={filteredFriends}
          isLoading={isFriendsLoading}
          sort={friendSort}
          totalFriends={friends.length}
          onFilterChange={setFriendFilter}
          onSortChange={setFriendSort}
        />

        <aside className="order-1 grid content-start gap-4 xl:sticky xl:top-8 xl:order-2">
          <FindFriendPanel
            disabled={!hasNickname}
            hasNickname={hasNickname}
            isActionPending={isAnyFriendActionPending}
            isProfileLoading={isProfileLoading}
            isSearching={isSearchFetching}
            query={searchInput}
            results={searchResults}
            setQuery={setSearchInput}
            submittedQuery={submittedQuery}
            onAccept={handleAcceptRequest}
            onCancel={handleCancelRequest}
            onDecline={handleDeclineRequest}
            onSearch={handleSearch}
            onSend={handleSendRequest}
          />

          <FriendRequestPanel
            incomingRequests={incomingRequests}
            isActionPending={isAnyFriendActionPending}
            isLoading={isRequestsLoading}
            outgoingRequests={outgoingRequests}
            onAccept={handleAcceptRequest}
            onCancel={handleCancelRequest}
            onDecline={handleDeclineRequest}
          />
        </aside>
      </section>
    </div>
  );
};

interface PanelHeaderProps {
  icon: LucideIcon;
  label: string;
  title: string;
  trailing?: string;
}

const PanelHeader = ({ icon: Icon, label, title, trailing }: PanelHeaderProps) => (
  <div className="section-header flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      <h2 className="mt-1 truncate text-base font-bold">{title}</h2>
    </div>
    <div className="ow-game-icon-shell h-9 min-w-9 shrink-0 bg-primary">
      <div className="ow-game-icon-core bg-card px-2 text-primary">
        {trailing ? (
          <span className="text-xs font-black tabular-nums">{trailing}</span>
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
    </div>
  </div>
);

interface FindFriendPanelProps {
  disabled: boolean;
  hasNickname: boolean;
  isActionPending: boolean;
  isProfileLoading: boolean;
  isSearching: boolean;
  query: string;
  results: ProfileSearchResult[];
  setQuery: (query: string) => void;
  submittedQuery: string;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onSend: (userId: string) => void;
}

const FindFriendPanel = ({
  disabled,
  hasNickname,
  isActionPending,
  isProfileLoading,
  isSearching,
  query,
  results,
  setQuery,
  submittedQuery,
  onAccept,
  onCancel,
  onDecline,
  onSearch,
  onSend,
}: FindFriendPanelProps) => (
  <section className="workspace-panel ow-panel-cap overflow-hidden shadow-sm">
    <PanelHeader icon={Search} label="친구 찾기" title="닉네임 검색" />
    <div className="section-pad grid gap-3">
      {isProfileLoading ? (
        <div className="grid gap-2">
          <SkeletonBlock className="h-10" />
          <SkeletonBlock className="h-24" />
        </div>
      ) : hasNickname ? (
        <>
          <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={onSearch}>
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoComplete="off"
                className="pl-9"
                disabled={disabled}
                placeholder="친구 닉네임"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button disabled={disabled || isSearching} type="submit">
              <Search className="h-4 w-4" />
              검색
            </Button>
          </form>

          <SearchResultList
            disabled={isActionPending}
            isSearching={isSearching}
            results={results}
            submittedQuery={submittedQuery}
            onAccept={onAccept}
            onCancel={onCancel}
            onDecline={onDecline}
            onSend={onSend}
          />
        </>
      ) : (
        <InlineEmptyState
          action={
            <Button asChild size="sm">
              <NavLink to="/settings/account">
                <UserRound className="h-4 w-4" />내 계정
              </NavLink>
            </Button>
          }
          title="닉네임 설정이 필요합니다."
          description="설정 > 내 계정에서 공개 닉네임을 저장하면 친구 검색을 사용할 수 있습니다."
        />
      )}
    </div>
  </section>
);

interface SearchResultListProps {
  disabled: boolean;
  isSearching: boolean;
  results: ProfileSearchResult[];
  submittedQuery: string;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onSend: (userId: string) => void;
}

const SearchResultList = ({
  disabled,
  isSearching,
  results,
  submittedQuery,
  onAccept,
  onCancel,
  onDecline,
  onSend,
}: SearchResultListProps) => {
  if (isSearching) {
    return (
      <div className="grid gap-2">
        <SkeletonBlock className="h-14" />
        <SkeletonBlock className="h-14" />
      </div>
    );
  }

  if (results.length > 0) {
    return (
      <div className="max-h-[280px] overflow-y-auto rounded-md border border-border/70">
        {results.map((result) => (
          <ProfileSearchRow
            key={result.userId}
            disabled={disabled}
            result={result}
            onAccept={onAccept}
            onCancel={onCancel}
            onDecline={onDecline}
            onSend={onSend}
          />
        ))}
      </div>
    );
  }

  if (submittedQuery.trim()) {
    return (
      <InlineEmptyState
        title="검색 결과가 없습니다."
        description="닉네임 철자나 띄어쓰기를 확인해 주세요."
      />
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2.5 text-xs font-semibold leading-relaxed text-muted-foreground">
      찾을 친구의 닉네임을 입력하세요.
    </div>
  );
};

interface ProfileSearchRowProps {
  disabled: boolean;
  result: ProfileSearchResult;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onSend: (userId: string) => void;
}

const ProfileSearchRow = ({
  disabled,
  result,
  onAccept,
  onCancel,
  onDecline,
  onSend,
}: ProfileSearchRowProps) => (
  <div className="flat-row grid gap-3 p-3 transition-colors hover:bg-secondary/50 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
    <FriendAvatar
      avatarUrl={result.avatarUrl}
      className="h-9 w-9 text-xs"
      nickname={result.nickname}
    />
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-bold">{result.nickname}</p>
        <RelationshipChip relationship={result.relationship} />
      </div>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        가입 {formatShortDate(result.createdAt)}
      </p>
    </div>
    <SearchResultAction
      disabled={disabled}
      result={result}
      onAccept={onAccept}
      onCancel={onCancel}
      onDecline={onDecline}
      onSend={onSend}
    />
  </div>
);

const RelationshipChip = ({
  relationship,
}: {
  relationship: ProfileSearchResult['relationship'];
}) => (
  <span
    className={cn(
      'inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-[10px] font-black',
      relationship === 'friend'
        ? 'border-primary/25 bg-primary/10 text-primary'
        : relationship === 'received'
          ? 'border-warning/30 bg-warning/10 text-warning'
          : 'border-border bg-[hsl(var(--surface-2))] text-muted-foreground',
    )}
  >
    {getSearchRelationshipLabel(relationship)}
  </span>
);

const SearchResultAction = ({
  disabled,
  result,
  onAccept,
  onCancel,
  onDecline,
  onSend,
}: ProfileSearchRowProps) => {
  if (result.relationship === 'friend') {
    return (
      <Button asChild className="w-full sm:w-auto" size="sm" variant="outline">
        <NavLink to={`/friends/${result.userId}`}>보기</NavLink>
      </Button>
    );
  }

  if (result.relationship === 'sent' && result.requestId) {
    return (
      <Button
        className="w-full sm:w-auto"
        disabled={disabled}
        size="sm"
        variant="outline"
        onClick={() => onCancel(result.requestId as string)}
      >
        <X className="h-4 w-4" />
        취소
      </Button>
    );
  }

  if (result.relationship === 'received' && result.requestId) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button disabled={disabled} size="sm" onClick={() => onAccept(result.requestId as string)}>
          <Check className="h-4 w-4" />
          수락
        </Button>
        <Button
          disabled={disabled}
          size="sm"
          variant="outline"
          onClick={() => onDecline(result.requestId as string)}
        >
          <X className="h-4 w-4" />
          거절
        </Button>
      </div>
    );
  }

  return (
    <Button
      className="w-full sm:w-auto"
      disabled={disabled}
      size="sm"
      onClick={() => onSend(result.userId)}
    >
      <UserPlus className="h-4 w-4" />
      신청
    </Button>
  );
};

interface FriendRequestPanelProps {
  incomingRequests: FriendRequest[];
  isActionPending: boolean;
  isLoading: boolean;
  outgoingRequests: FriendRequest[];
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

const FriendRequestPanel = ({
  incomingRequests,
  isActionPending,
  isLoading,
  outgoingRequests,
  onAccept,
  onCancel,
  onDecline,
}: FriendRequestPanelProps) => {
  const totalRequests = incomingRequests.length + outgoingRequests.length;

  return (
    <section className="workspace-panel ow-panel-cap overflow-hidden shadow-sm">
      <PanelHeader
        icon={Bell}
        label="친구 초대"
        title="수락과 거절"
        trailing={totalRequests > 0 ? formatCount(totalRequests) : undefined}
      />
      <div className="section-pad grid gap-4">
        {isLoading ? (
          <div className="grid gap-2">
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
          </div>
        ) : totalRequests === 0 ? (
          <InlineEmptyState title="대기 중인 친구 초대가 없습니다." />
        ) : (
          <>
            <RequestGroup
              disabled={isActionPending}
              emptyTitle="받은 초대가 없습니다."
              requests={incomingRequests}
              title="받은 초대"
              onAccept={onAccept}
              onCancel={onCancel}
              onDecline={onDecline}
            />
            <RequestGroup
              disabled={isActionPending}
              emptyTitle="보낸 초대가 없습니다."
              requests={outgoingRequests}
              title="보낸 초대"
              onAccept={onAccept}
              onCancel={onCancel}
              onDecline={onDecline}
            />
          </>
        )}
      </div>
    </section>
  );
};

interface RequestGroupProps {
  disabled: boolean;
  emptyTitle: string;
  requests: FriendRequest[];
  title: string;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

const RequestGroup = ({
  disabled,
  emptyTitle,
  requests,
  title,
  onAccept,
  onCancel,
  onDecline,
}: RequestGroupProps) => (
  <div className="grid gap-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-black text-muted-foreground">{title}</h3>
      <span className="text-xs font-bold text-muted-foreground">
        {formatCount(requests.length)}
      </span>
    </div>
    {requests.length === 0 ? (
      <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground">
        {emptyTitle}
      </p>
    ) : (
      <div className="overflow-hidden rounded-md border border-border/70">
        {requests.map((request) => (
          <RequestRow
            key={request.requestId}
            disabled={disabled}
            request={request}
            onAccept={onAccept}
            onCancel={onCancel}
            onDecline={onDecline}
          />
        ))}
      </div>
    )}
  </div>
);

interface RequestRowProps {
  disabled: boolean;
  request: FriendRequest;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

const RequestRow = ({ disabled, request, onAccept, onCancel, onDecline }: RequestRowProps) => (
  <div className="flat-row grid gap-3 p-3 transition-colors hover:bg-secondary/50 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
    <FriendAvatar className="h-9 w-9 text-xs" nickname={request.nickname} />
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{request.nickname}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        {request.direction === 'incoming' ? '받은 초대' : '보낸 초대'} ·{' '}
        {formatShortDate(request.createdAt)}
      </p>
    </div>
    {request.direction === 'incoming' ? (
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button disabled={disabled} size="sm" onClick={() => onAccept(request.requestId)}>
          <Check className="h-4 w-4" />
          수락
        </Button>
        <Button
          disabled={disabled}
          size="sm"
          variant="outline"
          onClick={() => onDecline(request.requestId)}
        >
          <X className="h-4 w-4" />
          거절
        </Button>
      </div>
    ) : (
      <Button
        className="w-full sm:w-auto"
        disabled={disabled}
        size="sm"
        variant="outline"
        onClick={() => onCancel(request.requestId)}
      >
        <X className="h-4 w-4" />
        취소
      </Button>
    )}
  </div>
);

interface FriendDirectoryPanelProps {
  className?: string;
  filter: string;
  friends: FriendSummary[];
  isLoading: boolean;
  sort: FriendSort;
  totalFriends: number;
  onFilterChange: (value: string) => void;
  onSortChange: (sort: FriendSort) => void;
}

const FriendDirectoryPanel = ({
  className,
  filter,
  friends,
  isLoading,
  sort,
  totalFriends,
  onFilterChange,
  onSortChange,
}: FriendDirectoryPanelProps) => (
  <section className={cn('workspace-panel ow-panel-cap overflow-hidden shadow-sm', className)}>
    <div className="section-header grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:items-center">
      <div className="min-w-0">
        <p className="metric-label">친구 목록</p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <h2 className="truncate text-xl font-black">{formatCount(totalFriends)}명</h2>
        </div>
      </div>
      <div className="grid gap-2">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="친구 검색"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
          />
        </div>
        <FriendSortControl sort={sort} onSortChange={onSortChange} />
      </div>
    </div>

    <div className="min-h-[420px] bg-[hsl(var(--surface-2))]">
      {isLoading ? (
        <div className="grid gap-2 p-3.5 sm:p-4">
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
        </div>
      ) : totalFriends === 0 ? (
        <div className="section-pad">
          <EmptyState
            icon={UsersRound}
            title="아직 친구가 없습니다."
            description="친구 찾기에서 닉네임을 검색해 친구 신청을 보낼 수 있습니다."
          />
        </div>
      ) : friends.length === 0 ? (
        <div className="section-pad">
          <InlineEmptyState
            title="일치하는 친구가 없습니다."
            description="다른 닉네임으로 검색해 보세요."
          />
        </div>
      ) : (
        <div className="p-3.5 sm:p-4">
          <div className="overflow-hidden rounded-[3px] border border-border bg-card">
            {friends.map((friend) => (
              <FriendListRow key={friend.friendId} friend={friend} />
            ))}
          </div>
        </div>
      )}
    </div>
  </section>
);

const FriendListRow = ({ friend }: { friend: FriendSummary }) => (
  <NavLink
    to={`/friends/${friend.friendId}`}
    className="group grid min-h-16 gap-3 border-b border-border/70 px-3.5 py-3 transition-colors last:border-b-0 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[44px_minmax(0,1fr)_150px] sm:items-center sm:px-4"
  >
    <FriendAvatar
      avatarUrl={friend.avatarUrl}
      className="h-10 w-10 text-sm"
      nickname={friend.nickname}
    />
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-black">{friend.nickname}</p>
        <span className="inline-flex h-5 shrink-0 items-center rounded-sm border border-border bg-[hsl(var(--surface-2))] px-1.5 text-[10px] font-black text-muted-foreground">
          친구
        </span>
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground sm:hidden">
        친구 등록일 {formatShortDate(friend.friendsSince)}
      </p>
    </div>
    <div className="hidden text-right sm:block">
      <p className="metric-label">친구 등록일</p>
      <p className="mt-1 text-xs font-bold text-muted-foreground">
        {formatShortDate(friend.friendsSince)}
      </p>
    </div>
  </NavLink>
);

interface FriendSortControlProps {
  sort: FriendSort;
  onSortChange: (sort: FriendSort) => void;
}

const sortOptions: Array<{ label: string; value: FriendSort }> = [
  { label: '이름순', value: 'name' },
  { label: '최근 추가', value: 'recent' },
  { label: '오래된 순', value: 'oldest' },
];

const FriendSortControl = ({ sort, onSortChange }: FriendSortControlProps) => (
  <div className="grid grid-cols-3 rounded-md border border-border/70 bg-card p-1">
    {sortOptions.map((option) => (
      <button
        key={option.value}
        type="button"
        className={cn(
          'h-8 rounded-sm px-2 text-xs font-bold transition-colors',
          sort === option.value
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )}
        onClick={() => onSortChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

interface FriendDetailViewProps {
  friend?: FriendSummary;
  isStatsLoading: boolean;
  stats?: FriendStats;
  onRemoveFriend: (friendId: string, nickname: string) => void;
}

const FriendDetailView = ({
  friend,
  isStatsLoading,
  stats,
  onRemoveFriend,
}: FriendDetailViewProps) => {
  if (isStatsLoading) {
    return (
      <div className="page-stack">
        <PageHeader compact eyebrow="친구 상세" title="불러오는 중" />
        <SkeletonBlock className="h-32" />
        <SkeletonBlock className="h-80" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="page-stack">
        <PageHeader
          compact
          eyebrow="친구 상세"
          title="친구를 찾을 수 없습니다."
          actions={
            <Button asChild variant="outline">
              <NavLink to="/friends">
                <ArrowLeft className="h-4 w-4" />
                친구 목록
              </NavLink>
            </Button>
          }
        />
        <EmptyState
          action={
            <Button asChild>
              <NavLink to="/friends">목록으로 이동</NavLink>
            </Button>
          }
          icon={UsersRound}
          title="열람할 수 없는 친구입니다."
          description="친구 관계가 삭제되었거나 접근 권한이 없는 프로필입니다."
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <>
        <FriendProfilePanel friend={friend} stats={stats} onRemoveFriend={onRemoveFriend} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <ModePerformancePanel modes={stats.modes} />
          <MapStrengthList maps={stats.maps} />
        </div>
        <div
          className={cn(
            'grid gap-4 xl:items-start',
            stats.recentForm.length > 0 && 'xl:grid-cols-[minmax(0,1fr)_420px]',
          )}
        >
          <HeroPerformancePanel heroes={stats.heroes} />
          {stats.recentForm.length > 0 && <RecentFormPanel recentForm={stats.recentForm} />}
        </div>
      </>
    </div>
  );
};

interface FriendProfilePanelProps {
  friend?: FriendSummary;
  onRemoveFriend: (friendId: string, nickname: string) => void;
  stats: FriendStats;
}

const FriendProfilePanel = ({ friend, onRemoveFriend, stats }: FriendProfilePanelProps) => {
  const profileNickname = stats.profile.nickname || friend?.nickname || '친구';
  const profileUserId = stats.profile.userId || friend?.friendId || '';
  const avatarUrl = stats.profile.avatarUrl || friend?.avatarUrl || null;
  const bestModeLabel = stats.summary.bestModeId ? getModeLabel(stats.summary.bestModeId) : '-';
  const bestMapLabel = stats.summary.bestMapId ? getMapLabel(stats.summary.bestMapId) : '-';

  return (
    <section className="workspace-panel ow-panel-cap overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-border/70 bg-[hsl(var(--surface-2))] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <Button asChild className="w-full bg-card sm:w-auto" variant="outline">
          <NavLink to="/friends">
            <ArrowLeft className="h-4 w-4" />
            목록
          </NavLink>
        </Button>
        <Button
          className="w-full bg-card text-destructive hover:text-destructive sm:w-auto"
          disabled={!profileUserId}
          variant="outline"
          onClick={() => onRemoveFriend(profileUserId, profileNickname)}
        >
          <UserMinus className="h-4 w-4" />
          삭제
        </Button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="section-pad">
          <div className="grid gap-5 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
            <FriendAvatar
              avatarUrl={avatarUrl}
              className="h-20 w-20 rounded-[3px] text-2xl sm:h-24 sm:w-24 sm:text-3xl"
              nickname={profileNickname}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="metric-label">커리어 프로필</p>
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border/70 bg-card px-2 text-xs font-bold text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  친구 공개
                </span>
              </div>
              <h1 className="mt-3 truncate text-4xl font-black tracking-normal sm:text-5xl">
                {profileNickname}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <ProfileInfoChip
                  label="친구 등록일"
                  value={friend ? formatFullDate(friend.friendsSince) : '확인 중'}
                />
                <ProfileInfoChip label="공개 범위" value="공유 통계" />
              </div>
            </div>
          </div>
        </div>

        <aside className="section-pad border-t border-border/70 bg-[hsl(var(--surface-2))] lg:border-l lg:border-t-0">
          <div className="grid gap-4">
            <div>
              <p className="metric-label">통계 요약</p>
              <h2 className="mt-1 text-base font-black">모드와 전장 기준</h2>
            </div>

            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <SummaryMetric label="승률" primary value={formatPercent(stats.summary.winRate)} />
                <SummaryMetric label="경기" value={formatCount(stats.summary.totalMatches)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SummaryMetric label="강점 모드" value={bestModeLabel} />
                <SummaryMetric label="강점 전장" value={bestMapLabel} />
              </div>
              <SummaryRecordBlock
                draws={stats.summary.draws}
                losses={stats.summary.losses}
                wins={stats.summary.wins}
              />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

const ProfileInfoChip = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 text-xs font-black">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 truncate">{value}</span>
  </span>
);

interface SummaryMetricProps {
  label: string;
  primary?: boolean;
  value: string;
}

const SummaryMetric = ({ label, primary = false, value }: SummaryMetricProps) => (
  <div
    className={cn(
      'min-w-0 rounded-[3px] border border-border/70 bg-card px-3 py-3',
      primary && 'border-primary/25 bg-primary/5',
    )}
  >
    <p className="metric-label">{label}</p>
    <p
      className={cn(
        'mt-1.5 truncate text-xl font-black leading-tight tracking-normal',
        primary && 'text-primary',
      )}
    >
      {value}
    </p>
  </div>
);

const SummaryRecordBlock = ({
  draws,
  losses,
  wins,
}: {
  draws: number;
  losses: number;
  wins: number;
}) => (
  <div className="rounded-[3px] border border-border/70 bg-card px-3 py-3">
    <p className="metric-label">전적</p>
    <p className="mt-1.5 text-sm font-black leading-tight [overflow-wrap:anywhere]">
      {getRecordSummary(wins, losses, draws)}
    </p>
  </div>
);

const HeroPerformancePanel = ({ heroes }: { heroes: FriendStatsHero[] }) => {
  const topHeroes = [...heroes].sort(getUsageSort).slice(0, 8);

  return (
    <section className="workspace-panel ow-panel-cap overflow-hidden">
      <div className="section-header flex items-center justify-between gap-3">
        <div>
          <p className="metric-label">보조 통계</p>
          <h2 className="mt-1 text-base font-bold">기록된 영웅</h2>
        </div>
        <div className="ow-game-icon-shell h-9 w-9 bg-primary">
          <div className="ow-game-icon-core bg-card text-primary">
            <Trophy className="h-4 w-4" />
          </div>
        </div>
      </div>
      <div className="divide-y divide-border/70">
        {topHeroes.length > 0 ? (
          topHeroes.map((hero, index) => (
            <HeroCompactRow hero={hero} index={index} key={hero.heroId} />
          ))
        ) : (
          <div className="flex min-h-[220px] items-center justify-center px-4 text-sm font-semibold text-muted-foreground">
            공개된 영웅 기록이 없습니다.
          </div>
        )}
      </div>
    </section>
  );
};

const HeroCompactRow = ({ hero, index }: { hero: FriendStatsHero; index: number }) => (
  <div className="grid min-h-[64px] grid-cols-[28px_44px_minmax(0,1fr)_72px] items-center gap-3 border-b border-border/70 px-3 transition-colors last:border-b-0 hover:bg-[hsl(var(--surface-2))]">
    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-black text-muted-foreground">
      {index + 1}
    </span>
    <img
      alt=""
      className="h-11 w-11 rounded-md border border-border/70 object-cover object-top"
      src={getHeroPortraitPath(hero.heroId)}
    />
    <div className="min-w-0">
      <p className="truncate text-sm font-black">{getHeroLabel(hero.heroId)}</p>
      <p className="mt-0.5 truncate text-[11px] font-bold text-muted-foreground">
        {getHeroRoleLabel(hero.heroId)} · {formatCount(hero.totalMatches)}전
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, hero.winRate))}%` }}
        />
      </div>
    </div>
    <p className="text-right text-sm font-black text-primary">{formatPercent(hero.winRate)}</p>
  </div>
);

interface MiniStatProps {
  label: string;
  primary?: boolean;
  value: string;
}

const MiniStat = ({ label, primary = false, value }: MiniStatProps) => (
  <div className="min-w-0 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] px-2.5 py-2">
    <p className="metric-label">{label}</p>
    <p
      className={cn(
        'mt-1 text-base font-black leading-tight tabular-nums [overflow-wrap:anywhere]',
        primary && 'text-primary',
      )}
    >
      {value}
    </p>
  </div>
);

const RecentFormPanel = ({ recentForm }: { recentForm: FriendRecentFormItem[] }) => {
  const wins = recentForm.filter((item) => item.result === 'win').length;
  const recentWinRate =
    recentForm.length > 0 ? formatPercent((wins / recentForm.length) * 100) : '-';
  const currentStreak = getCurrentStreak(recentForm);

  return (
    <section className="workspace-panel ow-panel-cap overflow-hidden">
      <div className="section-header flex items-center justify-between gap-3">
        <div>
          <p className="metric-label">최근 흐름</p>
          <h2 className="mt-1 text-base font-bold">보조 지표</h2>
        </div>
        <p className="text-sm font-black text-primary">{recentWinRate}</p>
      </div>
      <div className="section-pad">
        {recentForm.length > 0 ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card px-3 py-2.5">
              <div className="min-w-0">
                <p className="metric-label">현재 흐름</p>
                <p className="mt-1 truncate text-sm font-black">{currentStreak?.label ?? '-'}</p>
              </div>
              <div className="text-right">
                <p className="metric-label">최근 {formatCount(recentForm.length)}경기</p>
                <p className="mt-1 text-sm font-black text-primary">{recentWinRate}</p>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-1.5">
              {recentForm.map((item, index) => (
                <span
                  className={cn(
                    'h-8 rounded-sm border border-border/70 bg-card text-center text-[11px] font-black leading-8',
                    resultTextTone[item.result],
                  )}
                  key={`${item.result}-${item.playedAt ?? index}-${index}`}
                  title={`${formatRecentDate(item.playedAt)} · ${resultLongLabel[item.result]}`}
                >
                  {resultLabel[item.result]}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <InlineEmptyState title="공개된 최근 흐름이 없습니다." />
        )}
      </div>
    </section>
  );
};

const ModePerformancePanel = ({ modes }: { modes: FriendStatsMode[] }) => {
  const sortedModes = [...modes].sort(
    (a, b) => getWinRateSort(a, b) || a.modeId.localeCompare(b.modeId),
  );
  const topModes = sortedModes.slice(0, 5);
  const featuredMode = sortedModes[0];

  return (
    <section className="workspace-panel ow-panel-cap overflow-hidden">
      <div className="section-header flex items-center justify-between gap-3">
        <div>
          <p className="metric-label">모드</p>
          <h2 className="mt-1 text-base font-bold">모드별 성과</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border/70 bg-card px-2 py-1 text-xs font-black text-muted-foreground">
            상위 5
          </span>
          <div className="ow-game-icon-shell h-9 w-9 bg-primary">
            <div className="ow-game-icon-core bg-card text-primary">
              <Swords className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
      {featuredMode && (
        <div className="section-pad border-b border-border/70">
          <ModeSpotlight mode={featuredMode} />
        </div>
      )}
      <div className="divide-y divide-border/70">
        {topModes.length > 0 ? (
          topModes.map((mode, index) => (
            <PerformanceRow
              index={index}
              key={mode.modeId}
              name={<MatchModeLabel modeId={mode.modeId} />}
              record={getRecordSummary(mode.wins, mode.losses, mode.draws)}
              totalMatches={mode.totalMatches}
              winRate={mode.winRate}
            />
          ))
        ) : (
          <div className="flex min-h-[260px] items-center justify-center px-4 text-sm font-semibold text-muted-foreground">
            공개된 모드 통계가 없습니다.
          </div>
        )}
      </div>
    </section>
  );
};

const ModeSpotlight = ({ mode }: { mode: FriendStatsMode }) => (
  <div className="grid min-h-[156px] gap-4 rounded-[3px] border border-border/70 bg-card p-4 sm:grid-cols-[minmax(0,1fr)_180px]">
    <div className="min-w-0">
      <p className="metric-label">최고 승률 모드</p>
      <MatchModeLabel className="mt-2 text-3xl font-black tracking-normal" modeId={mode.modeId} />
      <p className="mt-2 truncate text-sm font-semibold text-muted-foreground">
        {formatCount(mode.totalMatches)}전 · {getRecordSummary(mode.wins, mode.losses, mode.draws)}
      </p>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
      <MiniStat label="승률" primary value={formatPercent(mode.winRate)} />
      <MiniStat label="경기" value={formatCount(mode.totalMatches)} />
    </div>
  </div>
);

interface PerformanceRowProps {
  index: number;
  name: ReactNode;
  record: ReactNode;
  totalMatches: number;
  winRate: number;
}

const PerformanceRow = ({ index, name, record, totalMatches, winRate }: PerformanceRowProps) => (
  <div className="grid min-h-[76px] grid-cols-[30px_minmax(0,1fr)_78px] items-center gap-3 px-4 py-3 transition-colors hover:bg-[hsl(var(--surface-2))] sm:grid-cols-[32px_minmax(0,1fr)_92px]">
    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-black text-muted-foreground sm:h-8 sm:w-8">
      {index + 1}
    </span>
    <div className="min-w-0">
      <div className="truncate text-sm font-black">{name}</div>
      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
        {formatCount(totalMatches)}전 · {record}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, winRate))}%` }}
        />
      </div>
    </div>
    <div className="text-right">
      <p className="text-base font-black text-primary tabular-nums">{formatPercent(winRate)}</p>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">승률</p>
    </div>
  </div>
);

const MapStrengthList = ({ maps }: { maps: FriendStatsMap[] }) => {
  const sortedMaps = [...maps]
    .sort((a, b) => getWinRateSort(a, b) || a.mapId.localeCompare(b.mapId))
    .slice(0, 5);
  const featuredMap = sortedMaps[0];

  return (
    <section className="workspace-panel ow-panel-cap overflow-hidden">
      <div className="section-header flex items-center justify-between gap-3">
        <div>
          <p className="metric-label">전장</p>
          <h2 className="mt-1 text-base font-bold">전장별 성과</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border/70 bg-card px-2 py-1 text-xs font-black text-muted-foreground">
            상위 5
          </span>
          <div className="ow-game-icon-shell h-9 w-9 bg-primary">
            <div className="ow-game-icon-core bg-card text-primary">
              <MapIcon className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
      {featuredMap && (
        <div className="section-pad border-b border-border/70">
          <MapSpotlight map={featuredMap} />
        </div>
      )}
      <div className="divide-y divide-border/70">
        {sortedMaps.length > 0 ? (
          sortedMaps.map((map, index) => (
            <PerformanceRow
              index={index}
              key={map.mapId}
              name={getMapLabel(map.mapId)}
              record={
                <>
                  <MatchModeLabel className="inline-flex" modeId={map.modeId} /> ·{' '}
                  {getRecordSummary(map.wins, map.losses, map.draws)}
                </>
              }
              totalMatches={map.totalMatches}
              winRate={map.winRate}
            />
          ))
        ) : (
          <div className="flex min-h-[260px] items-center justify-center px-4 text-sm font-semibold text-muted-foreground">
            공개된 전장 통계가 없습니다.
          </div>
        )}
      </div>
    </section>
  );
};

const MapSpotlight = ({ map }: { map: FriendStatsMap }) => (
  <div className="grid min-h-[156px] gap-4 rounded-[3px] border border-border/70 bg-card p-4 sm:grid-cols-[minmax(0,1fr)_180px]">
    <div className="min-w-0">
      <p className="metric-label">최고 승률 전장</p>
      <h3 className="mt-2 truncate text-3xl font-black tracking-normal">
        {getMapLabel(map.mapId)}
      </h3>
      <p className="mt-2 truncate text-sm font-semibold text-muted-foreground">
        <MatchModeLabel className="inline-flex" modeId={map.modeId} /> ·{' '}
        {getRecordSummary(map.wins, map.losses, map.draws)}
      </p>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
      <MiniStat label="승률" primary value={formatPercent(map.winRate)} />
      <MiniStat label="경기" value={formatCount(map.totalMatches)} />
    </div>
  </div>
);

interface FriendAvatarProps {
  avatarUrl?: string | null;
  className?: string;
  nickname: string;
}

const FriendAvatar = ({ avatarUrl, className, nickname }: FriendAvatarProps) => (
  <Avatar
    className={cn(
      'h-10 w-10 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] shadow-sm',
      className,
    )}
  >
    <AvatarImage alt={nickname} src={avatarUrl ?? undefined} />
    <AvatarFallback className="rounded-md bg-[hsl(var(--surface-2))] text-sm font-black text-foreground">
      {getInitial(nickname)}
    </AvatarFallback>
  </Avatar>
);

export { FriendsPage };
