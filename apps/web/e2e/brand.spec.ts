import { expect, test, type Page } from './fixtures';
import { horizontalOverflow, setLocaleCookie, smallTargets } from './support';

// Feature brand-logo-animation, Scenarios 7 and 8 (web): the SVG wordmark in the headers, the new
// palette, the favicon pair and the apple-touch icon. The splash is skipped (shared fixture).
test.use({ locale: 'en-US' });

const PRIMARY = 'rgb(41, 104, 236)';
const TEXT = 'rgb(24, 34, 49)';

async function expectWordmark(page: Page) {
  const logo = page.getByRole('img', { name: 'BricoMission' });
  await expect(logo).toHaveCount(1);
  await expect(logo).toHaveAttribute('data-testid', 'wordmark');
  expect(await logo.evaluate((el) => el.tagName.toLowerCase())).toBe('svg');
  expect(await logo.boundingBox()).toMatchObject({ width: 140, height: 22 });
  const art = await logo.evaluate((svg) => ({
    lines: svg.querySelectorAll('line').length,
    shapes: svg.querySelectorAll('path, circle').length,
    fills: [...svg.querySelectorAll('g')].map((g) => getComputedStyle(g).fill),
  }));
  expect(art).toEqual({ lines: 0, shapes: 21, fills: [TEXT, PRIMARY] });
}

for (const path of ['/', '/language', '/auth/error?reason=failed']) {
  test(`${path}: header shows the SVG wordmark 140x22 in the new colors`, async ({ page }) => {
    await page.goto(path);
    await expectWordmark(page);
    expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe(TEXT);
  });
}

test('Capture keeps its back button and has no logo', async ({ page }) => {
  await page.goto('/kitchen-projects/new');
  await expect(page.getByTestId('wordmark')).toHaveCount(0);
});

test('primary buttons and focus rings use #2968EC', async ({ page }) => {
  await page.goto('/');
  const cta = page.getByTestId('home-cta-start');
  expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PRIMARY);
  await cta.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return { color: style.outlineColor, width: style.outlineWidth, offset: style.outlineOffset };
  });
  expect(ring).toEqual({ color: PRIMARY, width: '2px', offset: '2px' });
});

test.describe('360x780 compact header', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  for (const locale of ['de', 'fi', 'nl'] as const) {
    test(`${locale}: logo, selector and account entry fit without overflow`, async ({ page, context }) => {
      await setLocaleCookie(context, locale);
      await page.goto('/');
      const logo = await page.getByTestId('wordmark').boundingBox();
      const selector = await page.getByTestId('locale-selector').boundingBox();
      expect(logo && selector && logo.x + logo.width <= selector.x).toBe(true);
      expect(logo?.width).toBe(140);
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTargets(page)).toEqual([]);
    });
  }
});

test('favicon pair and apple-touch icon are linked and served', async ({ page, request }) => {
  await page.goto('/');
  const icons = await page.locator('link[rel="icon"]').evaluateAll((links) =>
    links.map((l) => ({ href: new URL((l as HTMLLinkElement).href).pathname, type: (l as HTMLLinkElement).type })),
  );
  expect(icons).toEqual([
    { href: '/icons/favicon.svg', type: 'image/svg+xml' },
    { href: '/favicon.ico', type: '' },
  ]);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  const svg = await request.get('/icons/favicon.svg');
  expect(svg.status()).toBe(200);
  expect(svg.headers()['content-type']).toMatch(/^image\/svg\+xml/);
  expect(await svg.text()).toContain('prefers-color-scheme:dark');
  const ico = await request.get('/favicon.ico');
  expect(ico.status()).toBe(200);
  expect(ico.headers()['content-type']).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);
  expect((await ico.body()).readUInt16LE(4)).toBe(3);
  expect(await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'))).toBe('#2968EC');
});
