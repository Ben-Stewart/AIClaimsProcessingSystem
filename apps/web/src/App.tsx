import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { UserRole } from '@claims/shared';
import { AppLayout } from './components/layout/AppLayout';
import { ClientLayout } from './components/layout/ClientLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClaimsListPage } from './pages/ClaimsListPage';
import { NewClaimPage } from './pages/NewClaimPage';
import { ClaimDetailPage } from './pages/ClaimDetailPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ClientLoginPage } from './pages/client/ClientLoginPage';
import { ClientRegisterPage } from './pages/client/ClientRegisterPage';
import { ClientDashboardPage } from './pages/client/ClientDashboardPage';
import { ClientNewClaimPage } from './pages/client/ClientNewClaimPage';
import { ClientClaimDetailPage } from './pages/client/ClientClaimDetailPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === UserRole.CLIENT) return <Navigate to="/client" replace />;
  return <>{children}</>;
}

function ClientProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/client/login" replace />;
  if (user.role !== UserRole.CLIENT) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Staff portal */}
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="claims" element={<ClaimsListPage />} />
        <Route path="claims/new" element={<NewClaimPage />} />
        <Route path="claims/:id/*" element={<ClaimDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      {/* Client portal */}
      <Route path="/client/login" element={<ClientLoginPage />} />
      <Route path="/client/register" element={<ClientRegisterPage />} />
      <Route
        path="/client"
        element={
          <ClientProtectedRoute>
            <ClientLayout />
          </ClientProtectedRoute>
        }
      >
        <Route index element={<ClientDashboardPage />} />
        <Route path="claims/new" element={<ClientNewClaimPage />} />
        <Route path="claims/:id" element={<ClientClaimDetailPage />} />
      </Route>
    </Routes>
  );
}
