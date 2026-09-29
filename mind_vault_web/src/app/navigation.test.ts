import { describe, expect, it } from 'vitest';
import { APP_PATHS } from './navigation';

describe('application navigation paths', () => {
  it('defines the overview and account destinations used by routing and navigation', () => {
    expect(APP_PATHS.overview).toBe('/app/overview');
    expect(APP_PATHS.settingsAccount).toBe('/app/settings/account');
  });
});
