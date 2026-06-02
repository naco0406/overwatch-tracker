import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/hooks/useAuth';
import { LiveCaptureProvider } from '@/hooks/useLiveCapture';
import { AppRoutes } from '@/routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LiveCaptureProvider>
          <AppRoutes />
          <Toaster />
        </LiveCaptureProvider>
      </AuthProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
