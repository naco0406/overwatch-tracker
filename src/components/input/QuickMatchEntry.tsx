import { Minus, Plus, Save, Search } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getModeLabel,
  getOptionLabel,
  mapOptions,
  modeOptions,
  queueOptions,
  resultOptions,
} from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { Match, MatchCreateInput, MatchResult, ModeId } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';
import type { UserSettings } from '@/types/userSettings';

type ModeFilter = ModeId | 'all';
type ResultValue = MatchResult | '';

interface QuickMatchEntryProps {
  accounts?: PlayerAccount[];
  defaultSettings?: UserSettings;
  isSubmitting?: boolean;
  matches?: Match[];
  onSubmit: (input: MatchCreateInput) => Promise<void>;
}

const isValidScore = (value: string) => {
  if (!value.trim()) return false;

  const score = Number(value);

  return Number.isInteger(score) && score >= 0 && score <= 10;
};

const inferResult = (teamScore: string, enemyScore: string): ResultValue => {
  if (!isValidScore(teamScore) || !isValidScore(enemyScore)) return '';

  const team = Number(teamScore);
  const enemy = Number(enemyScore);

  if (team > enemy) return 'win';
  if (team < enemy) return 'loss';
  return 'draw';
};

const getResultTone = (result: MatchResult, selected: boolean) => {
  if (selected && result === 'loss') {
    return 'border-destructive bg-destructive text-destructive-foreground';
  }

  if (selected && result === 'draw') {
    return 'border-foreground bg-foreground text-background';
  }

  if (selected) {
    return 'border-primary bg-primary text-primary-foreground';
  }

  if (result === 'loss') {
    return 'border-border bg-card text-destructive hover:border-destructive/40 hover:bg-destructive/10';
  }

  if (result === 'draw') {
    return 'border-border bg-card text-muted-foreground hover:bg-secondary';
  }

  return 'border-border bg-card text-primary hover:border-primary/40 hover:bg-primary/10';
};

const getDefaultAccountId = (accounts: PlayerAccount[]) =>
  accounts.find((account) => account.isMain)?.id ?? accounts[0]?.id ?? '';

const QuickMatchEntry = ({
  accounts = [],
  defaultSettings,
  isSubmitting = false,
  matches = [],
  onSubmit,
}: QuickMatchEntryProps) => {
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [mapQuery, setMapQuery] = useState('');
  const [mapId, setMapId] = useState('');
  const [teamScore, setTeamScore] = useState('');
  const [enemyScore, setEnemyScore] = useState('');
  const [result, setResult] = useState<ResultValue>('');
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(() => getDefaultAccountId(accounts));
  const enemyScoreInputRef = useRef<HTMLInputElement>(null);
  const teamScoreInputRef = useRef<HTMLInputElement>(null);
  const defaultAccountId = getDefaultAccountId(accounts);
  const effectiveSelectedAccountId = accounts.some((account) => account.id === selectedAccountId)
    ? selectedAccountId
    : defaultAccountId;
  const selectedAccount =
    accounts.find((account) => account.id === effectiveSelectedAccountId) ?? null;
  const selectedMap = mapOptions.find((map) => map.value === mapId);
  const defaultQueueType = defaultSettings?.defaultQueueType ?? 'solo';

  const mapPickCounts = useMemo(() => {
    const all = new Map<string, number>();
    const byMode = new Map<ModeId, Map<string, number>>();

    matches.forEach((match) => {
      all.set(match.mapId, (all.get(match.mapId) ?? 0) + 1);

      const modeCounts = byMode.get(match.modeId) ?? new Map<string, number>();
      modeCounts.set(match.mapId, (modeCounts.get(match.mapId) ?? 0) + 1);
      byMode.set(match.modeId, modeCounts);
    });

    return {
      all,
      byMode,
    };
  }, [matches]);

  const visibleMaps = useMemo(() => {
    const normalizedQuery = mapQuery.trim().toLowerCase();
    const baseOrder = new Map(mapOptions.map((map, index) => [map.value, index]));
    const activeCounts =
      modeFilter === 'all' ? mapPickCounts.all : (mapPickCounts.byMode.get(modeFilter) ?? null);

    return mapOptions
      .filter((map) => {
        const modeMatches = modeFilter === 'all' || map.modeId === modeFilter;
        const queryMatches =
          normalizedQuery.length === 0 ||
          map.label.toLowerCase().includes(normalizedQuery) ||
          map.value.toLowerCase().includes(normalizedQuery) ||
          getModeLabel(map.modeId).toLowerCase().includes(normalizedQuery);

        return modeMatches && queryMatches;
      })
      .sort((left, right) => {
        const pickDelta =
          (activeCounts?.get(right.value) ?? 0) - (activeCounts?.get(left.value) ?? 0);

        if (pickDelta !== 0) {
          return pickDelta;
        }

        return (baseOrder.get(left.value) ?? 0) - (baseOrder.get(right.value) ?? 0);
      });
  }, [mapPickCounts, mapQuery, modeFilter]);

  const selectMap = (nextMapId: string) => {
    const nextMap = mapOptions.find((map) => map.value === nextMapId);

    if (!nextMap) return;

    setMapId(nextMap.value);
    setError('');
  };

  const updateScore = (side: 'team' | 'enemy', value: string) => {
    const nextValue = value.replace(/[^\d]/g, '').slice(0, 2);
    const nextTeamScore = side === 'team' ? nextValue : teamScore;
    const nextEnemyScore = side === 'enemy' ? nextValue : enemyScore;

    if (side === 'team') {
      setTeamScore(nextValue);
    } else {
      setEnemyScore(nextValue);
    }

    const inferred = inferResult(nextTeamScore, nextEnemyScore);
    if (inferred) {
      setResult(inferred);
    } else if (!isValidScore(nextTeamScore) || !isValidScore(nextEnemyScore)) {
      setResult('');
    }
    setError('');
  };

  const adjustScore = (side: 'team' | 'enemy', delta: number) => {
    const current = side === 'team' ? teamScore : enemyScore;
    const next = Math.max(0, Math.min(10, (Number(current) || 0) + delta));

    updateScore(side, String(next));
  };

  const submit = async () => {
    if (!selectedMap) {
      setError('맵을 선택하세요.');
      return;
    }

    if (!isValidScore(teamScore) || !isValidScore(enemyScore)) {
      setError('스코어는 0~10 사이로 입력하세요.');
      return;
    }

    if (!result) {
      setError('결과를 선택하세요.');
      return;
    }

    await onSubmit({
      account: selectedAccount?.isMain === false ? 'sub' : 'main',
      accountId: selectedAccount?.id ?? null,
      enemyScore: Number(enemyScore),
      mapId: selectedMap.value,
      memo: '',
      modeId: selectedMap.modeId,
      myHeroes: [],
      playedAt: new Date().toISOString(),
      queueType: defaultQueueType,
      result,
      source: 'manual',
      tags: [],
      teamScore: Number(teamScore),
    });

    setMapId('');
    setTeamScore('');
    setEnemyScore('');
    setResult('');
    setMapQuery('');
    setError('');
  };

  const handleScoreKeyDown = (event: KeyboardEvent<HTMLInputElement>, side: 'team' | 'enemy') => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
      return;
    }

    if (event.key === 'Tab' && side === 'team' && !event.shiftKey) {
      event.preventDefault();
      enemyScoreInputRef.current?.focus();
      enemyScoreInputRef.current?.select();
    }
  };

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="metric-label">빠른 기록</p>
          <h2 className="mt-1 truncate text-[17px] font-bold leading-tight tracking-normal sm:text-lg">
            새 경기
          </h2>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:items-end">
          {accounts.length > 0 ? (
            <div className="mobile-scroll flex max-w-full gap-1 overflow-x-auto pb-0.5">
              {accounts.map((account) => {
                const selected = account.id === effectiveSelectedAccountId;

                return (
                  <button
                    key={account.id}
                    type="button"
                    title={account.battleTag}
                    className={cn(
                      'flex h-9 max-w-36 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold transition-colors sm:h-8',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                    onClick={() => setSelectedAccountId(account.id)}
                  >
                    <span className="truncate">{getPlayerAccountLabel(account)}</span>
                    {account.isMain ? (
                      <span
                        className={cn(
                          'shrink-0 text-[10px] font-bold',
                          selected ? 'text-primary-foreground/75' : 'text-primary',
                        )}
                      >
                        본계
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <Badge variant="outline" className="w-fit bg-transparent">
              계정 미지정
            </Badge>
          )}
          <Badge variant="outline" className="w-fit bg-transparent">
            {getOptionLabel(queueOptions, defaultQueueType)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="grid gap-2 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="맵 검색"
                className="h-10 pl-9 text-sm font-semibold sm:h-9"
                placeholder="맵 검색"
                value={mapQuery}
                onChange={(event) => setMapQuery(event.target.value)}
              />
            </div>
            <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1">
              <ModeButton active={modeFilter === 'all'} onClick={() => setModeFilter('all')}>
                전체
              </ModeButton>
              {modeOptions.map((mode) => (
                <ModeButton
                  key={mode.value}
                  active={modeFilter === mode.value}
                  onClick={() => setModeFilter(mode.value)}
                >
                  {mode.label}
                </ModeButton>
              ))}
            </div>
          </div>

          <div className="mobile-scroll mt-2.5 h-[190px] overflow-x-auto pb-2 min-[390px]:h-[204px] sm:mt-3 sm:h-[228px] lg:h-[244px]">
            {visibleMaps.length > 0 ? (
              <div className="grid h-full auto-cols-[124px] grid-flow-col grid-rows-2 gap-2 min-[390px]:auto-cols-[136px] sm:auto-cols-[148px] lg:auto-cols-[164px]">
                {visibleMaps.map((map) => {
                  const selected = map.value === mapId;

                  return (
                    <button
                      key={map.value}
                      type="button"
                      className={cn(
                        'overflow-hidden rounded-md border bg-card text-left transition-[background-color,border-color,color] hover:border-primary/35 hover:bg-secondary',
                        selected && 'border-primary bg-primary/[0.06] text-primary',
                      )}
                      onClick={() => selectMap(map.value)}
                    >
                      <span className="block h-12 overflow-hidden bg-secondary min-[390px]:h-14 sm:h-16 lg:h-[72px]">
                        <img
                          alt={map.label}
                          className="h-full w-full object-cover"
                          src={getMapScreenshotPath(map.value)}
                          loading="lazy"
                        />
                      </span>
                      <span className="block min-w-0 px-2 py-1.5">
                        <span className="block truncate text-xs font-bold">{map.label}</span>
                        <span
                          className={cn(
                            'mt-0.5 block truncate text-[10px] font-semibold min-[390px]:text-[11px]',
                            selected ? 'text-primary/70' : 'text-muted-foreground',
                          )}
                        >
                          {getModeLabel(map.modeId)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border bg-[hsl(var(--surface-2))] px-4 text-center text-sm font-semibold text-muted-foreground">
                검색 결과 없음
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3 lg:rounded-none lg:border-y-0 lg:border-l lg:border-r-0 lg:bg-transparent lg:p-0 lg:pl-5">
          <div className="mb-3 flex min-h-10 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">맵</p>
              <p className="mt-1 truncate text-base font-bold">
                {selectedMap ? selectedMap.label : '선택'}
              </p>
            </div>
            {selectedMap ? (
              <Badge variant="outline" className="w-fit shrink-0 bg-transparent">
                {getModeLabel(selectedMap.modeId)}
              </Badge>
            ) : null}
          </div>

          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
              <ScoreField
                inputRef={teamScoreInputRef}
                label="우리"
                value={teamScore}
                onAdjust={(delta) => adjustScore('team', delta)}
                onChange={(value) => updateScore('team', value)}
                onKeyDown={(event) => handleScoreKeyDown(event, 'team')}
              />
              <div className="pt-9 text-lg font-bold text-muted-foreground">:</div>
              <ScoreField
                inputRef={enemyScoreInputRef}
                label="상대"
                value={enemyScore}
                onAdjust={(delta) => adjustScore('enemy', delta)}
                onChange={(value) => updateScore('enemy', value)}
                onKeyDown={(event) => handleScoreKeyDown(event, 'enemy')}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {resultOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'h-11 rounded-md border px-2 text-sm font-bold transition-colors',
                    getResultTone(option.value, result === option.value),
                  )}
                  onClick={() => {
                    setResult(option.value);
                    setError('');
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <Button className="h-11 w-full" type="button" disabled={isSubmitting} onClick={submit}>
              <Save className="h-4 w-4" />
              {isSubmitting ? '저장 중' : '저장'}
            </Button>
          </div>

          {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
};

interface ModeButtonProps {
  active: boolean;
  children: string;
  onClick: () => void;
}

const ModeButton = ({ active, children, onClick }: ModeButtonProps) => (
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

interface ScoreFieldProps {
  inputRef?: RefObject<HTMLInputElement>;
  label: string;
  onAdjust: (delta: number) => void;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  value: string;
}

const ScoreField = ({ inputRef, label, onAdjust, onChange, onKeyDown, value }: ScoreFieldProps) => (
  <div>
    <p className="mb-2 text-center text-xs font-bold text-muted-foreground">{label}</p>
    <div className="grid grid-cols-[34px_minmax(0,1fr)_34px] overflow-hidden rounded-md border border-input bg-card">
      <button
        type="button"
        className="flex h-11 items-center justify-center border-r border-border/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`${label} 점수 감소`}
        tabIndex={-1}
        onClick={() => onAdjust(-1)}
      >
        <Minus className="h-4 w-4" />
      </button>
      <Input
        ref={inputRef}
        className="h-11 rounded-none border-0 bg-card px-1 text-center text-lg font-bold focus-visible:ring-0"
        inputMode="numeric"
        max={10}
        min={0}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="flex h-11 items-center justify-center border-l border-border/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`${label} 점수 증가`}
        tabIndex={-1}
        onClick={() => onAdjust(1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  </div>
);

export { QuickMatchEntry };
