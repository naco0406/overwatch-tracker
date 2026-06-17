import { useMutation, useQuery } from '@tanstack/react-query';

import {
  collectExternalData,
  getExternalDataOverview,
  isExternalDataApiConfigured,
  type ExternalCollectRequest,
} from '@/lib/externalDataApi';

const externalDataQueryKey = ['external-data', 'overview'] as const;

const useExternalDataOverview = (enabled = true) =>
  useQuery({
    enabled: enabled && isExternalDataApiConfigured(),
    queryFn: getExternalDataOverview,
    queryKey: externalDataQueryKey,
    staleTime: 1000 * 60 * 5,
  });

const useCollectExternalData = () => {
  return useMutation({
    mutationFn: (request: ExternalCollectRequest = {}) => collectExternalData(request),
  });
};

export { externalDataQueryKey, useCollectExternalData, useExternalDataOverview };
