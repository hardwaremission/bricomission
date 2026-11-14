import { expect, test } from './fixtures';
import { messages } from './support';

// Scenario 6: Home reads GET /api/health through the generated client.
test.use({ locale: 'en-US' });

test('online: same-origin GET /api/health answers 200', async ({ page }) => {
  const health = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/health');
  await page.goto('/');
  const response = await health;
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);
  const status = page.getByTestId('api-status');
  await expect(status).toHaveAttribute('data-state', 'online');
  await expect(status).toHaveText(messages('en').status.online);
  await expect(status).toHaveAttribute('aria-live', 'polite');
});

test.describe('without a service worker (routed API)', () => {
  test.use({ serviceWorkers: 'block' });

  test('degraded: 503 database down', async ({ page }) => {
    await page.route('**/api/health', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"error","database":"down"}' }),
    );
    await page.goto('/');
    const status = page.getByTestId('api-status');
    await expect(status).toHaveAttribute('data-state', 'degraded');
    await expect(status).toHaveText(messages('en').status.degraded);
  });

  test('offline: proxy 502', async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: '{"status":"error"}' }));
    await page.goto('/');
    await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'offline');
    await expect(page.getByTestId('api-status')).toHaveText(messages('en').status.offline);
  });

  test('offline: network error, localized and without raw details', async ({ page, context }) => {
    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'es', url: process.env.E2E_BASE_URL ?? 'http://localhost:3100' }]);
    await page.route('**/api/health', (route) => route.abort('connectionrefused'));
    await page.goto('/');
    const status = page.getByTestId('api-status');
    await expect(status).toHaveAttribute('data-state', 'offline');
    await expect(status).toHaveText(messages('es').status.offline);
    await expect(status).not.toContainText(/[{}]|50\d|error/i);
  });

  test('offline: no answer within 5 s', async ({ page }) => {
    await page.route('**/api/health', () => {
      // Never fulfilled: the client aborts after HEALTH_TIMEOUT_MS.
    });
    await page.goto('/');
    await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'checking');
    await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'offline', { timeout: 8000 });
  });
});
