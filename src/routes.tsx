import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/common/AppLayout';
import { RequireAuth } from '@/components/common/RequireAuth';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { MasterDataPage } from '@/pages/MasterDataPage';
import { SessionsPage } from '@/pages/SessionsPage';
import { SettingsPage } from '@/pages/SettingsPage';

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
        <Route path="/sessions" element={<SessionsPage />} />
        <Route
          path="/stats"
          element={
            <LazyPage>
              <StatsPage />
            </LazyPage>
          }
        />
        <Route path="/master-data" element={<MasterDataPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Route>
  </Routes>
);

export { AppRoutes };
