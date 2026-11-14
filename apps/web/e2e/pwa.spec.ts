import { expect, test } from './fixtures';
import { messages } from './support';

// Scenarios 7 and 8: installable PWA, offline after the first controlled visit.
test.use({ locale: 'en-US' });

test('manifest has the installability fields and PNG icons', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'BricoMission',
    short_name: 'BricoMission',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#2968EC',
    background_color: '#FAFAF8',
  });
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }
});

test('service worker controls the page after one reload; CDP reports no installability errors', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toMatch(/\/sw\.js$/);

  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
});

test('offline reload serves the cached Home and shows offline status', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'online');

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages('en').home.headline);
    await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'offline');
    await expect(page.getByTestId('api-status')).toHaveText(messages('en').status.offline);
  } finally {
    await context.setOffline(false);
  }
});
