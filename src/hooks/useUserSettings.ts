import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getUserSettings, upsertUserSettings } from '@/supabase/userSettings';
import type { UserSettingsUpdateInput } from '@/types/userSettings';

export const userSettingsQueryKey = ['user-settings'] as const;

export const useUserSettings = () =>
  useQuery({
    queryFn: getUserSettings,
    queryKey: userSettingsQueryKey,
  });

export const useUpdateUserSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UserSettingsUpdateInput) => upsertUserSettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(userSettingsQueryKey, settings);
    },
  });
};
