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
  getModeLabel,
  getOptionLabel,
  getResultLabel,
  mapOptions,
  modeOptions,
  queueOptions,
  resultOptions,
} from '@/data/matchOptions';
import { toast } from '@/hooks/use-toast';
import { useDeleteMatch, useMatches, useUpdateMatch } from '@/hooks/useMatches';
import { usePlayerAccounts } from '@/hooks/usePlayerAccounts';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatWinRate, summarizeResults } from '@/lib/matchStats';
import { cn } from '@/lib/utils';
import type { Match, MatchCreateInput, MatchResult, ModeId } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';

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

const getResultTone = (result: Match['result']) => {
  if (result === 'win') {
    return 'border-primary/25 bg-primary/10 text-primary';
  }

  if (result === 'loss') {
    return 'border-destructive/25 bg-destructive/10 text-destructive';
  }

  return 'border-border bg-secondary text-muted-foreground';
};

const RecordsPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeId | 'all'>('all');
  const [resultFilter, setResultFilter] = useState<MatchResult | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkResult, setBulkResult] = useState<MatchResult | 'keep'>('keep');
  const [bulkMapId, setBulkMapId] = useState('keep');
  const [bulkAccountId, setBulkAccountId] = useState('keep');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Match | null>(null);
  const { data: matches = [], isLoading } = useMatches();
  const { data: playerAccounts = [] } = usePlayerAccounts();
  const { data: userSettings } = useUserSettings();
  const updateMatchMutation = useUpdateMatch();
  const deleteMatchMutation = useDeleteMatch();

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
      const searchableText = [
        accountLabel,
        getMapLabel(match.mapId),
        getModeLabel(match.modeId),
        getOptionLabel(queueOptions, match.queueType),
        getResultLabel(match.result),
        `${match.teamScore}:${match.enemyScore}`,
      ]
        .join(' ')
        .toLowerCase();

      if (periodStart !== null && playedAtTime < periodStart) return false;
      if (modeFilter !== 'all' && match.modeId !== modeFilter) return false;
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
  }, [accountById, accountFilter, matches, modeFilter, periodFilter, resultFilter, searchQuery]);

  const selectedMatches = useMemo(
    () => matches.filter((match) => selectedIdSet.has(match.id)),
    [matches, selectedIdSet],
  );
  const summary = useMemo(() => summarizeResults(filteredMatches), [filteredMatches]);
  const visibleSelected =
    filteredMatches.length > 0 && filteredMatches.every((match) => selectedIdSet.has(match.id));
  const activeFilterCount = [
    searchQuery.trim().length > 0,
    periodFilter !== 'all',
    modeFilter !== 'all',
    resultFilter !== 'all',
    accountFilter !== 'all',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearchQuery('');
    setPeriodFilter('all');
    setModeFilter('all');
    setResultFilter('all');
    setAccountFilter('all');
  };

  const toggleSelected = (matchId: string) => {
    setSelectedIds((current) =>
      current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId],
    );
  };

  const toggleVisibleSelected = () => {
    if (visibleSelected) {
      const filteredIds = new Set(filteredMatches.map((match) => match.id));
      setSelectedIds((current) => current.filter((id) => !filteredIds.has(id)));
      return;
    }

    setSelectedIds((current) =>
      Array.from(new Set([...current, ...filteredMatches.map((match) => match.id)])),
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
    const hasUpdates = bulkResult !== 'keep' || Boolean(selectedMap) || bulkAccountId !== 'keep';

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
      <PageHeader eyebrow="데이터" title="기록" />

      <section className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start">
        <aside className="workspace-panel overflow-hidden">
          <div className="section-header">
            <p className="metric-label">요약</p>
            <h2 className="mt-1 text-lg font-bold">기록 상태</h2>
          </div>
          <div className="divide-y divide-border/70">
            <MetricCell label="표시 기록" value={filteredMatches.length.toLocaleString('ko-KR')} />
            <MetricCell label="승률" value={formatWinRate(summary.winRate)} />
            <MetricCell label="선택" value={selectedMatches.length.toLocaleString('ko-KR')} />
          </div>
        </aside>

        <div className="workspace-panel overflow-hidden">
          <div className="section-divider section-pad">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="맵, 모드, 결과 검색"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="bg-transparent"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                필터{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
              </Button>
              <Button
                type="button"
                disabled={selectedMatches.length === 0}
                onClick={() => setBulkActionsOpen(true)}
              >
                <CheckSquare className="h-4 w-4" />
                작업
              </Button>
            </div>

            {selectedMatches.length > 0 ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/[0.06] px-3 py-2">
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
          </div>

          <div className="section-pad">
            {isLoading ? (
              <RecordsSkeleton />
            ) : filteredMatches.length > 0 ? (
              <>
                <div className="subpanel hidden md:block">
                  <table className="w-full table-fixed border-collapse text-left text-sm">
                    <thead className="bg-[hsl(var(--surface-2))]">
                      <tr className="border-b border-border/70">
                        <th className="w-12 px-3 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border accent-primary"
                            checked={visibleSelected}
                            aria-label="표시 기록 전체 선택"
                            onChange={toggleVisibleSelected}
                          />
                        </th>
                        <th className="w-32 px-3 py-3 font-semibold text-muted-foreground">시간</th>
                        <th className="px-3 py-3 font-semibold text-muted-foreground">맵</th>
                        <th className="w-28 px-3 py-3 font-semibold text-muted-foreground">결과</th>
                        <th className="w-32 px-3 py-3 font-semibold text-muted-foreground">계정</th>
                        <th className="w-24 px-3 py-3 text-right font-semibold text-muted-foreground">
                          액션
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatches.map((match) => (
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

                <div className="space-y-3 md:hidden">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-3">
                    <span className="text-sm font-bold">표시 기록</span>
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
                  {filteredMatches.map((match) => (
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
              </>
            ) : (
              <div className="subpanel">
                <div className="flat-row p-3">
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
              </div>
            )}
          </div>
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
                    onClick={() => setPeriodFilter(period.value)}
                  >
                    {period.label}
                  </FilterButton>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                value={modeFilter}
                onValueChange={(value) => setModeFilter(value as ModeId | 'all')}
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
                value={resultFilter}
                onValueChange={(value) => setResultFilter(value as MatchResult | 'all')}
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

              <Select value={accountFilter} onValueChange={setAccountFilter}>
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
            bulkResult={bulkResult}
            disabled={selectedMatches.length === 0 || isBulkSaving}
            isSaving={isBulkSaving}
            selectedCount={selectedMatches.length}
            onApply={handleBulkUpdate}
            onBulkAccountChange={setBulkAccountId}
            onBulkDelete={() => setBulkDeleteOpen(true)}
            onBulkMapChange={setBulkMapId}
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
  label: string;
  value: string;
}

const MetricCell = ({ label, value }: MetricCellProps) => (
  <div className="px-4 py-3 sm:px-5">
    <div className="min-w-0">
      <p className="metric-label">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold">{value}</p>
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
  bulkResult: MatchResult | 'keep';
  disabled: boolean;
  isSaving: boolean;
  onApply: () => void;
  onBulkAccountChange: (value: string) => void;
  onBulkDelete: () => void;
  onBulkMapChange: (value: string) => void;
  onBulkResultChange: (value: string) => void;
  onClearSelection: () => void;
  selectedCount: number;
}

const BulkActionBar = ({
  accounts,
  bulkAccountId,
  bulkMapId,
  bulkResult,
  disabled,
  isSaving,
  onApply,
  onBulkAccountChange,
  onBulkDelete,
  onBulkMapChange,
  onBulkResultChange,
  onClearSelection,
  selectedCount,
}: BulkActionBarProps) => (
  <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] p-4 sm:p-5">
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

    <div className="grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)_220px_auto_auto]">
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

      <Button type="button" disabled={disabled} onClick={onApply}>
        <Save className="h-4 w-4" />
        {isSaving ? '저장 중' : '적용'}
      </Button>
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
    </div>
  </div>
);

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
  <tr className={cn('border-b border-border/70 last:border-b-0', selected && 'bg-primary/5')}>
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
      <span
        className={cn(
          'inline-flex h-8 min-w-16 items-center justify-center rounded-md border px-2 text-xs font-bold',
          getResultTone(match.result),
        )}
      >
        {getResultLabel(match.result)}
      </span>
      <p className="mt-2 text-sm font-bold">
        {match.teamScore}:{match.enemyScore}
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
  <article
    className={cn(
      'rounded-lg border border-border/70 bg-card p-3',
      selected && 'border-primary bg-primary/5',
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <label className="flex min-w-0 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-border accent-primary"
          checked={selected}
          onChange={onSelect}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{getMapLabel(match.mapId)}</span>
          <span className="mt-1 block text-xs font-semibold text-muted-foreground">
            {formatDate(match.playedAt)} · {formatTime(match.playedAt)}
          </span>
        </span>
      </label>
      <span
        className={cn(
          'inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-bold',
          getResultTone(match.result),
        )}
      >
        {match.teamScore}:{match.enemyScore}
      </span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-3">
      <InfoCell label="모드" value={getModeLabel(match.modeId)} />
      <InfoCell label="결과" value={getResultLabel(match.result)} />
      <InfoCell label="계정" value={getPlayerAccountLabel(account)} />
      <InfoCell label="큐" value={getOptionLabel(queueOptions, match.queueType)} />
    </div>

    <div className="mt-3 flex justify-end gap-1">
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
  </article>
);

interface InfoCellProps {
  label: string;
  value: string;
}

const InfoCell = ({ label, value }: InfoCellProps) => (
  <div className="min-w-0">
    <p className="metric-label">{label}</p>
    <p className="mt-1 truncate text-xs font-bold">{value}</p>
  </div>
);

const RecordsSkeleton = () => (
  <div className="subpanel">
    {Array.from({ length: 8 }, (_, index) => (
      <div
        key={index}
        className="flat-row grid gap-3 p-3 md:grid-cols-[32px_120px_minmax(0,1fr)_80px_120px_80px]"
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
