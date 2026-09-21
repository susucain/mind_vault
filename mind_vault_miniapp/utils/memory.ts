import { MemoryKind } from '../types/memory';

/** 术语不出现在界面上：preference/fact/goal 对用户没有意义 */
export function memoryKindLabel(kind: MemoryKind): string {
  switch (kind) {
    case 'preference':
      return '偏好';
    case 'goal':
      return '目标';
    default:
      return '关于我';
  }
}

/**
 * 记忆卡片只显示相对时间。记忆是"最近有没有被用到"，
 * 精确到分钟的时间戳在列表里没有价值，反而占位置。
 */
export function formatMemoryTime(
  value: string | null | undefined,
  now: number = Date.now()
): string {
  if (!value) return '还没被用到过';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '还没被用到过';
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return '刚刚用过';
  if (minutes < 60) return `${minutes} 分钟前用过`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前用过`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前用过`;
  return `${value.slice(0, 10)} 用过`;
}
