import {
  CheckSquare,
  Pencil,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { InlineEmptyState, SkeletonBlock } from '@/components/common/DataState';
import { PageHeader } from '@/components/common/PageHeader';
import { MatchDeleteDialog } from '@/components/input/MatchDeleteDialog';
import { MatchEntryDialog } from '@/components/input/MatchEntryDialog';
import { MatchRoleBadge, MatchRoleLabel } from '@/components/match/MatchRoleBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getMapLabel,
  getMatchRoleLabel,
  getModeLabel,
  getOptionLabel,
  getResultLabel,
  matchRoleOptions,
  mapOptions,
  modeOptions,
  queueOptions,
  resultOptions,
} from '@/data/matchOptions';
import { toast } from '@/hooks/use-toast';
import { useCompetitiveSeasons } from '@/hooks/useCompetitiveSeasons';
import { useDeleteMatch, useMatches, useUpdateMatch } from '@/hooks/useMatches';
import { usePlayerAccounts } from '@/hooks/usePlayerAccounts';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatWinRate, summarizeResults } from '@/lib/matchStats';
import { cn } from '@/lib/utils';
import {
  getCompetitiveSeasonLabel,
  getCurrentCompetitiveSeason,
  getSeasonFilterLabel,
  type SeasonFilterValue,
} from '@/types/competitiveSeason';
import type { Match, MatchCreateInput, MatchResult, MatchRole, ModeId } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const recordPageSize = 100;

const periodOptions = [
  { label: '전체', value: 'all' },
  { label: '7일', value: '7d' },
  { label: '30일', value: '30d' },
  { label: '90일', value: '90d' },
] as const;

type PeriodFilter = (typeof periodOptions)[number]['value'];

const periodDays = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} satisfies Record<Exclude<PeriodFilter, 'all'>, number>;

const getPeriodStart = (period: PeriodFilter) => {
  if (period === 'all') {
    return null;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - periodDays[period] + 1);

  return start.getTime();
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(new Date(value));

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const RecordsPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilterValue>('current');
  const [modeFilter, setModeFilter] = useState<ModeId | 'all'>('all');
  const [matchRoleFilter, setMatchRoleFilter] = useState<MatchRole | 'all'>('all');
  const [resultFilter, setResultFilter] = useState<MatchResult | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [recordPage, setRecordPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkResult, setBulkResult] = useState<MatchResult | 'keep'>('keep');
  const [bulkMapId, setBulkMapId] = useState('keep');
  const [bulkMatchRole, setBulkMatchRole] = useState<MatchRole | 'keep'>('keep');
  const [bulkAccountId, setBulkAccountId] = useState('keep');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Match | null>(null);
  const { data: matches = [], isLoading: isMatchesLoading } = useMatches();
  const { data: seasons = [], isLoading: isSeasonsLoading } = useCompetitiveSeasons();
  const { data: playerAccounts = [], isLoading: isAccountsLoading } = usePlayerAccounts();
  const { data: userSettings } = useUserSettings();
  const updateMatchMutation = useUpdateMatch();
  const deleteMatchMutation = useDeleteMatch();
  const currentSeason = useMemo(() => getCurrentCompetitiveSeason(seasons), [seasons]);
  const currentSeasonId = currentSeason?.id ?? null;
  const selectableSeasons = useMemo(
    () => seasons.filter((season) => season.id !== currentSeasonId),
    [currentSeasonId, seasons],
  );
  const isRecordsLoading = isMatchesLoading || isAccountsLoading || isSeasonsLoading;

  const accountById = useMemo(
    () => new Map(playerAccounts.map((account) => [account.id, account])),
    [playerAccounts],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredMatches = useMemo(() => {
    const periodStart = getPeriodStart(periodFilter);
    const query = searchQuery.trim().toLowerCase();

    return matches.filter((match) => {
      const playedAtTime = new Date(match.playedAt).getTime();
      const accountLabel = getPlayerAccountLabel(accountById.get(match.accountId ?? ''));
      const seasonLabel = getCompetitiveSeasonLabel(seasons, match.competitiveSeasonId);
      const searchableText = [
        accountLabel,
        seasonLabel,
        getMapLabel(match.mapId),
        getMatchRoleLabel(match.matchRole),
        getModeLabel(match.modeId),
        getOptionLabel(queueOptions, match.queueType),
        getResultLabel(match.result),
        `${match.teamScore}:${match.enemyScore}`,
      ]
        .join(' ')
        .toLowerCase();

      if (periodStart !== null && playedAtTime < periodStart) return false;
      if (seasonFilter === 'current') {
        if (!currentSeasonId || match.competitiveSeasonId !== currentSeasonId) {
          return false;
        }
      } else if (seasonFilter === 'unassigned') {
        if (match.competitiveSeasonId) {
          return false;
        }
      } else if (seasonFilter !== 'all' && match.competitiveSeasonId !== seasonFilter) {
        return false;
      }
      if (modeFilter !== 'all' && match.modeId !== modeFilter) return false;
      if (matchRoleFilter !== 'all' && match.matchRole !== matchRoleFilter) return false;
      if (resultFilter !== 'all' && match.result !== resultFilter) return false;
      if (accountFilter === 'unassigned' && match.accountId) return false;
      if (
        accountFilter !== 'all' &&
        accountFilter !== 'unassigned' &&
        match.accountId !== accountFilter
      ) {
        return false;
      }
      if (query && !searchableText.includes(query)) return false;

      return true;
    });
  }, [
    accountById,
    accountFilter,
    currentSeasonId,
    matches,
    matchRoleFilter,
    modeFilter,
    periodFilter,
    resultFilter,
    searchQuery,
    seasonFilter,
    seasons,
  ]);

  const selectedMatches = useMemo(
    () => matches.filter((match) => selectedIdSet.has(match.id)),
    [matches, selectedIdSet],
  );
  const recordPageCount = Math.max(1, Math.ceil(filteredMatches.length / recordPageSize));
  const currentRecordPage = Math.min(recordPage, recordPageCount);
  const visibleMatches = filteredMatches.slice(
    (currentRecordPage - 1) * recordPageSize,
    currentRecordPage * recordPageSize,
  );
  const summary = useMemo(() => summarizeResults(filteredMatches), [filteredMatches]);
  const visibleSelected =
    visibleMatches.length > 0 && visibleMatches.every((match) => selectedIdSet.has(match.id));
  const activeFilterCount = [
    searchQuery.trim().length > 0,
    periodFilter !== 'all',
    seasonFilter !== 'current',
    modeFilter !== 'all',
    matchRoleFilter !== 'all',
    resultFilter !== 'all',
    accountFilter !== 'all',
  ].filter(Boolean).length;
  const hasBulkUpdates =
    bulkResult !== 'keep' ||
    bulkMapId !== 'keep' ||
    bulkMatchRole !== 'keep' ||
    bulkAccountId !== 'keep';
  const activeFilterLabels = [
    periodFilter !== 'all'
      ? periodOptions.find((period) => period.value === periodFilter)?.label
      : null,
    seasonFilter !== 'current'
      ? getSeasonFilterLabel(seasons, seasonFilter, currentSeasonId)
      : null,
    modeFilter !== 'all' ? getModeLabel(modeFilter) : null,
    matchRoleFilter !== 'all' ? getMatchRoleLabel(matchRoleFilter) : null,
    resultFilter !== 'all' ? getResultLabel(resultFilter) : null,
    accountFilter === 'unassigned'
      ? '미지정 계정'
      : accountFilter !== 'all'
        ? getPlayerAccountLabel(accountById.get(accountFilter))
        : null,
    searchQuery.trim() ? `"${searchQuery.trim()}"` : null,
  ].filter((label): label is string => Boolean(label));

  const resetFilters = () => {
    setSearchQuery('');
    setPeriodFilter('all');
    setSeasonFilter('current');
    setModeFilter('all');
    setMatchRoleFilter('all');
    setResultFilter('all');
    setAccountFilter('all');
    setRecordPage(1);
  };

  const toggleSelected = (matchId: string) => {
    setSelectedIds((current) =>
      current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId],
    );
  };

  const toggleVisibleSelected = () => {
    if (visibleSelected) {
      const visibleIds = new Set(visibleMatches.map((match) => match.id));
      setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
      return;
    }

    setSelectedIds((current) =>
      Array.from(new Set([...current, ...visibleMatches.map((match) => match.id)])),
    );
  };

  const handleUpdateMatch = async (input: MatchCreateInput) => {
    if (!editingMatch) {
      return;
    }

    try {
      await updateMatchMutation.mutateAsync({
        ...input,
        id: editingMatch.id,
      });
      toast({
        description: '저장된 경기 정보를 갱신했습니다.',
        title: '경기 수정 완료',
      });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '경기 수정 실패',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteMatch = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteMatchMutation.mutateAsync(deleteTarget.id);
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
      toast({
        description: '기록과 통계에서 해당 경기를 제거했습니다.',
        title: '경기 삭제 완료',
      });
      setDeleteTarget(null);
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '경기 삭제 실패',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedMatches.length === 0) {
      return;
    }

    const selectedMap =
      bulkMapId === 'keep' ? null : mapOptions.find((map) => map.value === bulkMapId);
    const selectedAccount =
      bulkAccountId === 'keep' || bulkAccountId === 'unassigned'
        ? null
        : playerAccounts.find((account) => account.id === bulkAccountId);
    const hasUpdates =
      bulkResult !== 'keep' ||
      Boolean(selectedMap) ||
      bulkMatchRole !== 'keep' ||
      bulkAccountId !== 'keep';

    if (!hasUpdates) {
      toast({
        description: '변경할 값을 선택하세요.',
        title: '벌크 수정 대기',
      });
      return;
    }

    setIsBulkSaving(true);
    try {
      for (const match of selectedMatches) {
        await updateMatchMutation.mutateAsync({
          id: match.id,
          ...(bulkResult !== 'keep' ? { result: bulkResult } : {}),
          ...(selectedMap ? { mapId: selectedMap.value, modeId: selectedMap.modeId } : {}),
          ...(bulkMatchRole !== 'keep' ? { matchRole: bulkMatchRole } : {}),
          ...(bulkAccountId !== 'keep'
            ? {
                account: selectedAccount?.isMain === false ? 'sub' : 'main',
                accountId: selectedAccount?.id ?? null,
              }
            : {}),
        });
      }

      setBulkResult('keep');
      setBulkMapId('keep');
      setBulkMatchRole('keep');
      setBulkAccountId('keep');
      setBulkActionsOpen(false);
      toast({
        description: `${selectedMatches.length.toLocaleString('ko-KR')}개 기록을 수정했습니다.`,
        title: '벌크 수정 완료',
      });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '벌크 수정 실패',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedMatches.length === 0) {
      return;
    }

    try {
      for (const match of selectedMatches) {
        await deleteMatchMutation.mutateAsync(match.id);
      }

      setSelectedIds([]);
      setBulkDeleteOpen(false);
      setBulkActionsOpen(false);
      toast({
        description: `${selectedMatches.length.toLocaleString('ko-KR')}개 기록을 삭제했습니다.`,
        title: '벌크 삭제 완료',
      });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        title: '벌크 삭제 실패',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="데이터"
        title="기록"
        actions={
          <Badge variant="secondary">
            {isRecordsLoading ? '불러오는 중' : `${matches.length.toLocaleString('ko-KR')} 경기`}
          </Badge>
        }
      />

      <section className="border-t border-border/70">
        <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] px-3 py-3 sm:px-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-center">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(220px,1fr)_minmax(230px,260px)_auto_auto]">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 bg-card pl-9"
                  placeholder="맵, 모드, 결과 검색"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setRecordPage(1);
                  }}
                />
              </div>
              <Select
                value={seasonFilter}
                onValueChange={(value) => {
                  setSeasonFilter(value);
                  setRecordPage(1);
                }}
              >
                <SelectTrigger className="col-span-2 h-10 bg-card text-left sm:col-span-1">
                  <SelectValue placeholder="시즌" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">
                    {getSeasonFilterLabel(seasons, 'current', currentSeasonId)}
                  </SelectItem>
                  <SelectItem value="all">전체 시즌</SelectItem>
                  <SelectItem value="unassigned">시즌 미지정</SelectItem>
                  {selectableSeasons.map((season) => (
                    <SelectItem key={season.id} value={season.id}>
                      {season.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="bg-card"
                disabled={isRecordsLoading}
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                필터{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
              </Button>
              <Button
                type="button"
                disabled={isRecordsLoading || selectedMatches.length === 0}
                onClick={() => setBulkActionsOpen(true)}
              >
                <CheckSquare className="h-4 w-4" />
                작업
              </Button>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border/70 border-y border-border/70 bg-background xl:border-y-0 xl:bg-transparent">
              <MetricCell
                isLoading={isRecordsLoading}
                label="표시"
                value={filteredMatches.length.toLocaleString('ko-KR')}
              />
              <MetricCell
                isLoading={isRecordsLoading}
                label="승률"
                value={formatWinRate(summary.winRate)}
              />
              <MetricCell
                isLoading={isRecordsLoading}
                label="선택"
                value={selectedMatches.length.toLocaleString('ko-KR')}
              />
            </div>
          </div>

          {selectedMatches.length > 0 ? (
            <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-l-primary bg-primary/[0.06] px-3 py-2">
              <p className="text-sm font-bold">
                {selectedMatches.length.toLocaleString('ko-KR')}개 선택
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-card"
                onClick={() => setSelectedIds([])}
              >
                해제
              </Button>
            </div>
          ) : null}

          {activeFilterLabels.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground">
                {activeFilterLabels.map((label, index) => (
                  <span key={`${label}-${index}`} className="min-w-0 truncate">
                    {label}
                  </span>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-fit px-2"
                onClick={resetFilters}
              >
                <RotateCcw className="h-4 w-4" />
                초기화
              </Button>
            </div>
          ) : null}
        </div>

        <div className="px-0 py-0">
          {isRecordsLoading ? (
            <RecordsSkeleton />
          ) : filteredMatches.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[hsl(var(--surface-2))]">
                    <tr className="border-b border-border/70">
                      <th className="w-12 px-3 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                          checked={visibleSelected}
                          aria-label="불러온 기록 전체 선택"
                          onChange={toggleVisibleSelected}
                        />
                      </th>
                      <th className="w-32 px-3 py-3 font-semibold text-muted-foreground">시간</th>
                      <th className="px-3 py-3 font-semibold text-muted-foreground">맵</th>
                      <th className="w-24 px-3 py-3 font-semibold text-muted-foreground">포지션</th>
                      <th className="w-28 px-3 py-3 font-semibold text-muted-foreground">스코어</th>
                      <th className="w-32 px-3 py-3 font-semibold text-muted-foreground">계정</th>
                      <th className="w-24 px-3 py-3 text-right font-semibold text-muted-foreground">
                        액션
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMatches.map((match) => (
                      <RecordTableRow
                        key={match.id}
                        account={accountById.get(match.accountId ?? '')}
                        match={match}
                        selected={selectedIdSet.has(match.id)}
                        onDelete={() => setDeleteTarget(match)}
                        onEdit={() => setEditingMatch(match)}
                        onSelect={() => toggleSelected(match.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-border/70 md:hidden">
                <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
                  <span className="text-sm font-bold">
                    {visibleMatches.length.toLocaleString('ko-KR')}개 표시
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                    onClick={toggleVisibleSelected}
                  >
                    <CheckSquare className="h-4 w-4" />
                    {visibleSelected ? '해제' : '전체 선택'}
                  </Button>
                </div>
                {visibleMatches.map((match) => (
                  <RecordCard
                    key={match.id}
                    account={accountById.get(match.accountId ?? '')}
                    match={match}
                    selected={selectedIdSet.has(match.id)}
                    onDelete={() => setDeleteTarget(match)}
                    onEdit={() => setEditingMatch(match)}
                    onSelect={() => toggleSelected(match.id)}
                  />
                ))}
              </div>

              <PaginationBar
                itemLabel="기록"
                page={currentRecordPage}
                pageCount={recordPageCount}
                pageSize={recordPageSize}
                totalCount={filteredMatches.length}
                visibleCount={visibleMatches.length}
                onPageChange={setRecordPage}
              />
            </>
          ) : (
            <div className="px-3 py-6 sm:px-5">
              <InlineEmptyState
                title="기록 없음"
                description="필터 결과가 비어 있습니다."
                action={
                  activeFilterCount > 0 ? (
                    <Button variant="outline" className="bg-transparent" onClick={resetFilters}>
                      <RotateCcw className="h-4 w-4" />
                      초기화
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}
        </div>
      </section>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-2xl flex-col gap-0 p-0 sm:h-[460px] sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/70 px-4 py-4 pr-12 sm:px-5">
            <DialogTitle>필터</DialogTitle>
            <DialogDescription>필요한 조건만 켜서 기록을 좁힙니다.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
            <div>
              <p className="metric-label mb-2">기간</p>
              <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1">
                {periodOptions.map((period) => (
                  <FilterButton
                    key={period.value}
                    active={periodFilter === period.value}
                    onClick={() => {
                      setPeriodFilter(period.value);
                      setRecordPage(1);
                    }}
                  >
                    {period.label}
                  </FilterButton>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                value={seasonFilter}
                onValueChange={(value) => {
                  setSeasonFilter(value);
                  setRecordPage(1);
                }}
              >
                <SelectTrigger className="h-11 bg-card">
                  <SelectValue placeholder="시즌" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">
                    {getSeasonFilterLabel(seasons, 'current', currentSeasonId)}
                  </SelectItem>
                  <SelectItem value="all">전체 시즌</SelectItem>
                  <SelectItem value="unassigned">시즌 미지정</SelectItem>
                  {selectableSeasons.map((season) => (
                    <SelectItem key={season.id} value={season.id}>
                      {season.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={modeFilter}
                onValueChange={(value) => {
                  setModeFilter(value as ModeId | 'all');
                  setRecordPage(1);
                }}
              >
                <SelectTrigger className="h-11 bg-card">
                  <SelectValue placeholder="모드" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 모드</SelectItem>
                  {modeOptions.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={matchRoleFilter}
                onValueChange={(value) => {
                  setMatchRoleFilter(value as MatchRole | 'all');
                  setRecordPage(1);
                }}
              >
                <SelectTrigger className="h-11 bg-card">
                  <SelectValue placeholder="포지션" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 포지션</SelectItem>
                  {matchRoleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value} textValue={role.label}>
                      <MatchRoleLabel role={role.value} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={resultFilter}
                onValueChange={(value) => {
                  setResultFilter(value as MatchResult | 'all');
                  setRecordPage(1);
                }}
              >
                <SelectTrigger className="h-11 bg-card">
                  <SelectValue placeholder="결과" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 결과</SelectItem>
                  {resultOptions.map((result) => (
                    <SelectItem key={result.value} value={result.value}>
                      {result.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={accountFilter}
                onValueChange={(value) => {
                  setAccountFilter(value);
                  setRecordPage(1);
                }}
              >
                <SelectTrigger className="h-11 bg-card">
                  <SelectValue placeholder="계정" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 계정</SelectItem>
                  <SelectItem value="unassigned">미지정</SelectItem>
                  {playerAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {getPlayerAccountLabel(account)}
                      {account.isMain ? ' · 본계' : ''}
                      {!account.isActive ? ' · 비활성' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="border-t border-border/70 px-4 py-4 sm:px-5">
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              disabled={activeFilterCount === 0}
              onClick={resetFilters}
            >
              <RotateCcw className="h-4 w-4" />
              초기화
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkActionsOpen} onOpenChange={setBulkActionsOpen}>
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 p-0 sm:h-[430px] sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/70 px-4 py-4 pr-12 sm:px-5">
            <DialogTitle>선택 작업</DialogTitle>
            <DialogDescription>
              {selectedMatches.length.toLocaleString('ko-KR')}개 기록을 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <BulkActionBar
            accounts={playerAccounts}
            bulkAccountId={bulkAccountId}
            bulkMapId={bulkMapId}
            bulkMatchRole={bulkMatchRole}
            bulkResult={bulkResult}
            disabled={selectedMatches.length === 0 || isBulkSaving}
            hasUpdates={hasBulkUpdates}
            isSaving={isBulkSaving}
            selectedCount={selectedMatches.length}
            onApply={handleBulkUpdate}
            onBulkAccountChange={setBulkAccountId}
            onBulkDelete={() => setBulkDeleteOpen(true)}
            onBulkMapChange={setBulkMapId}
            onBulkMatchRoleChange={(value) => setBulkMatchRole(value as MatchRole | 'keep')}
            onBulkResultChange={(value) => setBulkResult(value as MatchResult | 'keep')}
            onClearSelection={() => setSelectedIds([])}
          />
        </DialogContent>
      </Dialog>

      <MatchEntryDialog
        accounts={playerAccounts}
        defaultSettings={userSettings}
        isSubmitting={updateMatchMutation.isPending}
        match={editingMatch}
        open={Boolean(editingMatch)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMatch(null);
          }
        }}
        onSaved={() => setEditingMatch(null)}
        onSubmit={handleUpdateMatch}
      />

      <MatchDeleteDialog
        isDeleting={deleteMatchMutation.isPending}
        match={deleteTarget}
        open={Boolean(deleteTarget)}
        onConfirm={handleDeleteMatch}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader className="border-b border-border/70 px-4 py-4 pr-12 sm:px-5">
            <DialogTitle>선택 기록 삭제</DialogTitle>
            <DialogDescription>
              {selectedMatches.length.toLocaleString('ko-KR')}개 기록을 삭제합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-border/70 px-4 py-4 sm:px-5">
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              onClick={() => setBulkDeleteOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMatchMutation.isPending}
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-4 w-4" />
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface MetricCellProps {
  isLoading?: boolean;
  label: string;
  value: string;
}

const MetricCell = ({ isLoading = false, label, value }: MetricCellProps) => (
  <div className="min-w-0 px-3 py-2">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      {isLoading ? (
        <SkeletonBlock className="mt-2 h-4 w-12" />
      ) : (
        <p className="mt-1 truncate text-sm font-bold sm:text-base">{value}</p>
      )}
    </div>
  </div>
);

interface FilterButtonProps {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}

const FilterButton = ({ active, children, onClick }: FilterButtonProps) => (
  <button
    type="button"
    className={cn(
      'h-9 shrink-0 rounded-md border px-3 text-xs font-bold transition-[background-color,border-color,color]',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
    )}
    onClick={onClick}
  >
    {children}
  </button>
);

interface BulkActionBarProps {
  accounts: PlayerAccount[];
  bulkAccountId: string;
  bulkMapId: string;
  bulkMatchRole: MatchRole | 'keep';
  bulkResult: MatchResult | 'keep';
  disabled: boolean;
  hasUpdates: boolean;
  isSaving: boolean;
  onApply: () => void;
  onBulkAccountChange: (value: string) => void;
  onBulkDelete: () => void;
  onBulkMapChange: (value: string) => void;
  onBulkMatchRoleChange: (value: string) => void;
  onBulkResultChange: (value: string) => void;
  onClearSelection: () => void;
  selectedCount: number;
}

const BulkActionBar = ({
  accounts,
  bulkAccountId,
  bulkMapId,
  bulkMatchRole,
  bulkResult,
  disabled,
  hasUpdates,
  isSaving,
  onApply,
  onBulkAccountChange,
  onBulkDelete,
  onBulkMapChange,
  onBulkMatchRoleChange,
  onBulkResultChange,
  onClearSelection,
  selectedCount,
}: BulkActionBarProps) => {
  const selectedMap =
    bulkMapId === 'keep' ? null : mapOptions.find((map) => map.value === bulkMapId);
  const selectedAccount =
    bulkAccountId === 'keep' || bulkAccountId === 'unassigned'
      ? null
      : accounts.find((account) => account.id === bulkAccountId);
  const summaryItems = [
    {
      changed: bulkResult !== 'keep',
      label: '결과',
      value: bulkResult === 'keep' ? '유지' : getResultLabel(bulkResult),
    },
    {
      changed: bulkMapId !== 'keep',
      label: '맵',
      value: selectedMap ? `${selectedMap.label} · ${getModeLabel(selectedMap.modeId)}` : '유지',
    },
    {
      changed: bulkMatchRole !== 'keep',
      label: '포지션',
      value: bulkMatchRole === 'keep' ? '유지' : getMatchRoleLabel(bulkMatchRole),
    },
    {
      changed: bulkAccountId !== 'keep',
      label: '계정',
      value:
        bulkAccountId === 'unassigned'
          ? '미지정'
          : selectedAccount
            ? getPlayerAccountLabel(selectedAccount)
            : '유지',
    },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--surface-2))] p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="metric-label">선택 수정</p>
          <p className="mt-1 text-sm font-bold">{selectedCount.toLocaleString('ko-KR')}개 선택</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit bg-transparent"
          disabled={selectedCount === 0}
          onClick={onClearSelection}
        >
          해제
        </Button>
      </div>

      <div className="mb-4 border-y border-border/70 bg-card py-3">
        <p className="px-3 metric-label">적용 예정</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className={cn(
                'min-w-0 border-y px-3 py-2 sm:border-y-0 sm:border-l',
                item.changed
                  ? 'border-primary/25 bg-primary/[0.06]'
                  : 'border-border/70 bg-[hsl(var(--surface-2))]',
              )}
            >
              <p className="metric-label">{item.label}</p>
              <p
                className={cn(
                  'mt-1 truncate text-sm font-bold',
                  item.changed ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_180px_220px]">
        <div>
          <p className="metric-label mb-2">결과</p>
          <Select value={bulkResult} onValueChange={onBulkResultChange}>
            <SelectTrigger className="h-10 bg-card">
              <SelectValue placeholder="결과" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">결과 유지</SelectItem>
              {resultOptions.map((result) => (
                <SelectItem key={result.value} value={result.value}>
                  {result.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="metric-label mb-2">맵</p>
          <Select value={bulkMapId} onValueChange={onBulkMapChange}>
            <SelectTrigger className="h-10 bg-card">
              <SelectValue placeholder="맵" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">맵 유지</SelectItem>
              {mapOptions.map((map) => (
                <SelectItem key={map.value} value={map.value}>
                  {map.label} · {getModeLabel(map.modeId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="metric-label mb-2">포지션</p>
          <Select value={bulkMatchRole} onValueChange={onBulkMatchRoleChange}>
            <SelectTrigger className="h-10 bg-card">
              <SelectValue placeholder="포지션" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">포지션 유지</SelectItem>
              {matchRoleOptions.map((role) => (
                <SelectItem key={role.value} value={role.value} textValue={role.label}>
                  <MatchRoleLabel role={role.value} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="metric-label mb-2">계정</p>
          <Select value={bulkAccountId} onValueChange={onBulkAccountChange}>
            <SelectTrigger className="h-10 bg-card">
              <SelectValue placeholder="계정" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">계정 유지</SelectItem>
              <SelectItem value="unassigned">미지정</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {getPlayerAccountLabel(account)}
                  {account.isMain ? ' · 본계' : ''}
                  {!account.isActive ? ' · 비활성' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="bg-transparent text-destructive hover:text-destructive"
          disabled={selectedCount === 0}
          onClick={onBulkDelete}
        >
          <Trash2 className="h-4 w-4" />
          삭제
        </Button>
        <Button type="button" disabled={disabled || !hasUpdates} onClick={onApply}>
          <Save className="h-4 w-4" />
          {isSaving ? '저장 중' : hasUpdates ? '변경 적용' : '변경값 선택'}
        </Button>
      </div>
    </div>
  );
};

interface RecordRowProps {
  account?: PlayerAccount;
  match: Match;
  onDelete: () => void;
  onEdit: () => void;
  onSelect: () => void;
  selected: boolean;
}

const RecordTableRow = ({
  account,
  match,
  onDelete,
  onEdit,
  onSelect,
  selected,
}: RecordRowProps) => (
  <tr
    className={cn(
      'border-b border-border/70 transition-colors last:border-b-0 hover:bg-[hsl(var(--surface-2))]',
      selected && 'bg-primary/[0.05]',
    )}
  >
    <td className="px-3 py-3 align-middle">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-border accent-primary"
        checked={selected}
        aria-label={`${getMapLabel(match.mapId)} 기록 선택`}
        onChange={onSelect}
      />
    </td>
    <td className="px-3 py-3 align-middle">
      <p className="font-bold">{formatDate(match.playedAt)}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        {formatTime(match.playedAt)}
      </p>
    </td>
    <td className="min-w-0 px-3 py-3 align-middle">
      <p className="truncate font-bold">{getMapLabel(match.mapId)}</p>
      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
        {getModeLabel(match.modeId)}
      </p>
    </td>
    <td className="px-3 py-3 align-middle">
      <MatchRoleBadge role={match.matchRole} />
    </td>
    <td className="px-3 py-3 align-middle">
      <p className="text-sm font-bold">
        {match.teamScore}:{match.enemyScore}
      </p>
      <p
        className={cn(
          'mt-1 text-xs font-bold',
          match.result === 'win' && 'text-primary',
          match.result === 'loss' && 'text-destructive',
          match.result === 'draw' && 'text-muted-foreground',
        )}
      >
        {getResultLabel(match.result)}
      </p>
    </td>
    <td className="px-3 py-3 align-middle">
      <p className="truncate text-sm font-semibold">{getPlayerAccountLabel(account)}</p>
      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
        {getOptionLabel(queueOptions, match.queueType)}
      </p>
    </td>
    <td className="px-3 py-3 align-middle">
      <div className="flex justify-end gap-1">
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </td>
  </tr>
);

const RecordCard = ({ account, match, onDelete, onEdit, onSelect, selected }: RecordRowProps) => (
  <div className={cn('border-b border-border/70 px-3 py-2.5', selected && 'bg-primary/5')}>
    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3">
      <label className="pt-1">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary"
          checked={selected}
          aria-label={`${getMapLabel(match.mapId)} 기록 선택`}
          onChange={onSelect}
        />
      </label>

      <div className="min-w-0">
        <p className="truncate text-sm font-bold">
          {getMapLabel(match.mapId)} · {getModeLabel(match.modeId)}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <span className="truncate">
            {formatDate(match.playedAt)} · {formatTime(match.playedAt)} ·{' '}
            {getPlayerAccountLabel(account)}
          </span>
          <span className="shrink-0">·</span>
          <MatchRoleLabel className="shrink-0" role={match.matchRole} />
        </p>
      </div>

      <span className="shrink-0 text-sm font-bold">
        {match.teamScore}:{match.enemyScore}
      </span>
    </div>

    <div className="mt-2 flex items-center justify-between gap-2 pl-9">
      <p className="truncate text-xs font-semibold text-muted-foreground">
        <span
          className={cn(
            match.result === 'win' && 'text-primary',
            match.result === 'loss' && 'text-destructive',
          )}
        >
          {getResultLabel(match.result)}
        </span>{' '}
        · {getOptionLabel(queueOptions, match.queueType)} ·{' '}
        <MatchRoleLabel role={match.matchRole} />
      </p>
      <div className="flex shrink-0 justify-end gap-1">
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
);

interface PaginationBarProps {
  itemLabel: string;
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  visibleCount: number;
}

const PaginationBar = ({
  itemLabel,
  onPageChange,
  page,
  pageCount,
  pageSize,
  totalCount,
  visibleCount,
}: PaginationBarProps) => {
  if (totalCount === 0) {
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = start + visibleCount - 1;

  return (
    <div className="flex flex-col gap-2 border-t border-border/70 bg-[hsl(var(--surface-2))] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-semibold text-muted-foreground">
        {start.toLocaleString('ko-KR')}-{end.toLocaleString('ko-KR')} /{' '}
        {totalCount.toLocaleString('ko-KR')} {itemLabel}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-transparent"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          이전
        </Button>
        <span className="px-2 text-center text-xs font-bold text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-transparent"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          다음
        </Button>
      </div>
    </div>
  );
};

const RecordsSkeleton = () => (
  <div className="divide-y divide-border/70">
    {Array.from({ length: 8 }, (_, index) => (
      <div
        key={index}
        className="grid gap-3 px-3 py-3 md:grid-cols-[32px_120px_minmax(0,1fr)_80px_120px_80px]"
      >
        <SkeletonBlock className="h-4 w-4" />
        <div>
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="mt-2 h-3 w-14" />
        </div>
        <div>
          <SkeletonBlock className="h-4 w-40 max-w-full" />
          <SkeletonBlock className="mt-2 h-3 w-24" />
        </div>
        <SkeletonBlock className="h-8 w-16" />
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-9 w-20" />
      </div>
    ))}
  </div>
);

export { RecordsPage };
