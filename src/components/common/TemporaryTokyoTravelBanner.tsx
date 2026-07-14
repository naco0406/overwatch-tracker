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
    <div className="h-14 border-b border-border bg-sky-50 px-3.5 sm:px-6 xl:h-16 xl:px-8">
      <Link
        to={TOKYO_TRAVEL_ROUTE}
        className={cn(
          'group mx-auto flex h-full w-full max-w-none items-center justify-between gap-3 text-left transition-colors hover:bg-sky-100/70',
          'border-x border-sky-100/80 px-3 sm:px-4',
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-600 text-white shadow-sm xl:h-10 xl:w-10">
            <Plane className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-slate-950">
              안란방 도쿄 여행 바로가기
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-sky-800 sm:gap-2 sm:text-xs">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">2026.7.4 - 7.6</span>
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden truncate min-[420px]:inline">도쿄 일정/지도/식사</span>
              <span className="truncate min-[420px]:hidden">일정/지도</span>
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-sky-700 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
};

export { TemporaryTokyoTravelBanner };
