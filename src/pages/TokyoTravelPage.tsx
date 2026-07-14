import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  CloudSun,
  Compass,
  Coffee,
  CreditCard,
  Crosshair,
  ExternalLink,
  Home,
  Hotel,
  Info,
  Languages,
  ListChecks,
  LocateFixed,
  MapIcon,
  MapPin,
  Navigation,
  Pill,
  Plane,
  Route,
  Search,
  ShoppingBag,
  Sparkles,
  Train,
  Umbrella,
  Utensils,
  WandSparkles,
  Wind,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  tokyoChecklistItems,
  tokyoRestaurantCandidates,
  tokyoTravelPhrases,
  tokyoTripDays,
  tokyoTripMeta,
  tokyoTripPlaces,
} from '@/data/tokyoTravel';
import {
  getCurrentTripContext,
  getEventTimeLabel,
  getFixedMealSlots,
  getRouteEvents,
  getUndecidedMealSlots,
} from '@/lib/tokyoTravel';
import {
  createGoogleMapsCurrentLocationUrl,
  createGoogleMapsDirectionsFromCurrentLocationUrl,
  createGoogleMapsDirectionsUrl,
  createGoogleMapsNearbySearchUrl,
  createGoogleMapsSearchUrl,
} from '@/lib/tokyoTravelMaps';
import { cn } from '@/lib/utils';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import type {
  ChecklistItem,
  RestaurantCandidate,
  TravelMode,
  TravelPhrase,
  TripDay,
  TripEvent,
  TripEventType,
  TripPlace,
} from '@/types/tokyoTravel';

type TokyoTravelSection = 'ai' | 'home' | 'info' | 'itinerary' | 'map' | 'meals' | 'places';
type TravelLocationControl = ReturnType<typeof useCurrentLocation>;
type NearbySearchCategory = 'atm' | 'cafe' | 'convenience_store' | 'pharmacy' | 'station';

interface MealRecommendationResponse {
  rankedCategories: Array<{
    category: string;
    caution?: string;
    rank: number;
    reason: string;
  }>;
  source: 'gemini';
  summary: string;
}

interface TranslateResponse {
  notes: string[];
  source: 'gemini';
  translatedText: string;
}

interface TripDecisionRecommendationResponse {
  actionPlan: string[];
  cautions: string[];
  model?: string;
  optionId: string;
  reasons: string[];
  recommendation: string;
  source: 'gemini';
  summary: string;
}

interface NearbyPlace {
  address: string;
  distanceMeters: number | null;
  googleMapsUrl: string;
  id: string;
  isOpenNow: boolean | null;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  name: string;
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
}

interface NearbySearchResponse {
  label: string;
  places: NearbyPlace[];
  radiusMeters: number;
  source: 'google_places';
}

interface ApiErrorResponse {
  error?: string;
  upstreamMessage?: string;
  upstreamStatus?: number;
}

interface TravelWeatherResponse {
  current: {
    cloudCover: number | null;
    condition: string | null;
    conditionType: string | null;
    currentTime: string | null;
    feelsLikeCelsius: number | null;
    humidity: number | null;
    iconUrl: string | null;
    isDaytime: boolean | null;
    precipitationProbability: number | null;
    temperatureCelsius: number | null;
    uvIndex: number | null;
    windKph: number | null;
  };
  forecastDays: Array<{
    condition: string | null;
    conditionType: string | null;
    date: string | null;
    iconUrl: string | null;
    maxTemperatureCelsius: number | null;
    minTemperatureCelsius: number | null;
    precipitationProbability: number | null;
    uvIndex: number | null;
    windKph: number | null;
  }>;
  source: 'google_weather' | 'open_meteo';
  timeZone: string | null;
}

interface ReverseGeocodeResponse {
  address: string;
  googleMapsUrl: string;
  placeId: string | null;
  shortLabel: string;
  source: 'coordinates' | 'google_geocoding' | 'google_places';
}

const sectionItems: Array<{
  icon: LucideIcon;
  label: string;
  value: TokyoTravelSection;
}> = [
  { icon: Home, label: '홈', value: 'home' },
  { icon: CalendarDays, label: '일정', value: 'itinerary' },
  { icon: Utensils, label: '식사', value: 'meals' },
  { icon: MapIcon, label: '지도', value: 'map' },
  { icon: MapPin, label: '장소', value: 'places' },
  { icon: Info, label: '정보', value: 'info' },
  { icon: Languages, label: 'AI', value: 'ai' },
];

const mobileSectionItems: Array<{
  icon: LucideIcon;
  label: string;
  value: TokyoTravelSection;
}> = [
  { icon: Home, label: '홈', value: 'home' },
  { icon: CalendarDays, label: '일정', value: 'itinerary' },
  { icon: Utensils, label: '식사', value: 'meals' },
  { icon: MapIcon, label: '지도', value: 'map' },
  { icon: Info, label: '정보', value: 'info' },
];

const eventTypeLabels = {
  activity: '활동',
  airport: '공항',
  arrival: '도착',
  free: '자유',
  hotel: '숙소',
  meal: '식사',
  shopping: '쇼핑',
  transport: '이동',
} satisfies Record<TripEventType, string>;

const eventTypeIcons = {
  activity: Sparkles,
  airport: Plane,
  arrival: Plane,
  free: Coffee,
  hotel: BriefcaseBusiness,
  meal: Utensils,
  shopping: ShoppingBag,
  transport: Train,
} satisfies Record<TripEventType, LucideIcon>;

const eventTypeBadgeClassNames = {
  activity: 'border-sky-200 bg-sky-50 text-sky-700',
  airport: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  arrival: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  free: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  hotel: 'border-violet-200 bg-violet-50 text-violet-700',
  meal: 'border-orange-200 bg-orange-50 text-orange-700',
  shopping: 'border-pink-200 bg-pink-50 text-pink-700',
  transport: 'border-slate-200 bg-slate-50 text-slate-700',
} satisfies Record<TripEventType, string>;

const travelModeLabels = {
  driving: '차량',
  transit: '대중교통',
  walking: '도보',
} satisfies Record<TravelMode, string>;

const checklistSectionLabels = {
  airport: '공항',
  'before-departure': '출국 전',
  daily: '현지',
  packing: '준비물',
} satisfies Record<ChecklistItem['section'], string>;

const tokyoBaseCoordinates = {
  latitude: 35.6721,
  longitude: 139.7364,
};

const nearbySearchItems: Array<{
  category: NearbySearchCategory;
  helper: string;
  icon: LucideIcon;
  label: string;
  query: string;
}> = [
  {
    category: 'convenience_store',
    helper: '물, 간식, 충전 케이블',
    icon: ShoppingBag,
    label: '편의점',
    query: 'convenience store',
  },
  {
    category: 'cafe',
    helper: '대기/휴식할 곳',
    icon: Coffee,
    label: '카페',
    query: 'cafe',
  },
  {
    category: 'pharmacy',
    helper: '상비약, 파스',
    icon: Pill,
    label: '약국',
    query: 'pharmacy',
  },
  {
    category: 'atm',
    helper: '현금 인출',
    icon: CreditCard,
    label: 'ATM',
    query: 'ATM',
  },
  {
    category: 'station',
    helper: '가장 가까운 전철역',
    icon: Train,
    label: '역',
    query: 'train station',
  },
];

const getTripPhaseLabel = (phase: ReturnType<typeof getCurrentTripContext>['phase']) => {
  if (phase === 'before') {
    return '출발 전';
  }

  if (phase === 'after') {
    return '여행 종료';
  }

  return '여행 중';
};

const getDaysUntilTrip = () => {
  const now = new Date();
  const start = new Date(`${tokyoTripMeta.startDate}T00:00:00+09:00`);
  const delta = start.getTime() - now.getTime();

  if (delta <= 0) {
    return null;
  }

  return Math.ceil(delta / 86_400_000);
};

const getNextRouteUrl = (event: TripEvent | null, location: TravelLocationControl) =>
  event?.route
    ? createGoogleMapsDirectionsFromCurrentLocationUrl(
        event.route.destination,
        event.route.mode,
        location.coordinates,
      )
    : null;

const getEventPlaceUrl = (event: TripEvent | null) =>
  event?.place ? createGoogleMapsSearchUrl(event.place.googleMapsQuery) : null;

const TokyoTravelPage = () => {
  const [section, setSection] = useState<TokyoTravelSection>('home');
  const [selectedNearbyCategory, setSelectedNearbyCategory] = useState<NearbySearchCategory | null>(
    null,
  );
  const tripContext = useMemo(() => getCurrentTripContext(), []);
  const location = useCurrentLocation();
  const daysUntilTrip = getDaysUntilTrip();
  const handleNearbySearchRequest = (category: NearbySearchCategory) => {
    setSection('home');
    setSelectedNearbyCategory(category);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef6f9_46%,#f8fafc_100%)] px-3.5 py-3 text-slate-950 sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 pb-24 sm:gap-4 xl:pb-0">
        <HeroSection
          daysUntilTrip={daysUntilTrip}
          location={location}
          onNearbySearchRequest={handleNearbySearchRequest}
          phaseLabel={getTripPhaseLabel(tripContext.phase)}
          tripContext={tripContext}
        />

        <SectionNav activeSection={section} onSelect={setSection} />

        {section === 'home' ? (
          <HomeSection
            location={location}
            selectedNearbyCategory={selectedNearbyCategory}
            tripContext={tripContext}
            onSelectedNearbyCategoryChange={setSelectedNearbyCategory}
            onSelect={setSection}
          />
        ) : null}
        {section === 'itinerary' ? <ItinerarySection location={location} /> : null}
        {section === 'meals' ? <MealsSection /> : null}
        {section === 'map' ? (
          <MapSection
            location={location}
            selectedNearbyCategory={selectedNearbyCategory}
            onSelectedNearbyCategoryChange={setSelectedNearbyCategory}
          />
        ) : null}
        {section === 'places' ? <PlacesSection /> : null}
        {section === 'info' ? <InfoSection location={location} /> : null}
        {section === 'ai' ? <AiToolsSection /> : null}

        <MobileTravelNav activeSection={section} onSelect={setSection} />
      </div>
    </main>
  );
};

const HeroSection = ({
  daysUntilTrip,
  location,
  onNearbySearchRequest,
  phaseLabel,
  tripContext,
}: {
  daysUntilTrip: number | null;
  location: TravelLocationControl;
  onNearbySearchRequest: (category: NearbySearchCategory) => void;
  phaseLabel: string;
  tripContext: ReturnType<typeof getCurrentTripContext>;
}) => {
  const nextRouteUrl = getNextRouteUrl(tripContext.nextEvent, location);
  const nextPlaceUrl = getEventPlaceUrl(tripContext.nextEvent);

  return (
    <section className="relative overflow-hidden rounded-lg bg-slate-950 text-white shadow-[0_24px_90px_-60px_rgb(15_23_42/0.95)]">
      <img
        alt="도쿄 여행 도시 풍경"
        className="absolute inset-0 h-full w-full object-cover"
        src={tokyoTripMeta.heroImagePath}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/52 to-slate-950/86 sm:bg-gradient-to-r sm:from-slate-950/92 sm:via-slate-950/62 sm:to-slate-950/16" />
      <div className="relative z-10 grid gap-3 p-4 sm:gap-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-7">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge className="border-white/20 bg-white/12 text-white hover:bg-white/12">
                  {phaseLabel}
                </Badge>
                <h1 className="mt-3 break-words text-2xl font-black leading-tight tracking-normal min-[430px]:text-3xl sm:text-5xl">
                  {tokyoTripMeta.title}
                </h1>
              </div>
              <div className="shrink-0 rounded-lg border border-white/15 bg-slate-950/55 px-2 py-1.5 text-right sm:px-3 sm:py-2">
                <p className="text-[11px] font-bold text-white/62">Tokyo</p>
                <p className="text-base font-black">
                  {daysUntilTrip ? `D-${daysUntilTrip}` : `Day ${tripContext.currentDay.day}`}
                </p>
              </div>
            </div>
          </div>

          <div className="hidden min-w-0 grid-cols-2 gap-2 sm:grid sm:gap-3">
            <TravelNowCard
              event={tripContext.currentEvent}
              label="지금"
              placeholder="아직 첫 일정 전입니다."
            />
            <TravelNowCard
              event={tripContext.nextEvent}
              label="다음"
              placeholder="오늘 남은 일정이 없습니다."
            />
          </div>
        </div>

        <div className="hidden gap-3 sm:grid">
          <div className="rounded-lg border border-white/15 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-white/62">다음 행동</p>
              <LocationStatusButton location={location} tone="dark" />
            </div>
            <h2 className="mt-1 text-xl font-black tracking-normal">
              {tripContext.nextEvent ? tripContext.nextEvent.title : '오늘 일정 종료'}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/78">
              {tripContext.nextEvent?.route
                ? `${tripContext.nextEvent.route.origin}에서 ${tripContext.nextEvent.route.destination}까지 ${tripContext.nextEvent.route.estimatedDuration ?? '이동 시간 확인'}`
                : (tripContext.nextEvent?.area ?? '숙소, 공항, 체크리스트를 확인하세요.')}
            </p>
            <div className="mt-4 grid gap-2">
              {nextRouteUrl ? (
                <Button
                  asChild
                  className="h-11 justify-between bg-white text-slate-950 hover:bg-white/92"
                >
                  <a href={nextRouteUrl} rel="noreferrer" target="_blank">
                    <span className="flex items-center gap-2">
                      <Navigation className="h-4 w-4" />
                      현위치에서 다음 경로
                    </span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
              {nextPlaceUrl ? (
                <Button
                  asChild
                  className="h-11 justify-between border-white/18 bg-white/10 text-white hover:bg-white/16"
                  variant="outline"
                >
                  <a href={nextPlaceUrl} rel="noreferrer" target="_blank">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      다음 장소 검색
                    </span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="hidden grid-cols-3 gap-2 sm:grid">
            <HeroShortcut
              href={createGoogleMapsSearchUrl(tokyoTripMeta.hotelMapsQuery)}
              icon={Hotel}
              label="숙소"
            />
            <HeroShortcut
              href={createGoogleMapsSearchUrl('Narita Airport Terminal 1 Terminal 3')}
              icon={Plane}
              label="공항"
            />
            <HeroShortcut
              icon={ShoppingBag}
              label="편의점"
              onClick={() => onNearbySearchRequest('convenience_store')}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

const LocationStatusButton = ({
  location,
  tone = 'light',
}: {
  location: TravelLocationControl;
  tone?: 'dark' | 'light';
}) => (
  <button
    className={cn(
      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-70',
      tone === 'dark'
        ? 'border-white/16 bg-white/12 text-white hover:bg-white/18'
        : 'border-border/70 bg-white text-slate-950 hover:border-primary/30 hover:bg-primary/5',
    )}
    disabled={location.isLoading}
    type="button"
    onClick={location.requestLocation}
  >
    <LocateFixed className={cn('h-3.5 w-3.5', location.isLoading && 'animate-pulse')} />
    {location.hasCoordinates ? '현위치 켜짐' : location.isLoading ? '확인 중' : '현위치 사용'}
  </button>
);

const HeroShortcut = ({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) => {
  const className =
    'flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-slate-950/55 text-xs font-black text-white transition-colors hover:bg-slate-950/70';

  if (href) {
    return (
      <a className={className} href={href} rel="noreferrer" target="_blank">
        <Icon className="h-5 w-5" />
        {label}
      </a>
    );
  }

  return (
    <button className={className} type="button" onClick={onClick}>
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
};

const TravelNowCard = ({
  event,
  label,
  placeholder,
}: {
  event: TripEvent | null;
  label: string;
  placeholder: string;
}) => (
  <div className="min-w-0 rounded-lg border border-white/15 bg-slate-950/55 p-3.5">
    <p className="text-[11px] font-bold text-white/62">{label}</p>
    {event ? (
      <div className="mt-2 flex gap-3">
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/16 text-white min-[360px]:flex">
          {(() => {
            const Icon = eventTypeIcons[event.type];

            return <Icon className="h-4 w-4" />;
          })()}
        </span>
        <div className="min-w-0">
          <p className="break-words text-sm font-black leading-5">
            {getEventTimeLabel(event)} · {event.title}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/68">{event.area}</p>
        </div>
      </div>
    ) : (
      <p className="mt-2 text-sm font-semibold text-white/72">{placeholder}</p>
    )}
  </div>
);

const SectionNav = ({
  activeSection,
  onSelect,
}: {
  activeSection: TokyoTravelSection;
  onSelect: (section: TokyoTravelSection) => void;
}) => (
  <nav className="hidden rounded-lg border border-border/70 bg-card p-1.5 shadow-sm xl:block">
    <div className="grid grid-cols-7 gap-1">
      {sectionItems.map((item) => {
        const active = activeSection === item.value;

        return (
          <button
            key={item.value}
            type="button"
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold text-muted-foreground transition-[background-color,color]',
              active
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-secondary hover:text-foreground',
            )}
            onClick={() => onSelect(item.value)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  </nav>
);

const MobileTravelNav = ({
  activeSection,
  onSelect,
}: {
  activeSection: TokyoTravelSection;
  onSelect: (section: TokyoTravelSection) => void;
}) => (
  <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-lg border border-border/70 bg-card p-1 shadow-[0_18px_70px_-36px_rgb(15_23_42/0.8)] xl:hidden">
    <div className="grid grid-cols-5 gap-1">
      {mobileSectionItems.map((item) => {
        const active = activeSection === item.value;

        return (
          <button
            key={item.value}
            type="button"
            className={cn(
              'flex h-12 flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] font-black text-muted-foreground transition-[background-color,color]',
              active
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-secondary hover:text-foreground',
            )}
            onClick={() => onSelect(item.value)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  </nav>
);

const HomeSection = ({
  location,
  selectedNearbyCategory,
  onSelectedNearbyCategoryChange,
  onSelect,
  tripContext,
}: {
  location: TravelLocationControl;
  selectedNearbyCategory: NearbySearchCategory | null;
  onSelectedNearbyCategoryChange: (category: NearbySearchCategory) => void;
  onSelect: (section: TokyoTravelSection) => void;
  tripContext: ReturnType<typeof getCurrentTripContext>;
}) => {
  const dayRoutes = getRouteEvents(tripContext.currentDay);
  const upcomingEvents = tripContext.currentDay.events.slice(0, 5);

  useEffect(() => {
    if (!selectedNearbyCategory) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById('nearby-search')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedNearbyCategory]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <TodayCommandPanel
        location={location}
        tripContext={tripContext}
        onNearbySearchRequest={onSelectedNearbyCategoryChange}
        onSelect={onSelect}
      />

      <EssentialActionsPanel
        onNearbySearchRequest={onSelectedNearbyCategoryChange}
        onSelect={onSelect}
      />

      <LuggageDecisionPanel />

      <LocationInsightPanel
        location={location}
        onNearbySearchRequest={onSelectedNearbyCategoryChange}
      />

      <div className="lg:hidden">
        <NearbySearchPanel
          location={location}
          selectedCategory={selectedNearbyCategory}
          onSelectedCategoryChange={onSelectedNearbyCategoryChange}
        />
      </div>

      <WeatherPanel location={location} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:gap-4">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="metric-label">{tripContext.todayDateLabel}</p>
                  <CardTitle className="mt-1 text-xl tracking-normal">오늘의 동선</CardTitle>
                  <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
                    Day {tripContext.currentDay.day} · {tripContext.currentDay.areas.join(' → ')}
                  </p>
                </div>
                <Badge variant="outline" className="w-fit">
                  {tripContext.currentDay.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="grid gap-2">
                {upcomingEvents.map((event) => (
                  <CompactEventRow key={event.id} event={event} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg tracking-normal">오늘의 이동</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {dayRoutes.map((event) => (
                <RouteCard key={event.id} event={event} location={location} />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="hidden lg:block">
            <NearbySearchPanel
              location={location}
              selectedCategory={selectedNearbyCategory}
              onSelectedCategoryChange={onSelectedNearbyCategoryChange}
            />
          </div>

          <Card className="hidden lg:block">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg tracking-normal">여행 도구</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
              <QuickActionButton
                icon={CalendarDays}
                label="일정"
                onClick={() => onSelect('itinerary')}
              />
              <QuickActionButton icon={MapIcon} label="지도" onClick={() => onSelect('map')} />
              <QuickActionButton icon={Utensils} label="식사" onClick={() => onSelect('meals')} />
              <QuickActionButton icon={Info} label="정보" onClick={() => onSelect('info')} />
              <QuickActionButton icon={MapPin} label="장소" onClick={() => onSelect('places')} />
              <QuickActionButton icon={Languages} label="번역" onClick={() => onSelect('ai')} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-[hsl(var(--surface-2))]">
              <CardTitle className="text-lg tracking-normal">미정 포인트</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {getUndecidedMealSlots().map(({ day, event, meal }) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-dashed border-orange-200 bg-orange-50/70 p-3"
                >
                  <p className="text-xs font-black text-orange-700">
                    Day {day.day} · {event.time} · {event.area}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{event.title}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                    {meal.recommendationReason}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const EssentialActionsPanel = ({
  onNearbySearchRequest,
  onSelect,
}: {
  onNearbySearchRequest: (category: NearbySearchCategory) => void;
  onSelect: (section: TokyoTravelSection) => void;
}) => (
  <Card className="overflow-hidden border-border/70">
    <CardHeader className="p-3.5 pb-0 sm:p-5 sm:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="metric-label">필수 정보</p>
          <CardTitle className="mt-1 text-base tracking-normal sm:text-lg">
            현장에서 바로 쓰는 것
          </CardTitle>
        </div>
        <Badge variant="outline" className="shrink-0">
          Today
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="grid grid-cols-2 gap-2 p-3.5 sm:grid-cols-4 sm:p-5">
      <EssentialAction
        href={createGoogleMapsSearchUrl(tokyoTripMeta.hotelMapsQuery)}
        icon={Hotel}
        label="숙소 지도"
        value="주소 확인"
      />
      <EssentialAction
        icon={ShoppingBag}
        label="근처 편의점"
        value="현위치 기준"
        onClick={() => onNearbySearchRequest('convenience_store')}
      />
      <EssentialAction
        icon={Languages}
        label="번역/회화"
        value="일본어 도움"
        onClick={() => onSelect('ai')}
      />
      <EssentialAction
        href={createGoogleMapsSearchUrl('Narita Airport Terminal 1 Terminal 3')}
        icon={Plane}
        label="공항 터미널"
        value="T1/T3 확인"
      />
    </CardContent>
  </Card>
);

const EssentialAction = ({
  href,
  icon: Icon,
  label,
  onClick,
  value,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  value: string;
}) => {
  const className =
    'flex h-[72px] w-full min-w-0 items-center gap-2.5 rounded-lg border border-border/70 bg-white px-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5';
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--surface-2))] text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-950">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground">
          {value}
        </span>
      </span>
    </>
  );

  if (href) {
    return (
      <a className={className} href={href} rel="noreferrer" target="_blank">
        {content}
      </a>
    );
  }

  return (
    <button className={className} type="button" onClick={onClick}>
      {content}
    </button>
  );
};

const LuggageDecisionPanel = () => {
  const [recommendation, setRecommendation] = useState<TripDecisionRecommendationResponse | null>(
    null,
  );
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRecommend = async () => {
    setIsLoading(true);
    setRecommendation(null);
    setRecommendationError(null);

    try {
      const response = await fetch('/api/gemini/recommend-trip-decision', {
        body: JSON.stringify({
          context: [
            'Day 2: 10:00 아카사카 숙소에서 아키하바라로 이동',
            '아키하바라에서 쇼핑/자유시간 후 짐이 생길 가능성이 높음',
            '17:00 이른 저녁은 아직 미정',
            '21:00 롯폰기로 출발, 22:00 곤파치',
            '곤파치 이후 숙소까지 도보 복귀 가능',
            `숙소: ${tokyoTripMeta.hotelName}, ${tokyoTripMeta.hotelAddress}`,
          ],
          options: [
            {
              details:
                '아키하바라에서 바로 롯폰기 곤파치로 이동한다. 시간은 짧지만 짐을 들고 다닌다.',
              id: 'direct_to_roppongi',
              label: '짐 들고 바로 롯폰기',
            },
            {
              details:
                '아키하바라에서 아카사카 숙소에 들러 짐을 두고 롯폰기 곤파치로 이동한다. 시간이 더 걸리지만 밤 일정이 가벼워진다.',
              id: 'drop_luggage_at_hotel',
              label: '숙소에 짐 두고 롯폰기',
            },
          ],
          question:
            '둘째날 아키하바라에서 다 놀고난 뒤 쇼핑 짐을 숙소에 두고 롯폰기 곤파치로 가는 편이 나은지 추천해줘.',
          title: '아키하바라 이후 짐 동선 판단',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Gemini decision route failed.'));
      }

      const data = (await response.json()) as Omit<TripDecisionRecommendationResponse, 'source'>;
      setRecommendation({ ...data, source: 'gemini' });
    } catch (error) {
      setRecommendationError(
        error instanceof Error && error.message
          ? error.message
          : 'AI 추천을 불러오지 못했어요. 잠시 후 다시 시도하세요.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden border-amber-200">
      <CardHeader className="border-b border-amber-200 bg-amber-50 p-3.5 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="metric-label">미정 판단</p>
            <CardTitle className="mt-1 text-base tracking-normal sm:text-lg">
              아키하바라 짐, 숙소에 두고 갈까?
            </CardTitle>
            <p className="mt-2 text-xs font-semibold leading-5 text-amber-900/75">
              쇼핑 짐을 들고 곤파치로 바로 갈지, 아카사카 숙소에 들렀다 갈지 비교합니다.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 border-amber-300 bg-white text-amber-800">
            Day 2
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3.5 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-white p-3">
            <p className="text-xs font-black text-slate-950">바로 이동</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
              시간이 짧지만 쇼핑 짐을 들고 저녁 일정까지 이동합니다.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-white p-3">
            <p className="text-xs font-black text-slate-950">숙소 경유</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
              이동은 늘지만 밤 일정과 도보 복귀가 훨씬 가벼워집니다.
            </p>
          </div>
        </div>

        <Button className="w-full" disabled={isLoading} onClick={handleRecommend}>
          <WandSparkles className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          {isLoading ? '동선 비교 중' : 'AI로 짐 동선 추천'}
        </Button>

        {recommendationError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
            {recommendationError}
          </p>
        ) : null}

        {recommendation ? <TripDecisionResult recommendation={recommendation} /> : null}
      </CardContent>
    </Card>
  );
};

const TripDecisionResult = ({
  recommendation,
}: {
  recommendation: TripDecisionRecommendationResponse;
}) => (
  <div className="rounded-lg border border-border/70 bg-white p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-black text-amber-700">{recommendation.recommendation}</p>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-950">{recommendation.summary}</p>
      </div>
      <Badge className="shrink-0">Gemini</Badge>
    </div>
    <div className="mt-3 grid gap-2">
      {recommendation.reasons.map((reason) => (
        <p
          key={reason}
          className="rounded-md bg-[hsl(var(--surface-2))] px-3 py-2 text-xs font-semibold leading-5 text-muted-foreground"
        >
          {reason}
        </p>
      ))}
    </div>
    {recommendation.actionPlan.length > 0 ? (
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-black text-amber-800">실행 순서</p>
        <ol className="mt-2 grid gap-1.5">
          {recommendation.actionPlan.map((item, index) => (
            <li key={item} className="text-xs font-semibold leading-5 text-amber-900">
              {index + 1}. {item}
            </li>
          ))}
        </ol>
      </div>
    ) : null}
  </div>
);

const TodayCommandPanel = ({
  location,
  onNearbySearchRequest,
  onSelect,
  tripContext,
}: {
  location: TravelLocationControl;
  onNearbySearchRequest: (category: NearbySearchCategory) => void;
  onSelect: (section: TokyoTravelSection) => void;
  tripContext: ReturnType<typeof getCurrentTripContext>;
}) => {
  const nextEvent = tripContext.nextEvent;
  const nextRouteUrl = getNextRouteUrl(nextEvent, location);
  const nextPlaceUrl = getEventPlaceUrl(nextEvent);
  const routeCount = getRouteEvents(tripContext.currentDay).length;
  const mealCount = tripContext.currentDay.events.filter((event) => event.meal).length;
  const undecidedMealCount = tripContext.currentDay.events.filter(
    (event) => event.meal?.status === 'undecided',
  ).length;
  const fixedCount = tripContext.currentDay.events.filter((event) => event.fixed).length;

  return (
    <Card className="overflow-hidden border-sky-200 shadow-sm">
      <CardContent className="p-0">
        <div className="bg-white p-3.5 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">오늘 바로 할 일</p>
              <h2 className="mt-1 break-words text-xl font-black tracking-normal sm:text-2xl">
                {nextEvent ? nextEvent.title : '오늘 일정 정리 완료'}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
                {nextEvent
                  ? `${getEventTimeLabel(nextEvent)} · ${nextEvent.area}`
                  : '숙소 복귀, 체크리스트, 내일 동선을 확인하세요.'}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 border-sky-200 bg-sky-50 text-sky-800">
              Day {tripContext.currentDay.day}
            </Badge>
          </div>

          <div className="mt-4 grid gap-2 min-[380px]:grid-cols-2">
            {nextRouteUrl ? (
              <Button asChild className="h-11 justify-between">
                <a href={nextRouteUrl} rel="noreferrer" target="_blank">
                  <span className="flex items-center gap-2">
                    <Navigation className="h-4 w-4" />
                    다음 경로
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : nextPlaceUrl ? (
              <Button asChild className="h-11 justify-between">
                <a href={nextPlaceUrl} rel="noreferrer" target="_blank">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    다음 장소
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : (
              <Button
                className="h-11 justify-between"
                type="button"
                onClick={() => onSelect('itinerary')}
              >
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  내일 보기
                </span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}

            <Button
              className="h-11 justify-between"
              type="button"
              variant="outline"
              onClick={() => onNearbySearchRequest('convenience_store')}
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                근처 편의점
              </span>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-border/70 border-t border-border/70 bg-white">
          <TodayMetric label="확정" value={`${fixedCount}`} />
          <TodayMetric label="이동" value={`${routeCount}`} />
          <TodayMetric label="식사" value={`${mealCount}`} />
          <TodayMetric label="미정" value={`${undecidedMealCount}`} />
        </div>

        <div className="hidden grid-cols-3 gap-2 border-t border-border/70 bg-[hsl(var(--surface-2))] p-3 sm:grid">
          <Button
            className="h-10"
            type="button"
            variant="outline"
            onClick={() => onSelect('itinerary')}
          >
            <CalendarDays className="h-4 w-4" />
            일정
          </Button>
          <Button
            className="h-10"
            type="button"
            variant="outline"
            onClick={() => onSelect('meals')}
          >
            <Utensils className="h-4 w-4" />
            식사
          </Button>
          <Button className="h-10" type="button" variant="outline" onClick={() => onSelect('map')}>
            <MapIcon className="h-4 w-4" />
            지도
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const TodayMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 px-1.5 py-2.5 text-center sm:px-2 sm:py-3">
    <p className="text-[11px] font-black text-muted-foreground">{label}</p>
    <p className="mt-1 text-base font-black tabular-nums text-slate-950 sm:text-lg">{value}</p>
  </div>
);

const CompactEventRow = ({ event }: { event: TripEvent }) => {
  const Icon = eventTypeIcons[event.type];

  return (
    <div className="grid grid-cols-[56px_36px_minmax(0,1fr)] items-start gap-3 rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] px-3 py-2.5">
      <p className="pt-2 text-sm font-black tabular-nums text-slate-950">
        {getEventTimeLabel(event)}
      </p>
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md border',
          eventTypeBadgeClassNames[event.type],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="break-words text-sm font-black leading-5">{event.title}</p>
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{event.area}</p>
      </div>
    </div>
  );
};

const QuickActionButton = ({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) => (
  <Button
    className="h-[70px] w-full min-w-0 flex-col justify-center gap-1.5 px-1.5 text-xs sm:h-14 sm:flex-row sm:justify-between sm:px-3 sm:text-sm"
    type="button"
    variant="outline"
    onClick={onClick}
  >
    <span className="flex min-w-0 flex-col items-center gap-1 font-black sm:flex-row sm:gap-2">
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </span>
    <ChevronRight className="hidden h-4 w-4 sm:block" />
  </Button>
);

const formatDistanceMeters = (distanceMeters: number | null) => {
  if (distanceMeters === null) {
    return '거리 확인 중';
  }

  if (distanceMeters < 1_000) {
    return `${distanceMeters}m`;
  }

  return `${(distanceMeters / 1_000).toFixed(1)}km`;
};

const formatTemperature = (temperature: number | null) =>
  temperature === null ? '-' : `${Math.round(temperature)}°`;

const formatPercent = (value: number | null) => (value === null ? '-' : `${Math.round(value)}%`);

const formatUv = (value: number | null) => {
  if (value === null) {
    return '-';
  }

  const rounded = value >= 10 ? Math.round(value) : Number(value.toFixed(1));

  return String(rounded);
};

const formatWind = (value: number | null) => (value === null ? '-' : `${Math.round(value)}km/h`);

const formatForecastDate = (dateText: string | null) => {
  if (!dateText) {
    return '예보';
  }

  const date = new Date(`${dateText}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return dateText;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'numeric',
    weekday: 'short',
  }).format(date);
};

const readApiErrorMessage = async (response: Response, fallback: string) => {
  const data = (await response.json().catch(() => null)) as ApiErrorResponse | null;

  return data?.upstreamMessage ?? data?.error ?? fallback;
};

const getWeatherAdviceItems = (weather: TravelWeatherResponse) => {
  const current = weather.current;
  const maxValue = (values: Array<number | null | undefined>) => {
    const validValues = values.filter((value): value is number => typeof value === 'number');

    return validValues.length > 0 ? Math.max(...validValues) : null;
  };
  const precipitation = maxValue([
    current.precipitationProbability,
    ...weather.forecastDays.map((day) => day.precipitationProbability),
  ]);
  const uvIndex = maxValue([current.uvIndex, ...weather.forecastDays.map((day) => day.uvIndex)]);
  const temperature = maxValue([
    current.feelsLikeCelsius,
    current.temperatureCelsius,
    ...weather.forecastDays.map((day) => day.maxTemperatureCelsius),
  ]);
  const windKph = maxValue([current.windKph, ...weather.forecastDays.map((day) => day.windKph)]);
  const adviceItems: Array<{
    icon: LucideIcon;
    label: string;
    tone: string;
  }> = [];

  if (precipitation !== null && precipitation >= 40) {
    adviceItems.push({
      icon: Umbrella,
      label: '접이식 우산',
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
    });
  }

  if (uvIndex !== null && uvIndex >= 6) {
    adviceItems.push({
      icon: CloudSun,
      label: '선크림/모자',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }

  if (temperature !== null && temperature >= 29) {
    adviceItems.push({
      icon: Coffee,
      label: '물·휴식',
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }

  if (windKph !== null && windKph >= 25) {
    adviceItems.push({
      icon: Wind,
      label: '바람 대비',
      tone: 'border-slate-200 bg-slate-50 text-slate-800',
    });
  }

  if (adviceItems.length === 0) {
    adviceItems.push({
      icon: CheckCircle2,
      label: '가볍게 이동',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    });
  }

  return adviceItems;
};

const WeatherPanel = ({ location }: { location: TravelLocationControl }) => {
  const [scope, setScope] = useState<'current' | 'tokyo'>('tokyo');
  const [weather, setWeather] = useState<TravelWeatherResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeCoordinates = scope === 'current' ? location.coordinates : tokyoBaseCoordinates;
  const activeLatitude = activeCoordinates?.latitude ?? null;
  const activeLongitude = activeCoordinates?.longitude ?? null;
  const isWaitingForCurrentLocation = scope === 'current' && !location.coordinates;

  const handleScopeChange = (nextScope: 'current' | 'tokyo') => {
    setScope(nextScope);

    if (nextScope === 'current' && !location.coordinates) {
      location.requestLocation();
    }
  };

  useEffect(() => {
    if (activeLatitude === null || activeLongitude === null) {
      return;
    }

    let isCancelled = false;

    const loadWeather = async () => {
      setIsLoading(true);
      setWeatherError(null);

      try {
        const response = await fetch('/api/maps/weather', {
          body: JSON.stringify({
            days: 3,
            latitude: activeLatitude,
            longitude: activeLongitude,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response, 'Google Weather request failed.'));
        }

        const data = (await response.json()) as TravelWeatherResponse;

        if (!isCancelled) {
          setWeather(data);
        }
      } catch (error) {
        if (!isCancelled) {
          setWeather(null);
          setWeatherError(
            error instanceof Error && error.message
              ? error.message
              : '날씨를 불러오지 못했어요. 잠시 후 다시 시도하세요.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadWeather();

    return () => {
      isCancelled = true;
    };
  }, [activeLatitude, activeLongitude]);

  const adviceItems = weather ? getWeatherAdviceItems(weather) : [];

  return (
    <Card className="overflow-hidden border-sky-200">
      <CardHeader className="border-b border-sky-200 bg-sky-50 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="metric-label">실시간 여행 판단</p>
            <CardTitle className="mt-1 text-lg tracking-normal">
              {scope === 'current' ? '현위치 날씨' : '아카사카 날씨'}
            </CardTitle>
            <p className="mt-2 text-xs font-semibold leading-5 text-sky-900/70">
              비, 더위, UV, 바람을 보고 오늘 챙길 것을 바로 정리합니다.
            </p>
          </div>
          <CloudSun className="h-5 w-5 shrink-0 text-sky-700" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className={cn(
              'h-9 rounded-md border px-3 text-xs font-black transition-colors',
              scope === 'tokyo'
                ? 'border-sky-400 bg-white text-sky-900'
                : 'border-sky-200 bg-sky-100/70 text-sky-800 hover:bg-white',
            )}
            type="button"
            onClick={() => handleScopeChange('tokyo')}
          >
            도쿄
          </button>
          <button
            className={cn(
              'h-9 rounded-md border px-3 text-xs font-black transition-colors',
              scope === 'current'
                ? 'border-sky-400 bg-white text-sky-900'
                : 'border-sky-200 bg-sky-100/70 text-sky-800 hover:bg-white',
            )}
            type="button"
            onClick={() => handleScopeChange('current')}
          >
            현위치
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {isWaitingForCurrentLocation ? (
          <div className="rounded-lg border border-dashed border-sky-200 bg-white p-4 text-sm font-semibold leading-6 text-sky-900/75">
            위치 권한을 허용하면 지금 서 있는 곳 기준으로 날씨와 준비물을 다시 계산합니다.
          </div>
        ) : null}

        {location.errorMessage && scope === 'current' ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
            {location.errorMessage} 브라우저에서 위치 권한을 켠 뒤 다시 눌러주세요.
          </p>
        ) : null}

        {weatherError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
            Google Weather 오류: {weatherError}
          </p>
        ) : null}

        {isLoading ? (
          <div className="grid gap-2">
            <div className="h-28 animate-pulse rounded-lg bg-sky-100" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-lg bg-sky-100/70" />
              ))}
            </div>
          </div>
        ) : weather ? (
          <>
            <div className="rounded-lg border border-sky-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-sky-700">
                    {weather.current.condition ?? '현재 날씨'} ·{' '}
                    {weather.source === 'open_meteo' ? 'Open-Meteo' : 'Google Weather'}
                  </p>
                  <p className="mt-1 text-4xl font-black tracking-normal text-slate-950">
                    {formatTemperature(weather.current.temperatureCelsius)}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                    체감 {formatTemperature(weather.current.feelsLikeCelsius)} · 습도{' '}
                    {formatPercent(weather.current.humidity)}
                  </p>
                </div>
                {weather.current.iconUrl ? (
                  <img alt="" className="h-16 w-16 shrink-0" src={weather.current.iconUrl} />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <CloudSun className="h-7 w-7" />
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <WeatherMetric
                  icon={Umbrella}
                  label="강수"
                  value={formatPercent(weather.current.precipitationProbability)}
                />
                <WeatherMetric
                  icon={CloudSun}
                  label="UV"
                  value={formatUv(weather.current.uvIndex)}
                />
                <WeatherMetric
                  icon={Wind}
                  label="바람"
                  value={formatWind(weather.current.windKph)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {adviceItems.map((item) => (
                <Badge
                  key={item.label}
                  variant="outline"
                  className={cn('gap-1.5 px-2.5 py-1', item.tone)}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Badge>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {weather.forecastDays.slice(0, 3).map((day) => (
                <div
                  key={day.date ?? day.condition ?? 'forecast'}
                  className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3"
                >
                  <p className="text-[11px] font-black text-muted-foreground">
                    {formatForecastDate(day.date)}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {day.iconUrl ? <img alt="" className="h-7 w-7" src={day.iconUrl} /> : null}
                    <p className="text-sm font-black">
                      {formatTemperature(day.minTemperatureCelsius)} /{' '}
                      {formatTemperature(day.maxTemperatureCelsius)}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-muted-foreground">
                    {day.condition ?? `강수 ${formatPercent(day.precipitationProbability)}`}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};

const WeatherMetric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <div className="rounded-md bg-sky-50 px-2.5 py-2">
    <p className="flex items-center gap-1.5 text-[11px] font-black text-sky-800">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </p>
    <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
  </div>
);

const formatCoordinatesForDisplay = (coordinates: TravelLocationControl['coordinates']) =>
  coordinates
    ? `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`
    : '좌표 없음';

const formatAccuracyMeters = (accuracyMeters: number | null) => {
  if (accuracyMeters === null) {
    return '정확도 확인 중';
  }

  if (accuracyMeters < 1_000) {
    return `±${accuracyMeters}m`;
  }

  return `±${(accuracyMeters / 1_000).toFixed(1)}km`;
};

const formatLocationUpdatedAt = (updatedAt: number | null) => {
  if (!updatedAt) {
    return '갱신 전';
  }

  const elapsedMs = Date.now() - updatedAt;

  if (elapsedMs < 60_000) {
    return '방금 갱신';
  }

  if (elapsedMs < 3_600_000) {
    return `${Math.floor(elapsedMs / 60_000)}분 전 갱신`;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(updatedAt));
};

const LocationInsightPanel = ({
  location,
  onNearbySearchRequest,
}: {
  location: TravelLocationControl;
  onNearbySearchRequest: (category: NearbySearchCategory) => void;
}) => {
  const [locationInfo, setLocationInfo] = useState<ReverseGeocodeResponse | null>(null);
  const [locationInfoError, setLocationInfoError] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const coordinates = location.coordinates;
  const latitude = coordinates?.latitude ?? null;
  const longitude = coordinates?.longitude ?? null;
  const currentLocationMapUrl = createGoogleMapsCurrentLocationUrl(coordinates);
  const hotelDirectionsUrl = createGoogleMapsDirectionsFromCurrentLocationUrl(
    tokyoTripMeta.hotelMapsQuery,
    'transit',
    coordinates,
  );

  useEffect(() => {
    if (latitude === null || longitude === null) {
      return;
    }

    let isCancelled = false;

    const resolveAddress = async () => {
      setIsResolvingAddress(true);
      setLocationInfoError(null);

      try {
        const response = await fetch('/api/maps/reverse-geocode', {
          body: JSON.stringify({
            latitude,
            longitude,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response, 'Google Geocoding request failed.'));
        }

        const data = (await response.json()) as ReverseGeocodeResponse;

        if (!isCancelled) {
          setLocationInfo(data);
          setLocationInfoError(null);
        }
      } catch {
        if (!isCancelled) {
          setLocationInfo(null);
          setLocationInfoError(
            '주소명은 잠시 확인하지 못했어요. 좌표 기준 기능은 그대로 사용할 수 있습니다.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsResolvingAddress(false);
        }
      }
    };

    void resolveAddress();

    return () => {
      isCancelled = true;
    };
  }, [latitude, longitude]);

  if (!coordinates) {
    return (
      <Card className="overflow-hidden border-violet-200">
        <CardHeader className="border-b border-violet-200 bg-violet-50 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="metric-label">현위치 컨텍스트</p>
              <CardTitle className="mt-1 text-lg tracking-normal">
                위치를 켜면 더 정확해집니다
              </CardTitle>
              <p className="mt-2 text-xs font-semibold leading-5 text-violet-900/70">
                주변 검색, 현위치 출발 길찾기, 현위치 날씨가 모두 실제 위치 기준으로 바뀝니다.
              </p>
            </div>
            <Crosshair className="h-5 w-5 shrink-0 text-violet-700" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <Button
            className="h-12 w-full justify-between"
            disabled={location.isLoading}
            type="button"
            onClick={location.requestLocation}
          >
            <span className="flex items-center gap-2">
              <LocateFixed className={cn('h-4 w-4', location.isLoading && 'animate-pulse')} />
              {location.isLoading ? '위치 확인 중' : '현위치 켜기'}
            </span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {location.errorMessage ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
              {location.errorMessage} 브라우저 위치 권한을 허용한 뒤 다시 시도하세요.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button asChild className="h-10" variant="outline">
              <a
                href={createGoogleMapsSearchUrl(tokyoTripMeta.hotelMapsQuery)}
                rel="noreferrer"
                target="_blank"
              >
                <Hotel className="h-4 w-4" />
                숙소 지도
              </a>
            </Button>
            <Button asChild className="h-10" variant="outline">
              <a
                href={createGoogleMapsSearchUrl('Narita Airport')}
                rel="noreferrer"
                target="_blank"
              >
                <Plane className="h-4 w-4" />
                공항 지도
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-violet-200">
      <CardHeader className="border-b border-violet-200 bg-violet-50 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="metric-label">현위치 컨텍스트</p>
            <CardTitle className="mt-1 break-words text-lg tracking-normal">
              {isResolvingAddress ? '주소 확인 중' : (locationInfo?.shortLabel ?? '좌표 기준 위치')}
            </CardTitle>
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-violet-900/70">
              {isResolvingAddress
                ? formatCoordinatesForDisplay(coordinates)
                : (locationInfo?.address ?? formatCoordinatesForDisplay(coordinates))}
            </p>
          </div>
          <LocationStatusButton location={location} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <LocationMetric
            icon={Crosshair}
            label="정확도"
            value={formatAccuracyMeters(location.accuracyMeters)}
          />
          <LocationMetric
            icon={Clock}
            label="갱신"
            value={formatLocationUpdatedAt(location.updatedAt)}
          />
          <LocationMetric
            icon={Compass}
            label="좌표"
            value={formatCoordinatesForDisplay(coordinates)}
            wide
          />
        </div>

        {locationInfoError ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
            {locationInfoError}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button asChild className="h-11 justify-between" variant="outline">
            <a href={currentLocationMapUrl} rel="noreferrer" target="_blank">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />내 위치
              </span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild className="h-11 justify-between">
            <a href={hotelDirectionsUrl} rel="noreferrer" target="_blank">
              <span className="flex items-center gap-2">
                <Navigation className="h-4 w-4" />
                숙소까지
              </span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button
            className="h-11 justify-between"
            type="button"
            variant="outline"
            onClick={() => onNearbySearchRequest('convenience_store')}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              편의점
            </span>
            <Search className="h-4 w-4" />
          </Button>
          <Button
            className="h-11 justify-between"
            type="button"
            variant="outline"
            onClick={() => onNearbySearchRequest('station')}
          >
            <span className="flex items-center gap-2">
              <Train className="h-4 w-4" />
              가까운 역
            </span>
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const LocationMetric = ({
  icon: Icon,
  label,
  value,
  wide = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  wide?: boolean;
}) => (
  <div
    className={cn(
      'min-w-0 rounded-md bg-violet-50 px-2.5 py-2',
      wide && 'col-span-2 sm:col-span-1',
    )}
  >
    <p className="flex items-center gap-1.5 text-[11px] font-black text-violet-800">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </p>
    <p className="mt-1 truncate text-xs font-black text-slate-950">{value}</p>
  </div>
);

const NearbySearchPanel = ({
  location,
  selectedCategory,
  onSelectedCategoryChange,
}: {
  location: TravelLocationControl;
  selectedCategory: NearbySearchCategory | null;
  onSelectedCategoryChange: (category: NearbySearchCategory) => void;
}) => {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [resultLabel, setResultLabel] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const activeItem =
    nearbySearchItems.find((item) => item.category === selectedCategory) ?? nearbySearchItems[0];

  const requestNearbyPlaces = (category: NearbySearchCategory) => {
    onSelectedCategoryChange(category);
    setPlaces([]);
    setResultLabel(null);
    setSearchError(null);

    if (!location.coordinates) {
      location.requestLocation();
    }
  };

  useEffect(() => {
    const coordinates = location.coordinates;

    if (!selectedCategory || !coordinates) {
      return;
    }

    let isCancelled = false;

    const loadNearbyPlaces = async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const response = await fetch('/api/maps/nearby-search', {
          body: JSON.stringify({
            category: selectedCategory,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            radiusMeters: 900,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response, 'Google Places search failed.'));
        }

        const data = (await response.json()) as NearbySearchResponse;

        if (!isCancelled) {
          setPlaces(data.places);
          setResultLabel(data.label);
        }
      } catch (error) {
        if (!isCancelled) {
          setPlaces([]);
          setSearchError(
            error instanceof Error && error.message
              ? `Google Places 오류: ${error.message}`
              : '주변 검색을 불러오지 못했어요. 잠시 후 다시 시도하세요.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    };

    void loadNearbyPlaces();

    return () => {
      isCancelled = true;
    };
  }, [location.coordinates, selectedCategory]);

  return (
    <Card className="overflow-hidden border-emerald-200" id="nearby-search">
      <CardHeader className="border-b border-emerald-200 bg-emerald-50 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="metric-label">현장 검색</p>
            <CardTitle className="mt-1 text-lg tracking-normal">내 주변 빠른 검색</CardTitle>
            <p className="mt-2 text-xs font-semibold leading-5 text-emerald-900/70">
              {location.hasCoordinates
                ? `${formatAccuracyMeters(location.accuracyMeters)} 범위의 현재 위치 기준으로 가까운 장소를 거리순으로 불러옵니다.`
                : '현재 위치를 켜면 실제 주변 후보를 바로 보여줍니다.'}
            </p>
          </div>
          <LocationStatusButton location={location} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
          {nearbySearchItems.map((item) => (
            <NearbySearchButton
              key={item.label}
              isActive={selectedCategory === item.category}
              item={item}
              onClick={() => requestNearbyPlaces(item.category)}
            />
          ))}
        </div>

        {location.errorMessage ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
            {location.errorMessage} 브라우저에서 위치 권한을 켠 뒤 다시 검색하세요.
          </p>
        ) : null}

        {searchError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
            {searchError}
          </p>
        ) : null}

        {isSearching ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-[86px] animate-pulse rounded-lg bg-emerald-100/70" />
            ))}
          </div>
        ) : places.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-emerald-800">
                {resultLabel ?? activeItem.label} {places.length}곳
              </p>
              <a
                className="text-xs font-black text-primary underline-offset-4 hover:underline"
                href={createGoogleMapsNearbySearchUrl(activeItem.query, location.coordinates)}
                rel="noreferrer"
                target="_blank"
              >
                Maps에서 더 보기
              </a>
            </div>
            <div className="grid gap-2">
              {places.map((place) => (
                <NearbyPlaceCard key={place.id} location={location} place={place} />
              ))}
            </div>
          </div>
        ) : selectedCategory && location.hasCoordinates ? (
          <p className="rounded-md bg-[hsl(var(--surface-2))] px-3 py-3 text-xs font-semibold leading-5 text-muted-foreground">
            반경 900m 안에서 {activeItem.label} 결과를 찾지 못했습니다.
          </p>
        ) : (
          <p className="rounded-md bg-[hsl(var(--surface-2))] px-3 py-3 text-xs font-semibold leading-5 text-muted-foreground">
            편의점처럼 필요한 항목을 누르면 위치 권한 확인 후 주변 후보를 보여줍니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const NearbySearchButton = ({
  isActive,
  item,
  onClick,
}: {
  isActive: boolean;
  item: (typeof nearbySearchItems)[number];
  onClick: () => void;
}) => {
  const Icon = item.icon;

  return (
    <button
      className={cn(
        'group flex min-h-[62px] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition-colors sm:min-h-[76px] sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:p-3 sm:text-left',
        isActive
          ? 'border-emerald-400 bg-emerald-50'
          : 'border-border/70 bg-white hover:border-emerald-300 hover:bg-emerald-50',
      )}
      type="button"
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 flex-col items-center gap-1 text-xs font-black text-slate-950 sm:flex-row sm:gap-2 sm:text-sm">
          <Icon className="h-4 w-4 text-emerald-700" />
          <span className="truncate">{item.label}</span>
        </span>
        <span className="mt-1 hidden text-xs font-semibold leading-5 text-muted-foreground sm:block">
          {item.helper}
        </span>
      </span>
      <Search className="mt-0.5 hidden h-4 w-4 shrink-0 text-emerald-700 transition-transform group-hover:scale-110 sm:block" />
    </button>
  );
};

const NearbyPlaceCard = ({
  location,
  place,
}: {
  location: TravelLocationControl;
  place: NearbyPlace;
}) => {
  const destination = place.location
    ? `${place.location.latitude},${place.location.longitude}`
    : `${place.name} ${place.address}`;
  const directionsUrl = createGoogleMapsDirectionsFromCurrentLocationUrl(
    destination,
    'walking',
    location.coordinates,
  );

  return (
    <div className="rounded-lg border border-border/70 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="break-words text-sm font-black text-slate-950">{place.name}</p>
            {place.isOpenNow !== null ? (
              <Badge
                variant="outline"
                className={cn(
                  'h-5 px-1.5 text-[10px]',
                  place.isOpenNow
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600',
                )}
              >
                {place.isOpenNow ? '영업중' : '영업외'}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
            {formatDistanceMeters(place.distanceMeters)}
            {place.rating ? ` · ${place.rating.toFixed(1)}점` : ''}
            {place.reviewCount ? ` · 리뷰 ${place.reviewCount.toLocaleString('ko-KR')}` : ''}
          </p>
          {place.address ? (
            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-muted-foreground">
              {place.address}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={place.googleMapsUrl} rel="noreferrer" target="_blank">
            <MapPin className="h-4 w-4" />
            지도
          </a>
        </Button>
        <Button asChild size="sm">
          <a href={directionsUrl} rel="noreferrer" target="_blank">
            <Navigation className="h-4 w-4" />
            길찾기
          </a>
        </Button>
      </div>
    </div>
  );
};

const ItinerarySection = ({ location }: { location: TravelLocationControl }) => (
  <Tabs defaultValue="1" className="space-y-4">
    <TabsList className="grid h-auto grid-cols-3 p-1">
      {tokyoTripDays.map((day) => (
        <TabsTrigger
          key={day.day}
          className="h-10 text-xs font-black sm:text-sm"
          value={String(day.day)}
        >
          Day {day.day}
        </TabsTrigger>
      ))}
    </TabsList>
    {tokyoTripDays.map((day) => (
      <TabsContent key={day.day} className="mt-0 space-y-4" value={String(day.day)}>
        <DayHeader day={day} />
        <div className="grid gap-3">
          {day.events.map((event) => (
            <TimelineCard key={event.id} event={event} location={location} />
          ))}
        </div>
      </TabsContent>
    ))}
  </Tabs>
);

const DayHeader = ({ day }: { day: TripDay }) => (
  <Card>
    <CardContent className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="metric-label">{day.label}</p>
          <h2 className="mt-1 text-xl font-black tracking-normal">Day {day.day}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            {day.summary}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {day.areas.map((area) => (
            <Badge key={area} variant="outline">
              {area}
            </Badge>
          ))}
        </div>
      </div>
    </CardContent>
  </Card>
);

const TimelineCard = ({
  event,
  location,
}: {
  event: TripEvent;
  location: TravelLocationControl;
}) => {
  const searchUrl = event.place ? createGoogleMapsSearchUrl(event.place.googleMapsQuery) : null;
  const directionsUrl = event.route
    ? createGoogleMapsDirectionsFromCurrentLocationUrl(
        event.route.destination,
        event.route.mode,
        location.coordinates,
      )
    : null;
  const plannedDirectionsUrl = event.route
    ? createGoogleMapsDirectionsUrl(event.route.origin, event.route.destination, event.route.mode)
    : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-0 p-0 sm:grid-cols-[112px_minmax(0,1fr)]">
        <div className="border-b border-border/70 bg-[hsl(var(--surface-2))] p-4 sm:border-b-0 sm:border-r">
          <p className="text-lg font-black tabular-nums">{getEventTimeLabel(event)}</p>
          <Badge
            variant="outline"
            className={cn('mt-2 w-fit', eventTypeBadgeClassNames[event.type])}
          >
            {eventTypeLabels[event.type]}
          </Badge>
        </div>
        <div className="min-w-0 p-4">
          <div className="flex items-start gap-3">
            <EventIcon event={event} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-black tracking-normal">
                    {event.title}
                  </h3>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">{event.area}</p>
                </div>
                <Badge variant={event.fixed ? 'secondary' : 'outline'} className="w-fit shrink-0">
                  {event.fixed ? '확정' : '미정'}
                </Badge>
              </div>
              {event.description ? (
                <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
                  {event.description}
                </p>
              ) : null}
              {event.route ? <RouteSummary event={event} /> : null}
              {event.meal ? <MealSummary event={event} /> : null}
              {event.notes?.length ? (
                <div className="mt-3 grid gap-1.5">
                  {event.notes.map((note) => (
                    <p
                      key={note}
                      className="flex gap-2 text-xs font-semibold text-muted-foreground"
                    >
                      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>{note}</span>
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {searchUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={searchUrl} rel="noreferrer" target="_blank">
                      <Search className="h-4 w-4" />
                      장소 검색
                    </a>
                  </Button>
                ) : null}
                {directionsUrl ? (
                  <Button asChild size="sm">
                    <a href={directionsUrl} rel="noreferrer" target="_blank">
                      <Navigation className="h-4 w-4" />
                      현위치 길찾기
                    </a>
                  </Button>
                ) : null}
                {plannedDirectionsUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={plannedDirectionsUrl} rel="noreferrer" target="_blank">
                      <Route className="h-4 w-4" />
                      계획 경로
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const EventIcon = ({ event }: { event: TripEvent }) => {
  const Icon = eventTypeIcons[event.type];

  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
        eventTypeBadgeClassNames[event.type],
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
};

const RouteSummary = ({ event }: { event: TripEvent }) => {
  if (!event.route) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3">
      <p className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-800">
        <Route className="h-4 w-4 text-primary" />
        {event.route.origin}
        <ArrowRight className="h-3.5 w-3.5" />
        {event.route.destination}
      </p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        {travelModeLabels[event.route.mode ?? 'transit']} ·{' '}
        {event.route.estimatedDuration ?? '시간 확인 필요'}
      </p>
    </div>
  );
};

const MealSummary = ({ event }: { event: TripEvent }) => {
  if (!event.meal) {
    return null;
  }

  const meal = event.meal;

  return (
    <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/70 p-3">
      <p className="text-xs font-black text-orange-700">
        {meal.status === 'fixed' ? '확정 식사' : '추천 필요'}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-950">
        {meal.restaurantName ?? meal.menu ?? meal.candidateCategories?.join(', ') ?? '메뉴 미정'}
      </p>
      {meal.recommendationReason ? (
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
          {meal.recommendationReason}
        </p>
      ) : null}
    </div>
  );
};

const MealsSection = () => {
  const [recommendation, setRecommendation] = useState<MealRecommendationResponse | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fixedMeals = getFixedMealSlots();
  const undecidedMeals = getUndecidedMealSlots();

  const handleRecommendMeal = async () => {
    const target = undecidedMeals[0];

    if (!target) {
      return;
    }

    setIsLoading(true);
    setRecommendation(null);
    setRecommendationError(null);

    try {
      const response = await fetch('/api/gemini/recommend-meal', {
        body: JSON.stringify({
          area: target.event.area,
          avoidCategories: target.meal.avoidCategories ?? [],
          candidateCategories: target.meal.candidateCategories ?? [],
          day: target.day.day,
          nextSchedule: '22:00 곤파치 롯폰기',
          previousMeal: '규카츠',
          time: target.event.time,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Gemini recommendation route failed.'));
      }

      const data = (await response.json()) as Omit<MealRecommendationResponse, 'source'>;
      setRecommendation({ ...data, source: 'gemini' });
    } catch (error) {
      setRecommendationError(
        error instanceof Error && error.message
          ? error.message
          : 'AI 추천을 불러오지 못했어요. 잠시 후 다시 시도하세요.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <SectionTitle
          description="확정된 식사와 아직 추천이 필요한 식사를 분리해서 봅니다."
          title="식사 계획"
        />
        <div className="grid gap-3 md:grid-cols-2">
          {fixedMeals.map(({ day, event, meal }) => (
            <Card key={event.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <EventIcon event={event} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-muted-foreground">
                      Day {day.day} · {event.time} · {event.area}
                    </p>
                    <h3 className="mt-1 text-base font-black">
                      {meal.restaurantName ?? meal.menu}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">
                      {event.title}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Card className="overflow-hidden border-orange-200">
          <CardHeader className="border-b border-orange-200 bg-orange-50">
            <CardTitle className="text-lg tracking-normal">미정 식사 추천</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {undecidedMeals.map(({ day, event, meal }) => (
              <div
                key={event.id}
                className="rounded-lg border border-dashed border-orange-300 bg-white p-3"
              >
                <p className="text-xs font-black text-orange-700">
                  Day {day.day} · {event.time} · {event.area}
                </p>
                <p className="mt-1 text-sm font-black">{event.title}</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">
                  {meal.recommendationReason}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {meal.candidateCategories?.map((category) => (
                    <Badge key={category} variant="outline">
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}

            <Button className="w-full" disabled={isLoading} onClick={handleRecommendMeal}>
              <WandSparkles className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              {isLoading ? '추천 정리 중' : 'AI 추천 보기'}
            </Button>

            {recommendationError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
                {recommendationError}
              </p>
            ) : null}

            {recommendation ? <MealRecommendationResult recommendation={recommendation} /> : null}
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {tokyoRestaurantCandidates.map((candidate) => (
            <RestaurantCandidateCard key={candidate.id} candidate={candidate} />
          ))}
        </div>
      </div>
    </div>
  );
};

const MealRecommendationResult = ({
  recommendation,
}: {
  recommendation: MealRecommendationResponse;
}) => (
  <div className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-bold leading-6">{recommendation.summary}</p>
      <Badge className="shrink-0">Gemini</Badge>
    </div>
    <div className="mt-3 grid gap-2">
      {recommendation.rankedCategories.map((item) => (
        <div
          key={`${item.rank}-${item.category}`}
          className="rounded-md border border-border/70 bg-card p-3"
        >
          <p className="text-sm font-black">
            {item.rank}. {item.category}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
            {item.reason}
          </p>
          {item.caution ? (
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-700">{item.caution}</p>
          ) : null}
        </div>
      ))}
    </div>
  </div>
);

const RestaurantCandidateCard = ({ candidate }: { candidate: RestaurantCandidate }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-muted-foreground">{candidate.area}</p>
          <h3 className="mt-1 text-base font-black">{candidate.category}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            {candidate.reason}
          </p>
          <p className="mt-2 text-xs font-bold text-primary">{candidate.travelTimeToNext}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={candidate.mapsUrl} rel="noreferrer" target="_blank">
            <MapPin className="h-4 w-4" />
            지도
          </a>
        </Button>
      </div>
    </CardContent>
  </Card>
);

const MapSection = ({
  location,
  selectedNearbyCategory,
  onSelectedNearbyCategoryChange,
}: {
  location: TravelLocationControl;
  selectedNearbyCategory: NearbySearchCategory | null;
  onSelectedNearbyCategoryChange: (category: NearbySearchCategory) => void;
}) => (
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
    <div className="space-y-4">
      <SectionTitle
        description="계획 장소와 현재 위치 기반 Places 주변 검색을 함께 봅니다."
        title="지도"
      />
      <NearbySearchPanel
        location={location}
        selectedCategory={selectedNearbyCategory}
        onSelectedCategoryChange={onSelectedNearbyCategoryChange}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {tokyoTripPlaces.slice(0, 6).map((place) => (
          <MapLinkCard key={place.id} place={place} />
        ))}
      </div>
    </div>

    <div className="space-y-4">
      <SectionTitle description="각 이동은 길찾기 링크로 열립니다." title="주요 이동" />
      {tokyoTripDays.flatMap((day) =>
        getRouteEvents(day).map((event) => (
          <RouteCard key={event.id} event={event} location={location} showDay={day.day} />
        )),
      )}
    </div>
  </div>
);

const MapLinkCard = ({ place }: { place: TripPlace }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-muted-foreground">
            {place.visitDays.map((day) => `Day ${day}`).join(', ')}
          </p>
          <h3 className="mt-1 break-words text-base font-black">{place.name}</h3>
          <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-muted-foreground">
            {place.nextMove ?? place.description}
          </p>
        </div>
        <Button asChild size="sm">
          <a
            href={createGoogleMapsSearchUrl(place.googleMapsQuery)}
            rel="noreferrer"
            target="_blank"
          >
            <MapPin className="h-4 w-4" />
            열기
          </a>
        </Button>
      </div>
    </CardContent>
  </Card>
);

const RouteCard = ({
  event,
  location,
  showDay,
}: {
  event: TripEvent;
  location?: TravelLocationControl;
  showDay?: number;
}) => {
  if (!event.route) {
    return null;
  }

  const directionsUrl =
    event.route.googleMapsUrl ??
    createGoogleMapsDirectionsUrl(event.route.origin, event.route.destination, event.route.mode);
  const currentDirectionsUrl = location
    ? createGoogleMapsDirectionsFromCurrentLocationUrl(
        event.route.destination,
        event.route.mode,
        location.coordinates,
      )
    : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <Navigation className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-muted-foreground">
              {showDay ? `Day ${showDay} · ` : ''}
              {getEventTimeLabel(event)}
            </p>
            <p className="mt-1 break-words text-sm font-black">
              {event.route.origin} → {event.route.destination}
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {travelModeLabels[event.route.mode ?? 'transit']} · {event.route.estimatedDuration}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {currentDirectionsUrl ? (
                <Button asChild size="sm">
                  <a href={currentDirectionsUrl} rel="noreferrer" target="_blank">
                    <Navigation className="h-4 w-4" />
                    현위치 출발
                  </a>
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <a href={directionsUrl} rel="noreferrer" target="_blank">
                  <MapIcon className="h-4 w-4" />
                  계획 경로
                </a>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const PlacesSection = () => (
  <div className="space-y-4">
    <SectionTitle
      description="방문일, 관련 식사, 다음 이동을 장소 기준으로 정리했습니다."
      title="장소"
    />
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tokyoTripPlaces.map((place) => (
        <PlaceCard key={place.id} place={place} />
      ))}
    </div>
  </div>
);

const PlaceCard = ({ place }: { place: TripPlace }) => {
  const mapUrl = createGoogleMapsSearchUrl(place.googleMapsQuery);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-[hsl(var(--surface-2))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="metric-label">{place.area}</p>
            <CardTitle className="mt-1 break-words text-lg tracking-normal">{place.name}</CardTitle>
          </div>
          <Badge variant="outline" className="shrink-0">
            {place.category}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <p className="text-sm font-semibold leading-6 text-muted-foreground">{place.description}</p>
        <InfoList
          items={[
            ['방문일', place.visitDays.map((day) => `Day ${day}`).join(', ')],
            ['관련 식사', place.relatedMeals?.join(', ') ?? '없음'],
            ['다음 이동', place.nextMove ?? '확인 필요'],
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          {place.activities.map((activity) => (
            <Badge key={activity} variant="secondary">
              {activity}
            </Badge>
          ))}
        </div>
        <Button asChild className="w-full" variant="outline">
          <a href={mapUrl} rel="noreferrer" target="_blank">
            <MapPin className="h-4 w-4" />
            Google Maps 열기
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};

const InfoSection = ({ location }: { location: TravelLocationControl }) => (
  <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
    <div className="space-y-4">
      <Card className="overflow-hidden border-sky-200">
        <CardHeader className="border-b border-sky-200 bg-sky-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="metric-label">여행 포켓</p>
              <CardTitle className="mt-1 text-lg tracking-normal">바로 필요한 정보</CardTitle>
            </div>
            <ListChecks className="h-5 w-5 text-sky-700" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 p-4">
          <PocketAction
            href={createGoogleMapsSearchUrl(tokyoTripMeta.hotelMapsQuery)}
            icon={Hotel}
            label="숙소 지도"
            value={tokyoTripMeta.hotelName}
          />
          <PocketAction
            href={createGoogleMapsSearchUrl('Narita Airport Terminal 1 Terminal 3')}
            icon={Plane}
            label="공항 터미널"
            value={tokyoTripMeta.airportNote}
          />
          <PocketAction
            href={createGoogleMapsDirectionsFromCurrentLocationUrl(
              'Narita Airport',
              'transit',
              location.coordinates,
            )}
            icon={Navigation}
            label="현위치 공항 이동"
            value="나리타까지 길찾기"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg tracking-normal">숙소 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoList
            items={[
              ['이름', tokyoTripMeta.hotelName],
              ['주소', tokyoTripMeta.hotelAddress],
              ['체크인', tokyoTripMeta.hotelCheckIn],
              ['체크아웃', tokyoTripMeta.hotelCheckOut],
            ]}
          />
          <Button asChild className="w-full">
            <a
              href={createGoogleMapsSearchUrl(tokyoTripMeta.hotelMapsQuery)}
              rel="noreferrer"
              target="_blank"
            >
              <MapPin className="h-4 w-4" />
              숙소 지도 열기
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg tracking-normal">공항 터미널</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <TerminalCard label="가연" terminal="나리타 T3" />
          <TerminalCard label="나머지" terminal="나리타 T1" />
        </CardContent>
      </Card>
    </div>

    <div className="space-y-4">
      <SectionTitle
        description="현장에서 바로 체크할 수 있도록 출국 전/현지/공항 항목을 나눴습니다."
        title="체크리스트"
      />
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(checklistSectionLabels).map(([section, label]) => (
          <ChecklistGroup
            key={section}
            items={tokyoChecklistItems.filter(
              (item) => item.section === (section as ChecklistItem['section']),
            )}
            label={label}
          />
        ))}
      </div>
    </div>
  </div>
);

const PocketAction = ({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <a
    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-white px-3 py-3 transition-colors hover:border-sky-300 hover:bg-sky-50"
    href={href}
    rel="noreferrer"
    target="_blank"
  >
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-muted-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-sm font-black text-slate-950">{value}</span>
      </span>
    </span>
    <ExternalLink className="h-4 w-4 shrink-0 text-sky-700" />
  </a>
);

const TerminalCard = ({ label, terminal }: { label: string; terminal: string }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3">
    <div>
      <p className="metric-label">{label}</p>
      <p className="mt-1 text-base font-black">{terminal}</p>
    </div>
    <Plane className="h-5 w-5 text-primary" />
  </div>
);

const ChecklistGroup = ({ items, label }: { items: ChecklistItem[]; label: string }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base tracking-normal">{label}</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-2 pt-0">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-2 rounded-md bg-[hsl(var(--surface-2))] p-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm font-semibold leading-5">{item.label}</p>
        </div>
      ))}
    </CardContent>
  </Card>
);

const AiToolsSection = () => (
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
    <TranslatePanel />
    <div className="space-y-4">
      <CameraInterpretPanel />
      <PhrasePanel phrases={tokyoTravelPhrases} />
    </div>
  </div>
);

const TranslatePanel = () => {
  const [text, setText] = useState('これは持ち帰りできますか？');
  const [translation, setTranslation] = useState<TranslateResponse | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTranslate = async () => {
    setIsLoading(true);
    setTranslation(null);
    setTranslationError(null);

    try {
      const response = await fetch('/api/gemini/translate', {
        body: JSON.stringify({
          context: 'travel',
          sourceLanguage: 'ja',
          targetLanguage: 'ko',
          text,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Gemini translate route failed.'));
      }

      const data = (await response.json()) as Omit<TranslateResponse, 'source'>;
      setTranslation({ ...data, source: 'gemini' });
    } catch (error) {
      setTranslationError(
        error instanceof Error && error.message
          ? error.message
          : '번역을 불러오지 못했어요. 잠시 후 다시 시도하세요.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="metric-label">Gemini 확장 슬롯</p>
            <CardTitle className="mt-1 text-lg tracking-normal">빠른 번역</CardTitle>
          </div>
          <Languages className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea
          className="min-h-[160px] w-full resize-none rounded-lg border border-input bg-card px-3 py-3 text-sm font-semibold leading-6 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/30"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          className="w-full"
          disabled={isLoading || text.trim().length === 0}
          onClick={handleTranslate}
        >
          <WandSparkles className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          {isLoading ? '번역 중' : '번역하기'}
        </Button>
        {translationError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
            {translationError}
          </p>
        ) : null}
        {translation ? (
          <div className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-black">{translation.translatedText}</p>
              <Badge>Gemini</Badge>
            </div>
            {translation.notes.length > 0 ? (
              <ul className="mt-3 grid gap-1.5">
                {translation.notes.map((note) => (
                  <li key={note} className="text-xs font-semibold leading-5 text-muted-foreground">
                    {note}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

const CameraInterpretPanel = () => {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="metric-label">메뉴판/표지판</p>
            <CardTitle className="mt-1 text-lg tracking-normal">이미지 해석</CardTitle>
          </div>
          <Camera className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-[hsl(var(--surface-2))] p-4 text-center transition-colors hover:border-primary/40">
          <Camera className="h-8 w-8 text-muted-foreground" />
          <span className="mt-3 text-sm font-black">사진 선택 또는 촬영</span>
          <span className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
            현장에서 확인할 메뉴판이나 표지판 사진을 선택하세요.
          </span>
          <input
            accept="image/*"
            capture="environment"
            className="sr-only"
            type="file"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
        </label>
        {fileName ? (
          <div className="rounded-lg border border-border/70 bg-card p-3">
            <p className="text-xs font-black text-muted-foreground">선택한 파일</p>
            <p className="mt-1 truncate text-sm font-bold">{fileName}</p>
          </div>
        ) : null}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
          제품 정보는 사진 속 상품명과 라벨을 기준으로 확인하는 것이 가장 정확합니다.
        </div>
      </CardContent>
    </Card>
  );
};

const PhrasePanel = ({ phrases }: { phrases: TravelPhrase[] }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg tracking-normal">상황별 문장</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-2">
      {phrases.map((phrase) => (
        <div
          key={phrase.id}
          className="rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3"
        >
          <p className="text-xs font-black text-primary">{phrase.situation}</p>
          <p className="mt-1 text-sm font-black">{phrase.korean}</p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{phrase.japanese}</p>
        </div>
      ))}
    </CardContent>
  </Card>
);

const SectionTitle = ({ description, title }: { description: string; title: string }) => (
  <div className="rounded-lg border border-border/70 bg-card p-4 sm:p-5">
    <p className="metric-label">Tokyo 2026</p>
    <h2 className="mt-1 text-xl font-black tracking-normal">{title}</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">{description}</p>
  </div>
);

const InfoList = ({ items }: { items: Array<[string, string]> }) => (
  <dl className="grid gap-2">
    {items.map(([label, value]) => (
      <div
        key={label}
        className="grid gap-1 rounded-lg border border-border/70 bg-[hsl(var(--surface-2))] p-3"
      >
        <dt className="text-xs font-black text-muted-foreground">{label}</dt>
        <dd className="break-words text-sm font-bold">{value}</dd>
      </div>
    ))}
  </dl>
);

export { TokyoTravelPage };
