import { describe, expect, it } from 'vitest';
import {
  MEMORY_CONTENT_MAX,
  NICKNAME_MAX,
  validateMemoryContent,
  validateNickname,
  validateUsername,
} from './settings-schema';

describe('nickname validation', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(validateNickname('')).toBe('昵称不能为空');
    expect(validateNickname('   ')).toBe('昵称不能为空');
  });

  it('accepts exactly the limit and rejects one character more', () => {
    expect(validateNickname('a'.repeat(NICKNAME_MAX))).toBeNull();
    expect(validateNickname('a'.repeat(NICKNAME_MAX + 1))).toBe(`昵称最多 ${NICKNAME_MAX} 个字符`);
  });

  it('trims before measuring, matching the backend 入库前 trim', () => {
    expect(validateNickname(`  ${'a'.repeat(NICKNAME_MAX)}  `)).toBeNull();
  });
});

describe('username validation', () => {
  it('requires 3-64 letters, digits, underscore or hyphen', () => {
    expect(validateUsername('ab')).not.toBeNull();
    expect(validateUsername('dev_user-1')).toBeNull();
    expect(validateUsername('a'.repeat(64))).toBeNull();
    expect(validateUsername('a'.repeat(65))).not.toBeNull();
  });

  it('rejects characters the backend pattern forbids', () => {
    expect(validateUsername('中文名')).not.toBeNull();
    expect(validateUsername('has space')).not.toBeNull();
    expect(validateUsername('dev@example.com')).not.toBeNull();
  });

  it('validates the trimmed value', () => {
    expect(validateUsername('  dev  ')).toBeNull();
  });
});

describe('memory content validation', () => {
  it('rejects blank content', () => {
    expect(validateMemoryContent('   ')).toBe('请输入记忆内容');
  });

  it('shares the 200 character ceiling with memoryConfig.maxContentChars', () => {
    expect(validateMemoryContent('好'.repeat(MEMORY_CONTENT_MAX))).toBeNull();
    expect(validateMemoryContent('好'.repeat(MEMORY_CONTENT_MAX + 1))).toBe(
      `最多 ${MEMORY_CONTENT_MAX} 字`,
    );
  });
});