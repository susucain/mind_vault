import type { PropsWithChildren, ReactNode } from 'react';

interface AuthShellProps {
  eyebrow: string;
  headline: string;
  description: string;
  asideExtra?: ReactNode;
}

/** 登录 / 注册共用的外框：左侧深色品牌栏 + 右侧表单区 */
export function AuthShell({
  asideExtra,
  children,
  description,
  eyebrow,
  headline,
}: PropsWithChildren<AuthShellProps>) {
  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <div className="auth-brand">
          <span aria-hidden="true" className="auth-brand-badge">
            MV
          </span>
          <span className="auth-brand-name">Mind Vault</span>
        </div>
        <div className="auth-aside-body">
          <p className="auth-eyebrow">{eyebrow}</p>
          <h2 className="auth-headline">{headline}</h2>
          <p className="auth-description">{description}</p>
          {asideExtra}
        </div>
      </aside>
      <main className="auth-content">
        <div className="auth-panel">{children}</div>
      </main>
    </div>
  );
}