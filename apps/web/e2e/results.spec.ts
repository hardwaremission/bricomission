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

// Feature controlnet-render, Scenario 4: AI Results with the fake image adapter (AI_ADAPTERS=fake in
// the compose api; each fake Render takes about 3 s and returns a tinted copy of the "before" crop).
// The claim with intent=render lands on /results and starts the first Render automatically.
test.use({ locale: 'en-US' });

const WEB = new URL(baseURL()).origin;
const GENERATE = '/kitchen-projects/new/generate';
const DRAFTS = '/api/kitchen-projects/drafts';
const CURRENT = `${DRAFTS}/current`;
const RESULTS_URL = /\/kitchen-projects\/([0-9a-f-]{36})\/results$/;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

interface ResultsMessages {
  back: string;
  titleDone: string;
  titleActive: string;
  helperDone: string;
  helperActive: string;
  slider: Record<'label' | 'before' | 'after', string>;
  status: Record<'running' | 'queued' | 'ahead', string>;
  photos: { title: string; option: string };
  history: { title: string; counter: string };
  cta: Record<'again' | 'retry' | 'generate' | 'back', string>;
  hints: Record<'oneAtATime' | 'limit', string>;
  alerts: Record<'failed' | 'interrupted' | 'queueFull' | 'uploadsOnly' | 'offline', string>;
}
const rm = (locale: Locale) => (messages(locale) as unknown as { results: ResultsMessages }).results;
const styleName = (locale: Locale, id: string) => (messages(locale) as unknown as { moodboard: { styles: Record<string, string> } }).moodboard.styles[id];
const fill = (message: string, values: Record<string, string | number>) => message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/** A ready anonymous draft with 2 photos and a Scandinavian-dominant Moodboard. */
async function seedDraft(page: Page): Promise<string> {
  await setLocaleCookie(page.context(), 'en');
  await page.goto('/language');
  const start = await pageFetch(page, DRAFTS, { method: 'POST' });
  expect(start.status).toBe(201);
  const id = (JSON.parse(start.body) as { draft: { id: string } }).draft.id;
  expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
  expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-2.jpg')).toBe(201);
  expect((await apiJson(page, `${CURRENT}/measurements`, 'PUT', { lengthCm: 420, widthCm: 310, heightCm: 260 })).status).toBe(200);
  for (const galleryImageId of ['modern-01', 'scandinavian-01', 'scandinavian-02']) {
    expect((await apiJson(page, `${CURRENT}/moodboard/gallery-items`, 'POST', { galleryImageId })).status).toBe(201);
  }
  return id;
}

async function keycloakSignIn(page: Page, request: APIRequestContext) {
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill(HOMEOWNER);
  await page.locator('#password').fill(homeownerPassword());
  const mail = await mailpitCode(request, HOMEOWNER_EMAIL, () => page.locator('#kc-login').click());
  await page.locator('#emailCode').fill(mail.code);
  await page.locator('#kc-login').click();
}

async function checkLayout(page: Page) {
  expect(await horizontalOverflow(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  // One primary CTA in the bottom bar.
  expect(await page.locator('footer .bg-primary').count()).toBeLessThanOrEqual(1);
}

async function imagesLoaded(page: Page, testId: string) {
  return page.getByTestId(testId).evaluateAll((imgs) =>
    imgs.map((img) => ({ ok: (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0, w: (img as HTMLImageElement).naturalWidth, h: (img as HTMLImageElement).naturalHeight })),
  );
}

test.describe.serial('AI Results (fake adapter)', () => {
  test.setTimeout(150_000);

  test('Scenario 4: claim with intent=render starts a Render; queued/running then the slider; Generate again with photo 2; history; layouts', async ({ page, request }) => {
    const en = rm('en');
    const draftId = await seedDraft(page);
    await page.goto(GENERATE);
    await page.getByTestId('generate-render').click();
    await page.getByTestId('login-gate-sign-in').click();
    await keycloakSignIn(page, request);
    await page.waitForURL(RESULTS_URL, { timeout: 30_000 });
    expect(RESULTS_URL.exec(new URL(page.url()).pathname)?.[1]).toBe(draftId);
    const projectId = draftId;

    // Active state: the status card, the note, the disabled CTA and its hint.
    await expect(page.getByTestId('results-status')).toBeVisible();
    await expect(page.getByTestId('results-status')).toHaveText(new RegExp(`${escape(en.status.running)}|${escape(en.status.queued)}`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.titleActive);
    await expect(page.getByTestId('results-helper')).toHaveText(fill(en.helperActive, { style: styleName('en', 'scandinavian'), n: 1 }));
    await expect(page.getByTestId('results-again')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('results-hint')).toHaveText(en.hints.oneAtATime);
    await expect(page.getByTestId('results-placeholder')).toHaveAttribute('aria-busy', 'true');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/results/1-running-en.png' });
    // Only one Render was started (the server's one-active rule backs the URL strip).
    const list = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}/renders`)).body) as { renders: Array<{ id: string; photoId: string }>; maxRenders: number };
    expect(list.renders).toHaveLength(1);
    expect(list.maxRenders).toBe(10);

    // Succeeded: the slider over before/after of the same size.
    await expect(page.getByTestId('results-slider')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.titleDone);
    await expect(page.getByTestId('results-helper')).toHaveText(fill(en.helperDone, { style: styleName('en', 'scandinavian'), n: 1 }));
    await expect(page.getByRole('slider', { name: en.slider.label })).toHaveAttribute('aria-valuenow', '50');
    await expect(page.getByText(en.slider.before, { exact: true })).toBeVisible();
    await expect(page.getByText(en.slider.after, { exact: true })).toBeVisible();
    await expect.poll(async () => (await imagesLoaded(page, 'results-before'))[0]?.ok).toBe(true);
    await expect.poll(async () => (await imagesLoaded(page, 'results-after'))[0]?.ok).toBe(true);
    const [before] = await imagesLoaded(page, 'results-before');
    const [after] = await imagesLoaded(page, 'results-after');
    expect(before).toMatchObject({ w: 1216, h: 832 });
    expect(after).toMatchObject({ w: before.w, h: before.h });
    await expect(page.getByTestId('results-again')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('results-again')).toHaveText(en.cta.again);
    await expect(page.getByTestId('results-back-project')).toHaveText(en.cta.back);
    await expect(page.getByTestId('results-back')).toHaveAttribute('aria-label', en.back);
    await expect(page.getByTestId('results-history-item')).toHaveCount(1);
    await expect(page.getByTestId('results-history-count')).toHaveText(fill(en.history.counter, { count: 1, max: 10 }));
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/results/2-succeeded-en.png' });

    // Keyboard and drag.
    const slider = page.getByTestId('results-slider');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '55');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuenow', '45');
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    const box = (await page.getByTestId('results-compare').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    const dragged = Number(await slider.getAttribute('aria-valuenow'));
    expect(dragged).toBeGreaterThanOrEqual(23);
    expect(dragged).toBeLessThanOrEqual(27);

    // Photo picker: photo 1 selected; pick photo 2 and generate again with it.
    await expect(page.getByTestId('results-photo-1')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: fill(en.photos.option, { n: 2 }) })).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('results-photo-2').click();
    await expect(page.getByTestId('results-photo-2')).toHaveAttribute('aria-checked', 'true');
    const project = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}`)).body) as { photos: Array<{ id: string }> };
    const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith(`/api/kitchen-projects/${projectId}/renders`));
    await page.getByTestId('results-again').click();
    expect((await posted).postDataJSON()).toEqual({ photoId: project.photos[1].id });
    await expect(page.getByTestId('results-status')).toBeVisible();
    await expect(page.getByTestId('results-photo-1')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('results-slider')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('results-helper')).toHaveText(fill(en.helperDone, { style: styleName('en', 'scandinavian'), n: 2 }));
    await expect(page.getByTestId('results-history-item')).toHaveCount(2);
    await expect(page.getByTestId('results-history-count')).toHaveText(fill(en.history.counter, { count: 2, max: 10 }));
    const after2 = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}/renders`)).body) as { renders: Array<{ id: string; photoId: string; status: string }> };
    expect(after2.renders.map((r) => r.status)).toEqual(['succeeded', 'succeeded']);
    expect(after2.renders[0].photoId).toBe(project.photos[1].id);
    await expect(page.getByTestId('results-history-item').first()).toHaveAttribute('aria-current', 'true');
    // Tapping the older Render shows it.
    await page.getByTestId('results-history-item').nth(1).click();
    await expect(page.getByTestId('results-history-item').nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('results-helper')).toHaveText(fill(en.helperDone, { style: styleName('en', 'scandinavian'), n: 1 }));

    // Layouts: 390x844 es, 360x780 de and fi.
    for (const [locale, width, height] of [['es', 390, 844], ['de', 360, 780], ['fi', 360, 780]] as const) {
      await page.setViewportSize({ width, height });
      await setLocaleCookie(page.context(), locale);
      await page.goto(`/kitchen-projects/${projectId}/results`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(rm(locale).titleDone);
      await expect(page.getByTestId('results-slider')).toBeVisible();
      await checkLayout(page);
      await page.screenshot({ path: `test-results/results/succeeded-${locale}-${width}.png`, fullPage: true });
    }

    // The owned page now offers "See my designs" (no automatic start).
    await page.setViewportSize({ width: 390, height: 844 });
    await setLocaleCookie(page.context(), 'en');
    await page.goto(`/kitchen-projects/${projectId}`);
    const projectMessages = (messages('en') as unknown as { project: { seeDesigns: string } }).project;
    await expect(page.getByTestId('project-render')).toHaveText(projectMessages.seeDesigns);
    await expect(page.getByTestId('project-render')).toHaveAttribute('href', `/kitchen-projects/${projectId}/results`);
    await page.getByTestId('project-render').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}/results`);
    await expect(page.getByTestId('results-slider')).toBeVisible();
    await page.getByTestId('results-back-project').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}`);
  });
});

// The remaining designed states, with the API answers mocked in the browser (no session needed).
test.describe('AI Results states (mocked API)', () => {
  const PID = '11111111-1111-4111-8111-111111111111';
  const photo = (n: number) => ({ id: `22222222-2222-4222-8222-00000000000${n}`, position: n - 1, width: 1024, height: 768, thumbUrl: `/kitchen-projects/${PID}/photos/p${n}/content?variant=thumb`, fullUrl: `/kitchen-projects/${PID}/photos/p${n}/content?variant=full` });
  const projectView = { id: PID, status: 'claimed', measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 }, photos: [photo(1)], moodboard: [], claimedAt: '2026-11-15T10:00:00.000Z' };
  const renderView = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    status,
    photoId: photo(1).id,
    styleId: 'modern',
    mode: 'canny',
    width: 1216,
    height: 832,
    position: null,
    waitingFor: null,
    errorCode: null,
    createdAt: `2026-11-16T10:00:0${id.slice(-1)}.000Z`,
    startedAt: null,
    finishedAt: null,
    beforeUrl: `/kitchen-projects/${PID}/renders/${id}/content?variant=before`,
    fullUrl: status === 'succeeded' ? `/kitchen-projects/${PID}/renders/${id}/content?variant=full` : null,
    thumbUrl: status === 'succeeded' ? `/kitchen-projects/${PID}/renders/${id}/content?variant=thumb` : null,
    ...extra,
  });
  const jpeg = readFileSync(fixture('kitchen-1.jpg'));

  async function mock(page: Page, renders: unknown[], options: { maxRenders?: number; post?: { status: number; body: unknown }; one?: unknown } = {}) {
    await page.route(`${WEB}/api/kitchen-projects/${PID}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/content')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg });
      if (url.pathname.endsWith('/renders') && route.request().method() === 'POST') {
        const post = options.post ?? { status: 503, body: {} };
        return route.fulfill({ status: post.status, contentType: 'application/json', body: JSON.stringify(post.body) });
      }
      if (url.pathname.endsWith('/renders')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ renders, maxRenders: options.maxRenders ?? 10 }) });
      if (/\/renders\/[^/]+$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(options.one ?? renders[0]) });
      return route.fallback();
    });
    await page.route(`${WEB}/api/kitchen-projects/${PID}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projectView) }));
  }

  test('queued with the queue position; failed and interrupted with Try again; limit; uploads-only; queue full; offline', async ({ page, context }) => {
    const en = rm('en');
    await setLocaleCookie(context, 'en');

    await mock(page, [renderView('r1', 'queued', { position: 2, waitingFor: 'image' })]);
    await page.goto(`/kitchen-projects/${PID}/results`);
    await expect(page.getByTestId('results-status')).toHaveAttribute('data-status', 'queued');
    await expect(page.getByTestId('results-status')).toContainText(en.status.queued);
    await expect(page.getByTestId('results-position')).toHaveText('2 jobs ahead of yours');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/results/3-queued-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [renderView('r2', 'failed', { errorCode: 'adapter_error', finishedAt: '2026-11-16T10:01:00.000Z' }), renderView('r1', 'succeeded')]);
    await page.goto(`/kitchen-projects/${PID}/results`);
    await expect(page.getByTestId('results-failed')).toHaveText(new RegExp(escape(en.alerts.failed)));
    await expect(page.getByTestId('results-before-only')).toBeVisible();
    await expect(page.getByTestId('results-retry')).toHaveText(en.cta.retry);
    await expect(page.getByTestId('results-retry')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('results-history-item')).toHaveCount(1);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/results/4-failed-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [renderView('r2', 'failed', { errorCode: 'interrupted' })], { post: { status: 429, body: { statusCode: 429, code: 'gpu_queue_full' } } });
    await page.goto(`/kitchen-projects/${PID}/results`);
    await expect(page.getByTestId('results-failed')).toHaveText(new RegExp(escape(en.alerts.interrupted)));
    await page.getByTestId('results-retry').click();
    await expect(page.getByTestId('results-queue-full')).toHaveText(new RegExp(escape(en.alerts.queueFull)));
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [renderView('r2', 'succeeded', { styleId: null }), renderView('r1', 'succeeded')], { maxRenders: 2 });
    await page.goto(`/kitchen-projects/${PID}/results`);
    await expect(page.getByTestId('results-uploads-only')).toHaveText(new RegExp(escape(en.alerts.uploadsOnly)));
    await expect(page.getByTestId('results-again')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('results-hint')).toHaveText(fill(en.hints.limit, { max: 2 }));
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/results/5-limit-en.png' });

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByTestId('results-offline')).toHaveText(new RegExp(escape(en.alerts.offline)));
    await expect(page.getByTestId('results-again')).toHaveAttribute('aria-disabled', 'true');
    await context.setOffline(false);
  });

  test('signed out and not found', async ({ page, context }) => {
    await setLocaleCookie(context, 'en');
    await page.goto(`/kitchen-projects/${PID}/results`);
    await expect(page.getByTestId('results-signed-out')).toBeVisible();
    await expect(page.getByTestId('results-sign-in')).toHaveAttribute('href', `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${PID}/results`)}`);
    await page.route(`${WEB}/api/kitchen-projects/${PID}**`, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"statusCode":404,"message":"Not Found"}' }));
    await page.goto(`/kitchen-projects/${PID}/results`);
    await expect(page.getByTestId('results-not-found')).toBeVisible();
    expect((await page.request.get('/kitchen-projects/not-a-uuid/results')).status()).toBe(404);
  });
});
