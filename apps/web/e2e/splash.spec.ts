import { expect, test, type Page } from './fixtures';
import { messages } from './support';

// Feature brand-logo-animation, Scenarios 1-6: the welcome splash plays once per tab, picks the
// lettermark below 768 px and the wordmark from 768 px, follows the system palette, shows only the
// static final frame under reduced motion, never blocks, and works offline. This spec opts out of
// the shared splash skip.
test.use({ skipSplash: false, locale: 'en-US' });

const ORIGIN = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3100').origin;
const LIGHT_BG = 'rgb(255, 255, 255)';
const DARK_BG = 'rgb(15, 23, 42)';

/** Test-only probe: records (performance.now) when the page removes data-splash. */
async function recordSplashEnd(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __splashEnd?: number };
    // Observe the document (the <html> element may not exist yet when init scripts run).
    new MutationObserver(() => {
      if (document.documentElement && !document.documentElement.hasAttribute('data-splash') && w.__splashEnd === undefined) {
        w.__splashEnd = performance.now();
      }
    }).observe(document, { attributes: true, attributeFilter: ['data-splash'], subtree: true });
  });
}

const splashState = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-splash'));
const splashEnd = (page: Page) =>
  page.waitForFunction(() => (window as unknown as { __splashEnd?: number }).__splashEnd, undefined, { timeout: 5_000 }).then((h) => h.jsonValue() as Promise<number>);
const overlay = (page: Page) => page.locator('#bm-splash');
const stage = (page: Page, variant: 'lettermark' | 'wordmark') => page.locator(`#bm-splash svg[data-variant="${variant}"]`);

async function expectVariant(page: Page, variant: 'lettermark' | 'wordmark') {
  const other = variant === 'lettermark' ? 'wordmark' : 'lettermark';
  await expect(stage(page, variant)).toBeVisible();
  await expect(stage(page, other)).toBeHidden();
}

test.describe('Scenario 1: lettermark on a phone, once per tab', () => {
  test('plays from first paint, ends by 3.2 s, then never again in the tab', async ({ page }) => {
    await recordSplashEnd(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await splashState(page)).toBe('play');
    await expect(overlay(page)).toBeVisible();
    await expectVariant(page, 'lettermark');
    await expect(overlay(page)).toHaveAttribute('aria-hidden', 'true');
    const bg = await overlay(page).evaluate((el) => ({ color: getComputedStyle(el).backgroundColor, image: getComputedStyle(el).backgroundImage }));
    expect(bg.color).toBe(LIGHT_BG);
    expect(bg.image).toContain('linear-gradient');
    // Dimension lines, pieces and corners are animating.
    const names = await page.evaluate(() =>
      document.getElementById('bm-splash')!.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName),
    );
    for (const name of ['lmDrawStroke', 'lmDrawTick', 'slideUpSnap', 'slideRightSnap', 'diagDownSnap', 'diagUpSnap', 'slideDownSnap', 'cornerLock']) {
      expect(names.some((n) => n.includes(name)), name).toBe(true);
    }
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

    expect(await splashEnd(page)).toBeLessThanOrEqual(3200);
    await expect(overlay(page)).toBeHidden();
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText(messages('en').home.headline);
    await h1.click({ trial: true });
    expect(await page.evaluate(() => sessionStorage.getItem('bm.splash.seen'))).toBe('1');

    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await splashState(page)).toBeNull();
    await page.getByTestId('home-cta-start').click();
    await expect(page).toHaveURL(/\/kitchen-projects\/new$/);
    expect(await splashState(page)).toBeNull();
    await page.goto('/language', { waitUntil: 'domcontentloaded' });
    expect(await splashState(page)).toBeNull();
    await expect(overlay(page)).toBeHidden();
  });
});

test.describe('Scenario 2: wordmark on wide screens', () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 1024 }]) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport, isMobile: false, hasTouch: false });

      for (const path of ['/', '/language', '/auth/error?reason=failed']) {
        test(`wordmark with construction guides plays once on ${path}`, async ({ page }) => {
          await page.goto(path, { waitUntil: 'domcontentloaded' });
          expect(await splashState(page)).toBe('play');
          await expectVariant(page, 'wordmark');
          const names = await page.evaluate(() =>
            document.getElementById('bm-splash')!.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName),
          );
          for (const name of ['guideSweep', 'wmDrawStroke', 'stemRise', 'moduleSlideRight', 'moduleUnfold', 'dotBounce', 'cornerKeystone']) {
            expect(names.some((n) => n.includes(name)), name).toBe(true);
          }
          await expect(overlay(page)).toBeHidden({ timeout: 4_000 });
          await page.reload({ waitUntil: 'domcontentloaded' });
          expect(await splashState(page)).toBeNull();
        });
      }
    });
  }

  test.describe('767x1024', () => {
    test.use({ viewport: { width: 767, height: 1024 }, isMobile: false, hasTouch: false });
    test('the lettermark plays just below 768 px', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(await splashState(page)).toBe('play');
      await expectVariant(page, 'lettermark');
    });
  });
});

test.describe('Scenario 3: dark system theme', () => {
  test.use({ colorScheme: 'dark' });

  for (const [viewport, variant] of [
    [{ width: 390, height: 844 }, 'lettermark'],
    [{ width: 1280, height: 800 }, 'wordmark'],
  ] as const) {
    test(`${variant}: dark splash, then the light UI`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(await splashState(page)).toBe('play');
      await expectVariant(page, variant);
      const colors = await stage(page, variant).evaluate((svg) => ({
        bg: getComputedStyle(svg.parentElement!).backgroundColor,
        ink: getComputedStyle(svg.querySelector('g[data-group="glyphs"]')!).fill,
        accent: getComputedStyle(svg.querySelector('g[data-group="accent-blue"]')!).fill,
      }));
      expect(colors).toEqual({ bg: DARK_BG, ink: 'rgb(248, 250, 252)', accent: 'rgb(59, 130, 246)' });
      await expect(overlay(page)).toBeHidden({ timeout: 4_000 });
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(250, 250, 248)');
    });
  }
});

test.describe('Scenario 4: reduced motion shows the static final frame for about 1 s', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const [viewport, variant] of [
    [{ width: 390, height: 844 }, 'lettermark'],
    [{ width: 1280, height: 800 }, 'wordmark'],
  ] as const) {
    test(`${variant} at ${viewport.width}: no animation, gone after ~1.0 s, once`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await recordSplashEnd(page);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(await splashState(page)).toBe('play');
      await expectVariant(page, variant);
      const frame = await stage(page, variant).evaluate((svg) => {
        const overlayStyle = getComputedStyle(svg.parentElement!);
        const pieces = [...svg.querySelectorAll('path, circle, line')].map((el) => getComputedStyle(el));
        const shapes = [...svg.querySelectorAll('path, circle')].map((el) => getComputedStyle(el));
        return {
          overlayAnimation: overlayStyle.animationName,
          overlayDuration: overlayStyle.animationDuration,
          animated: pieces.filter((s) => s.animationName !== 'none').length,
          hiddenShapes: shapes.filter((s) => s.opacity !== '1' || s.transform !== 'none').length,
          lines: svg.querySelectorAll('g[data-group="dimension-lines"] line').length,
          undrawnLines: [...svg.querySelectorAll('g[data-group="dimension-lines"] line')].filter(
            (el) => parseFloat(getComputedStyle(el).strokeDashoffset) !== 0 || getComputedStyle(el).opacity !== '1',
          ).length,
          visibleGuides: [...svg.querySelectorAll('g[data-group="construction-guides"] line')].filter((el) => getComputedStyle(el).display !== 'none').length,
        };
      });
      expect(frame.overlayAnimation).toContain('splashHide');
      expect(frame.overlayDuration).toBe('0s');
      expect(frame.animated).toBe(0);
      expect(frame.hiddenShapes).toBe(0);
      expect(frame.lines).toBeGreaterThanOrEqual(15);
      expect(frame.undrawnLines).toBe(0);
      expect(frame.visibleGuides).toBe(0);
      expect(await overlay(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(LIGHT_BG);
      // Evidence: the static frame is the final frame of the animation (git-ignored output).
      await page.screenshot({ path: `test-results/brand/splash-${variant}-${viewport.width}-light.png` });

      const end = await splashEnd(page);
      expect(end).toBeGreaterThanOrEqual(900);
      expect(end).toBeLessThanOrEqual(1500);
      await expect(overlay(page)).toBeHidden();
      expect(await page.evaluate(() => sessionStorage.getItem('bm.splash.seen'))).toBe('1');
      await page.reload({ waitUntil: 'domcontentloaded' });
      expect(await splashState(page)).toBeNull();
    });
  }

  test('dark palette applies to the static frame too (390 and 1280)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await overlay(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(DARK_BG);
    await page.screenshot({ path: 'test-results/brand/splash-lettermark-390-dark.png' });
    const wide = await page.context().newPage();
    await wide.setViewportSize({ width: 1280, height: 800 });
    await wide.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await wide.goto('/', { waitUntil: 'domcontentloaded' });
    await expectVariant(wide, 'wordmark');
    expect(await overlay(wide).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(DARK_BG);
    await wide.screenshot({ path: 'test-results/brand/splash-wordmark-1280-dark.png' });
    await wide.close();
  });
});

test.describe('Scenario 4: no JavaScript, no splash', () => {
  test.use({ javaScriptEnabled: false });
  test('the page renders without the overlay', async ({ page }) => {
    await page.goto('/');
    await expect(overlay(page)).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages('en').home.headline);
  });
});

test.describe('Scenario 5: never blocks', () => {
  test('a tap dismisses it within 0.3 s', async ({ page }) => {
    await recordSplashEnd(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(overlay(page)).toBeVisible();
    const tappedAt = await page.evaluate(() => performance.now());
    await page.touchscreen.tap(195, 420);
    expect((await splashEnd(page)) - tappedAt).toBeLessThanOrEqual(300);
    await expect(overlay(page)).toBeHidden();
  });

  test('a key dismisses it within 0.3 s', async ({ page }) => {
    await recordSplashEnd(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(overlay(page)).toBeVisible();
    const pressedAt = await page.evaluate(() => performance.now());
    await page.keyboard.press('Space');
    expect((await splashEnd(page)) - pressedAt).toBeLessThanOrEqual(300);
    await expect(overlay(page)).toBeHidden();
  });

  for (const [label, reducedMotion, cap] of [
    ['animated', 'no-preference', 3500],
    ['reduced motion', 'reduce', 1500],
  ] as const) {
    test(`${label}: with JS timers frozen the CSS alone hides it by ${cap} ms`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.clock.install({ time: new Date('2026-11-14T10:00:00Z') });
      await page.clock.pauseAt(new Date('2026-11-14T10:00:01Z'));
      const started = Date.now();
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(await splashState(page)).toBe('play');
      // The exit is a CSS animation: its end time is the cap, independent of any script timer.
      const exitEnd = await overlay(page).evaluate((el) => {
        const exit = el.getAnimations().find((a) => /splash(Exit|Hide)/.test((a as CSSAnimation).animationName));
        return Number(exit?.effect?.getComputedTiming().endTime ?? Infinity);
      });
      expect(exitEnd).toBeLessThanOrEqual(reducedMotion === 'reduce' ? 1000 : 3200);
      await expect(overlay(page)).toBeHidden({ timeout: cap });
      expect(Date.now() - started).toBeLessThanOrEqual(cap + 1500);
    });
  }
});

test.describe('Scenario 6: offline, same-origin only, no console errors', () => {
  test('same-origin requests, clean console, offline replay in a new tab', async ({ page, context }) => {
    const foreign: string[] = [];
    const problems: string[] = [];
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (url.origin !== ORIGIN) foreign.push(request.url());
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await splashState(page)).toBe('play');
    await expect(overlay(page)).toBeHidden({ timeout: 4_000 });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toMatch(/\/sw\.js$/);
    await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'online');
    expect(await page.evaluate(() => caches.keys())).toContain('bricomission-shell-v3');

    await context.setOffline(true);
    try {
      const tab = await context.newPage();
      await tab.goto('/', { waitUntil: 'domcontentloaded' });
      expect(await splashState(tab)).toBe('play');
      await expect(overlay(tab)).toBeVisible();
      await expect(overlay(tab)).toBeHidden({ timeout: 4_000 });
      await expect(tab.getByRole('heading', { level: 1 })).toHaveText(messages('en').home.headline);
      await tab.close();
    } finally {
      await context.setOffline(false);
    }
    expect(foreign).toEqual([]);
    expect(problems).toEqual([]);
  });
});
