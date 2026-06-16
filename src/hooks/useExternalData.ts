import { useQuery } from '@tanstack/react-query';

import { getExternalDataOverview, isExternalDataApiConfigured } from '@/lib/externalDataApi';

const externalDataQueryKey = ['external-data', 'overview'] as const;

const useExternalDataOverview = (enabled = true) =>
  useQuery({
    enabled: enabled && isExternalDataApiConfigured(),
    queryFn: getExternalDataOverview,
    queryKey: externalDataQueryKey,
    staleTime: 1000 * 60 * 5,
  });

export { externalDataQueryKey, useExternalDataOverview };
