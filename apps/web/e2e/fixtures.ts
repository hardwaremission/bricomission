import { test as base, type Browser, type BrowserContext, type BrowserContextOptions } from '@playwright/test';

/**
 * Shared Playwright entry point (feature brand-logo-animation). Every spec imports `test` and
 * `expect` from here, not from '@playwright/test'.
 *
 * The welcome splash plays once per tab (sessionStorage `bm.splash.seen`, set by the inline head
 * script). To keep specs deterministic without a production test hook, the `skipSplash` option
 * (default true) adds an init script that pre-sets that flag; init scripts run before the page's
 * own scripts on every document, so the splash never plays. Contexts created by hand must use
 * `newContext(browser, options)`. `e2e/splash.spec.ts` opts out with
 * `test.use({ skipSplash: false })`.
 */
export { expect } from '@playwright/test';
export type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';

function markSplashSeen() {
  try {
    sessionStorage.setItem('bm.splash.seen', '1');
  } catch {
    // Storage unavailable: the page shows no splash anyway.
  }
}

/** browser.newContext with the splash skipped (use instead of browser.newContext in specs). */
export async function newContext(browser: Browser, options?: BrowserContextOptions): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await context.addInitScript(markSplashSeen);
  return context;
}

export const test = base.extend<{ skipSplash: boolean }>({
  skipSplash: [true, { option: true }],
  context: async ({ context, skipSplash }, use) => {
    if (skipSplash) await context.addInitScript(markSplashSeen);
    await use(context);
  },
});
