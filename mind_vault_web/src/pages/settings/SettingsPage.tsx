import { Outlet } from 'react-router-dom';
import { SettingsNav } from './components/SettingsNav';

/** 个人设置页壳：顶部分区导航 + 分区内容 outlet（分区为嵌套路由，可深链与刷新保持）。 */
export function SettingsPage() {
  return (
    <section className="page-section settings-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>个人设置</h1>
        </div>
      </header>
      <div className="settings-layout">
        <SettingsNav />
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </section>
  );
}