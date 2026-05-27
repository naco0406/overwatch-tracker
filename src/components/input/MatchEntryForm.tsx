import { zodResolver } from '@hookform/resolvers/zod';
import { RotateCcw, Save, X } from 'lucide-react';
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
  roleLabels,
  roleOptions,
  type HeroRoleFilter,
} from '@/data/matchOptions';
import { cn } from '@/lib/utils';
import type { MatchCreateInput } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';
import type { UserSettings } from '@/types/userSettings';

const scoreSchema = z.string().refine((value) => {
  const score = Number(value);

  return Number.isInteger(score) && score >= 0 && score <= 10;
}, '0~10 사이의 정수를 입력하세요.');

const matchEntrySchema = z.object({
  enemyScore: scoreSchema,
  mapId: z.string().min(1, '맵을 선택하세요.'),
  memo: z.string().max(500, '메모는 500자 이하로 입력하세요.'),
  modeId: z.enum(['control', 'hybrid', 'push', 'escort', 'flashpoint', 'clash']),
  playedAt: z.string().min(1, '플레이 시간을 입력하세요.'),
  queueType: z.enum(['solo', 'duo', 'trio', 'quad', 'five']),
  result: z.enum(['win', 'loss', 'draw']),
  tagsText: z.string(),
  teamScore: scoreSchema,
});

type MatchEntryFormValues = z.infer<typeof matchEntrySchema>;

interface MatchEntryFormProps {
  accounts?: PlayerAccount[];
  defaultSettings?: UserSettings;
  isSubmitting?: boolean;
  onSaved?: () => void;
  onSubmit: (input: MatchCreateInput) => Promise<void>;
  source?: MatchCreateInput['source'];
}

const toDatetimeLocalValue = (date = new Date()) => {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const splitTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const MatchEntryForm = ({
  accounts = [],
  defaultSettings,
  isSubmitting = false,
  onSaved,
  onSubmit,
  source = 'manual',
}: MatchEntryFormProps) => {
  const mainAccount = accounts.find((account) => account.isMain);
  const fallbackAccountId = mainAccount?.id ?? accounts[0]?.id ?? '';
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);
  const [heroError, setHeroError] = useState('');
  const [heroQuery, setHeroQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<HeroRoleFilter>('all');

  const form = useForm<MatchEntryFormValues>({
    defaultValues: {
      enemyScore: '0',
      mapId: '',
      memo: '',
      modeId: 'control',
      playedAt: toDatetimeLocalValue(),
      queueType: defaultSettings?.defaultQueueType ?? 'solo',
      result: 'win',
      tagsText: '',
      teamScore: '0',
    },
    resolver: zodResolver(matchEntrySchema),
  });

  const watchedModeId = useWatch({ control: form.control, name: 'modeId' });
  const watchedResult = useWatch({ control: form.control, name: 'result' });
  const watchedMapId = useWatch({ control: form.control, name: 'mapId' });

  const filteredMaps = useMemo(
    () => mapOptions.filter((map) => map.modeId === watchedModeId),
    [watchedModeId],
  );
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
  const availableResultOptions = getResultOptionsForMode(watchedModeId);
  const effectiveSelectedAccountId = selectedAccountId ?? fallbackAccountId;
  const selectedAccount = accounts.find((account) => account.id === effectiveSelectedAccountId);

  useEffect(() => {
    const currentMapIsAvailable = filteredMaps.some((map) => map.value === watchedMapId);

    if (!currentMapIsAvailable) {
      form.setValue('mapId', filteredMaps[0]?.value ?? '', { shouldValidate: true });
    }
  }, [filteredMaps, form, watchedMapId]);

  useEffect(() => {
    if (watchedResult === 'draw' && !modeAllowsDraw(watchedModeId)) {
      form.setValue('result', 'win', { shouldValidate: true });
    }
  }, [form, watchedModeId, watchedResult]);

  useEffect(() => {
    if (defaultSettings?.defaultQueueType) {
      form.setValue('queueType', defaultSettings.defaultQueueType);
    }
  }, [defaultSettings, form]);

  const toggleHero = (heroId: string) => {
    setHeroError('');
    setSelectedHeroes((current) =>
      current.includes(heroId)
        ? current.filter((selectedHero) => selectedHero !== heroId)
        : [...current, heroId],
    );
  };

  const resetForm = () => {
    form.reset({
      enemyScore: '0',
      mapId: filteredMaps[0]?.value ?? '',
      memo: '',
      modeId: watchedModeId,
      playedAt: toDatetimeLocalValue(),
      queueType: defaultSettings?.defaultQueueType ?? 'solo',
      result: 'win',
      tagsText: '',
      teamScore: '0',
    });
    setSelectedAccountId(null);
    setSelectedHeroes([]);
    setHeroError('');
    setHeroQuery('');
    setRoleFilter('all');
  };

  const submit = form.handleSubmit(async (values) => {
    if (selectedHeroes.length === 0) {
      setHeroError('영웅을 1명 이상 선택하세요.');
      return;
    }

    await onSubmit({
      account: selectedAccount?.isMain === false ? 'sub' : 'main',
      accountId: selectedAccount?.id ?? null,
      enemyScore: Number(values.enemyScore),
      mapId: values.mapId,
      memo: values.memo.trim(),
      modeId: values.modeId,
      myHeroes: selectedHeroes,
      playedAt: new Date(values.playedAt).toISOString(),
      queueType: values.queueType,
      result: values.result,
      source,
      tags: splitTags(values.tagsText),
      teamScore: Number(values.teamScore),
    });

    resetForm();
    onSaved?.();
  });

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <FormField
            control={form.control}
            name="playedAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>플레이 시간</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
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
                <div className="grid grid-cols-3 gap-1.5 md:grid-cols-1">
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

        <section className="space-y-3">
          <Label>계정</Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                'h-10 rounded-md border px-3 text-sm font-bold transition-colors',
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
                  'h-10 rounded-md border px-3 text-sm font-bold transition-colors',
                  effectiveSelectedAccountId === account.id && selectedAccountId !== ''
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                )}
                onClick={() => setSelectedAccountId(account.id)}
              >
                {getPlayerAccountLabel(account)}
                {account.isMain ? ' · 본계' : ''}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <Label>모드</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'h-11 rounded-md border px-3 text-sm font-bold transition-colors',
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
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label>맵</Label>
            <span className="text-xs font-semibold text-muted-foreground">
              {getModeLabel(watchedModeId)}
            </span>
          </div>
          <div className="grid max-h-52 gap-2 overflow-y-auto rounded-lg border border-border bg-card p-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMaps.map((map) => (
              <button
                key={map.value}
                type="button"
                className={cn(
                  'min-h-10 rounded-md border px-3 py-2 text-left text-sm font-bold transition-colors',
                  watchedMapId === map.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-secondary',
                )}
                onClick={() => form.setValue('mapId', map.value, { shouldValidate: true })}
              >
                {map.label}
              </button>
            ))}
          </div>
          {form.formState.errors.mapId ? (
            <p className="text-sm font-medium text-destructive">
              {form.formState.errors.mapId.message}
            </p>
          ) : null}
        </section>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Label>결과</Label>
              {!modeAllowsDraw(watchedModeId) ? (
                <span className="text-xs font-semibold text-muted-foreground">무승부 없음</span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availableResultOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'h-12 rounded-md border text-sm font-bold transition-colors',
                    watchedResult === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                  )}
                  onClick={() => form.setValue('result', option.value, { shouldValidate: true })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <Label>스코어</Label>
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
              <FormField
                control={form.control}
                name="teamScore"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        className="text-center text-lg font-bold"
                        inputMode="numeric"
                        max={10}
                        min={0}
                        type="number"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="pt-3 text-sm font-bold text-muted-foreground">:</div>
              <FormField
                control={form.control}
                name="enemyScore"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        className="text-center text-lg font-bold"
                        inputMode="numeric"
                        max={10}
                        min={0}
                        type="number"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <Label>영웅</Label>
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
            </div>
            <Input
              className="sm:w-56"
              placeholder="영웅 검색"
              value={heroQuery}
              onChange={(event) => setHeroQuery(event.target.value)}
            />
          </div>

          <div className="grid max-h-52 gap-2 overflow-y-auto rounded-lg border border-border bg-card p-2 sm:grid-cols-2 lg:grid-cols-3">
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
                      : 'border-border bg-background text-foreground hover:bg-secondary',
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

          {selectedHeroes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
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
          {heroError ? <p className="text-sm font-medium text-destructive">{heroError}</p> : null}
        </section>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <FormField
            control={form.control}
            name="memo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>메모</FormLabel>
                <FormControl>
                  <textarea
                    className="min-h-20 w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                    placeholder="짧게 기록"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tagsText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>태그</FormLabel>
                <FormControl>
                  <Input placeholder="멘탈, 리플레이" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="outline" onClick={resetForm}>
            <RotateCcw className="h-4 w-4" />
            초기화
          </Button>
          <Button disabled={isSubmitting} type="submit">
            <Save className="h-4 w-4" />
            {isSubmitting ? '저장 중' : '저장'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export { MatchEntryForm };
