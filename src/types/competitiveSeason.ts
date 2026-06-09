export interface CompetitiveSeason {
  displayName: string;
  endsAt: string;
  id: string;
  seasonNumber: number;
  startsAt: string;
  year: number;
}

export type SeasonFilterValue = 'all' | 'current' | 'unassigned' | string;

export const getCompetitiveSeasonLabel = (seasons: CompetitiveSeason[], seasonId?: string | null) =>
  seasons.find((season) => season.id === seasonId)?.displayName ?? '시즌 미지정';

export const getCurrentCompetitiveSeason = (
  seasons: CompetitiveSeason[],
  now: Date = new Date(),
) => {
  const timestamp = now.getTime();

  return (
    seasons.find((season) => {
      const startsAt = new Date(season.startsAt).getTime();
      const endsAt = new Date(season.endsAt).getTime();

      return timestamp >= startsAt && timestamp < endsAt;
    }) ?? null
  );
};

export const getSeasonFilterLabel = (
  seasons: CompetitiveSeason[],
  value: SeasonFilterValue,
  currentSeasonId?: string | null,
) => {
  if (value === 'all') return '전체 시즌';
  if (value === 'current') {
    const currentSeason = seasons.find((season) => season.id === currentSeasonId);

    return currentSeason ? `현재 시즌 · ${currentSeason.displayName}` : '현재 시즌';
  }
  if (value === 'unassigned') return '시즌 미지정';

  return getCompetitiveSeasonLabel(seasons, value);
};
