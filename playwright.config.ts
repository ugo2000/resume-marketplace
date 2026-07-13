import { defineConfig, devices } from '@playwright/test';

const remoteBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(remoteBaseUrl
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: 'http://localhost:5173/health',
          reuseExistingServer: true,
        },
      }),
});
