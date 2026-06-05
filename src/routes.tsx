import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/common/AppLayout';
import { RequireAuth } from '@/components/common/RequireAuth';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { LivePage } from '@/pages/LivePage';
import { MasterDataPage } from '@/pages/MasterDataPage';
import { SessionsPage } from '@/pages/SessionsPage';
import { SettingsPage } from '@/pages/SettingsPage';

const RecordsPage = lazy(() =>
  import('@/pages/RecordsPage').then((module) => ({ default: module.RecordsPage })),
);

const CommunityPage = lazy(() =>
  import('@/pages/CommunityPage').then((module) => ({ default: module.CommunityPage })),
);

const StatsPage = lazy(() =>
  import('@/pages/StatsPage').then((module) => ({ default: module.StatsPage })),
);

const LazyPage = ({ children }: { children: ReactNode }) => (
  <Suspense
    fallback={<div className="text-sm font-semibold text-muted-foreground">불러오는 중</div>}
  >
    {children}
  </Suspense>
);

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireAuth />}>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/live" element={<LivePage />} />
        <Route
          path="/records"
          element={
            <LazyPage>
              <RecordsPage />
            </LazyPage>
          }
        />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route
          path="/community"
          element={
            <LazyPage>
              <CommunityPage />
            </LazyPage>
          }
        />
        <Route
          path="/community/friends/:friendId"
          element={
            <LazyPage>
              <CommunityPage />
            </LazyPage>
          }
        />
        <Route path="/stats" element={<Navigate to="/stats/maps" replace />} />
        <Route
          path="/stats/:section"
          element={
            <LazyPage>
              <StatsPage />
            </LazyPage>
          }
        />
        <Route path="/master-data" element={<MasterDataPage />} />
        <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
      </Route>
    </Route>
  </Routes>
);

export { AppRoutes };
