import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  DEV_CLIENT,
  DEV_REDIRECT,
  fmt,
  guardLocalhost,
  homeownerPassword,
  horizontalOverflow,
  KC_REALM_PATH,
  kcMessages,
  keycloakAuthUrl,
  keycloakURL,
  LOCALES,
  mailpitClear,
  mailpitCode,
  mailpitCount,
  newPkce,
  smallTargets,
  type Pkce,
} from './support';

// Feature keycloak-login-theme: the Keycloak sign-in, create-account, email-code and message
// pages (theme `bricomission`) driven directly with the dev client (Authorization Code + PKCE).
// The redirect to http://localhost/dev-callback is observed (request event); every browser request
// the guard can see must go to the Keycloak origin (localhost-only guard, Scenario 7).

const KC = keycloakURL();
const KC_ORIGIN = new URL(KC).origin;
const HOMEOWNER = 'bm-homeowner';
const HOMEOWNER_EMAIL = 'homeowner@bricomission.local';
const HOMEOWNER_FIRST_NAME = 'Hugo';
const STYLESHEET = /\/resources\/[^/]+\/login\/bricomission\/css\/bricomission\.css$/;
const en = kcMessages('login', 'en');

let blocked: string[] = [];

test.beforeEach(async ({ context }) => {
  blocked = await guardLocalhost(context, [KC_ORIGIN]);
});

test.afterEach(() => {
  expect(blocked, 'browser requests outside the Keycloak origin').toEqual([]);
});

/**
 * Watches for the redirect to dev-callback. Playwright routes do not see redirect hops, so the
 * request event is used; the browser then fails to load http://localhost/dev-callback (nothing
 * listens there), which is fine: only the URL with code= matters. `reached` resolves with it.
 */
function watchCallback(page: Page): { reached: Promise<URL> } {
  return { reached: page.waitForRequest((req) => req.url().startsWith(DEV_REDIRECT), { timeout: 15_000 }).then((req) => new URL(req.url())) };
}

async function openSignIn(page: Page, locale: string, extra: Record<string, string> = {}): Promise<Pkce> {
  const pkce = newPkce();
  await page.goto(keycloakAuthUrl(locale, pkce, extra));
  return pkce;
}

async function submitPassword(page: Page, username: string, password: string) {
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForLoadState('domcontentloaded');
}

/** Signs in as bm-homeowner and returns the code email that the password step sent. */
async function homeownerToCodePage(page: Page, request: APIRequestContext, locale: string) {
  await openSignIn(page, locale);
  return mailpitCode(request, HOMEOWNER_EMAIL, () => submitPassword(page, HOMEOWNER, homeownerPassword()));
}

function wrongCode(code: string): string {
  return [...code].map((d) => String((Number(d) + 1) % 10)).join('');
}

async function exchangeCode(request: APIRequestContext, code: string, pkce: Pkce) {
  const res = await request.post(`${KC}${KC_REALM_PATH}/protocol/openid-connect/token`, {
    form: { grant_type: 'authorization_code', client_id: DEV_CLIENT, code, redirect_uri: DEV_REDIRECT, code_verifier: pkce.verifier },
  });
  expect(res.status()).toBe(200);
  const token = ((await res.json()) as { access_token: string }).access_token;
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { realm_access: { roles: string[] } };
}

async function expectThemed(page: Page) {
  const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  expect(sheets).toHaveLength(1);
  expect(sheets[0]).toMatch(STYLESHEET);
  expect(sheets[0]?.startsWith(KC_ORIGIN)).toBe(true);
  await expect(page.getByTestId('wordmark')).toHaveText('BricoMission');
}

async function expectNoLanguagePicker(page: Page) {
  await expect(page.locator('#kc-locale, #kc-locale-dropdown, select, [id^="language-"]')).toHaveCount(0);
}

test.describe('Scenario 2: sign in with password and email code', () => {
  test('themed sign-in, code page and code email (en), then redirect with code=', async ({ page, request }) => {
    const fonts: string[] = [];
    page.on('requestfinished', (req) => {
      if (req.url().endsWith('.woff2')) fonts.push(req.url());
    });
    await openSignIn(page, 'en');
    await expectThemed(page);
    await expectNoLanguagePicker(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.loginAccountTitle!);
    await expect(page.getByText(en.bmSignInHelper!)).toBeVisible();
    expect(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('16px Inter')))).toBe(true);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) expect(font.startsWith(`${KC_ORIGIN}/resources/`)).toBe(true);

    const mail = await mailpitCode(request, HOMEOWNER_EMAIL, () => submitPassword(page, HOMEOWNER, homeownerPassword()));
    console.log(`Scenario 2 Mailpit message id: ${mail.id}`);
    await expectThemed(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.bmCodeTitle!);
    await expect(page.locator('.bm-helper')).toContainText('@bricomission.local');
    await expect(page.locator('#emailCode')).toHaveAttribute('inputmode', 'numeric');
    await expect(page.locator('#emailCode')).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(page.locator('#kc-resend')).toHaveText(en.resendCode!);
    await expect(page.locator('#kc-cancel')).toHaveText(en.bmCancelCode!);

    const email = kcMessages('email', 'en');
    expect(mail.subject).toBe(fmt(email.emailCodeSubject!, 'BricoMission'));
    for (const line of [fmt(email.bmEmailGreeting!, HOMEOWNER_FIRST_NAME), email.bmEmailIntro!, fmt(email.bmEmailValidity!, 5), email.bmEmailIgnore!]) {
      expect(mail.text).toContain(line);
    }
    expect(mail.html).toContain(`>${mail.code}</td>`);
    expect(mail.html).not.toMatch(/https?:\/\//);

    await page.locator('#emailCode').fill(mail.code);
    const callback = watchCallback(page);
    await page.locator('#kc-login').click();
    const url = await callback.reached;
    expect(url.searchParams.get('code')).toBeTruthy();
  });
});

test.describe('Scenario 3: create account with email code', () => {
  test('a new account must enter the code and gets exactly realm role user', async ({ page, request }) => {
    const id = `e2e-${Date.now()}`;
    const email = `${id}@bricomission.local`;
    const pkce = await openSignIn(page, 'en');
    await page.getByRole('link', { name: en.doRegister }).click();
    await expectThemed(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.registerTitle!);
    const labels = await page.locator('form .bm-label').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual([en.firstName, en.lastName, en.email, en.username, en.password, en.passwordConfirm]);

    await page.locator('#firstName').fill('Erika');
    await page.locator('#lastName').fill('Endtoend');
    await page.locator('#email').fill(email);
    await page.locator('#username').fill(id);
    await page.locator('#password').fill('E2e-pass-12345');
    await page.locator('#password-confirm').fill('E2e-pass-12345');
    const mail = await mailpitCode(request, email, () => page.locator('#kc-register').click());
    console.log(`Scenario 3 Mailpit message id: ${mail.id} (user ${id})`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.bmCodeTitle!);
    expect(mail.text).toContain(fmt(kcMessages('email', 'en').bmEmailGreeting!, 'Erika'));

    await page.locator('#emailCode').fill(mail.code);
    const callback = watchCallback(page);
    await page.locator('#kc-login').click();
    const url = await callback.reached;
    const code = url.searchParams.get('code');
    expect(code).toBeTruthy();
    const claims = await exchangeCode(request, code ?? '', pkce);
    expect(claims.realm_access.roles.filter((r) => ['user', 'professional', 'admin'].includes(r))).toEqual(['user']);
  });
});

test.describe('Scenario 4: error states', () => {
  test('wrong password: form-level alert, password emptied and focused, no email', async ({ page, request }) => {
    await mailpitClear(request, HOMEOWNER_EMAIL);
    await openSignIn(page, 'en');
    await submitPassword(page, HOMEOWNER, 'not-the-password');
    await expect(page.getByRole('alert')).toHaveText(en.invalidUserMessage!);
    await expect(page.getByRole('alert').locator('svg')).toHaveCount(1);
    await expect(page.locator('#username')).toHaveValue(HOMEOWNER);
    await expect(page.locator('#password')).toHaveValue('');
    await expect(page.locator('#password')).toBeFocused();
    await page.waitForTimeout(2000);
    expect(await mailpitCount(request, HOMEOWNER_EMAIL)).toBe(0);
  });

  test('wrong code keeps the page; the 5th wrong code shows too-many-attempts', async ({ page, request }) => {
    const mail = await homeownerToCodePage(page, request, 'en');
    const wrong = wrongCode(mail.code);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.locator('#emailCode').fill(wrong);
      await page.locator('#kc-login').click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.bmCodeTitle!);
      await expect(page.getByRole('alert')).toHaveText(en.invalidAccessCodeMessage!);
      await expect(page.locator('.bm-input-row--code')).toHaveClass(/bm-input-row--error/);
    }
    await page.locator('#emailCode').fill(wrong);
    await page.locator('#kc-login').click();
    await expect(page.getByRole('alert')).toHaveText(en['email-authenticator-too-many-attempts']!);
    await expect(page.locator('#emailCode')).toBeDisabled();
    await expect(page.locator('#kc-login')).toHaveCount(0);
    await expect(page.locator('#kc-resend')).toHaveClass(/bm-button--primary/);
  });

  test('create account shows the designed field errors', async ({ page }) => {
    await openSignIn(page, 'en');
    await page.getByRole('link', { name: en.doRegister }).click();
    await page.locator('#kc-register').click();
    const required: Array<[string, string]> = [
      ['firstName', en.missingFirstNameMessage!],
      ['lastName', en.missingLastNameMessage!],
      ['email', en.missingEmailMessage!],
      ['username', en.missingUsernameMessage!],
      ['password', en.missingPasswordMessage!],
    ];
    for (const [field, text] of required) {
      await expect(page.locator(`#input-error-${field}`)).toHaveText(text);
      await expect(page.locator(`#input-error-${field} svg`)).toHaveCount(1);
      await expect(page.locator(`#${field}`)).toHaveAttribute('aria-describedby', `input-error-${field}`);
    }

    await page.locator('#firstName').fill('Taken');
    await page.locator('#lastName').fill('Values');
    await page.locator('#email').fill(HOMEOWNER_EMAIL);
    await page.locator('#username').fill(HOMEOWNER);
    await page.locator('#password').fill('E2e-pass-12345');
    await page.locator('#password-confirm').fill('Something-else-1');
    await page.locator('#kc-register').click();
    await expect(page.locator('#input-error-username')).toHaveText(en.usernameExistsMessage!);
    await expect(page.locator('#input-error-email')).toHaveText(en.emailExistsMessage!);
    await expect(page.locator('#input-error-password-confirm')).toHaveText(en.invalidPasswordConfirmMessage!);
    await expect(page.locator('#input-error-firstName')).toHaveCount(0);
  });

  test('an expired login page renders with the theme', async ({ page, request }) => {
    await openSignIn(page, 'en');
    const staleAction = await page.locator('#kc-form-login').getAttribute('action');
    await mailpitCode(request, HOMEOWNER_EMAIL, () => submitPassword(page, HOMEOWNER, homeownerPassword()));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.bmCodeTitle!);
    // Re-post the already used sign-in form action (what a stale tab would do).
    await page.evaluate(
      ([action, username, password]) => {
        const form = document.createElement('form');
        form.method = 'post';
        form.action = action ?? '';
        for (const [name, value] of Object.entries({ username, password, credentialId: '' })) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value ?? '';
          form.append(input);
        }
        document.body.append(form);
        form.submit();
      },
      [staleAction, HOMEOWNER, homeownerPassword()],
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.bmExpiredTitle!);
    await expect(page.getByText(en.bmExpiredMessage!)).toBeVisible();
    await expect(page.locator('#loginRestartLink')).toHaveText(en.bmStartAgain!);
    await expectThemed(page);
  });

  test('an invalid action URL shows the themed error page', async ({ page }) => {
    await page.goto(`${KC}${KC_REALM_PATH}/login-actions/authenticate?session_code=invalid&execution=invalid&client_id=${DEV_CLIENT}&tab_id=invalid`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.bmErrorTitle!);
    await expect(page.getByText(en.bmErrorMessage!)).toBeVisible();
    await expect(page.locator('#bm-start-again')).toHaveText(en.bmStartAgain!);
    await expectThemed(page);
  });
});

test.describe('Scenario 5: 11 locales', () => {
  for (const locale of LOCALES) {
    test(`sign-in page in ${locale} (ui_locales)`, async ({ page }) => {
      await openSignIn(page, locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(kcMessages('login', locale).loginAccountTitle!);
      await expectNoLanguagePicker(page);
    });
  }

  for (const locale of ['de', 'fi'] as const) {
    test(`create-account page, code page and code email in ${locale}`, async ({ page, request }) => {
      const m = kcMessages('login', locale);
      await openSignIn(page, locale);
      await page.getByRole('link', { name: m.doRegister }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.registerTitle!);
      await expect(page.locator('label[for="firstName"]')).toHaveText(m.firstName!);
      await expectNoLanguagePicker(page);

      const mail = await homeownerToCodePage(page, request, locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.bmCodeTitle!);
      await expect(page.locator('#kc-login')).toHaveText(m.bmVerify!);
      expect(mail.subject).toBe(fmt(kcMessages('email', locale).emailCodeSubject!, 'BricoMission'));
    });
  }

  // Locale precedence (developer decision 2026-11-13, option a): the register page stores no
  // Keycloak locale, so ui_locales (the app language) decides every page and the code email,
  // for self-registered and seeded accounts alike.
  test('ui_locales decides after sign-in for a self-registered account and a seeded one', async ({ page, context, request }) => {
    const id = `e2e-fr-${Date.now()}`;
    const email = `${id}@bricomission.local`;
    await openSignIn(page, 'fr');
    await page.getByRole('link', { name: kcMessages('login', 'fr').doRegister }).click();
    await expect(page.locator('input[name="locale"]')).toHaveCount(0);
    await page.locator('#firstName').fill('Fanny');
    await page.locator('#lastName').fill('Francaise');
    await page.locator('#email').fill(email);
    await page.locator('#username').fill(id);
    await page.locator('#password').fill('E2e-pass-12345');
    await page.locator('#password-confirm').fill('E2e-pass-12345');
    const registered = await mailpitCode(request, email, () => page.locator('#kc-register').click());
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect(registered.subject).toBe(fmt(kcMessages('email', 'fr').emailCodeSubject!, 'BricoMission'));

    for (const [username, address, password, locale] of [
      [id, email, 'E2e-pass-12345', 'de'],
      [HOMEOWNER, HOMEOWNER_EMAIL, homeownerPassword(), 'it'],
    ] as const) {
      await context.clearCookies();
      await openSignIn(page, locale);
      const mail = await mailpitCode(request, address, () => submitPassword(page, username, password));
      await expect(page.locator('html'), `${username} with ui_locales=${locale}`).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(kcMessages('login', locale).bmCodeTitle!);
      expect(mail.subject).toBe(fmt(kcMessages('email', locale).emailCodeSubject!, 'BricoMission'));
    }
  });
});

test.describe('Scenario 7: layout at 390 and 360 px in de and fi', () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 780 },
  ]) {
    for (const locale of ['de', 'fi'] as const) {
      test(`sign-in, create-account and code pages fit at ${viewport.width}x${viewport.height} in ${locale}`, async ({ page, request }) => {
        await page.setViewportSize(viewport);
        const m = kcMessages('login', locale);
        const check = async (primary: string, label: string) => {
          expect(await horizontalOverflow(page), `${label}: overflow`).toEqual([]);
          expect(await smallTargets(page), `${label}: targets < 44x44`).toEqual([]);
          const button = page.locator(primary);
          await button.scrollIntoViewIfNeeded();
          await expect(button, `${label}: primary button`).toBeInViewport();
        };
        await openSignIn(page, locale);
        await check('#kc-login', 'sign-in');
        await page.getByRole('link', { name: m.doRegister }).click();
        await check('#kc-register', 'create-account');
        await homeownerToCodePage(page, request, locale);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.bmCodeTitle!);
        await check('#kc-login', 'code');
      });
    }
  }
});
