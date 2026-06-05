import { Check, Search, UserCheck, UserMinus, UserPlus, UsersRound, X } from 'lucide-react';
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
  useSaveOwnProfile,
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

const CommunityPage = () => {
  const navigate = useNavigate();
  const { friendId } = useParams<{ friendId?: string }>();
  const { data: profile, isLoading: isProfileLoading } = useOwnProfile();
  const { data: friends = [], isLoading: isFriendsLoading } = useFriends();
  const { data: requests = [], isLoading: isRequestsLoading } = useFriendRequests();
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [isNicknameDirty, setIsNicknameDirty] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const saveProfile = useSaveOwnProfile();
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
  const nicknameInput = isNicknameDirty ? nicknameDraft : (profile?.nickname ?? '');
  const isAnyFriendActionPending =
    sendRequest.isPending ||
    acceptRequest.isPending ||
    declineRequest.isPending ||
    cancelRequest.isPending ||
    removeFriend.isPending;

  const strongestFriends = useMemo(
    () =>
      [...friends]
        .filter((friend) => friend.totalMatches > 0)
        .sort((a, b) => b.winRate - a.winRate || b.totalMatches - a.totalMatches)
        .slice(0, 3),
    [friends],
  );

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const savedProfile = await saveProfile.mutateAsync({
        nickname: nicknameInput,
      });
      setNicknameDraft(savedProfile.nickname ?? '');
      setIsNicknameDirty(false);
      toast({ title: '닉네임 저장 완료' });
    } catch (error) {
      toast({
        title: '닉네임 저장 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

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
        title="친구"
        description="닉네임으로 친구를 추가하고, 서로 허용된 요약 통계만 확인합니다."
      />

      <section className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)] xl:items-start">
        <div className="grid gap-4">
          <ProfilePanel
            hasNickname={hasNickname}
            isLoading={isProfileLoading}
            isSaving={saveProfile.isPending}
            nicknameInput={nicknameInput}
            profileNickname={profile?.nickname ?? null}
            setNicknameInput={(value) => {
              setIsNicknameDirty(true);
              setNicknameDraft(value);
            }}
            onSave={handleSaveProfile}
          />

          <SearchPanel
            disabled={!hasNickname}
            isActionPending={isAnyFriendActionPending}
            isSearching={isSearchFetching}
            query={searchInput}
            results={searchResults}
            setQuery={setSearchInput}
            onAccept={handleAcceptRequest}
            onCancel={handleCancelRequest}
            onDecline={handleDeclineRequest}
            onSearch={handleSearch}
            onSend={handleSendRequest}
          />

          <RequestPanel
            incomingRequests={incomingRequests}
            isActionPending={isAnyFriendActionPending}
            isLoading={isRequestsLoading}
            outgoingRequests={outgoingRequests}
            onAccept={handleAcceptRequest}
            onCancel={handleCancelRequest}
            onDecline={handleDeclineRequest}
          />

          <FriendListPanel
            friends={friends}
            isLoading={isFriendsLoading}
            selectedFriendId={selectedFriend?.friendId}
          />
        </div>

        <div className="min-w-0">
          {selectedFriend ? (
            <FriendDetailPanel
              friend={selectedFriend}
              isLoading={isStatsLoading}
              stats={selectedStats}
              onRemoveFriend={handleRemoveFriend}
            />
          ) : (
            <CommunityOverviewPanel
              friends={friends}
              incomingCount={incomingRequests.length}
              isLoading={isFriendsLoading || isRequestsLoading}
              strongestFriends={strongestFriends}
            />
          )}
        </div>
      </section>
    </div>
  );
};

interface ProfilePanelProps {
  hasNickname: boolean;
  isLoading: boolean;
  isSaving: boolean;
  nicknameInput: string;
  profileNickname: string | null;
  setNicknameInput: (value: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}

const ProfilePanel = ({
  hasNickname,
  isLoading,
  isSaving,
  nicknameInput,
  profileNickname,
  setNicknameInput,
  onSave,
}: ProfilePanelProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">내 프로필</p>
        <h2 className="mt-1 truncate text-base font-bold">
          {hasNickname ? profileNickname : '닉네임 설정 필요'}
        </h2>
      </div>
      <Badge
        className={cn(
          'shrink-0 border-border bg-card text-foreground',
          !hasNickname && 'border-warning/30 bg-warning/10 text-warning',
        )}
        variant="outline"
      >
        {hasNickname ? '검색 가능' : '미설정'}
      </Badge>
    </div>
    <form className="section-pad grid gap-3" onSubmit={onSave}>
      {isLoading ? (
        <>
          <SkeletonBlock className="h-10" />
          <SkeletonBlock className="h-9 w-28" />
        </>
      ) : (
        <>
          <Input
            autoComplete="off"
            maxLength={20}
            placeholder="닉네임"
            value={nicknameInput}
            onChange={(event) => setNicknameInput(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-xs font-semibold leading-relaxed text-muted-foreground">
              친구 검색에는 이메일이 아니라 닉네임만 사용합니다.
            </p>
            <Button className="shrink-0" disabled={isSaving} size="sm" type="submit">
              <Check className="h-4 w-4" />
              저장
            </Button>
          </div>
        </>
      )}
    </form>
  </section>
);

interface SearchPanelProps {
  disabled: boolean;
  isActionPending: boolean;
  isSearching: boolean;
  query: string;
  results: ProfileSearchResult[];
  setQuery: (query: string) => void;
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onSend: (userId: string) => void;
}

const SearchPanel = ({
  disabled,
  isActionPending,
  isSearching,
  query,
  results,
  setQuery,
  onAccept,
  onCancel,
  onDecline,
  onSearch,
  onSend,
}: SearchPanelProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header">
      <p className="metric-label">친구 추가</p>
      <h2 className="mt-1 text-base font-bold">닉네임 검색</h2>
    </div>
    <div className="section-pad space-y-3">
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={onSearch}>
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoComplete="off"
            className="pl-9"
            disabled={disabled}
            placeholder={disabled ? '닉네임을 먼저 저장하세요' : '친구 닉네임'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button disabled={disabled || isSearching} type="submit">
          <Search className="h-4 w-4" />
          검색
        </Button>
      </form>

      {isSearching ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-11" />
          <SkeletonBlock className="h-11" />
        </div>
      ) : results.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border/70">
          {results.map((result) => (
            <ProfileSearchRow
              key={result.userId}
              disabled={isActionPending}
              result={result}
              onAccept={onAccept}
              onCancel={onCancel}
              onDecline={onDecline}
              onSend={onSend}
            />
          ))}
        </div>
      ) : (
        <InlineEmptyState
          title="검색 결과가 없습니다."
          description="정확한 닉네임 일부를 입력해서 친구를 찾아보세요."
        />
      )}
    </div>
  </section>
);

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

interface RequestPanelProps {
  incomingRequests: FriendRequest[];
  isActionPending: boolean;
  isLoading: boolean;
  outgoingRequests: FriendRequest[];
  onAccept: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

const RequestPanel = ({
  incomingRequests,
  isActionPending,
  isLoading,
  outgoingRequests,
  onAccept,
  onCancel,
  onDecline,
}: RequestPanelProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header flex items-center justify-between gap-3">
      <div>
        <p className="metric-label">요청</p>
        <h2 className="mt-1 text-base font-bold">대기 중</h2>
      </div>
      <Badge className="border-border bg-card text-foreground" variant="outline">
        {incomingRequests.length + outgoingRequests.length}
      </Badge>
    </div>
    <div className="section-pad space-y-3">
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
  <div className="grid gap-2 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="min-w-0">
      <p className="truncate text-sm font-bold">{request.nickname}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        {request.direction === 'incoming' ? '받은 신청' : '보낸 신청'} ·{' '}
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

interface FriendListPanelProps {
  friends: FriendSummary[];
  isLoading: boolean;
  selectedFriendId?: string;
}

const FriendListPanel = ({ friends, isLoading, selectedFriendId }: FriendListPanelProps) => (
  <section className="workspace-panel overflow-hidden">
    <div className="section-header flex items-center justify-between gap-3">
      <div>
        <p className="metric-label">친구 목록</p>
        <h2 className="mt-1 text-base font-bold">{formatCount(friends.length)}명</h2>
      </div>
      <UsersRound className="h-5 w-5 text-muted-foreground" />
    </div>
    <div className="max-h-[480px] overflow-y-auto">
      {isLoading ? (
        <div className="section-pad space-y-2">
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
        </div>
      ) : friends.length === 0 ? (
        <div className="section-pad">
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

interface CommunityOverviewPanelProps {
  friends: FriendSummary[];
  incomingCount: number;
  isLoading: boolean;
  strongestFriends: FriendSummary[];
}

const CommunityOverviewPanel = ({
  friends,
  incomingCount,
  isLoading,
  strongestFriends,
}: CommunityOverviewPanelProps) => (
  <section className="workspace-panel min-h-[540px] overflow-hidden">
    <div className="metric-strip grid-cols-3">
      <MetricCell label="친구" value={isLoading ? null : formatCount(friends.length)} />
      <MetricCell label="받은 요청" value={isLoading ? null : formatCount(incomingCount)} />
      <MetricCell
        label="공유 경기"
        value={
          isLoading
            ? null
            : formatCount(friends.reduce((total, friend) => total + friend.totalMatches, 0))
        }
      />
    </div>
    <div className="section-pad grid gap-5">
      <div className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <UsersRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">친구를 선택하세요</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              친구의 원본 경기 기록은 열람하지 않고, 승률과 강점 전장 같은 요약만 표시합니다.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
        </div>
      ) : strongestFriends.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {strongestFriends.map((friend, index) => (
            <NavLink
              key={friend.friendId}
              to={`/community/friends/${friend.friendId}`}
              className="rounded-lg border border-border/70 bg-card p-4 transition-colors hover:border-primary/35 hover:bg-secondary/50"
            >
              <p className="metric-label">승률 순위 {index + 1}</p>
              <h3 className="mt-2 truncate text-base font-bold">{friend.nickname}</h3>
              <p className="mt-4 text-2xl font-black text-primary">
                {formatPercent(friend.winRate)}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {formatCount(friend.totalMatches)}전 {formatCount(friend.wins)}승
              </p>
            </NavLink>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={UserPlus}
          title="요약할 친구 데이터가 없습니다."
          description="친구를 추가하면 이 화면에서 친구들의 공개 요약 통계를 빠르게 비교할 수 있습니다."
        />
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
        <p className="metric-label">친구 통계</p>
        <h2 className="mt-1 truncate text-2xl font-black">{friend.nickname}</h2>
      </div>
      <Button
        className="w-full bg-transparent lg:w-auto"
        size="sm"
        variant="outline"
        onClick={() => onRemoveFriend(friend)}
      >
        <UserMinus className="h-4 w-4" />
        친구 삭제
      </Button>
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
