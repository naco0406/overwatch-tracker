import {
  getHeroLabel,
  getMapLabel,
  getModeLabel,
  getOptionLabel,
  heroOptions,
  mapOptions,
  modeOptions,
  queueOptions,
  resultOptions,
} from '@/data/matchOptions';
import type { Match, MatchCreateInput, MatchResult, MatchSource, QueueType } from '@/types/match';
import type { PlayerAccount } from '@/types/playerAccount';
import { getPlayerAccountLabel } from '@/types/playerAccount';

const csvColumns = [
  'played_at',
  'mode_id',
  'mode',
  'map_id',
  'map',
  'team_score',
  'enemy_score',
  'result',
  'queue_type',
  'account_id',
  'account_label',
  'heroes',
  'source',
] as const;

const sourceValues = new Set<MatchSource>(['manual', 'mixed', 'ocr']);

const headerAliases = {
  account: ['account_id', 'account', 'account_label', 'battle_tag', 'battletag', '계정'],
  enemyScore: ['enemy_score', 'enemy', 'opponent_score', '상대', '상대점수'],
  heroes: ['heroes', 'my_heroes', 'hero', '영웅'],
  map: ['map_id', 'map', 'mapid', '전장', '맵'],
  mode: ['mode_id', 'mode', 'modeid', '모드'],
  playedAt: ['played_at', 'playedat', 'date', 'datetime', 'time', '날짜', '시간'],
  queueType: ['queue_type', 'queue', 'queue_type_id', '큐'],
  result: ['result', '결과', '승패'],
  source: ['source', '입력방식'],
  teamScore: ['team_score', 'team', 'our_score', 'ours', '우리', '우리점수'],
} as const;

export interface MatchCsvIssue {
  message: string;
  row: number;
}

export interface ParsedMatchCsv {
  issues: MatchCsvIssue[];
  matches: MatchCreateInput[];
}

const stripBom = (value: string) => value.replace(/^\uFEFF/, '');

const normalizeToken = (value: string) => stripBom(value).trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeHeader = (value: string) =>
  stripBom(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const createOptionLookup = <TOption extends { label: string; value: string }>(
  options: TOption[],
) => {
  const lookup = new Map<string, TOption>();

  for (const option of options) {
    lookup.set(normalizeToken(option.value), option);
    lookup.set(normalizeToken(option.label), option);
  }

  return lookup;
};

const mapLookup = createOptionLookup(mapOptions);
const modeLookup = createOptionLookup(modeOptions);
const queueLookup = createOptionLookup(queueOptions);
const resultLookup = createOptionLookup(resultOptions);
const heroLookup = createOptionLookup(heroOptions);

const parseCsvRows = (text: string) => {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';

      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((cells) => cells.some((value) => value.trim().length > 0));
};

const getColumnIndex = (headers: string[]) => {
  const indexByHeader = new Map<string, number>();

  headers.forEach((header, index) => {
    indexByHeader.set(normalizeHeader(header), index);
  });

  return indexByHeader;
};

const getCell = (row: string[], indexByHeader: Map<string, number>, aliases: readonly string[]) => {
  for (const alias of aliases) {
    const index = indexByHeader.get(normalizeHeader(alias));

    if (index !== undefined) {
      return row[index]?.trim() ?? '';
    }
  }

  return '';
};

const parseScore = (value: string) => {
  const score = Number(value);

  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return null;
  }

  return score;
};

const inferResult = (teamScore: number, enemyScore: number): MatchResult => {
  if (teamScore > enemyScore) return 'win';
  if (teamScore < enemyScore) return 'loss';
  return 'draw';
};

const parsePlayedAt = (value: string) => {
  if (!value.trim()) {
    return new Date().toISOString();
  }

  const normalized = value.trim().replace(' ', 'T');
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const parseHeroes = (value: string) =>
  value
    .split(/[;|]/)
    .map((hero) => hero.trim())
    .filter(Boolean)
    .map((hero) => heroLookup.get(normalizeToken(hero))?.value)
    .filter((hero): hero is string => Boolean(hero));

const resolveAccount = (value: string, accounts: PlayerAccount[]) => {
  const normalized = normalizeToken(value);

  if (!normalized) {
    return null;
  }

  return (
    accounts.find((account) =>
      [
        account.id,
        account.battleTag,
        account.displayName ?? '',
        getPlayerAccountLabel(account),
      ].some((candidate) => normalizeToken(candidate) === normalized),
    ) ?? null
  );
};

export const parseMatchesCsv = (text: string, accounts: PlayerAccount[] = []): ParsedMatchCsv => {
  const rows = parseCsvRows(text);
  const issues: MatchCsvIssue[] = [];

  if (rows.length < 2) {
    return {
      issues: [{ message: '헤더와 최소 1개의 데이터 행이 필요합니다.', row: 1 }],
      matches: [],
    };
  }

  const indexByHeader = getColumnIndex(rows[0]);
  const matches: MatchCreateInput[] = [];

  rows.slice(1).forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const rowIssues: string[] = [];
    const rawMap = getCell(row, indexByHeader, headerAliases.map);
    const rawMode = getCell(row, indexByHeader, headerAliases.mode);
    const rawTeamScore = getCell(row, indexByHeader, headerAliases.teamScore);
    const rawEnemyScore = getCell(row, indexByHeader, headerAliases.enemyScore);
    const rawResult = getCell(row, indexByHeader, headerAliases.result);
    const rawQueueType = getCell(row, indexByHeader, headerAliases.queueType);
    const rawPlayedAt = getCell(row, indexByHeader, headerAliases.playedAt);
    const rawAccount = getCell(row, indexByHeader, headerAliases.account);
    const rawHeroes = getCell(row, indexByHeader, headerAliases.heroes);
    const rawSource = getCell(row, indexByHeader, headerAliases.source);
    const map = mapLookup.get(normalizeToken(rawMap));
    const mode = rawMode ? modeLookup.get(normalizeToken(rawMode)) : null;
    const teamScore = parseScore(rawTeamScore);
    const enemyScore = parseScore(rawEnemyScore);
    const result = rawResult ? resultLookup.get(normalizeToken(rawResult))?.value : null;
    const queueType = rawQueueType ? queueLookup.get(normalizeToken(rawQueueType))?.value : 'solo';
    const playedAt = parsePlayedAt(rawPlayedAt);
    const source = sourceValues.has(rawSource as MatchSource)
      ? (rawSource as MatchSource)
      : 'manual';
    const account = resolveAccount(rawAccount, accounts);

    if (!map) rowIssues.push('맵을 찾을 수 없습니다.');
    if (mode && map && mode.value !== map.modeId) rowIssues.push('맵과 모드가 일치하지 않습니다.');
    if (!mode && rawMode) rowIssues.push('모드를 찾을 수 없습니다.');
    if (teamScore === null) rowIssues.push('우리 점수는 0~10 사이의 정수여야 합니다.');
    if (enemyScore === null) rowIssues.push('상대 점수는 0~10 사이의 정수여야 합니다.');
    if (rawResult && !result) rowIssues.push('결과 값을 찾을 수 없습니다.');
    if (!queueType) rowIssues.push('큐 값을 찾을 수 없습니다.');
    if (!playedAt) rowIssues.push('플레이 시간을 해석할 수 없습니다.');

    if (rowIssues.length > 0 || !map || teamScore === null || enemyScore === null || !playedAt) {
      rowIssues.forEach((message) => issues.push({ message, row: rowNumber }));
      return;
    }

    matches.push({
      account: account?.isMain === false ? 'sub' : 'main',
      accountId: account?.id ?? null,
      enemyScore,
      mapId: map.value,
      memo: '',
      modeId: map.modeId,
      myHeroes: parseHeroes(rawHeroes),
      playedAt,
      queueType: (queueType ?? 'solo') as QueueType,
      result: (result ?? inferResult(teamScore, enemyScore)) as MatchResult,
      source,
      tags: [],
      teamScore,
    });
  });

  return { issues, matches };
};

const escapeCsvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

export const buildMatchesCsv = (matches: Match[], accounts: PlayerAccount[] = []) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const rows = [
    csvColumns,
    ...matches.map((match) => {
      const account = accountById.get(match.accountId ?? '');

      return [
        match.playedAt,
        match.modeId,
        getModeLabel(match.modeId),
        match.mapId,
        getMapLabel(match.mapId),
        match.teamScore,
        match.enemyScore,
        match.result,
        getOptionLabel(queueOptions, match.queueType),
        match.accountId ?? '',
        account ? getPlayerAccountLabel(account) : '',
        match.myHeroes.map((heroId) => getHeroLabel(heroId)).join(';'),
        match.source,
      ];
    }),
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
};

export const createCsvFileName = () => {
  const date = new Date().toISOString().slice(0, 10);

  return `overwatch-matches-${date}.csv`;
};
