import { ChevronDown, Minus, Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  getModeLabel,
  getOptionLabel,
  getResultOptionsForMode,
  mapOptions,
  modeOptions,
  queueOptions,
  resultOptions,
} from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { MatchCreateInput, MatchResult, ModeId } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';
import type { UserSettings } from '@/types/userSettings';

type ModeFilter = ModeId | 'all';
type ResultValue = MatchResult | '';

interface QuickMatchEntryProps {
  accounts?: PlayerAccount[];
  defaultSettings?: UserSettings;
  isSubmitting?: boolean;
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

const QuickMatchEntry = ({
  accounts = [],
  defaultSettings,
  isSubmitting = false,
  onSubmit,
}: QuickMatchEntryProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [mapQuery, setMapQuery] = useState('');
  const [mapId, setMapId] = useState('');
  const [teamScore, setTeamScore] = useState('');
  const [enemyScore, setEnemyScore] = useState('');
  const [result, setResult] = useState<ResultValue>('');
  const [error, setError] = useState('');
  const mainAccount = accounts.find((account) => account.isMain);
  const defaultAccount = mainAccount ?? accounts[0];
  const selectedMap = mapOptions.find((map) => map.value === mapId);
  const defaultQueueType = defaultSettings?.defaultQueueType ?? 'solo';
  const availableResultOptions = selectedMap
    ? getResultOptionsForMode(selectedMap.modeId)
    : resultOptions;
  const filteredMaps = useMemo(() => {
    const query = mapQuery.trim().toLowerCase();

    return mapOptions.filter((map) => {
      const modeMatches = modeFilter === 'all' || map.modeId === modeFilter;
      const queryMatches =
        query.length === 0 ||
        map.label.toLowerCase().includes(query) ||
        map.value.toLowerCase().includes(query) ||
        getModeLabel(map.modeId).toLowerCase().includes(query);

      return modeMatches && queryMatches;
    });
  }, [mapQuery, modeFilter]);

  const selectMap = (nextMapId: string) => {
    const nextMap = mapOptions.find((map) => map.value === nextMapId);

    if (!nextMap) return;

    const nextResultOptions = getResultOptionsForMode(nextMap.modeId);

    setMapId(nextMap.value);
    setModeFilter(nextMap.modeId);
    if (result && !nextResultOptions.some((option) => option.value === result)) {
      setResult('');
    }
    setError('');
    setPickerOpen(false);
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
      setResult(availableResultOptions.some((option) => option.value === inferred) ? inferred : '');
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
      account: defaultAccount?.isMain === false ? 'sub' : 'main',
      accountId: defaultAccount?.id ?? null,
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
    setError('');
  };

  return (
    <>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="metric-label">빠른 기록</p>
            <h2 className="mt-2 text-2xl font-bold tracking-normal">새 경기</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="w-fit bg-transparent">
              {defaultAccount ? getPlayerAccountLabel(defaultAccount) : '계정 미지정'}
            </Badge>
            <Badge variant="outline" className="w-fit bg-transparent">
              {getOptionLabel(queueOptions, defaultQueueType)}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
          <button
            type="button"
            className={cn(
              'grid w-full overflow-hidden rounded-md border text-left transition-[background-color,border-color,color] sm:grid-cols-[148px_minmax(0,1fr)_auto]',
              selectedMap
                ? 'border-primary/30 bg-primary/[0.06]'
                : 'border-input bg-[hsl(var(--surface-2))] hover:border-primary/35',
            )}
            onClick={() => setPickerOpen(true)}
          >
            <div className="hidden aspect-video h-full min-h-20 overflow-hidden bg-secondary sm:block">
              {selectedMap ? (
                <img
                  alt={selectedMap.label}
                  className="h-full w-full object-cover"
                  src={getMapScreenshotPath(selectedMap.value)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs font-bold text-muted-foreground">
                  MAP
                </div>
              )}
            </div>
            <span className="min-w-0 self-center px-4 py-3">
              <span className="block text-xs font-semibold text-muted-foreground">맵</span>
              <span className="mt-1 block truncate text-lg font-bold">
                {selectedMap ? selectedMap.label : '선택'}
              </span>
              {selectedMap ? (
                <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                  {getModeLabel(selectedMap.modeId)}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2 self-center px-4 py-3 text-sm font-semibold text-muted-foreground">
              목록
              <ChevronDown className="h-4 w-4" />
            </span>
          </button>

          <div className="mt-4 grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)_140px] lg:items-end">
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
              <ScoreField
                label="우리"
                value={teamScore}
                onAdjust={(delta) => adjustScore('team', delta)}
                onChange={(value) => updateScore('team', value)}
              />
              <div className="pt-9 text-lg font-bold text-muted-foreground">:</div>
              <ScoreField
                label="상대"
                value={enemyScore}
                onAdjust={(delta) => adjustScore('enemy', delta)}
                onChange={(value) => updateScore('enemy', value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {availableResultOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'h-11 rounded-md border px-3 text-sm font-bold transition-colors',
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

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 p-0 sm:h-[760px] sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border bg-card px-4 py-4 pr-12 sm:px-5">
            <DialogTitle>맵 선택</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <Input
              autoFocus
              placeholder="맵 검색"
              value={mapQuery}
              onChange={(event) => setMapQuery(event.target.value)}
            />
            <div className="mobile-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
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
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-[hsl(var(--surface-2))] p-2">
              {filteredMaps.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredMaps.map((map) => (
                    <button
                      key={map.value}
                      type="button"
                      className={cn(
                        'overflow-hidden rounded-md border bg-card text-left transition-[background-color,border-color,color] hover:border-primary/35 hover:bg-secondary',
                        map.value === mapId && 'border-primary bg-primary/[0.06]',
                      )}
                      onClick={() => selectMap(map.value)}
                    >
                      <span className="block aspect-[16/9] overflow-hidden bg-secondary">
                        <img
                          alt={map.label}
                          className="h-full w-full object-cover"
                          src={getMapScreenshotPath(map.value)}
                          loading="lazy"
                        />
                      </span>
                      <span className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{map.label}</span>
                          <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                            {getModeLabel(map.modeId)}
                          </span>
                        </span>
                        {map.value === mapId ? (
                          <span className="shrink-0 text-xs font-bold text-primary">선택됨</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex h-full min-h-72 items-center justify-center rounded-md border border-dashed border-border bg-card text-center text-sm font-semibold text-muted-foreground">
                  검색 결과 없음
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
  label: string;
  onAdjust: (delta: number) => void;
  onChange: (value: string) => void;
  value: string;
}

const ScoreField = ({ label, onAdjust, onChange, value }: ScoreFieldProps) => (
  <div>
    <p className="mb-2 text-center text-xs font-bold text-muted-foreground">{label}</p>
    <div className="grid grid-cols-[34px_minmax(0,1fr)_34px] overflow-hidden rounded-md border border-input bg-card">
      <button
        type="button"
        className="flex h-11 items-center justify-center border-r border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`${label} 점수 감소`}
        onClick={() => onAdjust(-1)}
      >
        <Minus className="h-4 w-4" />
      </button>
      <Input
        className="h-11 rounded-none border-0 bg-card px-1 text-center text-lg font-bold focus-visible:ring-0"
        inputMode="numeric"
        max={10}
        min={0}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="flex h-11 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`${label} 점수 증가`}
        onClick={() => onAdjust(1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  </div>
);

export { QuickMatchEntry };
