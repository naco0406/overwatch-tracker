import type { TravelMode } from '@/types/tokyoTravel';

const googleMapsBaseUrl = 'https://www.google.com/maps';

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

const googleMapsTravelMode = {
  driving: 'driving',
  transit: 'transit',
  walking: 'walking',
} satisfies Record<TravelMode, string>;

const formatCoordinates = ({ latitude, longitude }: GeoCoordinates) =>
  `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

export const createGoogleMapsSearchUrl = (query: string) => {
  const params = new URLSearchParams({
    api: '1',
    query,
  });

  return `${googleMapsBaseUrl}/search/?${params.toString()}`;
};

export const createGoogleMapsNearbySearchUrl = (
  query: string,
  coordinates?: GeoCoordinates | null,
) =>
  createGoogleMapsSearchUrl(`${query} near ${coordinates ? formatCoordinates(coordinates) : 'me'}`);

export const createGoogleMapsCurrentLocationUrl = (coordinates?: GeoCoordinates | null) =>
  coordinates ? createGoogleMapsSearchUrl(formatCoordinates(coordinates)) : `${googleMapsBaseUrl}`;

export const createGoogleMapsDirectionsUrl = (
  origin: string,
  destination: string,
  mode: TravelMode = 'transit',
) => {
  const params = new URLSearchParams({
    api: '1',
    destination,
    origin,
    travelmode: googleMapsTravelMode[mode],
  });

  return `${googleMapsBaseUrl}/dir/?${params.toString()}`;
};

export const createGoogleMapsDirectionsFromCurrentLocationUrl = (
  destination: string,
  mode: TravelMode = 'transit',
  coordinates?: GeoCoordinates | null,
) => {
  const params = new URLSearchParams({
    api: '1',
    destination,
    dir_action: 'navigate',
    travelmode: googleMapsTravelMode[mode],
  });

  if (coordinates) {
    params.set('origin', formatCoordinates(coordinates));
  }

  return `${googleMapsBaseUrl}/dir/?${params.toString()}`;
};
