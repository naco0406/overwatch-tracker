import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createMatch, deleteMatch, getMatch, listMatches, updateMatch } from '@/supabase/matches';
import type { MatchCreateInput, MatchFilters, MatchUpdateInput } from '@/types/match';

export const matchesQueryKey = (filters?: MatchFilters) => ['matches', filters ?? {}] as const;

export const matchQueryKey = (matchId?: string) => ['matches', 'detail', matchId] as const;

export const useMatches = (filters?: MatchFilters) =>
  useQuery({
    queryFn: () => listMatches(filters),
    queryKey: matchesQueryKey(filters),
  });

export const useMatch = (matchId?: string) =>
  useQuery({
    enabled: Boolean(matchId),
    queryFn: () => getMatch(matchId as string),
    queryKey: matchQueryKey(matchId),
  });

export const useCreateMatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MatchCreateInput) => createMatch(input),
    onSuccess: (match) => {
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.setQueryData(matchQueryKey(match.id), match);
    },
  });
};

export const useUpdateMatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MatchUpdateInput) => updateMatch(input),
    onSuccess: (match) => {
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.setQueryData(matchQueryKey(match.id), match);
    },
  });
};

export const useDeleteMatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) => deleteMatch(matchId),
    onSuccess: (_result, matchId) => {
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.removeQueries({ queryKey: matchQueryKey(matchId) });
    },
  });
};
