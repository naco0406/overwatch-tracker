import { useCallback, useMemo, useState } from 'react';

import type { GeoCoordinates } from '@/lib/tokyoTravelMaps';

export type CurrentLocationStatus =
  | 'denied'
  | 'error'
  | 'granted'
  | 'idle'
  | 'loading'
  | 'unsupported';

interface CurrentLocationState {
  accuracyMeters: number | null;
  coordinates: GeoCoordinates | null;
  errorMessage: string | null;
  status: CurrentLocationStatus;
  updatedAt: number | null;
}

const locationOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 120_000,
  timeout: 10_000,
};

const getGeolocationErrorMessage = (error: GeolocationPositionError) => {
  if (error.code === error.PERMISSION_DENIED) {
    return '위치 권한이 꺼져 있어요.';
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return '현재 위치를 가져올 수 없어요.';
  }

  if (error.code === error.TIMEOUT) {
    return '위치 확인 시간이 초과됐어요.';
  }

  return '위치 확인에 실패했어요.';
};

export const useCurrentLocation = () => {
  const [state, setState] = useState<CurrentLocationState>({
    accuracyMeters: null,
    coordinates: null,
    errorMessage: null,
    status: 'idle',
    updatedAt: null,
  });

  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const requestLocation = useCallback(() => {
    if (!isSupported) {
      setState({
        accuracyMeters: null,
        coordinates: null,
        errorMessage: '이 브라우저에서는 위치 기능을 사용할 수 없어요.',
        status: 'unsupported',
        updatedAt: null,
      });
      return;
    }

    setState((previous) => ({
      ...previous,
      errorMessage: null,
      status: 'loading',
    }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          accuracyMeters: Math.round(position.coords.accuracy),
          coordinates: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          errorMessage: null,
          status: 'granted',
          updatedAt: Date.now(),
        });
      },
      (error) => {
        setState({
          accuracyMeters: null,
          coordinates: null,
          errorMessage: getGeolocationErrorMessage(error),
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'error',
          updatedAt: null,
        });
      },
      locationOptions,
    );
  }, [isSupported]);

  const statusLabel = useMemo(() => {
    if (state.status === 'granted') {
      return '현재 위치 기준';
    }

    if (state.status === 'loading') {
      return '위치 확인 중';
    }

    if (state.status === 'denied' || state.status === 'error' || state.status === 'unsupported') {
      return 'Maps 현재 위치 사용';
    }

    return '위치 미사용';
  }, [state.status]);

  return {
    ...state,
    hasCoordinates: Boolean(state.coordinates),
    isLoading: state.status === 'loading',
    requestLocation,
    statusLabel,
  };
};
