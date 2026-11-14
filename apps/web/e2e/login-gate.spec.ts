import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  authOrigins,
  baseURL,
  guardLocalhost,
  HOMEOWNER,
  HOMEOWNER_EMAIL,
  homeownerPassword,
  horizontalOverflow,
  type Locale,
  mailpitCode,
  messages,
  pageFetch,
  setLocaleCookie,
  smallTargets,
} from './support';

// Feature login-gate-claim: the Generate step, the Login Gate, the claim of the anonymous draft
// after sign-in (password + email code, or sign-up + email code), the owned project page, the
// role and failure states and the layouts. Browser requests stay on the web and Keycloak
// localhost origins; Mailpit is read through the test's request context.
test.use({ locale: 'en-US' });

const WEB = new URL(baseURL()).origin;
const GENERATE = '/kitchen-projects/new/generate';
const DRAFTS = '/api/kitchen-projects/drafts';
const CURRENT = `${DRAFTS}/current`;
const CLAIM = `${CURRENT}/claim`;
// Since controlnet-render the render intent lands on AI Results (the page strips ?claimed=1&start=1).
const PROJECT_URL = /\/kitchen-projects\/([0-9a-f-]{36})$/;
const RESULTS_URL = /\/kitchen-projects\/([0-9a-f-]{36})\/results$/;
const PROFESSIONAL = 'bm-professional';
const PROFESSIONAL_EMAIL = 'professional@bricomission.local';
const professionalPassword = () => process.env.E2E_SEED_PROFESSIONAL_PASSWORD ?? 'bm-professional-dev';
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

interface GenerateMessages {
  step: string;
  title: string;
  cta: Record<'render' | 'budget', string>;
  gate: Record<'title' | 'signIn' | 'register', string>;
  hints: Record<'capture' | 'items' | 'start', string>;
  alerts: Record<'wrongRole' | 'failed' | 'expired' | 'offline', string>;
  summary: { measurements: string };
}
interface ProjectMessages {
  title: string;
  claimed: string;
  seeBudget: string;
  signedOut: { title: string };
  notFound: { title: string };
}
const gm = (locale: Locale) => (messages(locale) as unknown as { generate: GenerateMessages }).generate;
const pm = (locale: Locale) => (messages(locale) as unknown as { project: ProjectMessages }).project;
const fill = (message: string, values: Record<string, string | number>) => message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

let blocked: string[] = [];
test.beforeEach(async ({ context }) => {
  blocked = await guardLocalhost(context, authOrigins());
});
test.afterEach(() => {
  expect(blocked, 'browser requests outside the web and Keycloak localhost origins').toEqual([]);
});

async function apiJson(page: Page, path: string, method: string, body?: unknown) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.text() };
    },
    { path, method, body },
  );
}

async function apiUpload(page: Page, path: string, file: string) {
  const bytes = Array.from(readFileSync(fixture(file)));
  return page.evaluate(
    async ({ path, bytes }) => {
      const form = new FormData();
      form.append('photo', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'photo');
      const res = await fetch(path, { method: 'POST', body: form, credentials: 'same-origin' });
      return res.status;
    },
    { path, bytes },
  );
}

/** Starts this browser's anonymous draft through the app's own routes; `ready` = 2 photos, 3 measurements, 3 Moodboard Items. */
async function seedDraft(page: Page, locale: Locale = 'en', ready = true): Promise<string> {
  await setLocaleCookie(page.context(), locale);
  await page.goto('/language');
  const start = await pageFetch(page, DRAFTS, { method: 'POST' });
  expect(start.status).toBe(201);
  const id = (JSON.parse(start.body) as { draft: { id: string } }).draft.id;
  if (ready) {
    expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
    expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-2.jpg')).toBe(201);
    expect((await apiJson(page, `${CURRENT}/measurements`, 'PUT', { lengthCm: 420, widthCm: 310, heightCm: 260 })).status).toBe(200);
    for (const galleryImageId of ['modern-01', 'scandinavian-02', 'farmhouse-03']) {
      expect((await apiJson(page, `${CURRENT}/moodboard/gallery-items`, 'POST', { galleryImageId })).status).toBe(201);
    }
  }
  return id;
}

/** Password + email code on the themed Keycloak page; the caller waits for its landing URL. */
async function keycloakSignIn(page: Page, request: APIRequestContext, username = HOMEOWNER, password = homeownerPassword(), email = HOMEOWNER_EMAIL) {
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  const mail = await mailpitCode(request, email, () => page.locator('#kc-login').click());
  await page.locator('#emailCode').fill(mail.code);
  await page.locator('#kc-login').click();
}

/** The budget intent lands on the project page (simulations-ux-overhaul: no Simulation is selected yet); returns the project id. */
async function waitForProjectPage(page: Page): Promise<string> {
  await page.waitForURL(PROJECT_URL, { timeout: 30_000 });
  return PROJECT_URL.exec(new URL(page.url()).pathname)?.[1] ?? '';
}

async function waitForResults(page: Page): Promise<string> {
  await page.waitForURL(RESULTS_URL, { timeout: 30_000 });
  return RESULTS_URL.exec(new URL(page.url()).pathname)?.[1] ?? '';
}

async function imagesLoaded(page: Page, testId: string) {
  return page.getByTestId(testId).evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
}

async function draftCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === 'bm_draft');
}

async function checkLayout(page: Page) {
  expect(await horizontalOverflow(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
}

test.describe.serial('login gate and claim', () => {
  test.setTimeout(120_000);
  let ownedId = '';
  let homeownerDraftToken = '';

  test('Scenario 1 + 7: Generate for an anonymous ready draft, the gate, no costly calls; en/es 390 and de/fi 360 layouts', async ({ page }) => {
    const costly: string[] = [];
    page.on('request', (req) => {
      const path = new URL(req.url()).pathname;
      if (path.endsWith('/claim') || /\/simulations$|\/budget$/.test(path) || /^\/api\/kitchen-projects\/[0-9a-f-]{36}/.test(path)) costly.push(path);
    });
    await seedDraft(page, 'en');
    await page.goto(GENERATE);
    const en = gm('en');
    await expect(page.getByText(fill(en.step, { current: 3, total: 3 }))).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.title);
    await expect(page.getByTestId('summary-photos-thumb')).toHaveCount(2);
    await expect(page.getByTestId('summary-moodboard-thumb')).toHaveCount(2);
    await expect(page.getByTestId('summary-moodboard-more')).toHaveText('+1');
    await expect(page.getByTestId('summary-measurements')).toHaveText(fill(en.summary.measurements, { length: '4.20', width: '3.10', height: '2.60' }));
    expect(await imagesLoaded(page, 'summary-photos-thumb')).toBe(true);
    expect(await imagesLoaded(page, 'summary-moodboard-thumb')).toBe(true);
    await expect(page.getByTestId('generate-render')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('generate-budget')).toHaveText(en.cta.budget);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/login-gate/1-generate-en.png' });

    // The gate: a modal dialog; Close, Escape and the links.
    await page.getByTestId('generate-render').click();
    const gate = page.getByRole('dialog', { name: en.gate.title });
    await expect(gate).toBeVisible();
    await expect(page.getByTestId('login-gate-sign-in')).toHaveAttribute('href', '/auth/login?returnTo=%2Fkitchen-projects%2Fnew%2Fgenerate%3Fintent%3Drender');
    await expect(page.getByTestId('login-gate-register')).toHaveAttribute('href', /&mode=register$/);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/login-gate/3-gate-en.png' });
    await page.keyboard.press('Escape');
    await expect(gate).toBeHidden();
    await page.getByTestId('generate-budget').click();
    await expect(page.getByTestId('login-gate-sign-in')).toHaveAttribute('href', /intent%3Dbudget$/);
    await page.getByTestId('login-gate-close').click();
    await expect(gate).toBeHidden();
    expect(costly).toEqual([]);

    // Through the web proxy, anonymous costly and owner calls are 401.
    const fakeId = '00000000-0000-4000-8000-000000000000';
    expect((await pageFetch(page, `/api/kitchen-projects/${fakeId}/simulations`, { method: 'POST' })).status).toBe(401);
    expect((await pageFetch(page, `/api/kitchen-projects/${fakeId}`)).status).toBe(401);
    // Claim without a session: 401 and the draft is kept.
    expect((await pageFetch(page, CLAIM, { method: 'POST' })).status).toBe(401);
    expect((await pageFetch(page, CURRENT)).status).toBe(200);

    for (const [locale, width, height] of [['es', 390, 844], ['de', 360, 780], ['fi', 360, 780]] as const) {
      await page.setViewportSize({ width, height });
      await setLocaleCookie(page.context(), locale);
      await page.goto(GENERATE);
      await expect(page.getByTestId('generate-render')).toHaveText(gm(locale).cta.render);
      await expect(page.getByTestId('generate-render')).toHaveAttribute('aria-disabled', 'false');
      await checkLayout(page);
      await page.getByTestId('generate-render').click();
      await expect(page.getByTestId('login-gate')).toBeVisible();
      await checkLayout(page);
      await page.screenshot({ path: `test-results/login-gate/gate-${locale}-${width}.png` });
    }
  });

  test('Scenario 2: gate -> sign in (email code) -> the same draft is claimed and shown on the owned page; idempotent; sign out and back', async ({ page, request }) => {
    const draftId = await seedDraft(page, 'en');
    const cookieBefore = await draftCookie(page);
    expect(cookieBefore).toBeDefined();
    homeownerDraftToken = cookieBefore!.value;
    await page.goto(GENERATE);
    // Budget intent: the claim lands on the project page with the "saved" banner (e2e/budget.spec.ts continues from there;
    // the render intent opens AI Results: e2e/results.spec.ts).
    await page.getByTestId('generate-budget').click();
    await page.getByTestId('login-gate-sign-in').click();
    await keycloakSignIn(page, request);
    ownedId = await waitForProjectPage(page);
    expect(ownedId).toBe(draftId);

    const p = pm('en');
    await expect(page.getByTestId('project-claimed')).toHaveText(p.claimed);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.title);
    // simulations-ux-overhaul: the summary card has three rows with edit links (cm, no thumbnails); no Simulation yet.
    await expect(page.getByTestId('summary-photos')).toContainText('2 photos');
    await expect(page.getByTestId('summary-measurements')).toContainText('420 x 310 x 260 cm');
    await expect(page.getByTestId('summary-styles')).toContainText('3 styles and references');
    await expect(page.getByTestId('project-edit-photos')).toHaveAttribute('href', `/kitchen-projects/${ownedId}/edit/photos`);
    await expect(page.getByTestId('project-edit-measurements')).toHaveAttribute('href', `/kitchen-projects/${ownedId}/edit/measurements`);
    await expect(page.getByTestId('project-edit-styles')).toHaveAttribute('href', `/kitchen-projects/${ownedId}/edit/styles`);
    await expect(page.getByTestId('simulations-empty')).toBeVisible();
    // "Generate my kitchen" opens AI Results and starts a Simulation; the budget button stays disabled until one is selected.
    await expect(page.getByTestId('project-render')).toHaveText(gm('en').cta.render);
    await expect(page.getByTestId('project-render')).toHaveAttribute('href', `/kitchen-projects/${ownedId}/results?start=1`);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-budget')).toHaveText(gm('en').cta.budget);
    await expect(page.getByTestId('project-new')).toHaveAttribute('href', '/kitchen-projects/new');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/login-gate/5-owned-en.png' });

    const project = await pageFetch(page, `/api/kitchen-projects/${ownedId}`);
    expect(project.status).toBe(200);
    const view = JSON.parse(project.body) as { status: string; claimedAt: string };
    expect(view.status).toBe('claimed');
    expect((await pageFetch(page, CURRENT)).status).toBe(404);
    expect(await draftCookie(page)).toBeUndefined();
    expect(await page.evaluate(() => window.localStorage.getItem('bm_draft_started'))).toBeNull();
    // Costly actions on the owned, ready project are real: Simulations (simulations-ux-overhaul) and Budgets (budget-tier-computation).
    // A Budget needs a selected Simulation: none yet, so the API answers 409 no_simulation_selected.
    const noSelection = await pageFetch(page, `/api/kitchen-projects/${ownedId}/budget`, { method: 'POST' });
    expect(noSelection.status).toBe(409);
    expect(JSON.parse(noSelection.body)).toMatchObject({ code: 'no_simulation_selected' });
    expect((await apiJson(page, `/api/kitchen-projects/${ownedId}/simulations`, 'POST')).status).toBe(202);

    // Idempotent: the same draft token again with the same Account gives the same project.
    await page.context().addCookies([{ name: 'bm_draft', value: cookieBefore!.value, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
    const again = await pageFetch(page, CLAIM, { method: 'POST' });
    expect(again.status).toBe(200);
    const againView = (JSON.parse(again.body) as { project: { id: string; claimedAt: string } }).project;
    expect(againView).toMatchObject({ id: ownedId, claimedAt: view.claimedAt });
    expect(await draftCookie(page)).toBeUndefined();

    // The owned page at 360x780 in de and fi.
    for (const locale of ['de', 'fi'] as const) {
      await page.setViewportSize({ width: 360, height: 780 });
      await setLocaleCookie(page.context(), locale);
      await page.goto(`/kitchen-projects/${ownedId}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(pm(locale).title);
      await expect(page.getByTestId('summary-photos')).toBeVisible();
      await checkLayout(page);
      await page.screenshot({ path: `test-results/login-gate/owned-${locale}-360.png` });
    }

    // Sign out on the owned page: signed-out state; sign in again: the project.
    await page.setViewportSize({ width: 390, height: 844 });
    await setLocaleCookie(page.context(), 'en');
    await page.goto(`/kitchen-projects/${ownedId}`);
    await page.getByTestId('account-button').click();
    await page.getByTestId('account-signout').click();
    await page.waitForURL(`${WEB}/`);
    await page.goto(`/kitchen-projects/${ownedId}`);
    await expect(page.getByTestId('project-signed-out')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.signedOut.title);
    await checkLayout(page);
    await page.getByTestId('project-sign-in').click();
    await keycloakSignIn(page, request);
    await page.waitForURL(`${WEB}/kitchen-projects/${ownedId}`);
    await expect(page.getByTestId('summary-photos')).toContainText('2 photos');
    await expect(page.getByTestId('project-claimed')).toHaveCount(0);
  });

  test('Scenario 3: "Create account" path: sign-up + email code, back and claimed by the new account; other accounts get 404', async ({ page, request }) => {
    expect(ownedId).not.toBe('');
    const draftId = await seedDraft(page, 'en');
    const cookieBefore = await draftCookie(page);
    await page.goto(GENERATE);
    await page.getByTestId('generate-budget').click();
    await page.getByTestId('login-gate-register').click();
    await expect(page.locator('#kc-register-form')).toBeVisible();
    const id = `e2e-gate-${Date.now()}`;
    const email = `${id}@bricomission.local`;
    await page.locator('#firstName').fill('Gina');
    await page.locator('#lastName').fill('Gate');
    await page.locator('#email').fill(email);
    await page.locator('#username').fill(id);
    await page.locator('#password').fill('E2e-pass-12345');
    await page.locator('#password-confirm').fill('E2e-pass-12345');
    const mail = await mailpitCode(request, email, () => page.locator('#kc-register').click());
    await page.locator('#emailCode').fill(mail.code);
    await page.locator('#kc-login').click();
    expect(await waitForProjectPage(page)).toBe(draftId);
    await page.goto(`/kitchen-projects/${draftId}?claimed=1`);
    await expect(page.getByTestId('project-claimed')).toBeVisible();
    const me = JSON.parse((await pageFetch(page, '/api/me')).body) as { username: string; roles: string[] };
    expect(me).toMatchObject({ username: id, roles: ['user'] });
    expect((await pageFetch(page, `/api/kitchen-projects/${draftId}`)).status).toBe(200);

    // Another Account: bm-homeowner's project is "not found" for this one, and vice versa.
    expect((await pageFetch(page, `/api/kitchen-projects/${ownedId}`)).status).toBe(404);
    await page.goto(`/kitchen-projects/${ownedId}`);
    await expect(page.getByTestId('project-not-found')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pm('en').notFound.title);
    await expect(page.getByTestId('project-home')).toHaveAttribute('href', '/');
    // Its own draft token again: idempotent 200. bm-homeowner's draft token: 404 (cookie cleared).
    await page.context().addCookies([{ name: 'bm_draft', value: cookieBefore!.value, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
    expect((await pageFetch(page, CLAIM, { method: 'POST' })).status).toBe(200);
    await page.context().addCookies([{ name: 'bm_draft', value: homeownerDraftToken, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
    expect((await pageFetch(page, CLAIM, { method: 'POST' })).status).toBe(404);
    expect(await draftCookie(page)).toBeUndefined();
    expect((await pageFetch(page, `/api/kitchen-projects/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    // Unknown uuid and a malformed id on the page.
    await page.goto('/kitchen-projects/00000000-0000-4000-8000-000000000000');
    await expect(page.getByTestId('project-not-found')).toBeVisible();
    expect((await page.request.get('/kitchen-projects/not-a-uuid')).status()).toBe(404);
  });

  test('Scenario 6: signed in before Generate claims at once (no gate); a failed claim keeps the draft and Retry works', async ({ page, request }) => {
    await page.goto('/auth/login?returnTo=%2Flanguage');
    await keycloakSignIn(page, request);
    await page.waitForURL(`${WEB}/language`);
    const draftId = await seedDraft(page, 'en');

    // API down for the claim (proxy 502): retryable error, the draft stays.
    await page.route(`${WEB}${CLAIM}`, (route) => route.fulfill({ status: 502, contentType: 'application/json', body: '{"status":"error"}' }));
    await page.goto(GENERATE);
    await page.getByTestId('generate-render').click();
    await expect(page.getByTestId('generate-claim-failed')).toHaveText(new RegExp(gm('en').alerts.failed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.getByTestId('login-gate')).toBeHidden();
    expect((await pageFetch(page, CURRENT)).status).toBe(200);
    await checkLayout(page);
    await page.unroute(`${WEB}${CLAIM}`);
    await page.getByTestId('generate-retry').click();
    expect(await waitForResults(page)).toBe(draftId);
    await expect(page.getByTestId('results-screen')).toBeVisible();

    // A signed-in visit to Generate without intent never claims by itself.
    const second = await seedDraft(page, 'en');
    await page.goto(GENERATE);
    await expect(page.getByTestId('generate-render')).toHaveAttribute('aria-disabled', 'false');
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe(GENERATE);
    expect((await pageFetch(page, CURRENT)).status).toBe(200);
    // Draft gone at claim time (404): the expired state with a Start link.
    await page.route(`${WEB}${CLAIM}`, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"status":"error"}' }));
    await page.getByTestId('generate-budget').click();
    await expect(page.getByTestId('generate-expired')).toHaveText(new RegExp(gm('en').alerts.expired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.getByTestId('generate-expired-start')).toHaveAttribute('href', '/kitchen-projects/new');
    await expect(page.getByTestId('generate-render')).toHaveAttribute('aria-disabled', 'true');
    expect(second).not.toBe(draftId);
  });

  test('Scenario 6: a Professional at the gate gets the wrong-role state; the draft stays anonymous', async ({ page, request }) => {
    const draftId = await seedDraft(page, 'en');
    await page.goto(GENERATE);
    await page.getByTestId('generate-render').click();
    await page.getByTestId('login-gate-sign-in').click();
    await keycloakSignIn(page, request, PROFESSIONAL, professionalPassword(), PROFESSIONAL_EMAIL);
    await page.waitForURL(`${WEB}${GENERATE}`);
    await expect(page.getByTestId('generate-wrong-role')).toHaveText(new RegExp(gm('en').alerts.wrongRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.getByTestId('generate-signout')).toBeVisible();
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/login-gate/6-wrong-role.png' });
    const current = await pageFetch(page, CURRENT);
    expect(current.status).toBe(200);
    expect((JSON.parse(current.body) as { id: string; status: string })).toMatchObject({ id: draftId, status: 'draft' });
    expect((await pageFetch(page, CLAIM, { method: 'POST' })).status).toBe(403);
    expect((await pageFetch(page, `/api/kitchen-projects/${ownedId}`)).status).toBe(403);
    expect(await draftCookie(page)).toBeDefined();
  });

  test('not ready and no draft: CTAs disabled with the designed hints; offline disables everything', async ({ page, context }) => {
    await seedDraft(page, 'en', false);
    await page.goto(GENERATE);
    const en = gm('en');
    await expect(page.getByTestId('generate-hint')).toHaveText(en.hints.capture);
    await expect(page.getByTestId('generate-hint-link')).toHaveAttribute('href', '/kitchen-projects/new');
    await expect(page.getByTestId('generate-render')).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled buttons are not "enabled" for Playwright: force the tap; nothing opens.
    await page.getByTestId('generate-render').click({ force: true });
    await expect(page.getByTestId('login-gate')).toBeHidden();
    await expect(page.getByTestId('summary-measurements')).toHaveText('—');
    expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
    expect((await apiJson(page, `${CURRENT}/measurements`, 'PUT', { lengthCm: 420, widthCm: 310, heightCm: 260 })).status).toBe(200);
    await page.goto(GENERATE);
    await expect(page.getByTestId('generate-hint')).toHaveText(en.hints.items);
    await expect(page.getByTestId('generate-hint-link')).toHaveAttribute('href', '/kitchen-projects/new/moodboard');
    await checkLayout(page);

    await context.clearCookies({ name: 'bm_draft' });
    await page.goto(GENERATE);
    await expect(page.getByTestId('generate-hint')).toHaveText(en.hints.start);
    await expect(page.getByTestId('generate-expired')).toBeVisible();

    expect((await apiJson(page, DRAFTS, 'POST')).status).toBe(201);
    expect((await apiJson(page, `${CURRENT}/moodboard/gallery-items`, 'POST', { galleryImageId: 'modern-01' })).status).toBe(201);
    await page.goto(GENERATE);
    await expect(page.getByTestId('generate-hint')).toHaveText(en.hints.capture);
    await context.setOffline(true);
    await expect(page.getByTestId('generate-offline')).toHaveText(en.alerts.offline);
    await expect(page.getByTestId('generate-render')).toHaveAttribute('aria-disabled', 'true');
    await context.setOffline(false);
  });
});
