import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createPlayerAccount,
  deactivatePlayerAccount,
  listPlayerAccounts,
  permanentlyDeletePlayerAccount,
  updatePlayerAccount,
} from '@/supabase/playerAccounts';
import type { PlayerAccountCreateInput, PlayerAccountUpdateInput } from '@/types/playerAccount';

export const playerAccountsQueryKey = ['player-accounts'] as const;

export const usePlayerAccounts = () =>
  useQuery({
    queryFn: listPlayerAccounts,
    queryKey: playerAccountsQueryKey,
  });

export const useCreatePlayerAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlayerAccountCreateInput) => createPlayerAccount(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: playerAccountsQueryKey });
    },
  });
};

export const useUpdatePlayerAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlayerAccountUpdateInput) => updatePlayerAccount(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: playerAccountsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
};

export const useDeactivatePlayerAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => deactivatePlayerAccount(accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: playerAccountsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
};

export const usePermanentlyDeletePlayerAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => permanentlyDeletePlayerAccount(accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: playerAccountsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      void queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    },
  });
};

export const useRestorePlayerAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlayerAccountUpdateInput) =>
      updatePlayerAccount({ ...input, isActive: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: playerAccountsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
};
