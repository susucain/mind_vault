import { describe, expect, it } from 'vitest';
import { queryClient } from './query-client';

describe('queryClient', () => {
  it('uses the baseline cache and retry policy', () => {
    const options = queryClient.getDefaultOptions().queries;
    const retry = options?.retry;
    const errorWithStatus = (status: number) =>
      Object.assign(new Error(`HTTP ${status}`), { status });

    expect(options?.staleTime).toBe(30_000);
    expect(typeof retry).toBe('function');

    if (typeof retry !== 'function') {
      throw new Error('expected a retry function');
    }

    expect(retry(0, new Error('network unavailable'))).toBe(true);
    expect(retry(0, errorWithStatus(408))).toBe(true);
    expect(retry(0, errorWithStatus(429))).toBe(true);
    expect(retry(0, errorWithStatus(500))).toBe(true);
    expect(retry(1, errorWithStatus(500))).toBe(false);

    for (const status of [400, 401, 403, 404, 422]) {
      expect(retry(0, errorWithStatus(status))).toBe(false);
    }
  });
});
