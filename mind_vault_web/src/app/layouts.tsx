import type { PropsWithChildren } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '../components/ui';
import { useAuthStore } from '../stores/auth.store';
import { AppShell } from './AppShell';
export { LoginPage } from '../pages/auth/LoginPage';

export function AuthLayout({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function ProtectedLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.token);
  const location = useLocation();

  if (!hydrated) return <LoadingState label="Restoring session" />;
  if (!token) return <Navigate replace state={{ from: location }} to="/login" />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
