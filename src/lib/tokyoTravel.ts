import { tokyoTripDays } from '@/data/tokyoTravel';
import type { MealInfo, TripContext, TripDay, TripEvent, TripEventType } from '@/types/tokyoTravel';

const tokyoTimeZone = 'Asia/Tokyo';

const eventTypePriority = {
  activity: 5,
  airport: 6,
  arrival: 1,
  free: 8,
  hotel: 3,
  meal: 4,
  shopping: 7,
  transport: 2,
} satisfies Record<TripEventType, number>;

const getTokyoDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: tokyoTimeZone,
    year: 'numeric',
  }).formatToParts(date);

  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';

  return {
    dateKey: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
    hour: Number(getPart('hour')),
    minute: Number(getPart('minute')),
  };
};

const getDateLabel = (date: Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'long',
    timeZone: tokyoTimeZone,
    weekday: 'short',
  }).format(date);

const getTripDayByDate = (dateKey: string) =>
  tokyoTripDays.find((day) => day.date === dateKey) ?? null;

export const parseTripTimeToMinutes = (time: string) => {
  const match = time.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return Number.POSITIVE_INFINITY;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

export const sortTripEvents = (events: TripEvent[]) =>
  [...events].sort((left, right) => {
    const timeDelta = parseTripTimeToMinutes(left.time) - parseTripTimeToMinutes(right.time);

    if (timeDelta !== 0) {
      return timeDelta;
    }

    return eventTypePriority[left.type] - eventTypePriority[right.type];
  });

export const getCurrentTripContext = (now: Date = new Date()): TripContext => {
  const { dateKey, hour, minute } = getTokyoDateParts(now);
  const currentDayByDate = getTripDayByDate(dateKey);
  const firstDay = tokyoTripDays[0];
  const lastDay = tokyoTripDays[tokyoTripDays.length - 1];

  if (!currentDayByDate) {
    const phase = dateKey < firstDay.date ? 'before' : 'after';
    const currentDay = phase === 'before' ? firstDay : lastDay;
    const sortedEvents = sortTripEvents(currentDay.events);

    return {
      currentDay,
      currentEvent: phase === 'before' ? null : (sortedEvents[sortedEvents.length - 1] ?? null),
      nextEvent: phase === 'before' ? (sortedEvents[0] ?? null) : null,
      phase,
      todayDateLabel: getDateLabel(now),
    };
  }

  const currentMinutes = hour * 60 + minute;
  const sortedEvents = sortTripEvents(currentDayByDate.events);
  const currentEvent =
    [...sortedEvents]
      .reverse()
      .find((event) => parseTripTimeToMinutes(event.time) <= currentMinutes) ?? null;
  const nextEvent =
    sortedEvents.find((event) => parseTripTimeToMinutes(event.time) > currentMinutes) ?? null;

  return {
    currentDay: currentDayByDate,
    currentEvent,
    nextEvent,
    phase: 'during',
    todayDateLabel: getDateLabel(now),
  };
};

export const getDaySummary = (day: TripDay) =>
  `${day.label} · ${day.areas.join(' → ')} · ${day.summary}`;

export const getMealSlots = () =>
  tokyoTripDays.flatMap((day) =>
    day.events
      .filter((event): event is TripEvent & { meal: MealInfo } => Boolean(event.meal))
      .map((event) => ({
        day,
        event,
        meal: event.meal,
      })),
  );

export const getUndecidedMealSlots = () =>
  getMealSlots().filter(({ meal }) => meal.status === 'undecided');

export const getFixedMealSlots = () => getMealSlots().filter(({ meal }) => meal.status === 'fixed');

export const getRouteEvents = (day: TripDay) => day.events.filter((event) => event.route);

export const getEventTimeLabel = (event: Pick<TripEvent, 'time'>) =>
  event.time.startsWith('24:') || event.time.startsWith('25:') ? `${event.time} 이후` : event.time;
