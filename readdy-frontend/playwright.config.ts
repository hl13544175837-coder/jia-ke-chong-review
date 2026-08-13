import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.E2E_BASE_URL?.trim();
const localBaseUrl = 'http://127.0.0.1:5290';
const isolatedSmoke = process.env.CI_ISOLATED_SMOKE === 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: externalBaseUrl || localBaseUrl,
    proxy: isolatedSmoke
      ? { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' }
      : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'COMPANY_GATEWAY_PROXY_TARGET=http://127.0.0.1:5010 COMPANY_API_PROXY_TARGET=http://127.0.0.1:5010 VITE_API_BASE_URL=/api VITE_OAUTH_BASE_URL=/pgs/oauth npm run dev -- --host 127.0.0.1 --port 5290 --strictPort',
        url: `${localBaseUrl}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
