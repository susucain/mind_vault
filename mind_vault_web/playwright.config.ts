import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4174',
    port: 4174,
    reuseExistingServer: true,
  },
});
