import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createStickyNote,
  deleteStickyNote,
  listStickyNotes,
  updateStickyNote,
} from '@/supabase/stickyNotes';
import type { StickyNote, StickyNoteCreateInput, StickyNoteUpdateInput } from '@/types/stickyNote';

export const stickyNotesQueryKey = ['sticky-notes'] as const;

export const useStickyNotes = () =>
  useQuery({
    queryFn: listStickyNotes,
    queryKey: stickyNotesQueryKey,
  });

export const useCreateStickyNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StickyNoteCreateInput) => createStickyNote(input),
    onSuccess: (note) => {
      queryClient.setQueryData<StickyNote[]>(stickyNotesQueryKey, (current = []) => [
        ...current,
        note,
      ]);
    },
  });
};

export const useUpdateStickyNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StickyNoteUpdateInput) => updateStickyNote(input),
    onSuccess: (note) => {
      queryClient.setQueryData<StickyNote[]>(stickyNotesQueryKey, (current = []) =>
        current.map((item) => (item.id === note.id ? note : item)),
      );
    },
  });
};

export const useDeleteStickyNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => deleteStickyNote(noteId),
    onSuccess: (_result, noteId) => {
      queryClient.setQueryData<StickyNote[]>(stickyNotesQueryKey, (current = []) =>
        current.filter((note) => note.id !== noteId),
      );
    },
  });
};
