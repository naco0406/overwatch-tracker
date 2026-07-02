export type TripDayNumber = 1 | 2 | 3;

export type TripEventType =
  | 'activity'
  | 'airport'
  | 'arrival'
  | 'free'
  | 'hotel'
  | 'meal'
  | 'shopping'
  | 'transport';

export type TravelMode = 'driving' | 'transit' | 'walking';

export interface PlaceInfo {
  address?: string;
  googleMapsQuery: string;
  id: string;
  name: string;
}

export interface RouteInfo {
  destination: string;
  estimatedDuration?: string;
  googleMapsUrl?: string;
  mode?: TravelMode;
  origin: string;
}

export interface MealInfo {
  avoidCategories?: string[];
  candidateCategories?: string[];
  menu?: string;
  recommendationReason?: string;
  restaurantName?: string;
  status: 'fixed' | 'undecided';
}

export interface TripEvent {
  area: string;
  day: TripDayNumber;
  description?: string;
  fixed: boolean;
  id: string;
  meal?: MealInfo;
  notes?: string[];
  place?: PlaceInfo;
  route?: RouteInfo;
  time: string;
  title: string;
  type: TripEventType;
}

export interface TripDay {
  areas: string[];
  date: string;
  day: TripDayNumber;
  events: TripEvent[];
  label: string;
  summary: string;
}

export interface RestaurantCandidate {
  area: string;
  category: string;
  googleMapsQuery: string;
  googlePlaceId?: string;
  id: string;
  mapsUrl: string;
  name: string;
  openNow?: boolean;
  priceLevel?: number;
  rating?: number;
  reason?: string;
  reviewCount?: number;
  travelTimeToNext?: string;
}

export interface TripPlace {
  activities: string[];
  address?: string;
  area: string;
  category: 'airport' | 'area' | 'hotel' | 'restaurant' | 'shopping';
  description: string;
  googleMapsQuery: string;
  id: string;
  name: string;
  nextMove?: string;
  relatedMeals?: string[];
  visitDays: TripDayNumber[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  section: 'airport' | 'before-departure' | 'daily' | 'packing';
}

export interface TravelPhrase {
  id: string;
  japanese: string;
  korean: string;
  situation: string;
}

export interface TripContext {
  currentDay: TripDay;
  currentEvent: TripEvent | null;
  nextEvent: TripEvent | null;
  phase: 'after' | 'before' | 'during';
  todayDateLabel: string;
}
