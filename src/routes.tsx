import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AppLayout } from '@/components/common/AppLayout';
import { RequireAuth } from '@/components/common/RequireAuth';
import { TOKYO_TRAVEL_ROUTE, temporaryFeatureFlags } from '@/features/temporaryFeatures';
import { LoginPage } from '@/pages/LoginPage';

const HomePage = lazy(() =>
  import('@/pages/HomePage').then((module) => ({ default: module.HomePage })),
);

const LivePage = lazy(() =>
  import('@/pages/LivePage').then((module) => ({ default: module.LivePage })),
);

const MasterDataPage = lazy(() =>
  import('@/pages/MasterDataPage').then((module) => ({ default: module.MasterDataPage })),
);

const SessionsPage = lazy(() =>
  import('@/pages/SessionsPage').then((module) => ({ default: module.SessionsPage })),
);

const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);

const RecordsPage = lazy(() =>
  import('@/pages/RecordsPage').then((module) => ({ default: module.RecordsPage })),
);

const FriendsPage = lazy(() =>
  import('@/pages/FriendsPage').then((module) => ({ default: module.FriendsPage })),
);

const CommunityPage = lazy(() =>
  import('@/pages/CommunityPage').then((module) => ({ default: module.CommunityPage })),
);

const StatsPage = lazy(() =>
  import('@/pages/StatsPage').then((module) => ({ default: module.StatsPage })),
);

const ExternalDataPage = lazy(() =>
  import('@/pages/ExternalDataPage').then((module) => ({ default: module.ExternalDataPage })),
);

const ExternalEsportsMatchPage = lazy(() =>
  import('@/pages/ExternalEsportsMatchPage').then((module) => ({
    default: module.ExternalEsportsMatchPage,
  })),
);

const TokyoTravelPage = lazy(() =>
  import('@/pages/TokyoTravelPage').then((module) => ({ default: module.TokyoTravelPage })),
);

const LazyPage = ({ children }: { children: ReactNode }) => (
  <Suspense
    fallback={
      <div
        aria-live="polite"
        className="workspace-panel ow-panel-cap flex min-h-56 items-center justify-center overflow-hidden"
        role="status"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <div>
            <p className="text-sm font-black">전투 기록 불러오는 중</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              최신 데이터를 준비하고 있습니다.
            </p>
          </div>
        </div>
      </div>
    }
  >
    {children}
  </Suspense>
);

const LegacyCommunityFriendRedirect = () => {
  const { friendId } = useParams<{ friendId: string }>();

  return <Navigate to={friendId ? `/friends/${friendId}` : '/friends'} replace />;
};

const AppRoutes = () => (
  <Routes>
    {temporaryFeatureFlags.tokyoTravelRoute ? (
      <Route
        path={TOKYO_TRAVEL_ROUTE}
        element={
          <LazyPage>
            <TokyoTravelPage />
          </LazyPage>
        }
      />
    ) : null}
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireAuth />}>
      <Route element={<AppLayout />}>
        <Route
          path="/"
          element={
            <LazyPage>
              <HomePage />
            </LazyPage>
          }
        />
        <Route
          path="/live"
          element={
            <LazyPage>
              <LivePage />
            </LazyPage>
          }
        />
        <Route
          path="/records"
          element={
            <LazyPage>
              <RecordsPage />
            </LazyPage>
          }
        />
        <Route
          path="/sessions"
          element={
            <LazyPage>
              <SessionsPage />
            </LazyPage>
          }
        />
        <Route
          path="/community"
          element={
            <LazyPage>
              <CommunityPage />
            </LazyPage>
          }
        />
        <Route path="/community/friends/:friendId" element={<LegacyCommunityFriendRedirect />} />
        <Route
          path="/friends"
          element={
            <LazyPage>
              <FriendsPage />
            </LazyPage>
          }
        />
        <Route
          path="/friends/:friendId"
          element={
            <LazyPage>
              <FriendsPage />
            </LazyPage>
          }
        />
        <Route path="/stats" element={<Navigate to="/stats/maps" replace />} />
        <Route path="/stats/external" element={<Navigate to="/external-data/heroes" replace />} />
        <Route
          path="/stats/:section"
          element={
            <LazyPage>
              <StatsPage />
            </LazyPage>
          }
        />
        <Route path="/external-data" element={<Navigate to="/external-data/heroes" replace />} />
        <Route
          path="/external-data/overview"
          element={<Navigate to="/external-data/heroes" replace />}
        />
        <Route
          path="/external-data/assets"
          element={
            <LazyPage>
              <MasterDataPage />
            </LazyPage>
          }
        />
        <Route
          path="/external-data/esports/matches/:eventId"
          element={
            <LazyPage>
              <ExternalEsportsMatchPage />
            </LazyPage>
          }
        />
        <Route
          path="/external-data/:section"
          element={
            <LazyPage>
              <ExternalDataPage />
            </LazyPage>
          }
        />
        <Route path="/master-data" element={<Navigate to="/external-data/assets" replace />} />
        <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
        <Route
          path="/settings/:section"
          element={
            <LazyPage>
              <SettingsPage />
            </LazyPage>
          }
        />
      </Route>
    </Route>
  </Routes>
);

export { AppRoutes };
