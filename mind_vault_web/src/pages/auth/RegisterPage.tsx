import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../../api/auth';
import { Button, Input } from '../../components/ui';
import { APP_PATHS } from '../../app/navigation';
import { isApiError } from '../../lib/errors';
import { useAuthStore } from '../../stores/auth.store';
import { AuthShell } from './AuthShell';

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;
const MIN_PASSWORD_LENGTH = 8;

const ASIDE_STEPS = ['创建你的资料集', '上传学习与面试资料', '开始提问与训练'];

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  function validate(trimmedUsername: string): string | undefined {
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      return '用户名需为 3-64 位字母、数字、下划线或中划线';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
    }
    if (password !== confirmPassword) {
      return '两次密码需要保持一致';
    }
    return undefined;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim();
    const invalid = validate(trimmedUsername);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const session = await register({ username: trimmedUsername, password });
      setSession(session);
      void navigate(APP_PATHS.overview, { replace: true });
    } catch (error_) {
      setError(isApiError(error_) ? error_.message : '注册失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      asideExtra={
        <ol className="auth-steps">
          {ASIDE_STEPS.map((step, index) => (
            <li key={step}>
              <span aria-hidden="true" className="auth-step-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              {step}
            </li>
          ))}
        </ol>
      }
      description="从一份资料开始，让 Mind Vault 帮你把内容变成可理解、可复习、可表达的知识。"
      eyebrow="BUILD YOUR SECOND BRAIN"
      headline="建立属于你的第二大脑。"
    >
      <p className="auth-eyebrow auth-eyebrow--brand">知识工作台</p>
      <h1 className="auth-title">创建你的账号</h1>
      <p className="auth-subtitle">只需要用户名和密码，马上建立个人知识空间。</p>

      <form aria-describedby={error ? 'register-error' : undefined} className="login-form" onSubmit={submit}>
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
          <label htmlFor="password">密码</label>
          <Input
            aria-describedby="password-hint"
            autoComplete="new-password"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位字符"
            type="password"
            value={password}
          />
          <p className="field-hint" id="password-hint">建议使用字母、数字与符号组合。</p>
        </div>

        <div className="form-field">
          <label htmlFor="confirmPassword">确认密码</label>
          <Input
            autoComplete="new-password"
            id="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="再次输入密码"
            type="password"
            value={confirmPassword}
          />
        </div>

        {error ? <p className="form-error" id="register-error" role="alert">{error}</p> : null}

        <Button aria-busy={submitting} className="auth-submit" disabled={submitting} type="submit">
          {submitting ? '正在创建' : '创建知识空间'}
        </Button>
      </form>

      <p className="auth-footer-link">
        已有账号？ <Link to={APP_PATHS.login}>返回登录</Link>
      </p>
    </AuthShell>
  );
}