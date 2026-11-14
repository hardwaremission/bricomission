import { expect, test, type Browser, type BrowserContext, type Page, newContext } from './fixtures';
import {
  authOrigins,
  baseURL,
  completeKeycloakSignIn,
  guardLocalhost,
  HOMEOWNER,
  HOMEOWNER_DISPLAY_NAME,
  horizontalOverflow,
  KC_REALM_PATH,
  keycloakURL,
  LOCALES,
  mailpitCode,
  messages,
  NATIVE_NAMES,
  pageFetch,
  setLocaleCookie,
  smallTargets,
  type Locale,
} from './support';

// Feature homeowner-password-login: sign-in through the web BFF (confidential client
// bricomission-web) and the themed Keycloak pages, the account entry and sheet, sign-out,
// callback safety, the proxy token rules and the layout of the new UI. Every browser request
// must go to the web or Keycloak localhost origins (Scenario 10).

const WEB = new URL(baseURL()).origin;
const KC_AUTH = `${keycloakURL()}${KC_REALM_PATH}/protocol/openid-connect/auth`;
const en = messages('en');

let blocked: string[] = [];

test.beforeEach(async ({ context }) => {
  blocked = await guardLocalhost(context, authOrigins());
});

test.afterEach(() => {
  expect(blocked, 'browser requests outside the web and Keycloak localhost origins').toEqual([]);
});

/** Signs in from Home through the account entry; returns the authorization request URL. */
async function signInFromHome(page: Page, request: Parameters<typeof completeKeycloakSignIn>[1]): Promise<URL> {
  await page.goto('/');
  const authRequest = page.waitForRequest((req) => req.url().startsWith(KC_AUTH));
  await page.getByTestId('account-signin').click();
  const url = new URL((await authRequest).url());
  await expect(page.locator('#username')).toBeVisible();
  await completeKeycloakSignIn(page, request, '/');
  return url;
}

test.describe('sign in, account sheet and sign out', () => {
  test.setTimeout(90_000);

  test('Scenario 1 + 7: sign in from Home (de), land back signed in, sign out ends the Keycloak session', async ({ page, context, request }) => {
    await setLocaleCookie(context, 'de');
    const de = messages('de');
    const auth = await signInFromHome(page, request);

    // The authorization request (Scenario 1).
    expect(auth.searchParams.get('client_id')).toBe('bricomission-web');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(auth.searchParams.get('state')).toBeTruthy();
    expect(auth.searchParams.get('nonce')).toBeTruthy();
    expect(auth.searchParams.get('ui_locales')).toBe('de');
    expect(auth.searchParams.get('redirect_uri')).toBe(`${WEB}/auth/callback`);

    // Signed-in header, no token anywhere the page can read.
    const account = page.getByTestId('account-button');
    await expect(account).toBeVisible();
    await expect(account).toHaveAccessibleName(de.auth.accountLabel.replace('{name}', HOMEOWNER_DISPLAY_NAME));
    await expect(account).toHaveText('H');
    const me = await pageFetch(page, '/api/me');
    expect(me.status).toBe(200);
    expect(JSON.parse(me.body)).toMatchObject({ username: HOMEOWNER, roles: ['user'] });
    expect(await page.evaluate(() => document.cookie)).not.toContain('bm_session');
    expect(await page.content()).not.toContain('eyJ');
    const session = await pageFetch(page, '/auth/session');
    expect(JSON.parse(session.body)).toEqual({ signedIn: true, user: { username: HOMEOWNER, displayName: HOMEOWNER_DISPLAY_NAME } });
    expect(session.body).not.toContain('eyJ');
    const cookie = (await context.cookies(WEB)).find((c) => c.name === 'bm_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    // Scenario 5 (browser part): a forged Authorization header never replaces the session token.
    const forged = await pageFetch(page, '/api/me', { headers: { authorization: 'Bearer forged' } });
    expect(forged.status).toBe(200);
    // Scenario 5: unsafe method with the session cookie and a foreign Origin -> 403.
    const csrf = await context.request.post('/api/me', { headers: { origin: 'http://evil.example' }, data: {} });
    expect(csrf.status()).toBe(403);
    const csrfLogout = await context.request.post('/auth/logout', { headers: { origin: 'http://evil.example' }, maxRedirects: 0 });
    expect(csrfLogout.status()).toBe(403);
    expect((await pageFetch(page, '/api/me')).status).toBe(200);

    // Account sheet (design: Account sheet open).
    await account.click();
    const sheet = page.getByTestId('account-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(de.auth.sheetTitle);
    await expect(page.getByTestId('account-display-name')).toHaveText(HOMEOWNER_DISPLAY_NAME);
    await expect(page.getByTestId('account-username')).toHaveText(HOMEOWNER);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(account).toBeFocused();

    // Scenario 7: sign out.
    await account.click();
    await page.getByTestId('account-signout').click();
    await page.waitForURL(`${WEB}/`);
    await expect(page.getByTestId('account-signin')).toBeVisible();
    expect((await pageFetch(page, '/api/me')).status).toBe(401);
    expect((await context.cookies(WEB)).some((c) => c.name === 'bm_session')).toBe(false);

    // The Keycloak SSO session ended: the next sign-in asks for the password again.
    await page.getByTestId('account-signin').click();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('Scenario 2: create an account from the app (mode=register) and land signed in as user', async ({ page, request }) => {
    const id = `e2e-web-${Date.now()}`;
    const email = `${id}@bricomission.local`;
    await page.goto('/auth/login?mode=register');
    await expect(page.locator('#kc-register-form')).toBeVisible();
    await page.locator('#firstName').fill('Wanda');
    await page.locator('#lastName').fill('Webtest');
    await page.locator('#email').fill(email);
    await page.locator('#username').fill(id);
    await page.locator('#password').fill('E2e-pass-12345');
    await page.locator('#password-confirm').fill('E2e-pass-12345');
    const mail = await mailpitCode(request, email, () => page.locator('#kc-register').click());
    await page.locator('#emailCode').fill(mail.code);
    await page.locator('#kc-login').click();
    await page.waitForURL(`${WEB}/`);
    await expect(page.getByTestId('account-button')).toHaveAccessibleName(en.auth.accountLabel.replace('{name}', 'Wanda Webtest'));
    const me = await pageFetch(page, '/api/me');
    expect(me.status).toBe(200);
    expect(JSON.parse(me.body)).toMatchObject({ username: id, roles: ['user'] });
  });

  test('Scenario 8: returnTo brings the user back; unsafe returnTo falls back to /', async ({ page, request }) => {
    await page.goto('/auth/login?returnTo=%2Flanguage');
    await completeKeycloakSignIn(page, request, '/language');
    await page.context().clearCookies();
    await page.goto('/auth/login?returnTo=%2F%2Fevil.example');
    await completeKeycloakSignIn(page, request, '/');
  });
});

test.describe('anonymous behavior', () => {
  test('Scenario 5 + 9: anonymous header, forged Authorization gives 401, /auth/session is no-store', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('account-signin')).toHaveAccessibleName(en.auth.signIn);
    await expect(page.getByTestId('account-signin')).toHaveAttribute('href', '/auth/login?returnTo=%2F');
    expect((await pageFetch(page, '/api/me', { headers: { authorization: 'Bearer forged' } })).status).toBe(401);
    expect((await pageFetch(page, '/api/health')).status).toBe(200);
    const session = await page.request.get('/auth/session');
    expect(session.headers()['cache-control']).toBe('no-store');
    expect(await session.json()).toEqual({ signedIn: false });
  });

  test('Scenario 9: the service worker never intercepts /auth/* (cache v3)', async ({ request }) => {
    const sw = await (await request.get('/sw.js')).text();
    expect(sw).toContain("const VERSION = 'v3';");
    expect(sw).toContain("url.pathname.startsWith('/auth/')");
  });

  test('Scenario 8: unknown transaction -> expired page; state mismatch -> generic page', async ({ page }) => {
    await page.goto('/auth/callback?code=x&state=y');
    await expect(page).toHaveURL(`${WEB}/auth/error?reason=expired`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.error.title);
    await expect(page.getByTestId('auth-error-helper')).toHaveText(en.auth.error.reasons.expired);

    await page.goto('/auth/login?returnTo=%2Flanguage');
    await expect(page.locator('#username')).toBeVisible();
    await page.goto('/auth/callback?code=x&state=wrong');
    await expect(page).toHaveURL(`${WEB}/auth/error?reason=failed&returnTo=%2Flanguage`);
    await expect(page.getByTestId('auth-error-helper')).toHaveText(en.auth.error.reasons.generic);
    await expect(page.getByTestId('auth-error-retry')).toHaveAttribute('href', '/auth/login?returnTo=%2Flanguage');
    expect((await page.context().cookies(WEB)).some((c) => c.name === 'bm_session')).toBe(false);
    await page.getByTestId('auth-error-home').click();
    await expect(page).toHaveURL(`${WEB}/`);
  });

  test('/auth/error shows one helper per reason, generic for failed and unknown values', async ({ page }) => {
    for (const [reason, key] of [
      ['cancelled', 'cancelled'],
      ['expired', 'expired'],
      ['unavailable', 'unavailable'],
      ['failed', 'generic'],
      ['nonsense', 'generic'],
    ] as const) {
      await page.goto(`/auth/error?reason=${reason}`);
      await expect(page.getByTestId('auth-error-helper')).toHaveText(en.auth.error.reasons[key]);
      await expect(page.getByTestId('auth-error-retry')).toHaveText(en.auth.error.tryAgain);
      await expect(page.getByTestId('auth-error-home')).toHaveText(en.auth.error.backHome);
    }
    await page.goto('/auth/error?reason=failed&returnTo=%2F%2Fevil.example');
    await expect(page.getByTestId('auth-error-retry')).toHaveAttribute('href', '/auth/login?returnTo=%2F');
  });

  test('Scenario 8: /auth/login on 127.0.0.1 redirects 307 to the canonical localhost URL', async ({ playwright }) => {
    const port = new URL(WEB).port;
    const api = await playwright.request.newContext();
    const res = await api.get(`http://127.0.0.1:${port}/auth/login?returnTo=%2Fx`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toBe(`${WEB}/auth/login?returnTo=%2Fx`);
    await api.dispose();
  });
});

// --- Scenario 9 + 10: same Home HTML for everyone; layout of the new UI ---

let signedInState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;

async function signedInContext(browser: Browser, viewport: { width: number; height: number }, locale: Locale) {
  const context = await newContext(browser, { baseURL: baseURL(), storageState: signedInState ?? undefined, viewport, isMobile: true, hasTouch: true });
  await setLocaleCookie(context, locale);
  return context;
}

test.describe('signed-in layout', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await newContext(browser, { baseURL: baseURL() });
    const guard = await guardLocalhost(context, authOrigins());
    const page = await context.newPage();
    await signInFromHome(page, context.request);
    signedInState = await context.storageState();
    expect(guard).toEqual([]);
    await context.close();
  });

  test('Scenario 9: Home HTML is identical for anonymous and signed-in visitors', async ({ browser, playwright }) => {
    const signed = await signedInContext(browser, { width: 390, height: 844 }, 'en');
    const anonymous = await playwright.request.newContext({ baseURL: baseURL(), extraHTTPHeaders: { cookie: 'NEXT_LOCALE=en' } });
    expect((await signed.cookies(WEB)).some((c) => c.name === 'bm_session')).toBe(true);
    expect((await signed.request.get('/auth/session').then((r) => r.json())) as unknown).toMatchObject({ signedIn: true });
    const signedHtml = await (await signed.request.get('/')).text();
    const anonymousHtml = await (await anonymous.get('/')).text();
    expect(signedHtml).not.toContain(HOMEOWNER);
    expect(signedHtml).not.toContain('eyJ');
    expect(signedHtml).toBe(anonymousHtml);
    await signed.close();
    await anonymous.dispose();
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 780 }]) {
    for (const locale of ['de', 'fi'] as const) {
      test(`${viewport.width}x${viewport.height} ${locale}: Home anonymous/signed in, account sheet and /auth/error fit`, async ({ browser, page, context }) => {
        // Anonymous Home.
        await page.setViewportSize(viewport);
        await setLocaleCookie(context, locale);
        await page.goto('/');
        await expect(page.getByTestId('account-signin')).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
        await expect(page.getByTestId('home-cta-start')).toBeInViewport({ ratio: 1 });

        // /auth/error.
        await page.goto('/auth/error?reason=unavailable');
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
        await expect(page.getByTestId('auth-error-retry')).toBeInViewport({ ratio: 1 });

        // Signed-in Home and the open account sheet.
        const signed = await signedInContext(browser, viewport, locale);
        const guard = await guardLocalhost(signed, authOrigins());
        const signedPage = await signed.newPage();
        await signedPage.goto(`${WEB}/`);
        await expect(signedPage.getByTestId('account-button')).toBeVisible();
        expect(await horizontalOverflow(signedPage)).toEqual([]);
        expect(await smallTargets(signedPage)).toEqual([]);
        await expect(signedPage.getByTestId('home-cta-start')).toBeInViewport({ ratio: 1 });
        await signedPage.getByTestId('account-button').click();
        await expect(signedPage.getByTestId('account-sheet')).toBeVisible();
        expect(await horizontalOverflow(signedPage)).toEqual([]);
        expect(await smallTargets(signedPage)).toEqual([]);
        await expect(signedPage.getByTestId('account-signout')).toBeInViewport({ ratio: 1 });
        expect(guard).toEqual([]);
        await signed.close();
      });
    }
  }
});

// Developer rule (design read-back): below 375 px the selector keeps the full native name at
// 12/16 in a compact centered pill; the header (wordmark + selector + account entry) fits.
test.describe('language selector on narrow screens', () => {
  for (const [width, fontSize] of [
    [360, '12px'],
    [390, '14px'],
  ] as const) {
    for (const locale of ['de', 'fi', 'nl'] as const) {
      test(`${width} px ${locale}: full native name at ${fontSize}, header fits`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 780 });
        await setLocaleCookie(context, locale);
        await page.goto('/');
        const label = page.getByTestId('locale-selector-label');
        await expect(label).toHaveText(NATIVE_NAMES[LOCALES.indexOf(locale)] ?? '');
        expect(await label.evaluate((el) => getComputedStyle(el).fontSize)).toBe(fontSize);
        const boxes = await page.evaluate(() => {
          const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().toJSON() as DOMRect;
          const header = document.querySelector('header') as HTMLElement;
          return {
            header: { scroll: header.scrollWidth, client: header.clientWidth },
            wordmark: rect('header [data-testid="wordmark"]'),
            selector: rect('[data-testid="locale-selector"]'),
            account: rect('[data-testid="account-signin"]'),
          };
        });
        expect(boxes.header.scroll).toBeLessThanOrEqual(boxes.header.client);
        expect(boxes.wordmark.right).toBeLessThanOrEqual(boxes.selector.left);
        expect(boxes.selector.right).toBeLessThanOrEqual(boxes.account.left);
        expect(boxes.account.right).toBeLessThanOrEqual(width - 16 + 0.5);
        expect(boxes.selector.height).toBe(44);
        expect(boxes.account.width).toBe(44);
        expect(await horizontalOverflow(page)).toEqual([]);
      });
    }
  }
});
