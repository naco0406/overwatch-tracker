import { supabase } from '@/supabase/client';
import { getCurrentUserOrThrow } from '@/supabase/currentUser';
import type { Database } from '@/supabase/database.types';
import { sanitizeStickyNoteHtml } from '@/lib/stickyNoteHtml';
import type {
  StickyNote,
  StickyNoteColor,
  StickyNoteCreateInput,
  StickyNoteUpdateInput,
} from '@/types/stickyNote';

type StickyNoteInsert = Database['public']['Tables']['sticky_notes']['Insert'];
type StickyNoteRow = Database['public']['Tables']['sticky_notes']['Row'];
type StickyNoteUpdate = Database['public']['Tables']['sticky_notes']['Update'];

const stickyNoteColors: StickyNoteColor[] = ['amber', 'sky', 'emerald', 'rose', 'violet'];

const isStickyNoteColor = (color: string): color is StickyNoteColor =>
  stickyNoteColors.includes(color as StickyNoteColor);

const ensureColor = (color: string) => {
  if (!isStickyNoteColor(color)) {
    throw new Error('지원하지 않는 메모 색상입니다.');
  }

  return color;
};

const rowToStickyNote = (row: StickyNoteRow): StickyNote => ({
  body: row.body,
  color: ensureColor(row.color),
  createdAt: row.created_at,
  id: row.id,
  sortOrder: row.sort_order,
  updatedAt: row.updated_at,
  userId: row.user_id,
});

const ensureBody = (body: string) => {
  return sanitizeStickyNoteHtml(body);
};

const getNextSortOrder = async (userId: string) => {
  const { data, error } = await supabase
    .from('sticky_notes')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.sort_order ?? -1) + 1;
};

export const listStickyNotes = async () => {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await supabase
    .from('sticky_notes')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(rowToStickyNote);
};

export const createStickyNote = async (input: StickyNoteCreateInput) => {
  const user = await getCurrentUserOrThrow();
  const row: StickyNoteInsert = {
    body: ensureBody(input.body),
    color: ensureColor(input.color ?? 'amber'),
    sort_order: await getNextSortOrder(user.id),
    user_id: user.id,
  };

  const { data, error } = await supabase.from('sticky_notes').insert(row).select('*').single();

  if (error) {
    throw error;
  }

  return rowToStickyNote(data);
};

export const updateStickyNote = async (input: StickyNoteUpdateInput) => {
  const user = await getCurrentUserOrThrow();
  const update: StickyNoteUpdate = {};

  if (input.body !== undefined) update.body = ensureBody(input.body);
  if (input.color !== undefined) update.color = ensureColor(input.color);
  if (input.sortOrder !== undefined) update.sort_order = input.sortOrder;

  if (Object.keys(update).length === 0) {
    const { data, error } = await supabase
      .from('sticky_notes')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', input.id)
      .single();

    if (error) {
      throw error;
    }

    return rowToStickyNote(data);
  }

  const { data, error } = await supabase
    .from('sticky_notes')
    .update(update)
    .eq('user_id', user.id)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return rowToStickyNote(data);
};

export const deleteStickyNote = async (noteId: string) => {
  const user = await getCurrentUserOrThrow();
  const { error } = await supabase
    .from('sticky_notes')
    .delete()
    .eq('user_id', user.id)
    .eq('id', noteId);

  if (error) {
    throw error;
  }
};
