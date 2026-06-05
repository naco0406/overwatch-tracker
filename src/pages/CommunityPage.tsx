import {
  ArrowLeft,
  Bell,
  Check,
  Network,
  Search,
  ShieldCheck,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { NavLink, useNavigate, useParams } from 'react-router-dom';

import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getMapLabel, getModeLabel } from '@/data/matchOptions';
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
  FriendStatsMap,
  FriendStatsMode,
  FriendSummary,
  ProfileSearchResult,
} from '@/types/community';

const formatPercent = (value: number) => `${Math.round(value * 10) / 10}%`;

const formatCount = (value: number) => value.toLocaleString('ko-KR');

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));

const resultTone = {
  draw: 'bg-muted-foreground/30',
  loss: 'bg-destructive',
  win: 'bg-[hsl(var(--success))]',
};

interface CommunitySummary {
  averageWinRate: number;
  bestFriend?: FriendSummary;
  friendsWithData: number;
  newestFriend?: FriendSummary;
  totalSharedMatches: number;
}

const buildCommunitySummary = (friends: FriendSummary[]): CommunitySummary => {
  const friendsWithData = friends.filter((friend) => friend.totalMatches > 0);
  const totalSharedMatches = friends.reduce((total, friend) => total + friend.totalMatches, 0);
  const averageWinRate =
    friendsWithData.length > 0
      ? friendsWithData.reduce((total, friend) => total + friend.winRate, 0) /
        friendsWithData.length
      : 0;
  const bestFriend = [...friendsWithData].sort(
    (a, b) => b.winRate - a.winRate || b.totalMatches - a.totalMatches,
  )[0];
  const newestFriend = [...friends].sort(
    (a, b) => new Date(b.friendsSince).getTime() - new Date(a.friendsSince).getTime(),
  )[0];

  return {
    averageWinRate,
    bestFriend,
    friendsWithData: friendsWithData.length,
    newestFriend,
    totalSharedMatches,
  };
};

const CommunityPage = () => {
  const navigate = useNavigate();
  const { friendId } = useParams<{ friendId?: string }>();
  const { data: profile, isLoading: isProfileLoading } = useOwnProfile();
  const { data: friends = [], isLoading: isFriendsLoading } = useFriends();
  const { data: requests = [], isLoading: isRequestsLoading } = useFriendRequests();
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
  const { data: selectedStats, isLoading: isStatsLoading } = useFriendStats(
    selectedFriend?.friendId,
  );
  const incomingRequests = requests.filter((request) => request.direction === 'incoming');
  const outgoingRequests = requests.filter((request) => request.direction === 'outgoing');
  const communitySummary = useMemo(() => buildCommunitySummary(friends), [friends]);
  const leaderboard = useMemo(
    () =>
      [...friends]
        .filter((friend) => friend.totalMatches > 0)
        .sort((a, b) => b.winRate - a.winRate || b.totalMatches - a.totalMatches)
        .slice(0, 8),
    [friends],
  );
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
        navigate(`/community/friends/${result.friend_id}`);
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

  const handleRemoveFriend = async (targetFriend: FriendSummary) => {
    try {
      await removeFriend.mutateAsync(targetFriend.friendId);
      toast({ title: `${targetFriend.nickname}님을 친구 목록에서 삭제했습니다.` });

      if (friendId === targetFriend.friendId) {
        navigate('/community');
      }
    } catch (error) {
      toast({
        title: '친구 삭제 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="커뮤니티"
        title="커뮤니티"
        description="친구들과 요약 통계를 공유하고, 서로의 강점과 최근 흐름을 가볍게 비교합니다."
      />

      <CommunityCommandCenter
        disabled={!hasNickname}
        friends={friends}
        hasNickname={hasNickname}
        incomingCount={incomingRequests.length}
        isActionPending={isAnyFriendActionPending}
        isProfileLoading={isProfileLoading}
        isSearching={isSearchFetching}
        outgoingCount={outgoingRequests.length}
        profileNickname={profile?.nickname ?? null}
        query={searchInput}
        results={searchResults}
        submittedQuery={submittedQuery}
        summary={communitySummary}
        setQuery={setSearchInput}
        onAccept={handleAcceptRequest}
        onCancel={handleCancelRequest}
        onDecline={handleDeclineRequest}
        onSearch={handleSearch}
        onSend={handleSendRequest}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_370px] xl:items-start">
        <div className="min-w-0">
          {selectedFriend ? (
            <FriendDetailPanel
              friend={selectedFriend}
              isLoading={isStatsLoading}
              stats={selectedStats}
              onRemoveFriend={handleRemoveFriend}
            />
          ) : (
            <CommunityHubPanel
              friends={friends}
              incomingCount={incomingRequests.length}
              isLoading={isFriendsLoading || isRequestsLoading}
              leaderboard={leaderboard}
              summary={communitySummary}
            />
          )}
        </div>

        <CommunityRail
          friends={friends}
          incomingRequests={incomingRequests}
          isActionPending={isAnyFriendActionPending}
          isFriendsLoading={isFriendsLoading}
          isRequestsLoading={isRequestsLoading}
          outgoingRequests={outgoingRequests}
          selectedFriendId={selectedFriend?.friendId}
          onAccept={handleAcceptRequest}
          onCancel={handleCancelRequest}
          onDecline={handleDeclineRequest}
        />
      </section>
    </div>
  );
};

interface CommunityCommandCenterProps {
  disabled: boolean;
  friends: FriendSummary[];
  hasNickname: boolean;
  incomingCount: number;
  isActionPending: boolean;
  isProfileLoading: boolean;
  isSearching: boolean;
  outgoingCount: number;
  profileNickname: string | null;
  query: string;
  results: ProfileSearchResult[];
  submittedQuery: string;
  summary: CommunitySummary;
  setQuery: (query: string) => void;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onSend: (userId: string) => void;
}

const CommunityCommandCenter = ({
  disabled,
  friends,
  hasNickname,
  incomingCount,
  isActionPending,
  isProfileLoading,
  isSearching,
  outgoingCount,
  profileNickname,
  query,
  results,
  submittedQuery,
  summary,
  setQuery,
  onAccept,
  onCancel,
  onDecline,
  onSearch,
  onSend,
}: CommunityCommandCenterProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.92fr)]">
      <div className="section-pad bg-[hsl(var(--surface-2))] lg:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="metric-label">커뮤니티 프로필</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Network className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-black">
                    {hasNickname ? profileNickname : '닉네임 설정 필요'}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">
                    {hasNickname
                      ? '친구 검색과 공개 요약 통계를 사용할 수 있습니다.'
                      : '내 계정 설정에서 닉네임을 설정하면 친구들이 나를 찾을 수 있습니다.'}
                  </p>
                </div>
              </div>
            </div>
            <Badge
              className={cn(
                'w-fit shrink-0 gap-1.5 border-border bg-card text-foreground',
                !hasNickname && 'border-warning/30 bg-warning/10 text-warning',
              )}
              variant="outline"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {hasNickname ? '닉네임 공개' : '대기 중'}
            </Badge>
          </div>

          <div className="grid border-t border-border/70 sm:grid-cols-2 lg:grid-cols-4">
            <CommunityMiniMetric
              label="친구"
              value={formatCount(friends.length)}
              hint="연결된 플레이어"
            />
            <CommunityMiniMetric
              label="공유 경기"
              value={formatCount(summary.totalSharedMatches)}
              hint="친구 요약 기준"
            />
            <CommunityMiniMetric
              label="평균 승률"
              value={formatPercent(summary.averageWinRate)}
              hint={`${formatCount(summary.friendsWithData)}명 데이터`}
            />
            <CommunityMiniMetric
              label="요청"
              value={formatCount(incomingCount + outgoingCount)}
              hint={`${formatCount(incomingCount)}개 수신`}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border/70 bg-card xl:border-l xl:border-t-0">
        <div className="grid divide-y divide-border/70">
          <CommunityProfileStatus
            hasNickname={hasNickname}
            isLoading={isProfileLoading}
            profileNickname={profileNickname}
          />
          <DiscoveryForm
            disabled={disabled}
            isActionPending={isActionPending}
            isSearching={isSearching}
            query={query}
            results={results}
            setQuery={setQuery}
            submittedQuery={submittedQuery}
            onAccept={onAccept}
            onCancel={onCancel}
            onDecline={onDecline}
            onSearch={onSearch}
            onSend={onSend}
          />
        </div>
      </div>
    </div>
  </section>
);

interface CommunityMiniMetricProps {
  hint: string;
  label: string;
  value: string;
}

const CommunityMiniMetric = ({ hint, label, value }: CommunityMiniMetricProps) => (
  <div className="min-w-0 border-b border-border/70 p-3 last:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b-0">
    <p className="metric-label">{label}</p>
    <p className="mt-2 truncate text-xl font-black">{value}</p>
    <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{hint}</p>
  </div>
);

interface CommunityProfileStatusProps {
  hasNickname: boolean;
  isLoading: boolean;
  profileNickname: string | null;
}

const CommunityProfileStatus = ({
  hasNickname,
  isLoading,
  profileNickname,
}: CommunityProfileStatusProps) => (
  <div className="grid gap-3 p-3.5 sm:p-4 lg:p-5">
    <div>
      <p className="metric-label">내 커뮤니티 프로필</p>
      <h3 className="mt-1 text-base font-bold">
        {isLoading ? '불러오는 중' : hasNickname ? profileNickname : '닉네임 설정 필요'}
      </h3>
    </div>
    {isLoading ? (
      <div className="grid gap-2">
        <SkeletonBlock className="h-10" />
        <SkeletonBlock className="h-9 w-28" />
      </div>
    ) : (
      <div className="grid gap-3">
        <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
          닉네임은 내 계정 설정에서 관리합니다. 닉네임을 설정해야 친구 검색과 친구 신청을 사용할 수
          있습니다.
        </p>
        <Button
          asChild
          className="w-full justify-start"
          variant={hasNickname ? 'outline' : 'default'}
        >
          <NavLink to="/settings/account">
            <UserRound className="h-4 w-4" />
            {hasNickname ? '닉네임 변경' : '닉네임 설정'}
          </NavLink>
        </Button>
      </div>
    )}
  </div>
);

interface DiscoveryFormProps {
  disabled: boolean;
  isActionPending: boolean;
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

const DiscoveryForm = ({
  disabled,
  isActionPending,
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
}: DiscoveryFormProps) => (
  <div className="grid gap-3 p-3.5 sm:p-4 lg:p-5">
    <div>
      <p className="metric-label">플레이어 찾기</p>
      <h3 className="mt-1 text-base font-bold">닉네임으로 연결</h3>
    </div>
    <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={onSearch}>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoComplete="off"
          className="pl-9"
          disabled={disabled}
          placeholder={disabled ? '닉네임을 먼저 설정하세요' : '친구 닉네임'}
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
  </div>
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
        <SkeletonBlock className="h-11" />
        <SkeletonBlock className="h-11" />
      </div>
    );
  }

  if (results.length > 0) {
    return (
      <div className="max-h-[210px] overflow-y-auto rounded-md border border-border/70">
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
        description="정확한 닉네임 일부를 입력해서 다시 찾아보세요."
      />
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2.5 text-xs font-semibold leading-relaxed text-muted-foreground">
      친구가 닉네임을 설정하면 이곳에서 검색하고 신청할 수 있습니다.
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
  <div className="flat-row grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{result.nickname}</p>
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
        <NavLink to={`/community/friends/${result.userId}`}>
          <UserCheck className="h-4 w-4" />
          보기
        </NavLink>
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

interface CommunityHubPanelProps {
  friends: FriendSummary[];
  incomingCount: number;
  isLoading: boolean;
  leaderboard: FriendSummary[];
  summary: CommunitySummary;
}

const CommunityHubPanel = ({
  friends,
  incomingCount,
  isLoading,
  leaderboard,
  summary,
}: CommunityHubPanelProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="metric-label">커뮤니티 보드</p>
        <h2 className="mt-1 text-2xl font-black">친구 요약</h2>
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        친구들의 원본 경기 기록은 열람하지 않고, 공개 가능한 요약 지표만 모아 봅니다.
      </p>
    </div>

    <div className="metric-strip grid-cols-2 lg:grid-cols-4">
      <MetricCell label="연결" value={isLoading ? null : `${formatCount(friends.length)}명`} />
      <MetricCell
        label="데이터 있는 친구"
        value={isLoading ? null : `${formatCount(summary.friendsWithData)}명`}
      />
      <MetricCell
        label="평균 승률"
        value={isLoading ? null : formatPercent(summary.averageWinRate)}
      />
      <MetricCell label="받은 요청" value={isLoading ? null : formatCount(incomingCount)} />
    </div>

    <div className="section-pad">
      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <SkeletonBlock className="h-[360px]" />
          <SkeletonBlock className="h-[360px]" />
        </div>
      ) : friends.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="아직 커뮤니티 연결이 없습니다."
          description="닉네임으로 친구를 추가하면 이곳에서 친구들의 요약 통계와 흐름을 볼 수 있습니다."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
          <LeaderboardPanel leaderboard={leaderboard} />
          <CommunityPulsePanel summary={summary} />
        </div>
      )}
    </div>
  </section>
);

const LeaderboardPanel = ({ leaderboard }: { leaderboard: FriendSummary[] }) => (
  <section className="overflow-hidden border border-border/70 bg-card">
    <div className="section-header flex items-center justify-between gap-3">
      <div>
        <p className="metric-label">리더보드</p>
        <h3 className="mt-1 text-base font-bold">친구 승률 순위</h3>
      </div>
      <Trophy className="h-5 w-5 text-primary" />
    </div>
    <div className="divide-y divide-border/70">
      {leaderboard.length > 0 ? (
        leaderboard.map((friend, index) => (
          <NavLink
            key={friend.friendId}
            to={`/community/friends/${friend.friendId}`}
            className="grid gap-3 px-4 py-3 transition-colors hover:bg-secondary/70 sm:grid-cols-[34px_minmax(0,1fr)_92px] sm:items-center"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs font-black text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{friend.nickname}</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {formatCount(friend.totalMatches)}전 · {formatCount(friend.wins)}승{' '}
                {formatCount(friend.losses)}패
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-base font-black text-primary">{formatPercent(friend.winRate)}</p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">승률</p>
            </div>
          </NavLink>
        ))
      ) : (
        <div className="flex min-h-[220px] items-center justify-center px-4 text-sm font-semibold text-muted-foreground">
          아직 비교할 친구 기록이 없습니다.
        </div>
      )}
    </div>
  </section>
);

const CommunityPulsePanel = ({ summary }: { summary: CommunitySummary }) => (
  <section className="overflow-hidden border border-border/70 bg-[hsl(var(--surface-2))]">
    <PulseItem
      icon={Trophy}
      label="최고 승률"
      title={summary.bestFriend?.nickname ?? '데이터 없음'}
      value={summary.bestFriend ? formatPercent(summary.bestFriend.winRate) : '-'}
    />
    <PulseItem
      icon={Network}
      label="최근 연결"
      title={summary.newestFriend?.nickname ?? '친구 없음'}
      value={summary.newestFriend ? formatShortDate(summary.newestFriend.friendsSince) : '-'}
    />
    <PulseItem
      icon={ShieldCheck}
      label="공유 규모"
      title="친구 요약 경기"
      value={`${formatCount(summary.totalSharedMatches)}전`}
    />
  </section>
);

interface PulseItemProps {
  icon: typeof Trophy;
  label: string;
  title: string;
  value: string;
}

const PulseItem = ({ icon: Icon, label, title, value }: PulseItemProps) => (
  <div className="flat-row p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <h3 className="mt-2 truncate text-base font-bold">{title}</h3>
        <p className="mt-3 text-2xl font-black text-primary">{value}</p>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-card text-primary">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

interface CommunityRailProps {
  friends: FriendSummary[];
  incomingRequests: FriendRequest[];
  isActionPending: boolean;
  isFriendsLoading: boolean;
  isRequestsLoading: boolean;
  outgoingRequests: FriendRequest[];
  selectedFriendId?: string;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

const CommunityRail = ({
  friends,
  incomingRequests,
  isActionPending,
  isFriendsLoading,
  isRequestsLoading,
  outgoingRequests,
  selectedFriendId,
  onAccept,
  onCancel,
  onDecline,
}: CommunityRailProps) => (
  <aside className="workspace-panel overflow-hidden xl:sticky xl:top-8">
    <div className="section-header flex items-center justify-between gap-3">
      <div>
        <p className="metric-label">네트워크</p>
        <h2 className="mt-1 text-base font-bold">요청과 친구</h2>
      </div>
      <UsersRound className="h-5 w-5 text-muted-foreground" />
    </div>
    <div className="divide-y divide-border/70">
      <RequestQueue
        incomingRequests={incomingRequests}
        isActionPending={isActionPending}
        isLoading={isRequestsLoading}
        outgoingRequests={outgoingRequests}
        onAccept={onAccept}
        onCancel={onCancel}
        onDecline={onDecline}
      />
      <FriendDirectory
        friends={friends}
        isLoading={isFriendsLoading}
        selectedFriendId={selectedFriendId}
      />
    </div>
  </aside>
);

interface RequestQueueProps {
  incomingRequests: FriendRequest[];
  isActionPending: boolean;
  isLoading: boolean;
  outgoingRequests: FriendRequest[];
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

const RequestQueue = ({
  incomingRequests,
  isActionPending,
  isLoading,
  outgoingRequests,
  onAccept,
  onCancel,
  onDecline,
}: RequestQueueProps) => (
  <section className="p-3.5 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <p className="metric-label">요청 큐</p>
        <h3 className="mt-1 text-sm font-bold">
          {formatCount(incomingRequests.length + outgoingRequests.length)}개 대기
        </h3>
      </div>
      <Bell className="h-4 w-4 text-muted-foreground" />
    </div>
    <div className="grid gap-2">
      {isLoading ? (
        <>
          <SkeletonBlock className="h-12" />
          <SkeletonBlock className="h-12" />
        </>
      ) : incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
        <InlineEmptyState title="대기 중인 요청이 없습니다." />
      ) : (
        <>
          {incomingRequests.map((request) => (
            <RequestRow
              key={request.requestId}
              disabled={isActionPending}
              request={request}
              onAccept={onAccept}
              onCancel={onCancel}
              onDecline={onDecline}
            />
          ))}
          {outgoingRequests.map((request) => (
            <RequestRow
              key={request.requestId}
              disabled={isActionPending}
              request={request}
              onAccept={onAccept}
              onCancel={onCancel}
              onDecline={onDecline}
            />
          ))}
        </>
      )}
    </div>
  </section>
);

interface RequestRowProps {
  disabled: boolean;
  request: FriendRequest;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

const RequestRow = ({ disabled, request, onAccept, onCancel, onDecline }: RequestRowProps) => (
  <div className="grid gap-2 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3">
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{request.nickname}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        {request.direction === 'incoming' ? '받은 신청' : '보낸 신청'} ·{' '}
        {formatShortDate(request.createdAt)}
      </p>
    </div>
    {request.direction === 'incoming' ? (
      <div className="grid grid-cols-2 gap-2">
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

interface FriendDirectoryProps {
  friends: FriendSummary[];
  isLoading: boolean;
  selectedFriendId?: string;
}

const FriendDirectory = ({ friends, isLoading, selectedFriendId }: FriendDirectoryProps) => (
  <section>
    <div className="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4">
      <div>
        <p className="metric-label">친구 디렉터리</p>
        <h3 className="mt-1 text-sm font-bold">{formatCount(friends.length)}명</h3>
      </div>
      <Button asChild className="bg-transparent" size="sm" variant="outline">
        <NavLink to="/community">
          <ArrowLeft className="h-4 w-4" />
          허브
        </NavLink>
      </Button>
    </div>
    <div className="max-h-[520px] overflow-y-auto border-t border-border/70">
      {isLoading ? (
        <div className="grid gap-2 p-3.5 sm:p-4">
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
        </div>
      ) : friends.length === 0 ? (
        <div className="p-3.5 sm:p-4">
          <InlineEmptyState
            title="아직 친구가 없습니다."
            description="닉네임으로 친구를 찾아 추가하면 이곳에 표시됩니다."
          />
        </div>
      ) : (
        friends.map((friend) => (
          <NavLink
            key={friend.friendId}
            to={`/community/friends/${friend.friendId}`}
            className={cn(
              'flat-row grid gap-2 px-3.5 py-3 transition-colors hover:bg-secondary/70 sm:grid-cols-[minmax(0,1fr)_76px] sm:items-center',
              selectedFriendId === friend.friendId && 'bg-primary/5',
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{friend.nickname}</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {formatCount(friend.totalMatches)}전 · 친구 {formatShortDate(friend.friendsSince)}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-black text-primary">{formatPercent(friend.winRate)}</p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">승률</p>
            </div>
          </NavLink>
        ))
      )}
    </div>
  </section>
);

interface FriendDetailPanelProps {
  friend: FriendSummary;
  isLoading: boolean;
  stats?: FriendStats;
  onRemoveFriend: (friend: FriendSummary) => void;
}

const FriendDetailPanel = ({
  friend,
  isLoading,
  stats,
  onRemoveFriend,
}: FriendDetailPanelProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="metric-label">친구 공개 분석</p>
        <h2 className="mt-1 truncate text-2xl font-black">{friend.nickname}</h2>
      </div>
      <div className="grid gap-2 sm:flex">
        <Button asChild className="bg-transparent" size="sm" variant="outline">
          <NavLink to="/community">
            <ArrowLeft className="h-4 w-4" />
            커뮤니티
          </NavLink>
        </Button>
        <Button
          className="bg-transparent"
          size="sm"
          variant="outline"
          onClick={() => onRemoveFriend(friend)}
        >
          <UserMinus className="h-4 w-4" />
          친구 삭제
        </Button>
      </div>
    </div>

    {isLoading || !stats ? (
      <div className="section-pad grid gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
        <SkeletonBlock className="h-72" />
      </div>
    ) : (
      <>
        <div className="metric-strip grid-cols-2 md:grid-cols-4">
          <MetricCell label="전체 승률" value={formatPercent(stats.summary.winRate)} />
          <MetricCell label="경기 수" value={formatCount(stats.summary.totalMatches)} />
          <MetricCell
            label="최고 모드"
            value={stats.summary.bestModeId ? getModeLabel(stats.summary.bestModeId) : '-'}
          />
          <MetricCell
            label="최고 전장"
            value={stats.summary.bestMapId ? getMapLabel(stats.summary.bestMapId) : '-'}
          />
        </div>
        <div className="section-pad grid gap-5">
          <RecentFormStrip recentForm={stats.recentForm} />
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <ModeChart modes={stats.modes} />
            <MapStrengthList maps={stats.maps} />
          </div>
        </div>
      </>
    )}
  </section>
);

interface MetricCellProps {
  label: string;
  value: string | null;
}

const MetricCell = ({ label, value }: MetricCellProps) => (
  <div className="metric-cell">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      {value === null ? (
        <SkeletonBlock className="mt-3 h-7 w-24" />
      ) : (
        <p className="mt-2 truncate text-2xl font-black tracking-normal">{value}</p>
      )}
    </div>
  </div>
);

const RecentFormStrip = ({ recentForm }: { recentForm: FriendRecentFormItem[] }) => (
  <section className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="metric-label">최근 폼</p>
        <h3 className="mt-1 text-base font-bold">최근 {recentForm.length}경기 결과 흐름</h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recentForm.length > 0 ? (
          recentForm.map((item, index) => (
            <span
              key={`${item.result}-${index}`}
              className={cn('h-3 w-8 rounded-full', resultTone[item.result])}
              title={item.result}
            />
          ))
        ) : (
          <span className="text-sm font-semibold text-muted-foreground">기록 없음</span>
        )}
      </div>
    </div>
  </section>
);

const ModeChart = ({ modes }: { modes: FriendStatsMode[] }) => {
  const chartData = modes.map((mode) => ({
    draws: mode.draws,
    losses: mode.losses,
    matches: mode.totalMatches,
    name: getModeLabel(mode.modeId),
    winRate: mode.winRate,
    wins: mode.wins,
  }));

  return (
    <section className="rounded-lg border border-border/70 bg-card">
      <div className="section-header">
        <p className="metric-label">모드</p>
        <h3 className="mt-1 text-base font-bold">모드별 승률</h3>
      </div>
      <div className="h-[320px] p-3 sm:p-4">
        {chartData.length > 0 ? (
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={chartData} margin={{ bottom: 6, left: -18, right: 4, top: 8 }}>
              <XAxis
                axisLine={false}
                dataKey="name"
                interval={0}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 700 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={[0, 100]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 700 }}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                width={42}
              />
              <Tooltip
                content={<CommunityChartTooltip />}
                cursor={{ fill: 'hsl(var(--secondary))' }}
              />
              <Bar dataKey="winRate" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-muted-foreground">
            공개된 모드 통계가 없습니다.
          </div>
        )}
      </div>
    </section>
  );
};

interface CommunityChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      losses: number;
      matches: number;
      name: string;
      winRate: number;
      wins: number;
    };
  }>;
}

const CommunityChartTooltip = ({ active, payload }: CommunityChartTooltipProps) => {
  if (!active || !payload?.[0]) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="rounded-md border border-border/80 bg-card px-3 py-2 shadow-lg">
      <p className="text-sm font-black">{data.name}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        {formatPercent(data.winRate)} · {formatCount(data.matches)}전 {formatCount(data.wins)}승{' '}
        {formatCount(data.losses)}패
      </p>
    </div>
  );
};

const MapStrengthList = ({ maps }: { maps: FriendStatsMap[] }) => (
  <section className="rounded-lg border border-border/70 bg-card">
    <div className="section-header">
      <p className="metric-label">전장</p>
      <h3 className="mt-1 text-base font-bold">강점 전장</h3>
    </div>
    <div className="divide-y divide-border/70">
      {maps.length > 0 ? (
        maps.slice(0, 8).map((map, index) => (
          <div
            key={map.mapId}
            className="grid gap-3 px-4 py-3 sm:grid-cols-[28px_minmax(0,1fr)_76px] sm:items-center"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-black text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{getMapLabel(map.mapId)}</p>
              <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                {getModeLabel(map.modeId)} · {formatCount(map.totalMatches)}전
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-black text-primary">{formatPercent(map.winRate)}</p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                {formatCount(map.wins)}승
              </p>
            </div>
          </div>
        ))
      ) : (
        <div className="flex min-h-[180px] items-center justify-center px-4 text-sm font-semibold text-muted-foreground">
          공개된 전장 통계가 없습니다.
        </div>
      )}
    </div>
  </section>
);

export { CommunityPage };
