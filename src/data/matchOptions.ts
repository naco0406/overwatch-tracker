import type { AccountType, MatchResult, MatchRole, ModeId, QueueType } from '@/types/match';

export interface MatchOption<TValue extends string = string> {
  label: string;
  value: TValue;
}

export interface HeroOption extends MatchOption {
  role: 'damage' | 'support' | 'tank';
}

export interface MapOption extends MatchOption {
  modeId: ModeId;
}

export const modeOptions = [
  { label: '쟁탈', value: 'control' },
  { label: '혼합', value: 'hybrid' },
  { label: '밀기', value: 'push' },
  { label: '호위', value: 'escort' },
  { label: '플래시포인트', value: 'flashpoint' },
] satisfies MatchOption<ModeId>[];

const legacyModeOptions = [{ label: '격돌', value: 'clash' }] satisfies MatchOption<ModeId>[];

export const resultOptions = [
  { label: '승리', value: 'win' },
  { label: '패배', value: 'loss' },
  { label: '무승부', value: 'draw' },
] satisfies MatchOption<MatchResult>[];

export const roleOptions = [
  { label: '전체', value: 'all' },
  { label: '탱커', value: 'tank' },
  { label: '딜러', value: 'damage' },
  { label: '지원', value: 'support' },
] as const;

export type HeroRoleFilter = (typeof roleOptions)[number]['value'];

export const roleLabels = {
  damage: '딜러',
  support: '지원',
  tank: '탱커',
} as const;

export const matchRoleOptions = [
  { label: roleLabels.tank, value: 'tank' },
  { label: roleLabels.damage, value: 'damage' },
  { label: roleLabels.support, value: 'support' },
] satisfies MatchOption<MatchRole>[];

export const matchRoleFilterOptions = [
  { label: '전체', value: 'all' },
  ...matchRoleOptions,
] as const;

export type MatchRoleFilter = (typeof matchRoleFilterOptions)[number]['value'];

const drawEnabledModes = new Set<ModeId>(['escort', 'hybrid']);

export const modeAllowsDraw = (modeId: ModeId) => drawEnabledModes.has(modeId);

export const getResultOptionsForMode = (modeId: ModeId) =>
  modeAllowsDraw(modeId)
    ? resultOptions
    : resultOptions.filter((option) => option.value !== 'draw');

export const accountOptions = [
  { label: '본계', value: 'main' },
  { label: '부계', value: 'sub' },
] satisfies MatchOption<AccountType>[];

export const queueOptions = [
  { label: '솔로', value: 'solo' },
  { label: '듀오', value: 'duo' },
  { label: '트리오', value: 'trio' },
  { label: '4인', value: 'quad' },
  { label: '5인', value: 'five' },
] satisfies MatchOption<QueueType>[];

export const mapOptions = [
  { label: '남극 반도', modeId: 'control', value: 'antarctic-peninsula' },
  { label: '부산', modeId: 'control', value: 'busan' },
  { label: '일리오스', modeId: 'control', value: 'ilios' },
  { label: '리장 타워', modeId: 'control', value: 'lijiang-tower' },
  { label: '네팔', modeId: 'control', value: 'nepal' },
  { label: '오아시스', modeId: 'control', value: 'oasis' },
  { label: '사모아', modeId: 'control', value: 'samoa' },
  { label: '블리자드 월드', modeId: 'hybrid', value: 'blizzard-world' },
  { label: '아이헨발데', modeId: 'hybrid', value: 'eichenwalde' },
  { label: '할리우드', modeId: 'hybrid', value: 'hollywood' },
  { label: '왕의 길', modeId: 'hybrid', value: 'kings-row' },
  { label: '미드타운', modeId: 'hybrid', value: 'midtown' },
  { label: '눔바니', modeId: 'hybrid', value: 'numbani' },
  { label: '파라이수', modeId: 'hybrid', value: 'paraiso' },
  { label: '콜로세오', modeId: 'push', value: 'colosseo' },
  { label: '이스페란사', modeId: 'push', value: 'esperanca' },
  { label: '뉴 퀸 스트리트', modeId: 'push', value: 'new-queen-street' },
  { label: '루나사피', modeId: 'push', value: 'runasapi' },
  { label: '서킷 로얄', modeId: 'escort', value: 'circuit-royal' },
  { label: '도라도', modeId: 'escort', value: 'dorado' },
  { label: '하바나', modeId: 'escort', value: 'havana' },
  { label: '쓰레기촌', modeId: 'escort', value: 'junkertown' },
  { label: '리알토', modeId: 'escort', value: 'rialto' },
  { label: '66번 국도', modeId: 'escort', value: 'route-66' },
  { label: '샴발리 수도원', modeId: 'escort', value: 'shambali-monastery' },
  { label: '감시 기지: 지브롤터', modeId: 'escort', value: 'watchpoint-gibraltar' },
  { label: '아틀리스', modeId: 'flashpoint', value: 'aatlis' },
  { label: '네온 정션', modeId: 'flashpoint', value: 'neon-junction' },
  { label: '뉴 정크 시티', modeId: 'flashpoint', value: 'new-junk-city' },
  { label: '수라바사', modeId: 'flashpoint', value: 'suravasa' },
] satisfies MapOption[];

const legacyMapOptions = [
  { label: '하나오카', modeId: 'clash', value: 'hanaoka' },
  { label: '아누비스의 왕좌', modeId: 'clash', value: 'throne-of-anubis' },
] satisfies MapOption[];

export const heroOptions = [
  { label: 'D.Va', role: 'tank', value: 'dva' },
  { label: '둠피스트', role: 'tank', value: 'doomfist' },
  { label: '도미나', role: 'tank', value: 'domina' },
  { label: '해저드', role: 'tank', value: 'hazard' },
  { label: '정커퀸', role: 'tank', value: 'junker-queen' },
  { label: '마우가', role: 'tank', value: 'mauga' },
  { label: '오리사', role: 'tank', value: 'orisa' },
  { label: '라마트라', role: 'tank', value: 'ramattra' },
  { label: '라인하르트', role: 'tank', value: 'reinhardt' },
  { label: '로드호그', role: 'tank', value: 'roadhog' },
  { label: '시그마', role: 'tank', value: 'sigma' },
  { label: '윈스턴', role: 'tank', value: 'winston' },
  { label: '레킹볼', role: 'tank', value: 'wrecking-ball' },
  { label: '자리야', role: 'tank', value: 'zarya' },
  { label: '안란', role: 'damage', value: 'anran' },
  { label: '애쉬', role: 'damage', value: 'ashe' },
  { label: '바스티온', role: 'damage', value: 'bastion' },
  { label: '캐서디', role: 'damage', value: 'cassidy' },
  { label: '에코', role: 'damage', value: 'echo' },
  { label: '엠레', role: 'damage', value: 'emre' },
  { label: '프레야', role: 'damage', value: 'freja' },
  { label: '겐지', role: 'damage', value: 'genji' },
  { label: '한조', role: 'damage', value: 'hanzo' },
  { label: '정크랫', role: 'damage', value: 'junkrat' },
  { label: '메이', role: 'damage', value: 'mei' },
  { label: '파라', role: 'damage', value: 'pharah' },
  { label: '리퍼', role: 'damage', value: 'reaper' },
  { label: '시에라', role: 'damage', value: 'sierra' },
  { label: '시온', role: 'damage', value: 'shion' },
  { label: '소전', role: 'damage', value: 'sojourn' },
  { label: '솔저: 76', role: 'damage', value: 'soldier-76' },
  { label: '솜브라', role: 'damage', value: 'sombra' },
  { label: '시메트라', role: 'damage', value: 'symmetra' },
  { label: '토르비욘', role: 'damage', value: 'torbjorn' },
  { label: '트레이서', role: 'damage', value: 'tracer' },
  { label: '벤데타', role: 'damage', value: 'vendetta' },
  { label: '벤처', role: 'damage', value: 'venture' },
  { label: '위도우메이커', role: 'damage', value: 'widowmaker' },
  { label: '아나', role: 'support', value: 'ana' },
  { label: '바티스트', role: 'support', value: 'baptiste' },
  { label: '브리기테', role: 'support', value: 'brigitte' },
  { label: '일리아리', role: 'support', value: 'illari' },
  { label: '제트팩 캣', role: 'support', value: 'jetpack-cat' },
  { label: '주노', role: 'support', value: 'juno' },
  { label: '키리코', role: 'support', value: 'kiriko' },
  { label: '라이프위버', role: 'support', value: 'lifeweaver' },
  { label: '루시우', role: 'support', value: 'lucio' },
  { label: '메르시', role: 'support', value: 'mercy' },
  { label: '미즈키', role: 'support', value: 'mizuki' },
  { label: '모이라', role: 'support', value: 'moira' },
  { label: '우양', role: 'support', value: 'wuyang' },
  { label: '젠야타', role: 'support', value: 'zenyatta' },
] satisfies HeroOption[];

export const getOptionLabel = <TValue extends string>(
  options: MatchOption<TValue>[],
  value: TValue | string | undefined,
) => options.find((option) => option.value === value)?.label ?? value ?? '-';

const modeLabelOptions = [...modeOptions, ...legacyModeOptions];
const mapLabelOptions = [...mapOptions, ...legacyMapOptions];

export const getMapLabel = (mapId: string | undefined) => getOptionLabel(mapLabelOptions, mapId);

export const getModeLabel = (modeId: ModeId | undefined) =>
  getOptionLabel(modeLabelOptions, modeId);

export const getHeroLabel = (heroId: string | undefined) => getOptionLabel(heroOptions, heroId);

export const getMatchRoleLabel = (role: MatchRole | undefined) =>
  getOptionLabel(matchRoleOptions, role);

export const getResultLabel = (result: MatchResult | undefined) =>
  getOptionLabel(resultOptions, result);
