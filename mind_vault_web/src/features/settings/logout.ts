import { useNavigate } from 'react-router-dom';
import { APP_PATHS } from '../../app/navigation';
import { queryClient } from '../../lib/query-client';
import { removeStoredValue } from '../../lib/storage';
import { useAppStore } from '../../stores/app.store';
import { POST_LOGIN_REDIRECT_KEY, useAuthStore } from '../../stores/auth.store';
import { READING_PREFERENCES_KEY } from '../documents/reading-preferences';
import { revokeAllAvatarUrls } from './queries';

/**
 * 「刚退出登录」的一次性标记（模块级，不落盘、不进 store）。
 *
 * 为什么不能只用路由 state：清 token 时页面还挂在受保护路由上，ProtectedLayout 会紧接着
 * 再重定向一次 /login，它带过去的 state（{ from }）会盖掉退出登录时传的 loggedOut，
 * 登录页就读不到提示了。标记在清 token 之前立上，守卫盖不掉，登录页读一次即清。
 */
let logoutNoticePending = false;

/** 只读判断，多次调用无副作用（可在 React 严格模式的重复渲染里安全使用）。 */
export function hasPendingLogoutNotice(): boolean {
  return logoutNoticePending;
}

/** 登录页读过提示后调用，避免下次前进/后退又冒出来。 */
export function clearPendingLogoutNotice(): void {
  logoutNoticePending = false;
}

/**
 * 退出登录只做本机清理，不调用任何后端接口（方案 §5.6：不做 JWT 吊销）。
 * 六步缺一不可——漏掉任何一步，上一个账号的痕迹就会带给下一个账号。
 */
export function performLogout(): void {
  logoutNoticePending = true; // ⓪ 先立提示标记，再清 token（清 token 会触发守卫重定向）
  useAuthStore.getState().clear(); // ① 清 token + user，并移除 localStorage mind-vault.auth
  queryClient.clear(); // ② 清 TanStack Query 缓存（模块级单例，会跨账号残留）
  removeStoredValue(POST_LOGIN_REDIRECT_KEY); // ③ 清待跳转路径，否则下次登录被跳到上次退出的页面
  removeStoredValue(READING_PREFERENCES_KEY); // ④ 清阅读偏好，字号属个人偏好不该被继承
  revokeAllAvatarUrls(); // ⑤ 释放头像 object URL，否则会一直留在内存
  useAppStore.getState().resetUserScoped(); // ⑥ 清会话级应用状态（datasetIds 等）
}

/** 清理本机状态后跳回登录页；登录页会展示一次「已退出登录」提示。 */
export function useLogout(): () => void {
  const navigate = useNavigate();

  return () => {
    performLogout();
    void navigate(APP_PATHS.login, { replace: true, state: { loggedOut: true } });
  };
}