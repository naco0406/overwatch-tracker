import type { ExternalEsportsEvent } from '@/types/externalData';
import type { FavoriteEsportsTeam } from '@/types/userSettings';

export interface ExternalEsportsTeamOption {
  aliases: string[];
  id: string;
  logoUrl: string | null;
  name: string;
  nextMatchAt: string | null;
  region: string | null;
  sourceId: string | null;
  totalCount: number;
  upcomingCount: number;
}

export type ExternalEsportsTeamSide = 'A' | 'B';

export const normalizeExternalEsportsTeamKey = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');

const getMetadataString = (event: ExternalEsportsEvent, key: string) => {
  const value = event.metadata?.[key];

  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

export const getExternalEsportsTeamLogoUrl = (
  event: ExternalEsportsEvent,
  side: ExternalEsportsTeamSide,
) => getMetadataString(event, side === 'A' ? 'teamALogoUrl' : 'teamBLogoUrl') || null;

export const getExternalEsportsTeamCode = (
  event: ExternalEsportsEvent,
  side: ExternalEsportsTeamSide,
) =>
  getMetadataString(event, side === 'A' ? 'teamAAbbreviation' : 'teamBAbbreviation') ||
  (side === 'A' ? event.teamA : event.teamB);

export const getExternalEsportsCompetitionLogoUrl = (event: ExternalEsportsEvent) =>
  getMetadataString(event, 'competitionLogoUrl');

const getExternalEsportsTeamAliases = (
  event: ExternalEsportsEvent,
  side: ExternalEsportsTeamSide,
) => {
  const name = side === 'A' ? event.teamA : event.teamB;
  const id = getMetadataString(event, side === 'A' ? 'teamAId' : 'teamBId');
  const slug = getMetadataString(event, side === 'A' ? 'teamASlug' : 'teamBSlug');
  const code = getExternalEsportsTeamCode(event, side);

  return [name, code, id, slug].filter((value): value is string => Boolean(value?.trim()));
};

const getExternalEsportsTeamId = (event: ExternalEsportsEvent, side: ExternalEsportsTeamSide) => {
  const id = getMetadataString(event, side === 'A' ? 'teamAId' : 'teamBId');
  const slug = getMetadataString(event, side === 'A' ? 'teamASlug' : 'teamBSlug');
  const name = side === 'A' ? event.teamA : event.teamB;

  return id || slug || normalizeExternalEsportsTeamKey(name);
};

export const createFavoriteEsportsTeam = (
  team: ExternalEsportsTeamOption,
): FavoriteEsportsTeam => ({
  aliases: team.aliases,
  id: team.id,
  logoUrl: team.logoUrl,
  name: team.name,
  region: team.region,
  selectedAt: new Date().toISOString(),
  sourceId: team.sourceId,
});

export const createExternalEsportsTeamOptions = (
  events: ExternalEsportsEvent[],
  now = Date.now(),
) => {
  const map = new Map<string, ExternalEsportsTeamOption>();

  events.forEach((event) => {
    (['A', 'B'] as const).forEach((side) => {
      const teamName = side === 'A' ? event.teamA : event.teamB;

      if (!teamName || teamName.toLowerCase() === 'tbd') {
        return;
      }

      const aliases = getExternalEsportsTeamAliases(event, side);
      const aliasKeys = aliases.map(normalizeExternalEsportsTeamKey).filter(Boolean);
      const id = getExternalEsportsTeamId(event, side);
      const key = id || aliasKeys[0];

      if (!key) {
        return;
      }

      const startsAt = event.startsAt ? new Date(event.startsAt).getTime() : null;
      const isUpcoming = startsAt !== null && !Number.isNaN(startsAt) && startsAt >= now;
      const current = map.get(key);
      const nextMatchAt =
        isUpcoming &&
        event.startsAt &&
        (!current?.nextMatchAt ||
          new Date(event.startsAt).getTime() < new Date(current.nextMatchAt).getTime())
          ? event.startsAt
          : (current?.nextMatchAt ?? null);

      map.set(key, {
        aliases: Array.from(new Set([...(current?.aliases ?? []), ...aliases, ...aliasKeys])),
        id: key,
        logoUrl: current?.logoUrl ?? getExternalEsportsTeamLogoUrl(event, side),
        name: current?.name ?? teamName,
        nextMatchAt,
        region: current?.region ?? event.region ?? null,
        sourceId: current?.sourceId ?? event.sourceId ?? null,
        totalCount: (current?.totalCount ?? 0) + 1,
        upcomingCount: (current?.upcomingCount ?? 0) + (isUpcoming ? 1 : 0),
      });
    });
  });

  return Array.from(map.values()).sort(
    (left, right) =>
      right.upcomingCount - left.upcomingCount ||
      right.totalCount - left.totalCount ||
      left.name.localeCompare(right.name, 'ko-KR'),
  );
};

export const getFavoriteEsportsTeamSide = (
  event: ExternalEsportsEvent,
  favoriteTeam: FavoriteEsportsTeam | null | undefined,
): ExternalEsportsTeamSide | null => {
  if (!favoriteTeam) {
    return null;
  }

  const favoriteKeys = new Set(
    [favoriteTeam.id, favoriteTeam.name, ...(favoriteTeam.aliases ?? [])]
      .map((value) => normalizeExternalEsportsTeamKey(value))
      .filter(Boolean),
  );

  if (favoriteKeys.size === 0) {
    return null;
  }

  for (const side of ['A', 'B'] as const) {
    const aliases = getExternalEsportsTeamAliases(event, side);

    if (aliases.some((alias) => favoriteKeys.has(normalizeExternalEsportsTeamKey(alias)))) {
      return side;
    }
  }

  return null;
};

export const isFavoriteEsportsTeamEvent = (
  event: ExternalEsportsEvent,
  favoriteTeam: FavoriteEsportsTeam | null | undefined,
) => getFavoriteEsportsTeamSide(event, favoriteTeam) !== null;

export const getFavoriteEsportsTeamEvents = (
  events: ExternalEsportsEvent[],
  favoriteTeam: FavoriteEsportsTeam | null | undefined,
) => events.filter((event) => isFavoriteEsportsTeamEvent(event, favoriteTeam));

export const getNextFavoriteEsportsTeamEvent = (
  events: ExternalEsportsEvent[],
  favoriteTeam: FavoriteEsportsTeam | null | undefined,
  now = Date.now(),
) =>
  getFavoriteEsportsTeamEvents(events, favoriteTeam)
    .filter((event) => event.startsAt && new Date(event.startsAt).getTime() >= now)
    .sort(
      (left, right) =>
        new Date(left.startsAt ?? 0).getTime() - new Date(right.startsAt ?? 0).getTime(),
    )[0] ?? null;
