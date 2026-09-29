import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('returns null for invalid JSON', () => {
    localStorage.setItem('mind-vault:invalid', '{invalid');

    expect(readStoredValue('mind-vault:invalid')).toBeNull();
  });

  it('swallows storage access errors', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(readStoredValue('mind-vault:test')).toBeNull();
    expect(() => writeStoredValue('mind-vault:test', { enabled: true })).not.toThrow();
    expect(() => removeStoredValue('mind-vault:test')).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
    removeItem.mockRestore();
  });
});
