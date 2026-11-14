import { expect, test } from './fixtures';
import { horizontalOverflow, LOCALES, setLocaleCookie, smallTargets } from './support';

// Scenario 9: no external requests; mobile layout at 390 and 360 px in all 11 locales.
test.use({ locale: 'en-US' });

test('every request goes to the page origin (Home, sheet, Language Selection)', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3100').origin) foreign.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('api-status')).not.toHaveAttribute('data-state', 'checking');
  await page.getByTestId('locale-selector').click();
  await page.keyboard.press('Escape');
  await page.goto('/language');
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
});

test('Inter is self-hosted and covers å ä ö ø æ ß é ç ñ', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const loaded = await page.evaluate(async () => {
    await document.fonts.load('400 16px Inter', 'åäöøæßéçñ');
    return document.fonts.check('400 16px Inter', 'åäöøæßéçñ');
  });
  expect(loaded).toBe(true);
  const families = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(families).toMatch(/^Inter/);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 780 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const locale of LOCALES) {
      test(`Home in ${locale}: no horizontal overflow, CTA visible, 44 px targets`, async ({ page, context }) => {
        await setLocaleCookie(context, locale);
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        expect(await horizontalOverflow(page)).toEqual([]);
        const cta = page.getByTestId('home-cta-start');
        await expect(cta).toBeInViewport({ ratio: 1 });
        expect(await smallTargets(page)).toEqual([]);

        await page.getByTestId('locale-selector').click();
        await expect(page.getByRole('dialog')).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
      });
    }

    test('Language Selection: no horizontal overflow, Continue visible, 44 px targets', async ({ page }) => {
      await page.goto('/language');
      expect(await horizontalOverflow(page)).toEqual([]);
      await expect(page.getByTestId('language-continue')).toBeInViewport({ ratio: 1 });
      expect(await smallTargets(page)).toEqual([]);
    });
  });
}
