import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, Settings } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import { fallbackColor, initialOf } from '../features/settings/avatar';
import { LogoutDialog } from '../features/settings/LogoutDialog';
import { useLogout } from '../features/settings/logout';
import { useAvatarUrl } from '../features/settings/queries';
import { APP_PATHS } from './navigation';

/** 顶栏用户菜单：头像按钮展开昵称、个人设置与退出登录，用户不必先进设置页才能退出。 */
export function UserMenu() {
  const navigate = useNavigate();
  const logout = useLogout();
  const user = useAuthStore((state) => state.user);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const nickname = user?.nickname?.trim() || '未知用户';
  const avatarUrl = useAvatarUrl(user?.avatarKey);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label="账户菜单" className="icon-button user-menu__trigger" type="button">
          <span
            aria-hidden="true"
            className="user-menu__avatar"
            style={avatarUrl ? undefined : { backgroundColor: fallbackColor(user?.id ?? '') }}
          >
            {avatarUrl ? <img alt="" src={avatarUrl} /> : initialOf(nickname)}
          </span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" className="dropdown-content" sideOffset={6}>
            <div className="user-menu__identity">
              <strong>{nickname}</strong>
              {user?.username ? <span>@{user.username}</span> : null}
            </div>
            <DropdownMenu.Item
              className="dropdown-item"
              onSelect={() => void navigate(APP_PATHS.settingsAccount)}
            >
              <Settings size={15} />
              个人设置
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="dropdown-item dropdown-item--danger"
              onSelect={() => setConfirmOpen(true)}
            >
              <LogOut size={15} />
              退出登录
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <LogoutDialog onConfirm={logout} onOpenChange={setConfirmOpen} open={confirmOpen} />
    </>
  );
}