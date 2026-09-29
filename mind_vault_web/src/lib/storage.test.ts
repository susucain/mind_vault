import { beforeEach, describe, expect, it } from 'vitest';
import { removeStoredValue, readStoredValue, writeStoredValue } from './storage';

describe('storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips JSON values and removes them', () => {
    writeStoredValue('mind-vault:test', { enabled: true });

    expect(readStoredValue<{ enabled: boolean }>('mind-vault:test')).toEqual({
      enabled: true,
    });

    removeStoredValue('mind-vault:test');
    expect(readStoredValue('mind-vault:test')).toBeNull();
  });
});
