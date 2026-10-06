import { Brain, ShieldCheck, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { APP_PATHS } from '../../../app/navigation';

const sections = [
  { to: APP_PATHS.settingsAccount, label: '账户信息', icon: UserRound },
  { to: APP_PATHS.settingsMemory, label: '长期记忆', icon: Brain },
  { to: APP_PATHS.settingsSecurity, label: '安全', icon: ShieldCheck },
];

/** 分区导航：桌面为左侧 sticky 竖排，紧凑/移动端由样式切换为横向可滚 tabs。 */
export function SettingsNav() {
  return (
    <nav aria-label="设置分区" className="settings-nav">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <NavLink
            className={({ isActive }) => `settings-nav__link${isActive ? ' settings-nav__link--active' : ''}`}
            key={section.to}
            to={section.to}
          >
            <Icon aria-hidden="true" size={18} />
            <span>{section.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}