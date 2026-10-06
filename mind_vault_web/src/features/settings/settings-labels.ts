import { isApiError } from '../../lib/errors';
import type { MemoryKind, MemoryStatus } from '../../api/memories';

/** 术语不出现在界面上：preference/fact/goal 对用户没有意义（与小程序 utils/memory.ts 同一口径） */
export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  preference: '偏好',
  fact: '关于我',
  goal: '目标',
};

/** 筛选 chip 的顺序：按“用户最可能想治理的”排，而非枚举定义顺序 */
export const MEMORY_KIND_ORDER: MemoryKind[] = ['fact', 'preference', 'goal'];

export const MEMORY_STATUS_LABEL: Record<MemoryStatus, string> = {
  ACTIVE: '生效中',
  SUPERSEDED: '已失效',
};

export const EMPTY_VALUE = '—';

export const PROFILE_ERROR_FALLBACK = '操作失败，请稍后重试';

/**
 * 状态码兜底文案。服务端对这些状态都抛了面向用户的中文，正常情况下不会走到这里；
 * 保留映射是为了兜住网关 / 非 JSON 响应等拿不到 message 的情况。
 */
const PROFILE_ERROR_MESSAGES: Record<number, string> = {
  401: '当前密码不正确',
  403: '开发账号不支持修改资料',
  409: '用户名已被占用',
  503: '头像存储未启用',
};

/** 把接口错误收敛成一句用户能读懂的提示，不透传技术细节 */
export function describeProfileError(error: unknown): string {
  if (!isApiError(error)) return PROFILE_ERROR_FALLBACK;
  const mapped = PROFILE_ERROR_MESSAGES[error.status];
  if (mapped) return mapped;
  return error.message?.trim() || PROFILE_ERROR_FALLBACK;
}

/**
 * 记忆卡片上的时间取相对表述：精确到分的时间戳在列表里不产生决策价值，只占位置。
 * now 可注入，便于测试不依赖真实时钟。
 */
export function formatRelativeTime(
  value: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!value) return EMPTY_VALUE;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return EMPTY_VALUE;

  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;

  return formatAbsoluteTime(value);
}

/** 注册时间等只读字段用绝对日期：YYYY-MM-DD，按本地时区取日，避免 UTC 跨日偏一天 */
export function formatAbsoluteTime(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}