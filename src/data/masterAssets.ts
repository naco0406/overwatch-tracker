import type { HeroOption, MapOption } from '@/data/matchOptions';
import type { ModeId } from '@/types/match';

export const getHeroPortraitPath = (heroId: HeroOption['value']) =>
  `/assets/overwatch/heroes/${heroId}.png`;

export const getMapScreenshotPath = (mapId: MapOption['value']) =>
  `/assets/overwatch/maps/${mapId}.jpg`;

export const getModeIconPath = (modeId: ModeId) => `/assets/overwatch/modes/${modeId}.svg`;

export const getRoleIconPath = (role: HeroOption['role']) => `/assets/overwatch/roles/${role}.svg`;
