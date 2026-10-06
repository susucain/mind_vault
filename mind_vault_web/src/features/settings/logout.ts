import { useNavigate } from 'react-router-dom';
import { APP_PATHS } from '../../app/navigation';
import { queryClient } from '../../lib/query-client';
import { removeStoredValue } from '../../lib/storage';
import { useAppStore } from '../../stores/app.store';
import { POST_LOGIN_REDIRECT_KEY, useAuthStore } from '../../stores/auth.store';
import { READING_PREFERENCES_KEY } from '../documents/reading-preferences';
import { revokeAllAvatarUrls } from './queries';

/**
 * 退出登录只做本机清理，不调用任何后端接口（方案 §5.6：不做 JWT 吊销）。
 * 六步缺一不可——漏掉任何一步，上一个账号的痕迹就会带给下一个账号。
 */
export function performLogout(): void {
  useAuthStore.getState().clear(); // ① 清 token + user，并移除 localStorage mind-vault.auth
  queryClient.clear(); // ② 清 TanStack Query 缓存（模块级单例，会跨账号残留）
  removeStoredValue(POST_LOGIN_REDIRECT_KEY); // ③ 清待跳转路径，否则下次登录被跳到上次退出的页面
  removeStoredValue(READING_PREFERENCES_KEY); // ④ 清阅读偏好，字号属个人偏好不该被继承
  revokeAllAvatarUrls(); // ⑤ 释放头像 object URL，否则会一直留在内存
  useAppStore.getState().resetUserScoped(); // ⑥ 清会话级应用状态（datasetIds 等）
}

/** 清理本机状态后跳回登录页；用路由 state 让登录页展示一次「已退出登录」提示。 */
export function useLogout(): () => void {
  const navigate = useNavigate();

  return () => {
    performLogout();
    void navigate(APP_PATHS.login, { replace: true, state: { loggedOut: true } });
  };
}