import { defineConfig } from '@playwright/test';

// Runs inside the pinned Playwright image (compose service web-e2e, scripts/web/e2e.sh)
// against the running compose `web` service. No webServer: the stack is started separately.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results/playwright',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'mobile-390',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
});
