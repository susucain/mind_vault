import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../lib/errors';
import {
  describeProfileError,
  formatAbsoluteTime,
  formatRelativeTime,
  MEMORY_KIND_LABEL,
  MEMORY_STATUS_LABEL,
} from './settings-labels';

describe('memory labels', () => {
  it('keeps the enum names out of the interface', () => {
    expect(MEMORY_KIND_LABEL).toEqual({ preference: '偏好', fact: '关于我', goal: '目标' });
    expect(MEMORY_STATUS_LABEL).toEqual({ ACTIVE: '生效中', SUPERSEDED: '已失效' });
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-06T12:00:00.000Z');

  it('falls back to a dash for missing or unparsable values', () => {
    expect(formatRelativeTime(null, now)).toBe('—');
    expect(formatRelativeTime(undefined, now)).toBe('—');
    expect(formatRelativeTime('not-a-date', now)).toBe('—');
  });

  it('rounds down to the coarsest sensible unit', () => {
    expect(formatRelativeTime(new Date(now - 30_000).toISOString(), now)).toBe('刚刚');
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 分钟前');
    expect(formatRelativeTime(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 小时前');
    expect(formatRelativeTime(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe('2 天前');
  });

  it('switches to an absolute date past 30 days', () => {
    expect(formatRelativeTime(new Date(now - 40 * 86_400_000).toISOString(), now)).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe('formatAbsoluteTime', () => {
  it('renders YYYY-MM-DD, or a dash when there is nothing to show', () => {
    expect(formatAbsoluteTime(null)).toBe('—');
    expect(formatAbsoluteTime('')).toBe('—');
    expect(formatAbsoluteTime('nope')).toBe('—');
    expect(formatAbsoluteTime('2026-10-06T08:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('describeProfileError', () => {
  const apiError = (status: number, message = 'raw upstream text') =>
    new ApiRequestError({ status, code: 'ERR', message });

  it('maps the statuses the settings forms can actually hit', () => {
    expect(describeProfileError(apiError(401))).toBe('当前密码不正确');
    expect(describeProfileError(apiError(403))).toBe('开发账号不支持修改资料');
    expect(describeProfileError(apiError(409))).toBe('用户名已被占用');
    expect(describeProfileError(apiError(503))).toBe('头像存储未启用');
  });

  it('keeps the server copy for unmapped statuses and never leaks non-API errors', () => {
    expect(describeProfileError(apiError(400, '至少需要一个待更新字段'))).toBe('至少需要一个待更新字段');
    expect(describeProfileError(new Error('TypeError: x is undefined'))).toBe('操作失败，请稍后重试');
    expect(describeProfileError(null)).toBe('操作失败，请稍后重试');
  });
});