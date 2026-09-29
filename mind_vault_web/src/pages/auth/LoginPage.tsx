import type { FormEvent } from 'react';
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { devLogin } from '../../api/auth';
import { Button, Input } from '../../components/ui';
import { APP_PATHS } from '../../app/navigation';
import { readStoredValue, removeStoredValue } from '../../lib/storage';
import { POST_LOGIN_REDIRECT_KEY, useAuthStore } from '../../stores/auth.store';

function redirectPath(state: unknown): string | undefined {
  if (!state || typeof state !== 'object' || !('from' in state)) return undefined;
  const from = state.from;
  if (typeof from === 'string') return from.startsWith('/') ? from : undefined;
  if (!from || typeof from !== 'object' || !('pathname' in from) || typeof from.pathname !== 'string') return undefined;
  const search = 'search' in from && typeof from.search === 'string' ? from.search : '';
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : '';
  return `${from.pathname}${search}${hash}`;
}

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const session = await devLogin({ nickname: nickname.trim() || undefined });
      setSession(session);
      const target = redirectPath(location.state)
        ?? readStoredValue<string>(POST_LOGIN_REDIRECT_KEY)
        ?? APP_PATHS.overview;
      removeStoredValue(POST_LOGIN_REDIRECT_KEY);
      void navigate(target, { replace: true });
    } catch {
      setError('登录失败，请检查服务状态后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-brand">
        <BookOpen aria-hidden="true" size={26} />
        <span>Mind Vault</span>
      </section>
      <main className="auth-content">
        <form aria-describedby={error ? 'login-error' : undefined} className="login-form" onSubmit={submit}>
          <p className="eyebrow">知识工作台</p>
          <h1>登录 Mind Vault</h1>
          <p className="muted">开发环境登录，用于访问资料、问答与面试训练。</p>
          <label htmlFor="nickname">显示名称</label>
          <Input
            autoComplete="name"
            id="nickname"
            onChange={(event) => setNickname(event.target.value)}
            placeholder="例如：小明"
            value={nickname}
          />
          {error ? <p className="form-error" id="login-error" role="alert">{error}</p> : null}
          <Button aria-busy={submitting} disabled={submitting} type="submit">
            {submitting ? '正在登录' : '进入工作台'}
          </Button>
        </form>
      </main>
    </div>
  );
}
