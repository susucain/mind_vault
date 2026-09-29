import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BookOpen,
  BrainCircuit,
  FolderKanban,
  Home,
  MessageSquareText,
  PanelLeft,
  Search,
  Settings,
} from 'lucide-react';
import { CommandMenu, Tooltip } from '../components/ui';
import { useAppStore } from '../stores/app.store';
import { APP_PATHS } from './navigation';

interface NavigationItem {
  label: string;
  to: string;
  icon: typeof Home;
  match?: (pathname: string) => boolean;
}

const navigation: NavigationItem[] = [
  { label: '概览', to: APP_PATHS.overview, icon: Home },
  {
    label: '知识库',
    to: APP_PATHS.library,
    icon: FolderKanban,
    match: (pathname) => pathname.startsWith('/app/library'),
  },
  {
    label: '问答',
    to: APP_PATHS.chatNew,
    icon: MessageSquareText,
    match: (pathname) => pathname.startsWith('/app/chat'),
  },
  {
    label: '面试训练',
    to: APP_PATHS.interview,
    icon: BrainCircuit,
    match: (pathname) => pathname.startsWith('/app/interview'),
  },
  {
    label: '个人设置',
    to: APP_PATHS.settingsAccount,
    icon: Settings,
    match: (pathname) => pathname.startsWith('/app/settings'),
  },
];

const mobileNavigation: NavigationItem[] = [
  { ...navigation[0], label: '首页' },
  { ...navigation[1] },
  { ...navigation[3], label: '面试' },
  {
    label: '我的',
    to: APP_PATHS.settingsAccount,
    icon: Settings,
    match: (pathname) => pathname.startsWith('/app/settings'),
  },
];

type ViewportMode = 'mobile' | 'compact' | 'desktop';

function getViewportMode(): ViewportMode {
  if (typeof window === 'undefined' || window.innerWidth >= 980) return 'desktop';
  return window.innerWidth >= 768 ? 'compact' : 'mobile';
}

function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState(getViewportMode);

  useEffect(() => {
    const updateMode = () => setMode(getViewportMode());
    window.addEventListener('resize', updateMode);
    return () => window.removeEventListener('resize', updateMode);
  }, []);

  return mode;
}

function isActive(item: NavigationItem, pathname: string): boolean {
  return item.match ? item.match(pathname) : pathname === item.to;
}

export function DesktopSidebar({ compact }: { compact: boolean }) {
  const { pathname } = useLocation();

  return (
    <aside aria-label="Desktop navigation" className="desktop-sidebar" data-compact={compact}>
      <Link aria-label="Mind Vault overview" className="brand" to={APP_PATHS.overview}>
        <BookOpen aria-hidden="true" size={20} />
        {!compact ? <span>Mind Vault</span> : null}
      </Link>
      <nav className="primary-nav">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
          const link = (
            <NavLink
              aria-current={active ? 'page' : undefined}
              aria-label={compact ? item.label : undefined}
              className={`nav-link${active ? ' nav-link--active' : ''}`}
              key={item.label}
              to={item.to}
            >
              <Icon aria-hidden="true" size={19} />
              {!compact ? <span>{item.label}</span> : null}
            </NavLink>
          );
          return compact ? <Tooltip content={item.label} key={item.label}>{link}</Tooltip> : link;
        })}
      </nav>
    </aside>
  );
}

export function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Mobile navigation" className="mobile-bottom-nav">
      {mobileNavigation.map((item) => {
        const Icon = item.icon;
        const active = isActive(item, pathname);
        return (
          <NavLink
            aria-current={active ? 'page' : undefined}
            className={`mobile-nav-link${active ? ' mobile-nav-link--active' : ''}`}
            key={item.label}
            to={item.to}
          >
            <Icon aria-hidden="true" size={19} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function PageContainer({ children }: PropsWithChildren) {
  return <main className="page-container">{children}</main>;
}

export function AppShell({ children }: PropsWithChildren) {
  const mode = useViewportMode();
  const commandMenuOpen = useAppStore((state) => state.commandMenuOpen);
  const setCommandMenuOpen = useAppStore((state) => state.setCommandMenuOpen);

  return (
    <div className="app-frame">
      {mode === 'mobile' ? null : <DesktopSidebar compact={mode === 'compact'} />}
      <div className="app-workspace">
        <header className="app-header">
          <div className="header-title">
            {mode === 'mobile' ? <BookOpen aria-hidden="true" size={20} /> : <PanelLeft aria-hidden="true" size={18} />}
            <span>工作台</span>
          </div>
          <button aria-label="Open command menu" className="icon-button" onClick={() => setCommandMenuOpen(true)} type="button">
            <Search aria-hidden="true" size={18} />
          </button>
        </header>
        <PageContainer>{children}</PageContainer>
      </div>
      {mode === 'mobile' ? <MobileBottomNav /> : null}
      <CommandMenu onOpenChange={setCommandMenuOpen} open={commandMenuOpen} />
    </div>
  );
}
