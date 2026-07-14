import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useForm, useFormState, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { DeferredImage } from '@/components/common/DeferredImage';
import { MatchModeBadge, MatchModeLabel } from '@/components/match/MatchModeBadge';
import { MapScreenshot } from '@/components/match/MapScreenshot';
import { MatchRoleIcon, MatchRoleLabel } from '@/components/match/MatchRoleBadge';
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
  matchRoleOptions,
  mapOptions,
  modeAllowsDraw,
  modeOptions,
  queueOptions,
  resultOptions,
  roleLabels,
  roleOptions,
  type HeroOption,
  type HeroRoleFilter,
} from '@/data/matchOptions';
import { getHeroPortraitPath } from '@/data/masterAssets';
import { cn } from '@/lib/utils';
import type { Match, MatchCreateInput, MatchResult, MatchRole } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';
import type { UserSettings } from '@/types/userSettings';

const modeValues = modeOptions.map((option) => option.value);
const resultValues = resultOptions.map((option) => option.value);
const heroRoleById = new Map(heroOptions.map((hero) => [hero.value, hero.role] as const));
const heroOptionById = new Map(heroOptions.map((hero) => [hero.value, hero] as const));
const mapById = new Map(mapOptions.map((map) => [map.value, map] as const));
const searchableMapOptions = mapOptions.map((map) => ({
  ...map,
  searchText: `${map.label} ${map.value} ${getModeLabel(map.modeId)}`.toLowerCase(),
}));
const searchableHeroOptions = heroOptions.map((hero) => ({
  ...hero,
  searchText: `${hero.label} ${hero.value}`.toLowerCase(),
}));
const heroRoleOrder = ['tank', 'damage', 'support'] as const;
type CurrentModeId = (typeof modeOptions)[number]['value'];
type SearchableMapOption = (typeof searchableMapOptions)[number];
type SearchableHeroOption = (typeof searchableHeroOptions)[number];

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
  matchRole: z.enum(['tank', 'damage', 'support']),
  playedAt: z.string().min(1, '플레이 시간을 입력하세요.'),
  queueType: z.enum(['solo', 'duo', 'trio', 'quad', 'five']),
  result: z.string().refine(isValidResultValue, '결과를 선택하세요.'),
  teamScore: scoreSchema,
});

type MatchEntryFormValues = z.infer<typeof matchEntrySchema>;

interface MatchEntryFormProps {
  accounts?: PlayerAccount[];
  defaultSettings?: UserSettings;
  headerContent?: ReactNode;
  initialDraft?: Partial<MatchCreateInput>;
  initialMatch?: Match;
  isSubmitting?: boolean;
  layout?: 'default' | 'dialog';
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
) => {
  const inferredRole = (initialDraft?.myHeroes ?? [])
    .map((heroId) => heroRoleById.get(heroId))
    .find((role): role is MatchRole => Boolean(role));

  return {
    enemyScore:
      initialMatch?.enemyScore !== undefined
        ? String(initialMatch.enemyScore)
        : initialDraft?.enemyScore !== undefined
          ? String(initialDraft.enemyScore)
          : '',
    mapId: initialMatch?.mapId ?? initialDraft?.mapId ?? '',
    modeId: initialMatch?.modeId ?? initialDraft?.modeId ?? '',
    matchRole:
      initialMatch?.matchRole ??
      initialDraft?.matchRole ??
      inferredRole ??
      defaultSettings?.defaultMatchRole ??
      'damage',
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
  };
};

const MatchEntryForm = ({
  accounts = [],
  defaultSettings,
  headerContent,
  initialDraft,
  initialMatch,
  isSubmitting = false,
  layout = 'default',
  onSaved,
  onSubmit,
  source,
  submitLabel,
}: MatchEntryFormProps) => {
  const isDialogLayout = layout === 'dialog';
  const fallbackAccountId = useMemo(() => {
    const mainAccount = accounts.find((account) => account.isMain);
    const defaultPlayerAccount = accounts.find(
      (account) => account.id === defaultSettings?.defaultPlayerAccountId,
    );

    return defaultPlayerAccount?.id ?? mainAccount?.id ?? accounts[0]?.id ?? '';
  }, [accounts, defaultSettings?.defaultPlayerAccountId]);
  const initialFormValues = useMemo(
    () => getDefaultFormValues(defaultSettings, initialMatch, initialDraft),
    [defaultSettings, initialDraft, initialMatch],
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialMatch ? (initialMatch.accountId ?? '') : (initialDraft?.accountId ?? null),
  );
  const [selectedHeroes, setSelectedHeroes] = useState<string[]>(
    initialMatch?.myHeroes ?? initialDraft?.myHeroes ?? [],
  );
  const [heroQuery, setHeroQuery] = useState('');
  const [mapQuery, setMapQuery] = useState('');
  const [showHeroPicker, setShowHeroPicker] = useState(true);
  const [roleFilter, setRoleFilter] = useState<HeroRoleFilter>(initialFormValues.matchRole);

  const form = useForm<MatchEntryFormValues>({
    defaultValues: initialFormValues,
    resolver: zodResolver(matchEntrySchema),
  });

  const effectiveSelectedAccountId = selectedAccountId ?? fallbackAccountId;
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === effectiveSelectedAccountId),
    [accounts, effectiveSelectedAccountId],
  );

  const toggleHero = useCallback((heroId: string) => {
    setSelectedHeroes((current) =>
      current.includes(heroId)
        ? current.filter((selectedHero) => selectedHero !== heroId)
        : [...current, heroId],
    );
  }, []);

  const toggleHeroPicker = useCallback(() => {
    if (!showHeroPicker) {
      setRoleFilter(form.getValues('matchRole'));
    }
    setShowHeroPicker((current) => !current);
  }, [form, showHeroPicker]);

  const resetForm = useCallback(() => {
    const defaultValues = getDefaultFormValues(defaultSettings, initialMatch, initialDraft);

    form.reset(defaultValues);
    setSelectedAccountId(
      initialMatch ? (initialMatch.accountId ?? '') : (initialDraft?.accountId ?? null),
    );
    setSelectedHeroes(initialMatch?.myHeroes ?? initialDraft?.myHeroes ?? []);
    setHeroQuery('');
    setMapQuery('');
    setRoleFilter(defaultValues.matchRole);
    setShowHeroPicker(true);
  }, [defaultSettings, form, initialDraft, initialMatch]);

  const updateScore = useCallback(
    (fieldName: 'teamScore' | 'enemyScore', value: string) => {
      form.setValue(fieldName, sanitizeScoreValue(value), { shouldValidate: true });
    },
    [form],
  );

  const adjustScore = useCallback(
    (fieldName: 'teamScore' | 'enemyScore', delta: number) => {
      const current = Number(form.getValues(fieldName)) || 0;
      const nextValue = Math.max(0, Math.min(10, current + delta));

      form.setValue(fieldName, String(nextValue), { shouldValidate: true });
    },
    [form],
  );

  const submit = form.handleSubmit(async (values) => {
    const didSubmit = await onSubmit({
      account: selectedAccount?.isMain === false ? 'sub' : 'main',
      accountId: selectedAccount?.id ?? null,
      enemyScore: Number(values.enemyScore),
      mapId: values.mapId,
      memo: '',
      modeId: values.modeId as MatchCreateInput['modeId'],
      matchRole: values.matchRole,
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
      <form className={cn(isDialogLayout && 'flex min-h-0 flex-1 flex-col')} onSubmit={submit}>
        <div
          className={cn(
            'space-y-4',
            isDialogLayout &&
              'match-entry-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5',
          )}
        >
          {headerContent}

          <MatchFormEffects
            defaultSettings={defaultSettings}
            form={form}
            initialDraft={initialDraft}
            initialMatch={initialMatch}
          />
          <MapAndScoreSection
            form={form}
            mapQuery={mapQuery}
            onAdjustScore={adjustScore}
            onMapQueryChange={setMapQuery}
            onUpdateScore={updateScore}
          />
          <MatchMetadataSection
            accounts={accounts}
            effectiveSelectedAccountId={effectiveSelectedAccountId}
            form={form}
            onAccountChange={setSelectedAccountId}
            selectedAccountId={selectedAccountId}
            setRoleFilter={setRoleFilter}
            showHeroPicker={showHeroPicker}
          />
          <HeroPickerSection
            heroQuery={heroQuery}
            onHeroQueryChange={setHeroQuery}
            onRoleFilterChange={setRoleFilter}
            onToggleHero={toggleHero}
            onTogglePicker={toggleHeroPicker}
            roleFilter={roleFilter}
            selectedHeroes={selectedHeroes}
            showHeroPicker={showHeroPicker}
          />
        </div>

        <div
          className={cn(
            'flex flex-col-reverse gap-2 border-t border-border/70 sm:flex-row sm:items-center sm:justify-end',
            isDialogLayout
              ? 'shrink-0 bg-card px-4 py-3 shadow-[0_-18px_42px_-34px_hsl(var(--foreground)/0.45)] sm:px-5 sm:py-4'
              : 'pt-4',
          )}
        >
          <Button type="button" variant="outline" onClick={resetForm}>
            <RotateCcw className="h-4 w-4" />
            초기화
          </Button>
          <Button className="ow-command-button" disabled={isSubmitting} type="submit">
            <Save className="h-4 w-4" />
            {isSubmitting ? '저장 중' : (submitLabel ?? '저장')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

interface MatchFormSectionProps {
  form: UseFormReturn<MatchEntryFormValues>;
}

interface MatchFormEffectsProps extends MatchFormSectionProps {
  defaultSettings?: UserSettings;
  initialDraft?: Partial<MatchCreateInput>;
  initialMatch?: Match;
}

const MatchFormEffects = ({
  defaultSettings,
  form,
  initialDraft,
  initialMatch,
}: MatchFormEffectsProps) => {
  const watchedModeId = useWatch({ control: form.control, name: 'modeId' });
  const watchedResult = useWatch({ control: form.control, name: 'result' });
  const watchedMapId = useWatch({ control: form.control, name: 'mapId' });
  const watchedTeamScore = useWatch({ control: form.control, name: 'teamScore' });
  const watchedEnemyScore = useWatch({ control: form.control, name: 'enemyScore' });
  const selectedModeId = isModeValue(watchedModeId) ? watchedModeId : null;

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

  useEffect(() => {
    if (
      !initialMatch &&
      !initialDraft?.matchRole &&
      !initialDraft?.myHeroes?.length &&
      defaultSettings?.defaultMatchRole
    ) {
      form.setValue('matchRole', defaultSettings.defaultMatchRole);
    }
  }, [
    defaultSettings,
    form,
    initialDraft?.matchRole,
    initialDraft?.myHeroes?.length,
    initialMatch,
  ]);

  return null;
};

interface MapAndScoreSectionProps extends MatchFormSectionProps {
  mapQuery: string;
  onAdjustScore: (fieldName: 'teamScore' | 'enemyScore', delta: number) => void;
  onMapQueryChange: (value: string) => void;
  onUpdateScore: (fieldName: 'teamScore' | 'enemyScore', value: string) => void;
}

const MapAndScoreSection = memo(
  ({ form, mapQuery, onAdjustScore, onMapQueryChange, onUpdateScore }: MapAndScoreSectionProps) => (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
      <MapPickerPanel form={form} mapQuery={mapQuery} onMapQueryChange={onMapQueryChange} />
      <ScoreResultPanel form={form} onAdjustScore={onAdjustScore} onUpdateScore={onUpdateScore} />
    </section>
  ),
);
MapAndScoreSection.displayName = 'MapAndScoreSection';

interface MapPickerPanelProps extends MatchFormSectionProps {
  mapQuery: string;
  onMapQueryChange: (value: string) => void;
}

interface MapTileButtonProps {
  map: SearchableMapOption;
  onSelectMap: (map: SearchableMapOption) => void;
  selected: boolean;
}

const MapTileButton = memo(({ map, onSelectMap, selected }: MapTileButtonProps) => {
  const handleClick = useCallback(() => onSelectMap(map), [map, onSelectMap]);

  return (
    <button
      type="button"
      className={cn(
        'match-map-tile ow-map-tile flex h-full min-w-0 flex-col overflow-hidden border border-border bg-card text-left shadow-[0_8px_18px_-18px_hsl(var(--foreground)/0.7)] transition-[background-color,border-color,color,box-shadow] hover:border-foreground/20 hover:shadow-[0_10px_20px_-16px_hsl(var(--foreground)/0.65)]',
        selected &&
          'border-primary bg-primary/[0.05] shadow-[0_10px_20px_-16px_hsl(var(--foreground)/0.55)]',
      )}
      onClick={handleClick}
    >
      <span className="relative block min-h-0 flex-1 overflow-hidden bg-secondary">
        <MapScreenshot
          alt={map.label}
          className="h-full w-full object-cover"
          decoding="async"
          height={150}
          loading="lazy"
          mapId={map.value}
          sizes="164px"
          width={328}
        />
        <MatchModeLabel
          className="absolute bottom-1.5 left-1.5 h-4 max-w-[calc(100%-12px)] rounded-sm bg-black/70 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm"
          iconClassName="h-3 w-3 rounded-[2px]"
          modeId={map.modeId}
        />
      </span>
      <span className="flex h-7 min-w-0 shrink-0 items-center px-2">
        <span className="block truncate text-xs font-black leading-4">{map.label}</span>
      </span>
    </button>
  );
});
MapTileButton.displayName = 'MapTileButton';

const MapPickerPanel = memo(({ form, mapQuery, onMapQueryChange }: MapPickerPanelProps) => {
  const watchedModeId = useWatch({ control: form.control, name: 'modeId' });
  const watchedMapId = useWatch({ control: form.control, name: 'mapId' });
  const { errors } = useFormState({ control: form.control, name: 'mapId' });
  const selectedModeId = isModeValue(watchedModeId) ? watchedModeId : null;
  const selectMap = useCallback(
    (map: SearchableMapOption) => {
      form.setValue('modeId', map.modeId, { shouldValidate: true });
      form.setValue('mapId', map.value, { shouldValidate: true });
    },
    [form],
  );
  const filteredMaps = useMemo(() => {
    const query = mapQuery.trim().toLowerCase();

    return searchableMapOptions.filter((map) => {
      const modeMatches = selectedModeId ? map.modeId === selectedModeId : true;
      const queryMatches = query.length === 0 || map.searchText.includes(query);

      return modeMatches && queryMatches;
    });
  }, [mapQuery, selectedModeId]);

  return (
    <div className="min-w-0">
      <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="맵 검색"
            className="h-9 pl-9 text-sm font-semibold"
            placeholder="맵 검색"
            value={mapQuery}
            onChange={(event) => onMapQueryChange(event.target.value)}
          />
        </div>
        <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[3px] border px-3 text-xs font-bold transition-[background-color,border-color,color,box-shadow]',
                watchedModeId === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              onClick={() => form.setValue('modeId', option.value, { shouldValidate: true })}
            >
              <MatchModeLabel modeId={option.value} />
            </button>
          ))}
        </div>
      </div>

      <div className="mobile-scroll h-[228px] overflow-x-auto pb-2 sm:h-[244px]">
        {filteredMaps.length > 0 ? (
          <div className="grid h-full auto-cols-[144px] grid-flow-col grid-rows-2 gap-2 sm:auto-cols-[164px]">
            {filteredMaps.map((map) => (
              <MapTileButton
                key={map.value}
                map={map}
                selected={watchedMapId === map.value}
                onSelectMap={selectMap}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[3px] border border-dashed border-border bg-[hsl(var(--surface-2))] px-4 text-center text-sm font-semibold text-muted-foreground">
            검색 결과 없음
          </div>
        )}
      </div>
      {errors.mapId ? (
        <p className="mt-2 text-sm font-medium text-destructive">{errors.mapId.message}</p>
      ) : null}
    </div>
  );
});
MapPickerPanel.displayName = 'MapPickerPanel';

interface ScoreResultPanelProps extends MatchFormSectionProps {
  onAdjustScore: (fieldName: 'teamScore' | 'enemyScore', delta: number) => void;
  onUpdateScore: (fieldName: 'teamScore' | 'enemyScore', value: string) => void;
}

const ScoreResultPanel = memo(({ form, onAdjustScore, onUpdateScore }: ScoreResultPanelProps) => {
  const watchedModeId = useWatch({ control: form.control, name: 'modeId' });
  const watchedResult = useWatch({ control: form.control, name: 'result' });
  const watchedMapId = useWatch({ control: form.control, name: 'mapId' });
  const { errors } = useFormState({ control: form.control, name: 'result' });
  const selectedModeId = isModeValue(watchedModeId) ? watchedModeId : null;
  const selectedMap = mapById.get(watchedMapId);
  const availableResultOptions = selectedModeId
    ? getResultOptionsForMode(selectedModeId)
    : resultOptions;

  return (
    <div className="ow-data-accent rounded-[3px] border border-white/10 bg-[hsl(var(--ow-navy))] p-3 text-white shadow-[0_16px_32px_-26px_rgb(2_6_23/0.9)] [&_.metric-label]:text-white/50 [&_label]:text-white/75 lg:p-4">
      <div className="mb-4 min-h-12">
        <p className="metric-label">맵</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-lg font-black">
            {selectedMap ? selectedMap.label : '선택'}
          </p>
          {selectedMap ? (
            <MatchModeBadge
              className="shrink-0 border-white/15 bg-white/5 text-white"
              modeId={selectedMap.modeId}
            />
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
                    onAdjust={(delta) => onAdjustScore('teamScore', delta)}
                    onChange={(value) => onUpdateScore('teamScore', value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-9 text-lg font-black text-white/50">:</div>
          <FormField
            control={form.control}
            name="enemyScore"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <ScoreStepper
                    label="상대"
                    value={field.value}
                    onAdjust={(delta) => onAdjustScore('enemyScore', delta)}
                    onChange={(value) => onUpdateScore('enemyScore', value)}
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
            <span className="text-xs font-semibold text-white/55">무승부 없음</span>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {availableResultOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                'h-11 rounded-[3px] border px-3 text-sm font-black transition-colors',
                getResultTone(option.value, watchedResult === option.value),
              )}
              onClick={() => form.setValue('result', option.value, { shouldValidate: true })}
            >
              {option.label}
            </button>
          ))}
        </div>
        {errors.result ? (
          <p className="text-sm font-medium text-destructive">{errors.result.message}</p>
        ) : null}
      </section>
    </div>
  );
});
ScoreResultPanel.displayName = 'ScoreResultPanel';

interface MatchMetadataSectionProps extends MatchFormSectionProps {
  accounts: PlayerAccount[];
  effectiveSelectedAccountId: string;
  onAccountChange: (accountId: string | null) => void;
  selectedAccountId: string | null;
  setRoleFilter: (role: HeroRoleFilter) => void;
  showHeroPicker: boolean;
}

const MatchMetadataSection = memo(
  ({
    accounts,
    effectiveSelectedAccountId,
    form,
    onAccountChange,
    selectedAccountId,
    setRoleFilter,
    showHeroPicker,
  }: MatchMetadataSectionProps) => (
    <section className="ow-data-accent rounded-[3px] border border-border bg-[hsl(var(--surface-2))] p-3 sm:p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
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
                      'h-9 rounded-[3px] border px-2 text-xs font-bold transition-colors',
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

        <FormField
          control={form.control}
          name="matchRole"
          render={({ field }) => (
            <FormItem>
              <FormLabel>포지션</FormLabel>
              <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-1">
                {matchRoleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'h-9 rounded-[3px] border px-2 text-xs font-bold transition-colors',
                      field.value === option.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                    )}
                    onClick={() => {
                      field.onChange(option.value);
                      if (showHeroPicker) {
                        setRoleFilter(option.value);
                      }
                    }}
                  >
                    <MatchRoleLabel className="justify-center" role={option.value} />
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
              'h-9 rounded-[3px] border px-3 text-sm font-bold transition-colors',
              effectiveSelectedAccountId === ''
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-secondary',
            )}
            onClick={() => onAccountChange('')}
          >
            미지정
          </button>
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={cn(
                'h-9 rounded-[3px] border px-3 text-sm font-bold transition-colors',
                effectiveSelectedAccountId === account.id && selectedAccountId !== ''
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-secondary',
              )}
              onClick={() => onAccountChange(account.id)}
            >
              {getPlayerAccountLabel(account)}
              {account.isMain ? ' · 본계' : ''}
              {!account.isActive ? ' · 비활성' : ''}
            </button>
          ))}
        </div>
      </div>
    </section>
  ),
);
MatchMetadataSection.displayName = 'MatchMetadataSection';

interface HeroPickerSectionProps {
  heroQuery: string;
  onHeroQueryChange: (value: string) => void;
  onRoleFilterChange: (role: HeroRoleFilter) => void;
  onToggleHero: (heroId: string) => void;
  onTogglePicker: () => void;
  roleFilter: HeroRoleFilter;
  selectedHeroes: string[];
  showHeroPicker: boolean;
}

const HeroPickerSection = memo(
  ({
    heroQuery,
    onHeroQueryChange,
    onRoleFilterChange,
    onToggleHero,
    onTogglePicker,
    roleFilter,
    selectedHeroes,
    showHeroPicker,
  }: HeroPickerSectionProps) => {
    const selectedHeroSet = useMemo(() => new Set(selectedHeroes), [selectedHeroes]);
    const deferredHeroQuery = useDeferredValue(heroQuery);
    const selectedHeroLabel = useMemo(
      () =>
        selectedHeroes.length > 0
          ? selectedHeroes.map((heroId) => getHeroLabel(heroId)).join(', ')
          : '없음',
      [selectedHeroes],
    );
    const selectedHeroOptions = useMemo(
      () =>
        selectedHeroes.map((heroId) => heroOptionById.get(heroId)).filter(Boolean) as HeroOption[],
      [selectedHeroes],
    );
    const heroGroups = useMemo(() => {
      const query = deferredHeroQuery.trim().toLowerCase();
      const roleMatchesFilter = (hero: SearchableHeroOption) =>
        roleFilter === 'all' || hero.role === roleFilter;
      const queryMatchesFilter = (hero: SearchableHeroOption) =>
        query.length === 0 || hero.searchText.includes(query);

      return heroRoleOrder
        .map((role) => ({
          heroes: searchableHeroOptions.filter(
            (hero) => hero.role === role && roleMatchesFilter(hero) && queryMatchesFilter(hero),
          ),
          role,
        }))
        .filter((group) => group.heroes.length > 0);
    }, [deferredHeroQuery, roleFilter]);

    return (
      <section className="ow-panel-cap rounded-[3px] border border-border bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left sm:px-4"
          aria-expanded={showHeroPicker}
          onClick={onTogglePicker}
        >
          <div className="min-w-0">
            <p className="metric-label">영웅 선택</p>
            <p className="mt-1 truncate text-sm font-bold">{selectedHeroLabel}</p>
          </div>
          {showHeroPicker ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {selectedHeroes.length > 0 ? (
          <div className="mobile-scroll flex gap-2 overflow-x-auto border-t border-border/70 px-3 py-3 sm:px-4">
            {selectedHeroOptions.map((hero) => (
              <SelectedHeroToken key={hero.value} hero={hero} onToggleHero={onToggleHero} />
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
                    aria-pressed={roleFilter === option.value}
                    data-role={option.value}
                    className={cn(
                      'ow-role-filter inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] border px-2.5 text-xs font-bold transition-colors',
                      roleFilter === option.value
                        ? 'text-white'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                    )}
                    onClick={() => onRoleFilterChange(option.value)}
                  >
                    {option.value !== 'all' ? (
                      <MatchRoleIcon className="h-3.5 w-3.5" role={option.value} />
                    ) : null}
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="영웅 검색"
                  className="pl-9"
                  placeholder="영웅 검색"
                  value={heroQuery}
                  onChange={(event) => onHeroQueryChange(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-[3px] border border-border bg-[hsl(var(--surface-3))] p-2.5">
              {heroGroups.length > 0 ? (
                heroGroups.map((group) => (
                  <section key={group.role} className="deferred-render">
                    <div className="mb-1.5 flex items-center gap-2 px-1">
                      <MatchRoleIcon className="h-3.5 w-3.5" role={group.role} />
                      <p className="text-xs font-black text-foreground">{roleLabels[group.role]}</p>
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {group.heroes.length}
                      </span>
                    </div>
                    <div className="hero-select-grid">
                      {group.heroes.map((hero) => (
                        <HeroPortraitButton
                          key={hero.value}
                          hero={hero}
                          selected={selectedHeroSet.has(hero.value)}
                          onToggleHero={onToggleHero}
                        />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="flex min-h-28 items-center justify-center rounded-[3px] border border-dashed border-border bg-card px-4 text-sm font-semibold text-muted-foreground">
                  검색 결과 없음
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    );
  },
);
HeroPickerSection.displayName = 'HeroPickerSection';

interface HeroPortraitButtonProps {
  hero: SearchableHeroOption;
  onToggleHero: (heroId: string) => void;
  selected: boolean;
}

const HeroPortraitButton = memo(({ hero, onToggleHero, selected }: HeroPortraitButtonProps) => {
  const handleClick = useCallback(() => onToggleHero(hero.value), [hero.value, onToggleHero]);

  return (
    <button
      type="button"
      aria-label={`${hero.label} ${selected ? '선택 해제' : '선택'}`}
      aria-pressed={selected}
      className="hero-picker-button hero-select-button group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      data-role={hero.role}
      title={hero.label}
      onClick={handleClick}
    >
      <span className="hero-select-shell">
        <span className="hero-select-card block">
          <span className="relative block aspect-square overflow-hidden">
            <DeferredImage
              alt=""
              className="hero-select-image h-full w-full object-cover"
              decoding="async"
              height={256}
              loading="lazy"
              rootMargin="360px"
              src={getHeroPortraitPath(hero.value)}
              width={256}
            />
            {selected ? (
              <span className="hero-select-check">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            ) : null}
          </span>
          <span className="hero-select-name min-w-0">
            <span className="block min-w-0 truncate text-center text-[9px] font-black leading-none sm:text-[10px]">
              {hero.label}
            </span>
          </span>
        </span>
      </span>
    </button>
  );
});
HeroPortraitButton.displayName = 'HeroPortraitButton';

interface SelectedHeroTokenProps {
  hero: HeroOption;
  onToggleHero: (heroId: string) => void;
}

const SelectedHeroToken = memo(({ hero, onToggleHero }: SelectedHeroTokenProps) => {
  const handleRemove = useCallback(() => onToggleHero(hero.value), [hero.value, onToggleHero]);

  return (
    <span className="inline-flex h-9 shrink-0 items-center overflow-hidden rounded-[3px] border border-border bg-secondary/60 pr-1 text-foreground">
      <DeferredImage
        alt=""
        className="h-9 w-9 object-cover"
        decoding="async"
        eager
        height={36}
        src={getHeroPortraitPath(hero.value)}
        width={36}
      />
      <span className="max-w-28 truncate px-2 text-xs font-black">{hero.label}</span>
      <button
        type="button"
        aria-label={`${hero.label} 제거`}
        className="grid h-7 w-7 place-items-center rounded-sm text-primary transition-colors hover:bg-primary/10"
        onClick={handleRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
});
SelectedHeroToken.displayName = 'SelectedHeroToken';

interface ScoreStepperProps {
  label: string;
  onAdjust: (delta: number) => void;
  onChange: (value: string) => void;
  value: string;
}

const ScoreStepper = ({ label, onAdjust, onChange, value }: ScoreStepperProps) => (
  <div>
    <p className="mb-2 text-center text-xs font-bold text-white/60">{label}</p>
    <div className="grid grid-cols-[34px_minmax(0,1fr)_34px] overflow-hidden rounded-[3px] border border-white/20 bg-card">
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
