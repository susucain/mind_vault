import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../../api/auth';
import { Button, Input } from '../../components/ui';
import { APP_PATHS } from '../../app/navigation';
import { isApiError } from '../../lib/errors';
import { readStoredValue, removeStoredValue } from '../../lib/storage';
import { POST_LOGIN_REDIRECT_KEY, useAuthStore } from '../../stores/auth.store';
import { AuthIllustration } from './AuthIllustration';
import { AuthShell } from './AuthShell';

function redirectPath(state: unknown): string | undefined {
  if (!state || typeof state !== 'object' || !('from' in state)) return undefined;
  const from = state.from;
  if (typeof from === 'string') return from.startsWith('/') ? from : undefined;
  if (!from || typeof from !== 'object' || !('pathname' in from) || typeof from.pathname !== 'string') return undefined;
  const search = 'search' in from && typeof from.search === 'string' ? from.search : '';
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : '';
  return `${from.pathname}${search}${hash}`;
}

const ASIDE_CHIPS = ['创建资料集', '上传资料', '开始提问'];

/** 退出登录后由 logout() 透传的一次性标记，用来在登录页显示一条轻提示 */
function isLoggedOut(state: unknown): boolean {
  return Boolean(state && typeof state === 'object' && 'loggedOut' in state && state.loggedOut);
}

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  // 只取一次初值：清空 history state 后仍能保留这条提示，而不是随路由更新立刻消失
  const [notice] = useState(() => (isLoggedOut(location.state) ? '已退出登录' : null));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  // 提示只读一次：清掉 history state，避免刷新或前进后退时重复弹出
  useEffect(() => {
    if (!isLoggedOut(location.state)) return;
    void navigate(APP_PATHS.login, { replace: true, state: null });
  }, [location.state, navigate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const session = await login({ username: username.trim(), password });
      setSession(session);
      const target = redirectPath(location.state)
        ?? readStoredValue<string>(POST_LOGIN_REDIRECT_KEY)
        ?? APP_PATHS.overview;
      removeStoredValue(POST_LOGIN_REDIRECT_KEY);
      void navigate(target, { replace: true });
    } catch (error_) {
      setError(isApiError(error_) ? error_.message : '登录失败，请检查用户名和密码。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      asideExtra={
        <>
          <ul className="auth-chips">
            {ASIDE_CHIPS.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
          <AuthIllustration />
        </>
      }
      description="上传、提问、训练，再把每一次思考沉淀成下一次更好的回答。"
      eyebrow="PERSONAL KNOWLEDGE WORKSPACE"
      headline="把你的资料，变成可以持续对话的知识库。"
    >
      <p className="auth-eyebrow auth-eyebrow--brand">知识工作台</p>
      <h1 className="auth-title">登录 Mind Vault</h1>
      <p className="auth-subtitle">进入你的资料、问答会话与面试训练。</p>

      {notice ? (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      ) : null}

      <form aria-describedby={error ? 'login-error' : undefined} className="login-form" onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="username">用户名</label>
          <Input
            autoComplete="username"
            id="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="例如：未央"
            value={username}
          />
        </div>

        <div className="form-field">
          <div className="field-header">
            <label htmlFor="password">密码</label>
            <button
              className="field-action"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? '隐藏' : '显示'}
            </button>
          </div>
          <Input
            autoComplete="current-password"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
            type={showPassword ? 'text' : 'password'}
            value={password}
          />
        </div>

        {error ? <p className="form-error" id="login-error" role="alert">{error}</p> : null}

        <Button aria-busy={submitting} className="auth-submit" disabled={submitting} type="submit">
          {submitting ? '正在登录' : '进入工作台'}
        </Button>

        <p className="auth-tip">开发环境提示：登录后会保留你的会话、资料与训练进度。</p>
      </form>

      <p className="auth-footer-link">
        还没有账号？ <Link to={APP_PATHS.register}>创建知识空间</Link>
      </p>
      <p className="auth-note">你的资料只属于你 · Mind Vault</p>
    </AuthShell>
  );
}