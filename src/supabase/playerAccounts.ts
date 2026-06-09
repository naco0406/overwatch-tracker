import { supabase } from '@/supabase/client';
import { getCurrentUserOrThrow } from '@/supabase/currentUser';
import type { Database } from '@/supabase/database.types';
import type {
  PlayerAccount,
  PlayerAccountCreateInput,
  PlayerAccountUpdateInput,
} from '@/types/playerAccount';

type PlayerAccountInsert = Database['public']['Tables']['player_accounts']['Insert'];
type PlayerAccountRow = Database['public']['Tables']['player_accounts']['Row'];
type PlayerAccountUpdate = Database['public']['Tables']['player_accounts']['Update'];

const rowToPlayerAccount = (row: PlayerAccountRow): PlayerAccount => ({
  battleTag: row.battle_tag,
  createdAt: row.created_at,
  deactivatedAt: row.deactivated_at,
  displayName: row.display_name,
  id: row.id,
  isActive: row.is_active,
  isMain: row.is_main,
  sortOrder: row.sort_order,
  updatedAt: row.updated_at,
  userId: row.user_id,
});

export const listPlayerAccounts = async () => {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await supabase
    .from('player_accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('is_active', { ascending: false })
    .order('is_main', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(rowToPlayerAccount);
};

export const createPlayerAccount = async (input: PlayerAccountCreateInput) => {
  const user = await getCurrentUserOrThrow();
  const row: PlayerAccountInsert = {
    battle_tag: input.battleTag.trim(),
    display_name: input.displayName?.trim() ?? '',
    is_active: true,
    is_main: input.isMain ?? false,
    sort_order: input.sortOrder ?? 0,
    user_id: user.id,
  };

  const { data, error } = await supabase.from('player_accounts').insert(row).select('*').single();

  if (error) {
    throw error;
  }

  return rowToPlayerAccount(data);
};

export const updatePlayerAccount = async (input: PlayerAccountUpdateInput) => {
  const user = await getCurrentUserOrThrow();
  const row: PlayerAccountUpdate = {};

  if (input.isMain === true) {
    const { error: unsetError } = await supabase
      .from('player_accounts')
      .update({ is_main: false })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .neq('id', input.id);

    if (unsetError) {
      throw unsetError;
    }
  }

  if (input.battleTag !== undefined) row.battle_tag = input.battleTag.trim();
  if (input.displayName !== undefined) row.display_name = input.displayName.trim();
  if (input.isActive !== undefined) row.is_active = input.isActive;
  if (input.isMain !== undefined) row.is_main = input.isMain;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;

  const { data, error } = await supabase
    .from('player_accounts')
    .update(row)
    .eq('user_id', user.id)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return rowToPlayerAccount(data);
};

export const deactivatePlayerAccount = async (accountId: string) => {
  const user = await getCurrentUserOrThrow();
  const { error } = await supabase
    .from('player_accounts')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('id', accountId);

  if (error) {
    throw error;
  }
};

export const permanentlyDeletePlayerAccount = async (accountId: string) => {
  const user = await getCurrentUserOrThrow();
  const { error } = await supabase
    .from('player_accounts')
    .delete()
    .eq('user_id', user.id)
    .eq('id', accountId);

  if (error) {
    throw error;
  }
};
