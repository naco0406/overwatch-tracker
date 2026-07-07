export const TOKYO_TRAVEL_ROUTE = '/tokyo-travel-2026';

export const temporaryFeatureFlags = {
  // 도쿄 여행은 종료되어 진입 퍼널만 닫아둡니다.
  // 페이지/데이터/API 코드는 보존하고, 다시 필요하면 두 값을 true로 되돌리면 됩니다.
  showTokyoTravelBanner: false,
  tokyoTravelRoute: false,
} as const;
