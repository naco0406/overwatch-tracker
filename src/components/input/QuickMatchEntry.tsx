import { Minus, Plus, Save, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  if (!value.trim()) {
    return false;
  }

  const score = Number(value);

  return Number.isInteger(score) && score >= 0 && score <= 10;
};

const inferResult = (teamScore: string, enemyScore: string): ResultValue => {
  if (!isValidScore(teamScore) || !isValidScore(enemyScore)) {
    return '';
  }

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
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [mapId, setMapId] = useState('');
  const [teamScore, setTeamScore] = useState('');
  const [enemyScore, setEnemyScore] = useState('');
  const [result, setResult] = useState<ResultValue>('');
  const [error, setError] = useState('');
  const mainAccount = accounts.find((account) => account.isMain);
  const defaultAccount = mainAccount ?? accounts[0];
  const selectedMap = mapOptions.find((map) => map.value === mapId);
  const filteredMaps = useMemo(
    () =>
      modeFilter === 'all' ? mapOptions : mapOptions.filter((map) => map.modeId === modeFilter),
    [modeFilter],
  );
  const availableResultOptions = selectedMap
    ? getResultOptionsForMode(selectedMap.modeId)
    : resultOptions;
  const defaultQueueType = defaultSettings?.defaultQueueType ?? 'solo';

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

        <div className="mobile-scroll mb-3 flex gap-2 overflow-x-auto pb-1">
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

        <div className="grid max-h-[300px] gap-2 overflow-y-auto rounded-lg border border-border bg-[hsl(var(--surface-2))] p-2 sm:grid-cols-2 xl:max-h-[360px]">
          {filteredMaps.map((map) => {
            const selected = map.value === mapId;

            return (
              <button
                key={map.value}
                type="button"
                className={cn(
                  'grid min-h-[74px] grid-cols-[80px_minmax(0,1fr)] overflow-hidden rounded-md border bg-card text-left transition-[background-color,border-color,color]',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:border-primary/35 hover:bg-secondary',
                )}
                onClick={() => {
                  const nextResultOptions = getResultOptionsForMode(map.modeId);

                  setMapId(map.value);
                  setModeFilter(map.modeId);
                  if (result && !nextResultOptions.some((option) => option.value === result)) {
                    setResult('');
                  }
                  setError('');
                }}
              >
                <div className="h-full overflow-hidden bg-secondary">
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={getMapScreenshotPath(map.value)}
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 self-center px-3 py-2">
                  <p className="truncate text-sm font-bold">{map.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs font-semibold',
                      selected ? 'text-primary-foreground/75' : 'text-muted-foreground',
                    )}
                  >
                    {getModeLabel(map.modeId)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="metric-label">스코어</p>
            <h3 className="mt-2 text-lg font-bold">
              {selectedMap ? selectedMap.label : '맵 미선택'}
            </h3>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
            <Swords className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
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

        <div className="mt-5 grid gap-2">
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

        {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}

        <Button
          className="mt-5 w-full"
          size="lg"
          type="button"
          disabled={isSubmitting}
          onClick={submit}
        >
          <Save className="h-4 w-4" />
          {isSubmitting ? '저장 중' : '저장'}
        </Button>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-[hsl(var(--surface-2))]">
          <div className="flat-row flex items-center justify-between gap-3 p-3">
            <span className="text-xs font-semibold text-muted-foreground">모드</span>
            <span className="truncate text-xs font-bold">
              {selectedMap ? getModeLabel(selectedMap.modeId) : '-'}
            </span>
          </div>
          <div className="flat-row flex items-center justify-between gap-3 p-3">
            <span className="text-xs font-semibold text-muted-foreground">시간</span>
            <span className="text-xs font-bold">현재</span>
          </div>
          <div className="flat-row flex items-center justify-between gap-3 p-3">
            <span className="text-xs font-semibold text-muted-foreground">입력</span>
            <span className="text-xs font-bold">수기</span>
          </div>
        </div>
      </aside>
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
