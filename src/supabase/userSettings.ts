import { supabase } from '@/supabase/client';
import { getCurrentUserOrThrow } from '@/supabase/currentUser';
import type { Database, Json } from '@/supabase/database.types';
import type { RoiConfig, UserSettings, UserSettingsUpdateInput } from '@/types/userSettings';

type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];
type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

const jsonToRoiConfig = (value: Json | null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as RoiConfig;
};

const rowToUserSettings = (row: UserSettingsRow): UserSettings => ({
  createdAt: row.created_at,
  defaultAccount: row.default_account,
  defaultQueueType: row.default_queue_type,
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
    defaultQueueType: 'solo',
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
  if (input.defaultQueueType !== undefined) row.default_queue_type = input.defaultQueueType;
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
