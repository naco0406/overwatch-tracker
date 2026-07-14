import { useMutation, useQuery } from '@tanstack/react-query';

import {
  collectExternalData,
  getExternalDataOverview,
  getExternalHeroRates,
  isExternalDataApiConfigured,
  type ExternalCollectRequest,
  type ExternalHeroRatesRequest,
} from '@/lib/externalDataApi';

const externalDataQueryKey = ['external-data', 'overview'] as const;
const externalHeroRatesQueryKey = (request: ExternalHeroRatesRequest) =>
  ['external-data', 'hero-rates', request] as const;

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

const useExternalHeroRates = (request: ExternalHeroRatesRequest, enabled = true) =>
  useQuery({
    enabled: enabled && isExternalDataApiConfigured(),
    queryFn: () => getExternalHeroRates(request),
    queryKey: externalHeroRatesQueryKey(request),
    staleTime: 1000 * 60 * 5,
  });

export {
  externalDataQueryKey,
  externalHeroRatesQueryKey,
  useCollectExternalData,
  useExternalDataOverview,
  useExternalHeroRates,
};
