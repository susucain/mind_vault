import { describe, expect, it } from 'vitest';
import { readAppConfig } from './config';

describe('app config', () => {
  it('reads the API base URL and mock flag from Vite environment values', () => {
    expect(
      readAppConfig({
        VITE_API_BASE_URL: '/v1',
        VITE_ENABLE_MOCK_API: 'true',
      }),
    ).toEqual({
      apiBaseUrl: '/v1',
      enableMockApi: true,
    });
  });

  it('uses safe defaults when environment values are absent', () => {
    expect(readAppConfig({})).toEqual({
      apiBaseUrl: '/v1',
      enableMockApi: false,
    });
  });
});
