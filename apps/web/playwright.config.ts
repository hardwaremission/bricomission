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
      // The diagnostics dashboard is a desktop web: its spec runs only in desktop-1920.
      testIgnore: '**/diagnostics.spec.ts',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      // Feature diagnostics-dashboard: the dashboard (compose profile "diagnostics") at 1920x1080. Its
      // spec skips itself with a message when the dashboard is not running, so a plain `pnpm test:e2e`
      // on the default stack stays green. Full run: `pnpm test:e2e:diagnostics`.
      name: 'desktop-1920',
      testMatch: '**/diagnostics.spec.ts',
      use: {
        browserName: 'chromium',
        viewport: { width: 1920, height: 1080 },
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
      },
    },
  ],
});
