import { NavLink, useLocation } from 'react-router-dom';

const items = [
  ['/app/library', '全部文件'],
  ['/app/library/datasets', '资料集'],
  ['/app/library/folders', '文件夹'],
  ['/app/library/tags', '标签'],
  ['/app/library/archive', '归档'],
] as const;

export function LibraryNav() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="知识库导航" className="library-nav">
      {items.map(([to, label]) => (
        <NavLink
          className={({ isActive }) => {
            const active = isActive || (to === '/app/library' && pathname === '/app/library/documents');
            return `library-nav__link${active ? ' library-nav__link--active' : ''}`;
          }}
          end={to === '/app/library'}
          key={to}
          to={to}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
