import type { FormEvent, PropsWithChildren } from 'react';
import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { devLogin } from '../api/auth';
import { Button, Input, LoadingState } from '../components/ui';
import { POST_LOGIN_REDIRECT_KEY, useAuthStore } from '../stores/auth.store';
import { readStoredValue, removeStoredValue } from '../lib/storage';
import { AppShell } from './AppShell';
import { APP_PATHS } from './navigation';

function redirectPathFromState(state: unknown): string | undefined {
  if (!state || typeof state !== 'object' || !('from' in state)) return undefined;

  const from = state.from;
  if (typeof from === 'string') return from.startsWith('/') ? from : undefined;
  if (!from || typeof from !== 'object' || !('pathname' in from) || typeof from.pathname !== 'string') {
    return undefined;
  }

  const search = 'search' in from && typeof from.search === 'string' ? from.search : '';
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : '';
  return `${from.pathname}${search}${hash}`;
}

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <div className="auth-layout">
      <section className="auth-brand">
        <BookOpen aria-hidden="true" size={26} />
        <span>Mind Vault</span>
      </section>
      <main className="auth-content">{children}</main>
    </div>
  );
}

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const setSession = useAuthStore((state) => state.setSession);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const session = await devLogin({ nickname: nickname.trim() || undefined });
      setSession(session);
      const redirectPath =
        redirectPathFromState(location.state) ??
        readStoredValue<string>(POST_LOGIN_REDIRECT_KEY) ??
        APP_PATHS.overview;
      removeStoredValue(POST_LOGIN_REDIRECT_KEY);
      void navigate(redirectPath, { replace: true });
    } catch {
      setError('Unable to sign in. Check the service and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="login-form" onSubmit={submit}>
        <p className="eyebrow">Knowledge workspace</p>
        <h1>Sign in to Mind Vault</h1>
        <p className="muted">Continue to your documents, conversations, and interview practice.</p>
        <label htmlFor="nickname">Name</label>
        <Input id="nickname" onChange={(event) => setNickname(event.target.value)} placeholder="Your name" value={nickname} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <Button disabled={submitting} type="submit">{submitting ? 'Signing in...' : 'Sign in'}</Button>
      </form>
    </AuthLayout>
  );
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
