import { ArrowRight, CalendarDays, MapPin, Plane } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { TOKYO_TRAVEL_ROUTE, temporaryFeatureFlags } from '@/features/temporaryFeatures';
import { cn } from '@/lib/utils';

const TemporaryTokyoTravelBanner = () => {
  const location = useLocation();

  if (!temporaryFeatureFlags.showTokyoTravelBanner || location.pathname === TOKYO_TRAVEL_ROUTE) {
    return null;
  }

  return (
    <div className="border-b border-border/70 bg-background/95 px-3.5 py-2 backdrop-blur-xl sm:px-6 xl:px-8">
      <Link
        to={TOKYO_TRAVEL_ROUTE}
        className={cn(
          'group mx-auto flex min-h-12 w-full max-w-none items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left shadow-sm transition-[border-color,background-color,box-shadow] hover:border-sky-300 hover:bg-sky-100/80 hover:shadow-md',
          'xl:min-h-14 xl:px-4',
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-600 text-white xl:h-10 xl:w-10">
            <Plane className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-slate-950">
              안란방 도쿄 여행 바로가기
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] font-bold text-sky-800 sm:text-xs">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">2026.7.4 - 7.6</span>
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">도쿄 일정/지도/식사</span>
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-sky-700 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
};

export { TemporaryTokyoTravelBanner };
