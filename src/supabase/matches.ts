import { createSessionId, shouldReuseSession } from '@/lib/session';
import { supabase } from '@/supabase/client';
import { getCurrentUserOrThrow } from '@/supabase/currentUser';
import type { Database, Json } from '@/supabase/database.types';
import type {
  Match,
  MatchCreateInput,
  MatchDateInput,
  MatchFilters,
  MatchSource,
  MatchUpdateInput,
  OcrConfidence,
  TeamComp,
} from '@/types/match';

type HeroInsert = Database['public']['Tables']['match_heroes']['Insert'];
type HeroRow = Database['public']['Tables']['match_heroes']['Row'];
type MatchInsert = Database['public']['Tables']['matches']['Insert'];
type MatchRow = Database['public']['Tables']['matches']['Row'];
type MatchUpdate = Database['public']['Tables']['matches']['Update'];
type MatchWithHeroesRow = MatchRow & { match_heroes: HeroRow[] };

const MATCHES_PAGE_SIZE = 200;

const toIsoString = (value?: MatchDateInput) => {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : value;
};

const jsonToObject = <T extends object>(value: Json | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as T;
};

const normalizeHeroIds = (heroIds: string[] = []) =>
  Array.from(new Set(heroIds.map((heroId) => heroId.trim()).filter(Boolean)));

const rowToMatch = (row: MatchRow, heroRows: HeroRow[] = []): Match => ({
  account: row.account,
  accountId: row.account_id,
  competitiveSeasonId: row.competitive_season_id,
  createdAt: row.created_at,
  enemyScore: row.enemy_score,
  id: row.id,
  mapId: row.map_id,
  memo: row.memo,
  modeId: row.mode_id,
  matchRole: row.match_role,
  myHeroes: [...heroRows].sort((a, b) => a.order_index - b.order_index).map((hero) => hero.hero_id),
  ocrConfidence: jsonToObject<OcrConfidence>(row.ocr_confidence),
  playedAt: row.played_at,
  queueType: row.queue_type,
  result: row.result,
  sessionId: row.session_id,
  source: row.source,
  tags: row.tags,
  teamComp: jsonToObject<TeamComp>(row.team_comp),
  teamScore: row.team_score,
  updatedAt: row.updated_at,
  userId: row.user_id,
});

const getMatchHeroes = async (userId: string, matchId: string) => {
  const { data, error } = await supabase
    .from('match_heroes')
    .select('*')
    .eq('user_id', userId)
    .eq('match_id', matchId)
    .order('order_index', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

const getMatchRowOrThrow = async (userId: string, matchId: string) => {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('user_id', userId)
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('경기를 찾을 수 없습니다.');
  }

  return data;
};

const resolveSessionId = async (userId: string, playedAt: string) => {
  const { data, error } = await supabase
    .from('matches')
    .select('played_at, session_id')
    .eq('user_id', userId)
    .lte('played_at', playedAt)
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('session_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data && shouldReuseSession(data.played_at, playedAt)) {
    return data.session_id;
  }

  return createSessionId(playedAt);
};

const replaceMatchHeroes = async ({
  heroIds,
  matchId,
  source,
  userId,
}: {
  heroIds: string[];
  matchId: string;
  source: MatchSource;
  userId: string;
}) => {
  const { error: deleteError } = await supabase
    .from('match_heroes')
    .delete()
    .eq('user_id', userId)
    .eq('match_id', matchId);

  if (deleteError) {
    throw deleteError;
  }

  const rows: HeroInsert[] = normalizeHeroIds(heroIds).map((heroId, index) => ({
    hero_id: heroId,
    match_id: matchId,
    order_index: index,
    source,
    user_id: userId,
  }));

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from('match_heroes').insert(rows);

  if (insertError) {
    throw insertError;
  }
};

const buildMatchUpdate = (input: MatchUpdateInput) => {
  const update: MatchUpdate = {};
  const playedAt = toIsoString(input.playedAt);

  if (input.account !== undefined) update.account = input.account;
  if (input.accountId !== undefined) update.account_id = input.accountId;
  if (input.competitiveSeasonId !== undefined) {
    update.competitive_season_id = input.competitiveSeasonId;
  }
  if (input.enemyScore !== undefined) update.enemy_score = input.enemyScore;
  if (input.mapId !== undefined) update.map_id = input.mapId;
  if (input.memo !== undefined) update.memo = input.memo;
  if (input.modeId !== undefined) update.mode_id = input.modeId;
  if (input.matchRole !== undefined) update.match_role = input.matchRole;
  if (input.ocrConfidence !== undefined) update.ocr_confidence = input.ocrConfidence as Json | null;
  if (playedAt !== undefined) update.played_at = playedAt;
  if (input.queueType !== undefined) update.queue_type = input.queueType;
  if (input.result !== undefined) update.result = input.result;
  if (input.sessionId !== undefined) update.session_id = input.sessionId;
  if (input.source !== undefined) update.source = input.source;
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.teamComp !== undefined) update.team_comp = input.teamComp as Json | null;
  if (input.teamScore !== undefined) update.team_score = input.teamScore;

  return update;
};

export const listMatches = async (filters: MatchFilters = {}) => {
  const user = await getCurrentUserOrThrow();
  const matchRows: MatchWithHeroesRow[] = [];
  let pageStart = 0;

  while (true) {
    let query = supabase
      .from('matches')
      .select('*, match_heroes(*)')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (filters.account) query = query.eq('account', filters.account);
    if (filters.accountId) query = query.eq('account_id', filters.accountId);
    if (filters.competitiveSeasonId) {
      query = query.eq('competitive_season_id', filters.competitiveSeasonId);
    }
    if (filters.mapId) query = query.eq('map_id', filters.mapId);
    if (filters.matchRole) query = query.eq('match_role', filters.matchRole);
    if (filters.modeId) query = query.eq('mode_id', filters.modeId);
    if (filters.playedFrom) {
      query = query.gte('played_at', toIsoString(filters.playedFrom) ?? '');
    }
    if (filters.playedTo) query = query.lte('played_at', toIsoString(filters.playedTo) ?? '');
    if (filters.queueType) query = query.eq('queue_type', filters.queueType);
    if (filters.sessionId) query = query.eq('session_id', filters.sessionId);

    const { data, error } = await query.range(pageStart, pageStart + MATCHES_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const pageRows = data ?? [];
    matchRows.push(...pageRows);

    if (pageRows.length < MATCHES_PAGE_SIZE) {
      break;
    }

    pageStart += MATCHES_PAGE_SIZE;
  }

  const matches = matchRows.map(({ match_heroes: heroRows, ...match }) =>
    rowToMatch(match, heroRows),
  );

  if (!filters.heroId) {
    return matches;
  }

  return matches.filter((match) => match.myHeroes.includes(filters.heroId as string));
};

export const getMatch = async (matchId: string) => {
  const user = await getCurrentUserOrThrow();
  const match = await getMatchRowOrThrow(user.id, matchId);
  const heroRows = await getMatchHeroes(user.id, match.id);

  return rowToMatch(match, heroRows);
};

export const createMatch = async (input: MatchCreateInput) => {
  const user = await getCurrentUserOrThrow();
  const playedAt = toIsoString(input.playedAt) ?? new Date().toISOString();
  const sessionId = input.sessionId ?? (await resolveSessionId(user.id, playedAt));
  const source = input.source ?? 'manual';

  const row: MatchInsert = {
    account: input.account ?? 'main',
    account_id: input.accountId ?? null,
    competitive_season_id: input.competitiveSeasonId ?? null,
    enemy_score: input.enemyScore,
    map_id: input.mapId,
    memo: input.memo ?? '',
    mode_id: input.modeId,
    match_role: input.matchRole ?? 'damage',
    ocr_confidence: input.ocrConfidence as Json | null | undefined,
    played_at: playedAt,
    queue_type: input.queueType ?? 'solo',
    result: input.result,
    session_id: sessionId,
    source,
    tags: input.tags ?? [],
    team_comp: input.teamComp as Json | null | undefined,
    team_score: input.teamScore,
    user_id: user.id,
  };

  const { data, error } = await supabase.from('matches').insert(row).select('*').single();

  if (error) {
    throw error;
  }

  try {
    await replaceMatchHeroes({
      heroIds: input.myHeroes ?? [],
      matchId: data.id,
      source,
      userId: user.id,
    });
  } catch (insertHeroesError) {
    await supabase.from('matches').delete().eq('user_id', user.id).eq('id', data.id);
    throw insertHeroesError;
  }

  const heroRows = await getMatchHeroes(user.id, data.id);

  return rowToMatch(data, heroRows);
};

export const updateMatch = async (input: MatchUpdateInput) => {
  const user = await getCurrentUserOrThrow();
  let match = await getMatchRowOrThrow(user.id, input.id);
  const update = buildMatchUpdate(input);

  if (Object.keys(update).length > 0) {
    const { data, error } = await supabase
      .from('matches')
      .update(update)
      .eq('user_id', user.id)
      .eq('id', input.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    match = data;
  }

  if (input.myHeroes !== undefined) {
    await replaceMatchHeroes({
      heroIds: input.myHeroes,
      matchId: input.id,
      source: input.source ?? match.source,
      userId: user.id,
    });
  }

  const heroRows = await getMatchHeroes(user.id, match.id);

  return rowToMatch(match, heroRows);
};

export const deleteMatch = async (matchId: string) => {
  const user = await getCurrentUserOrThrow();
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('user_id', user.id)
    .eq('id', matchId);

  if (error) {
    throw error;
  }
};
