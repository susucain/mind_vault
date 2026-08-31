import { ValueTransformer } from 'typeorm';

/**
 * Postgres BIGINT ↔ JS string
 * 雪花 ID 超过 Number 安全整数范围，必须用字符串，否则会丢精度。
 */
export const bigintTransformer: ValueTransformer = {
  to: (v: unknown) => v, // 写入：原样交给驱动
  from: (v: unknown) => {
    if (v == null) return v;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'bigint') return v.toString();
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return JSON.stringify(v);
  }, // 读出：统一转成 string
};
