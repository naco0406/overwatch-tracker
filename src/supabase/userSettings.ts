import { supabase } from '@/supabase/client';
import { getCurrentUserOrThrow } from '@/supabase/currentUser';
import type { Database, Json } from '@/supabase/database.types';
import type {
  FavoriteEsportsTeam,
  RoiConfig,
  UserSettings,
  UserSettingsUpdateInput,
} from '@/types/userSettings';

type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];
type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

const jsonToRoiConfig = (value: Json | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as RoiConfig;
};

const jsonToFavoriteEsportsTeam = (value: Json | null): FavoriteEsportsTeam | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';

  if (!id || !name) {
    return null;
  }

  return {
    aliases: Array.isArray(record.aliases)
      ? record.aliases.filter((alias): alias is string => typeof alias === 'string')
      : undefined,
    id,
    logoUrl: typeof record.logoUrl === 'string' ? record.logoUrl : null,
    name,
    region: typeof record.region === 'string' ? record.region : null,
    selectedAt: typeof record.selectedAt === 'string' ? record.selectedAt : undefined,
    sourceId: typeof record.sourceId === 'string' ? record.sourceId : null,
  };
};

const rowToUserSettings = (row: UserSettingsRow): UserSettings => ({
  createdAt: row.created_at,
  defaultAccount: row.default_account,
  defaultMatchRole: row.default_match_role ?? 'damage',
  defaultPlayerAccountId: row.default_player_account_id,
  defaultQueueType: row.default_queue_type,
  favoriteEsportsTeam: jsonToFavoriteEsportsTeam(row.favorite_esports_team),
  roiConfig: jsonToRoiConfig(row.roi_config),
  updatedAt: row.updated_at,
  userId: row.user_id,
});

export const getUserSettings = async () => {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return rowToUserSettings(data);
  }

  return {
    createdAt: '',
    defaultAccount: 'main',
    defaultMatchRole: 'damage',
    defaultPlayerAccountId: null,
    defaultQueueType: 'solo',
    favoriteEsportsTeam: null,
    updatedAt: '',
    userId: user.id,
  } satisfies UserSettings;
};

export const upsertUserSettings = async (input: UserSettingsUpdateInput) => {
  const user = await getCurrentUserOrThrow();
  const row: UserSettingsInsert = {
    user_id: user.id,
  };

  if (input.defaultAccount !== undefined) row.default_account = input.defaultAccount;
  if (input.defaultMatchRole !== undefined) row.default_match_role = input.defaultMatchRole;
  if (input.defaultPlayerAccountId !== undefined) {
    row.default_player_account_id = input.defaultPlayerAccountId;
  }
  if (input.defaultQueueType !== undefined) row.default_queue_type = input.defaultQueueType;
  if (input.favoriteEsportsTeam !== undefined) {
    row.favorite_esports_team = input.favoriteEsportsTeam as Json | null;
  }
  if (input.roiConfig !== undefined) row.roi_config = input.roiConfig as Json | null;

  const { data, error } = await supabase
    .from('user_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return rowToUserSettings(data);
};
