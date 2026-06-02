import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronUp, Minus, Plus, RotateCcw, Save, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getHeroLabel,
  getModeLabel,
  getResultOptionsForMode,
  heroOptions,
  mapOptions,
  modeAllowsDraw,
  modeOptions,
  queueOptions,
  resultOptions,
  roleLabels,
  roleOptions,
  type HeroRoleFilter,
} from '@/data/matchOptions';
import { getMapScreenshotPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { Match, MatchCreateInput, MatchResult } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';
import type { UserSettings } from '@/types/userSettings';

const modeValues = modeOptions.map((option) => option.value);
const resultValues = resultOptions.map((option) => option.value);
type CurrentModeId = (typeof modeOptions)[number]['value'];

const isModeValue = (value: string): value is CurrentModeId =>
  modeValues.includes(value as CurrentModeId);

const isValidModeValue = (value: string): boolean => modeValues.includes(value as CurrentModeId);

const isValidResultValue = (value: string): boolean =>
  resultValues.includes(value as MatchCreateInput['result']);

const isValidScoreValue = (value: string) => {
  if (!value.trim()) {
    return false;
  }

  const score = Number(value);

  return Number.isInteger(score) && score >= 0 && score <= 10;
};

const inferScoreResult = (teamScore: string, enemyScore: string) => {
  if (!isValidScoreValue(teamScore) || !isValidScoreValue(enemyScore)) return null;

  const team = Number(teamScore);
  const enemy = Number(enemyScore);

  if (team > enemy) return 'win';
  if (team < enemy) return 'loss';
  return 'draw';
};

const sanitizeScoreValue = (value: string) => value.replace(/[^\d]/g, '').slice(0, 2);

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

const scoreSchema = z.string().refine(isValidScoreValue, '0~10 사이의 정수를 입력하세요.');

const matchEntrySchema = z.object({
  enemyScore: scoreSchema,
  mapId: z.string().min(1, '맵을 선택하세요.'),
  modeId: z.string().refine(isValidModeValue, '모드를 선택하세요.'),
  playedAt: z.string().min(1, '플레이 시간을 입력하세요.'),
  queueType: z.enum(['solo', 'duo', 'trio', 'quad', 'five']),
  result: z.string().refine(isValidResultValue, '결과를 선택하세요.'),
  teamScore: scoreSchema,
});

type MatchEntryFormValues = z.infer<typeof matchEntrySchema>;

interface MatchEntryFormProps {
  accounts?: PlayerAccount[];
  defaultSettings?: UserSettings;
  initialDraft?: Partial<MatchCreateInput>;
  initialMatch?: Match;
  isSubmitting?: boolean;
  onSaved?: () => void;
  onSubmit: (input: MatchCreateInput) => Promise<boolean | void>;
  source?: MatchCreateInput['source'];
  submitLabel?: string;
}

const toDatetimeLocalValue = (date = new Date()) => {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const getDraftDate = (initialMatch?: Match, initialDraft?: Partial<MatchCreateInput>) => {
  if (initialMatch) {
    return new Date(initialMatch.playedAt);
  }

  if (initialDraft?.playedAt) {
    return new Date(initialDraft.playedAt);
  }

  return new Date();
};

const getDefaultFormValues = (
  defaultSettings?: UserSettings,
  initialMatch?: Match,
  initialDraft?: Partial<MatchCreateInput>,
) => ({
  enemyScore:
    initialMatch?.enemyScore !== undefined
      ? String(initialMatch.enemyScore)
      : initialDraft?.enemyScore !== undefined
        ? String(initialDraft.enemyScore)
        : '',
  mapId: initialMatch?.mapId ?? initialDraft?.mapId ?? '',
  modeId: initialMatch?.modeId ?? initialDraft?.modeId ?? '',
  playedAt: toDatetimeLocalValue(getDraftDate(initialMatch, initialDraft)),
  queueType:
    initialMatch?.queueType ??
    initialDraft?.queueType ??
    defaultSettings?.defaultQueueType ??
    'solo',
  result: initialMatch?.result ?? initialDraft?.result ?? '',
  teamScore:
    initialMatch?.teamScore !== undefined
      ? String(initialMatch.teamScore)
      : initialDraft?.teamScore !== undefined
        ? String(initialDraft.teamScore)
        : '',
});

const MatchEntryForm = ({
  accounts = [],
  defaultSettings,
  initialDraft,
  initialMatch,
  isSubmitting = false,
  onSaved,
  onSubmit,
  source,
  submitLabel,
}: MatchEntryFormProps) => {
  const mainAccount = accounts.find((account) => account.isMain);
  const fallbackAccountId = mainAccount?.id ?? accounts[0]?.id ?? '';
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialMatch ? (initialMatch.accountId ?? '') : (initialDraft?.accountId ?? null),
  );
  const [selectedHeroes, setSelectedHeroes] = useState<string[]>(
    initialMatch?.myHeroes ?? initialDraft?.myHeroes ?? [],
  );
  const [heroQuery, setHeroQuery] = useState('');
  const [mapQuery, setMapQuery] = useState('');
  const [showHeroPicker, setShowHeroPicker] = useState(
    Boolean(initialMatch?.myHeroes?.length || initialDraft?.myHeroes?.length),
  );
  const [roleFilter, setRoleFilter] = useState<HeroRoleFilter>('all');

  const form = useForm<MatchEntryFormValues>({
    defaultValues: getDefaultFormValues(defaultSettings, initialMatch, initialDraft),
    resolver: zodResolver(matchEntrySchema),
  });

  const watchedModeId = useWatch({ control: form.control, name: 'modeId' });
  const watchedResult = useWatch({ control: form.control, name: 'result' });
  const watchedMapId = useWatch({ control: form.control, name: 'mapId' });
  const watchedTeamScore = useWatch({ control: form.control, name: 'teamScore' });
  const watchedEnemyScore = useWatch({ control: form.control, name: 'enemyScore' });
  const selectedModeId = isModeValue(watchedModeId) ? watchedModeId : null;

  const filteredMaps = useMemo(() => {
    const query = mapQuery.trim().toLowerCase();

    return mapOptions.filter((map) => {
      const modeMatches = selectedModeId ? map.modeId === selectedModeId : true;
      const queryMatches =
        query.length === 0 ||
        map.label.toLowerCase().includes(query) ||
        map.value.toLowerCase().includes(query) ||
        getModeLabel(map.modeId).toLowerCase().includes(query);

      return modeMatches && queryMatches;
    });
  }, [mapQuery, selectedModeId]);
  const filteredHeroes = useMemo(() => {
    const query = heroQuery.trim().toLowerCase();

    return heroOptions.filter((hero) => {
      const roleMatches = roleFilter === 'all' || hero.role === roleFilter;
      const queryMatches =
        query.length === 0 ||
        hero.label.toLowerCase().includes(query) ||
        hero.value.toLowerCase().includes(query);

      return roleMatches && queryMatches;
    });
  }, [heroQuery, roleFilter]);
  const availableResultOptions = selectedModeId
    ? getResultOptionsForMode(selectedModeId)
    : resultOptions;
  const effectiveSelectedAccountId = selectedAccountId ?? fallbackAccountId;
  const selectedAccount = accounts.find((account) => account.id === effectiveSelectedAccountId);
  const selectedMap = mapOptions.find((map) => map.value === watchedMapId);

  useEffect(() => {
    const currentMapIsAvailable = mapOptions.some(
      (map) => map.value === watchedMapId && (!selectedModeId || map.modeId === selectedModeId),
    );

    if (watchedMapId && !currentMapIsAvailable) {
      form.setValue('mapId', '', { shouldValidate: true });
    }
  }, [form, selectedModeId, watchedMapId]);

  useEffect(() => {
    if (selectedModeId && watchedResult === 'draw' && !modeAllowsDraw(selectedModeId)) {
      form.setValue('result', '', { shouldValidate: true });
    }
  }, [form, selectedModeId, watchedResult]);

  useEffect(() => {
    const inferred = inferScoreResult(watchedTeamScore, watchedEnemyScore);

    if (!inferred) {
      if (
        watchedResult &&
        (!isValidScoreValue(watchedTeamScore) || !isValidScoreValue(watchedEnemyScore))
      ) {
        form.setValue('result', '', { shouldValidate: true });
      }
      return;
    }

    if (inferred === 'draw' && selectedModeId && !modeAllowsDraw(selectedModeId)) {
      if (watchedResult) {
        form.setValue('result', '', { shouldValidate: true });
      }
      return;
    }

    if (watchedResult !== inferred) {
      form.setValue('result', inferred, { shouldValidate: true });
    }
  }, [form, selectedModeId, watchedEnemyScore, watchedResult, watchedTeamScore]);

  useEffect(() => {
    if (!initialMatch && !initialDraft?.queueType && defaultSettings?.defaultQueueType) {
      form.setValue('queueType', defaultSettings.defaultQueueType);
    }
  }, [defaultSettings, form, initialDraft?.queueType, initialMatch]);

  const toggleHero = (heroId: string) => {
    setSelectedHeroes((current) =>
      current.includes(heroId)
        ? current.filter((selectedHero) => selectedHero !== heroId)
        : [...current, heroId],
    );
  };

  const resetForm = () => {
    form.reset(getDefaultFormValues(defaultSettings, initialMatch, initialDraft));
    setSelectedAccountId(
      initialMatch ? (initialMatch.accountId ?? '') : (initialDraft?.accountId ?? null),
    );
    setSelectedHeroes(initialMatch?.myHeroes ?? initialDraft?.myHeroes ?? []);
    setHeroQuery('');
    setMapQuery('');
    setRoleFilter('all');
    setShowHeroPicker(Boolean(initialMatch?.myHeroes?.length || initialDraft?.myHeroes?.length));
  };

  const updateScore = (fieldName: 'teamScore' | 'enemyScore', value: string) => {
    form.setValue(fieldName, sanitizeScoreValue(value), { shouldValidate: true });
  };

  const adjustScore = (fieldName: 'teamScore' | 'enemyScore', delta: number) => {
    const current = Number(form.getValues(fieldName)) || 0;
    const nextValue = Math.max(0, Math.min(10, current + delta));

    form.setValue(fieldName, String(nextValue), { shouldValidate: true });
  };

  const submit = form.handleSubmit(async (values) => {
    const didSubmit = await onSubmit({
      account: selectedAccount?.isMain === false ? 'sub' : 'main',
      accountId: selectedAccount?.id ?? null,
      enemyScore: Number(values.enemyScore),
      mapId: values.mapId,
      memo: '',
      modeId: values.modeId as MatchCreateInput['modeId'],
      myHeroes: selectedHeroes,
      playedAt: new Date(values.playedAt).toISOString(),
      queueType: values.queueType,
      result: values.result as MatchCreateInput['result'],
      source: source ?? initialMatch?.source ?? initialDraft?.source ?? 'manual',
      tags: [],
      teamScore: Number(values.teamScore),
    });

    if (didSubmit === false) {
      return;
    }

    if (!initialMatch) {
      resetForm();
    }
    onSaved?.();
  });

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={submit}>
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
          <div className="min-w-0">
            <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="맵 검색"
                  className="h-9 pl-9 text-sm font-semibold"
                  placeholder="맵 검색"
                  value={mapQuery}
                  onChange={(event) => setMapQuery(event.target.value)}
                />
              </div>
              <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1">
                {modeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'h-9 shrink-0 rounded-md border px-3 text-xs font-bold transition-colors',
                      watchedModeId === option.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                    )}
                    onClick={() => form.setValue('modeId', option.value, { shouldValidate: true })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mobile-scroll h-[228px] overflow-x-auto pb-2 sm:h-[244px]">
              {filteredMaps.length > 0 ? (
                <div className="grid h-full auto-cols-[144px] grid-flow-col grid-rows-2 gap-2 sm:auto-cols-[164px]">
                  {filteredMaps.map((map) => {
                    const selected = watchedMapId === map.value;

                    return (
                      <button
                        key={map.value}
                        type="button"
                        className={cn(
                          'overflow-hidden rounded-md border bg-card text-left transition-[background-color,border-color,color] hover:border-primary/35 hover:bg-secondary',
                          selected && 'border-primary bg-primary/[0.06] text-primary',
                        )}
                        onClick={() => {
                          form.setValue('modeId', map.modeId, { shouldValidate: true });
                          form.setValue('mapId', map.value, { shouldValidate: true });
                        }}
                      >
                        <span className="block h-16 overflow-hidden bg-secondary">
                          <img
                            alt={map.label}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            src={getMapScreenshotPath(map.value)}
                          />
                        </span>
                        <span className="block min-w-0 px-2 py-1.5">
                          <span className="block truncate text-xs font-bold">{map.label}</span>
                          <span
                            className={cn(
                              'mt-0.5 block truncate text-[11px] font-semibold',
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
            {form.formState.errors.mapId ? (
              <p className="mt-2 text-sm font-medium text-destructive">
                {form.formState.errors.mapId.message}
              </p>
            ) : null}
          </div>

          <div className="border-t border-border/70 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="mb-4 min-h-12">
              <p className="metric-label">맵</p>
              <div className="mt-1 flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-base font-bold">
                  {selectedMap ? selectedMap.label : '선택'}
                </p>
                {selectedMap ? (
                  <Badge variant="outline" className="shrink-0 bg-transparent">
                    {getModeLabel(selectedMap.modeId)}
                  </Badge>
                ) : null}
              </div>
            </div>

            <section className="space-y-3">
              <Label>스코어</Label>
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                <FormField
                  control={form.control}
                  name="teamScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ScoreStepper
                          label="우리"
                          value={field.value}
                          onAdjust={(delta) => adjustScore('teamScore', delta)}
                          onChange={(value) => updateScore('teamScore', value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="pt-9 text-lg font-bold text-muted-foreground">:</div>
                <FormField
                  control={form.control}
                  name="enemyScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ScoreStepper
                          label="상대"
                          value={field.value}
                          onAdjust={(delta) => adjustScore('enemyScore', delta)}
                          onChange={(value) => updateScore('enemyScore', value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>결과</Label>
                {selectedModeId && !modeAllowsDraw(selectedModeId) ? (
                  <span className="text-xs font-semibold text-muted-foreground">무승부 없음</span>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {availableResultOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'h-11 rounded-md border px-3 text-sm font-bold transition-colors',
                      getResultTone(option.value, watchedResult === option.value),
                    )}
                    onClick={() => form.setValue('result', option.value, { shouldValidate: true })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {form.formState.errors.result ? (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.result.message}
                </p>
              ) : null}
            </section>
          </div>
        </section>

        <section className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3 sm:p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <FormField
              control={form.control}
              name="playedAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>플레이 시간</FormLabel>
                  <FormControl>
                    <Input className="bg-card" type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="queueType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>큐</FormLabel>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-1">
                    {queueOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          'h-9 rounded-md border px-2 text-xs font-bold transition-colors',
                          field.value === option.value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                        )}
                        onClick={() => field.onChange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )}
            />
          </div>

          <div className="mt-4 space-y-3">
            <Label>계정</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  'h-9 rounded-md border px-3 text-sm font-bold transition-colors',
                  effectiveSelectedAccountId === ''
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                )}
                onClick={() => setSelectedAccountId('')}
              >
                미지정
              </button>
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={cn(
                    'h-9 rounded-md border px-3 text-sm font-bold transition-colors',
                    effectiveSelectedAccountId === account.id && selectedAccountId !== ''
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                  )}
                  onClick={() => setSelectedAccountId(account.id)}
                >
                  {getPlayerAccountLabel(account)}
                  {account.isMain ? ' · 본계' : ''}
                  {!account.isActive ? ' · 비활성' : ''}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border/70 bg-card">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left sm:px-4"
            aria-expanded={showHeroPicker}
            onClick={() => setShowHeroPicker((current) => !current)}
          >
            <div className="min-w-0">
              <p className="metric-label">선택 영웅</p>
              <p className="mt-1 truncate text-sm font-bold">
                {selectedHeroes.length > 0
                  ? selectedHeroes.map((heroId) => getHeroLabel(heroId)).join(', ')
                  : '없음'}
              </p>
            </div>
            {showHeroPicker ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {selectedHeroes.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-3 sm:px-4">
              {selectedHeroes.map((heroId) => (
                <Badge
                  key={heroId}
                  className="gap-1 border-primary/20 bg-primary/[0.08] text-primary hover:bg-primary/10"
                  variant="outline"
                >
                  {getHeroLabel(heroId)}
                  <button
                    aria-label={`${getHeroLabel(heroId)} 제거`}
                    className="rounded-sm p-0.5 hover:bg-primary/10"
                    type="button"
                    onClick={() => toggleHero(heroId)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}

          {showHeroPicker ? (
            <div className="space-y-3 border-t border-border/70 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {roleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        'h-8 rounded-md border px-2.5 text-xs font-bold transition-colors',
                        roleFilter === option.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                      )}
                      onClick={() => setRoleFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <Input
                  className="sm:w-56"
                  placeholder="영웅 검색"
                  value={heroQuery}
                  onChange={(event) => setHeroQuery(event.target.value)}
                />
              </div>

              <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border border-border/70 bg-[hsl(var(--surface-2))] p-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredHeroes.map((hero) => {
                  const selected = selectedHeroes.includes(hero.value);

                  return (
                    <button
                      key={hero.value}
                      type="button"
                      className={cn(
                        'min-h-10 rounded-md border px-3 py-2 text-left text-sm font-bold transition-colors',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:bg-secondary',
                      )}
                      onClick={() => toggleHero(hero.value)}
                    >
                      {hero.label}
                      <span className="ml-2 text-xs font-semibold opacity-70">
                        {roleLabels[hero.role]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="outline" onClick={resetForm}>
            <RotateCcw className="h-4 w-4" />
            초기화
          </Button>
          <Button disabled={isSubmitting} type="submit">
            <Save className="h-4 w-4" />
            {isSubmitting ? '저장 중' : (submitLabel ?? '저장')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

interface ScoreStepperProps {
  label: string;
  onAdjust: (delta: number) => void;
  onChange: (value: string) => void;
  value: string;
}

const ScoreStepper = ({ label, onAdjust, onChange, value }: ScoreStepperProps) => (
  <div>
    <p className="mb-2 text-center text-xs font-bold text-muted-foreground">{label}</p>
    <div className="grid grid-cols-[34px_minmax(0,1fr)_34px] overflow-hidden rounded-md border border-input bg-card">
      <button
        type="button"
        className="flex h-11 items-center justify-center border-r border-border/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
        className="flex h-11 items-center justify-center border-l border-border/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`${label} 점수 증가`}
        onClick={() => onAdjust(1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  </div>
);

export { MatchEntryForm };
