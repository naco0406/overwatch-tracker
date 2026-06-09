import { useQuery } from '@tanstack/react-query';

import { listCompetitiveSeasons } from '@/supabase/competitiveSeasons';

export const competitiveSeasonsQueryKey = ['competitive-seasons'] as const;

export const useCompetitiveSeasons = () =>
  useQuery({
    queryFn: listCompetitiveSeasons,
    queryKey: competitiveSeasonsQueryKey,
  });
