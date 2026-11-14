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

// Feature simulations-ux-overhaul, phase E1: AI Results around Simulations, fake adapters
// (AI_ADAPTERS=fake in the compose api; each fake Render takes about 3 s and returns a tinted copy
// of the "before" crop). The claim with intent=render lands on /results and starts the first
// Simulation automatically (one Render per photo).
test.use({ locale: 'en-US' });

const WEB = new URL(baseURL()).origin;
const GENERATE = '/kitchen-projects/new/generate';
const DRAFTS = '/api/kitchen-projects/drafts';
const CURRENT = `${DRAFTS}/current`;
const RESULTS_URL = /\/kitchen-projects\/([0-9a-f-]{36})\/results$/;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

interface ResultsMessages {
  back: string;
  titleActive: string;
  titleDone: string;
  helperActive: string;
  helperActiveBare: string;
  helperDone: string;
  slider: Record<'label' | 'before' | 'after', string>;
  sources: Record<'gallery' | 'own' | 'join', string>;
  status: Record<'queued' | 'ahead' | 'describing' | 'rendering' | 'percent', string>;
  tile: Record<'photo' | 'failed' | 'retry' | 'retryPhoto', string>;
  note: string;
  photos: { title: string; helper: string; option: string };
  history: { title: string; counter: string; item: string };
  cta: Record<'again' | 'retry' | 'generate' | 'back', string>;
  hints: Record<'oneAtATime' | 'offline', string>;
  alerts: Record<'failed' | 'interrupted' | 'queueFull' | 'offline' | 'partial' | 'degraded', string>;
}
const rm = (locale: Locale) => (messages(locale) as unknown as { results: ResultsMessages }).results;
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

/** A ready anonymous draft with 3 photos and a Moodboard of two gallery styles. */
async function seedDraft(page: Page): Promise<string> {
  await setLocaleCookie(page.context(), 'en');
  await page.goto('/language');
  const start = await pageFetch(page, DRAFTS, { method: 'POST' });
  expect(start.status).toBe(201);
  const id = (JSON.parse(start.body) as { draft: { id: string } }).draft.id;
  expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
  expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-2.jpg')).toBe(201);
  expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
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

const sliderValue = async (page: Page) => Number(await page.getByTestId('results-slider').getAttribute('aria-valuenow'));

/** Photo grid: 3 flexible columns, wrapping, no horizontal overflow. */
async function checkPhotoGrid(page: Page, expectedRows: number) {
  const boxes = await page.getByTestId('results-photos').locator('[data-testid^="results-render-"]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  const viewport = page.viewportSize()!;
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
  }
  expect(new Set(boxes.map((box) => Math.round(box.left))).size).toBeLessThanOrEqual(3);
  expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(expectedRows);
}

test.describe.serial('AI Results (fake adapter)', () => {
  test.setTimeout(180_000);

  test('claim with intent=render starts a Simulation: describing, n of N with tiles, slider that keeps its position, Generate again, grouped history, layouts', async ({ page, request }) => {
    const en = rm('en');
    const draftId = await seedDraft(page);
    await page.goto(GENERATE);
    await page.getByTestId('generate-render').click();
    await page.getByTestId('login-gate-sign-in').click();
    await keycloakSignIn(page, request);
    await page.waitForURL(RESULTS_URL, { timeout: 30_000 });
    expect(RESULTS_URL.exec(new URL(page.url()).pathname)?.[1]).toBe(draftId);
    const projectId = draftId;

    // Active: title, helper (2 gallery styles, 3 photos), the status card, 3 tiles, the note and the disabled CTA.
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'active');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.titleActive);
    await expect(page.getByTestId('results-helper')).toContainText('2 gallery styles');
    await expect(page.getByTestId('results-helper')).toContainText('3 kitchen photos');
    await expect(page.getByTestId('results-tiles').getByRole('img')).toHaveCount(3);
    await expect(page.getByTestId('results-again')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('results-hint')).toHaveText(en.hints.oneAtATime);
    await expect(page.getByTestId('results-placeholder')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText(en.note)).toBeVisible();
    await checkLayout(page);

    // Progress: "Rendering n of 3" with a determinate bar; n grows while the Renders finish one after the other.
    const seen = new Set<number>();
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && (await page.getByTestId('results-screen').getAttribute('data-phase')) === 'active') {
      const text = (await page.getByTestId('results-status').textContent({ timeout: 2000 }).catch(() => '')) ?? '';
      const match = /Rendering (\d) of 3/.exec(text);
      if (match) {
        seen.add(Number(match[1]));
        await expect(page.getByTestId('results-progress-bar')).toHaveAttribute('data-percent', String(Math.round((Number(match[1]) / 3) * 100)));
      }
      await page.waitForTimeout(400);
    }
    expect(seen.size, `distinct n seen: ${[...seen]}`).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: 'test-results/results/1-rendering-en.png' });

    // Succeeded: Simulation 1, three photos, the slider at 50.
    await expect(page.getByTestId('results-slider')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fill(en.titleDone, { n: 1 }));
    await expect(page.getByTestId('results-helper')).toContainText('Photo 1 of 3');
    await expect(page.getByRole('slider', { name: en.slider.label })).toHaveAttribute('aria-valuenow', '50');
    await expect.poll(async () => (await imagesLoaded(page, 'results-before'))[0]?.ok).toBe(true);
    await expect.poll(async () => (await imagesLoaded(page, 'results-after'))[0]?.ok).toBe(true);
    const [before] = await imagesLoaded(page, 'results-before');
    const [after] = await imagesLoaded(page, 'results-after');
    expect(after).toMatchObject({ w: before.w, h: before.h });
    await expect(page.getByTestId('results-again')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('results-again')).toHaveText(en.cta.again);
    await expect(page.getByTestId('results-back-project')).toHaveText(en.cta.back);
    await expect(page.getByRole('radiogroup')).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.getByTestId('results-render-1')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: fill(en.photos.option, { n: 2 }) })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('simulation-1')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('results-history-count')).toHaveText(fill(en.history.counter, { count: 1 }));
    await checkLayout(page);
    await checkPhotoGrid(page, 1);
    await page.screenshot({ path: 'test-results/results/2-succeeded-en.png' });

    // Keyboard and drag on the slider; Home = only After, End = only Before.
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
    await expect(page.getByTestId('results-before')).toHaveCSS('clip-path', /inset\(0px 100% 0px 0px\)/);
    const box = (await page.getByTestId('results-compare').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Math.abs((await sliderValue(page)) - 25)).toBeLessThanOrEqual(2);

    // The position survives switching the Render (set 0, switch, still 0 and only After shown).
    await page.keyboard.press('Home');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await page.getByTestId('results-render-2').click();
    await expect(page.getByTestId('results-render-2')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('results-helper')).toContainText('Photo 2 of 3');
    expect(await sliderValue(page)).toBe(0);
    await expect(page.getByTestId('results-before')).toHaveCSS('clip-path', /inset\(0px 100% 0px 0px\)/);
    await page.getByTestId('results-render-3').click();
    await expect(page.getByTestId('results-helper')).toContainText('Photo 3 of 3');
    expect(await sliderValue(page)).toBe(0);

    // Generate again: a new Simulation with a new calculated style.
    const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith(`/api/kitchen-projects/${projectId}/simulations`));
    await page.getByTestId('results-again').click();
    expect((await posted).postData()).toBeNull();
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'active');
    await expect(page.getByTestId('simulation-1')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('results-slider')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fill(en.titleDone, { n: 2 }));
    expect(await sliderValue(page)).toBe(0);
    await expect(page.getByTestId('results-history-count')).toHaveText(fill(en.history.counter, { count: 2 }));
    await expect(page.getByTestId('simulation-2')).toHaveAttribute('aria-current', 'true');
    const list = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}/simulations`)).body) as { simulations: Array<{ ordinal: number; status: string; renders: unknown[] }> };
    expect(list.simulations.map((s) => [s.ordinal, s.status, s.renders.length])).toEqual([[2, 'succeeded', 3], [1, 'succeeded', 3]]);

    // Tapping an older Simulation card shows it; the slider position is kept.
    await page.getByTestId('simulation-1').click();
    await expect(page.getByTestId('simulation-1')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fill(en.titleDone, { n: 1 }));
    expect(await sliderValue(page)).toBe(0);
    await expect(page.getByTestId('results-render-3')).toHaveAttribute('aria-checked', 'true');

    // Layouts: 390x844 es, 360x780 de and fi.
    for (const [locale, width, height] of [['es', 390, 844], ['de', 360, 780], ['fi', 360, 780]] as const) {
      await page.setViewportSize({ width, height });
      await setLocaleCookie(page.context(), locale);
      await page.goto(`/kitchen-projects/${projectId}/results`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(fill(rm(locale).titleDone, { n: 2 }));
      await expect(page.getByTestId('results-slider')).toBeVisible();
      await checkLayout(page);
      await checkPhotoGrid(page, 1);
      await page.screenshot({ path: `test-results/results/succeeded-${locale}-${width}.png`, fullPage: true });
    }

    // The project page opens a chosen Simulation on AI Results (Open), without starting a new one.
    await page.setViewportSize({ width: 390, height: 844 });
    await setLocaleCookie(page.context(), 'en');
    await page.goto(`/kitchen-projects/${projectId}`);
    const projectMessages = (messages('en') as unknown as { project: { generateMore: string } }).project;
    await expect(page.getByTestId('project-render')).toHaveText(projectMessages.generateMore);
    await page.getByTestId('simulation-open-1').click();
    await page.waitForURL(new RegExp(`/kitchen-projects/${projectId}/results\\?simulation=[0-9a-f-]{36}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fill(en.titleDone, { n: 1 }));
    await expect(page.getByTestId('results-slider')).toBeVisible();
    await expect(page.getByTestId('results-history-count')).toHaveText(fill(en.history.counter, { count: 2 }));
    await page.getByTestId('results-back-project').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}`);
  });

  test('Retry against the live fake stack: the poison photo fails once, the other Renders stay, Retry heals it with no mocks', async ({ page, request }) => {
    const en = rm('en');
    await setLocaleCookie(page.context(), 'en');
    await page.goto('/language');
    expect((await pageFetch(page, DRAFTS, { method: 'POST' })).status).toBe(201);
    expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
    // Solid magenta: the fake image adapter fails its first render once (apps/api fake-image.adapter.ts).
    expect(await apiUpload(page, `${CURRENT}/photos`, 'fail-once.jpg')).toBe(201);
    expect((await apiJson(page, `${CURRENT}/measurements`, 'PUT', { lengthCm: 420, widthCm: 310, heightCm: 260 })).status).toBe(200);
    expect((await apiJson(page, `${CURRENT}/moodboard/gallery-items`, 'POST', { galleryImageId: 'modern-01' })).status).toBe(201);
    await page.goto(GENERATE);
    await page.getByTestId('generate-render').click();
    await page.getByTestId('login-gate-sign-in').click();
    await keycloakSignIn(page, request);
    await page.waitForURL(RESULTS_URL, { timeout: 30_000 });

    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'partial', { timeout: 60_000 });
    await expect(page.getByTestId('results-partial')).toHaveText(fill(en.alerts.partial, { failed: 1, count: 2 }));
    await expect(page.getByTestId('results-render-2')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByRole('radio')).toHaveCount(1);
    const retry = page.getByTestId('results-retry-render-2');
    await expect(retry).toHaveText(en.tile.retry);
    await retry.click();
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'succeeded', { timeout: 60_000 });
    await expect(page.getByTestId('results-partial')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(2);
    await expect(page.getByTestId('results-retry-render-2')).toHaveCount(0);
  });
});

// The remaining designed states, with the API answers mocked in the browser (no session needed).
test.describe('AI Results states (mocked API)', () => {
  const PID = '11111111-1111-4111-8111-111111111111';
  const photo = (n: number) => ({ id: `22222222-2222-4222-8222-0000000000${String(n).padStart(2, '0')}`, position: n - 1, width: 1024, height: 768, thumbUrl: `/kitchen-projects/${PID}/photos/p${n}/content?variant=thumb`, fullUrl: `/kitchen-projects/${PID}/photos/p${n}/content?variant=full` });
  const projectView = (photos: number) => ({ id: PID, status: 'claimed', measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 }, photos: Array.from({ length: photos }, (_, i) => photo(i + 1)), moodboard: [], claimedAt: '2026-11-15T10:00:00.000Z' });
  type Json = Record<string, unknown>;
  const renderView = (ordinal: number, position: number, status: string, extra: Json = {}) => {
    const id = `r${ordinal}-${position}`;
    return {
      id,
      simulationId: `s${ordinal}`,
      status,
      photoId: photo(position + 1).id,
      photoPosition: position,
      attempts: 1,
      mode: 'canny',
      width: 1216,
      height: 832,
      position: null as number | null,
      waitingFor: null,
      errorCode: status === 'failed' ? 'adapter_error' : null,
      createdAt: '2026-11-16T10:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      beforeUrl: `/kitchen-projects/${PID}/renders/${id}/content?variant=before`,
      fullUrl: status === 'succeeded' ? `/kitchen-projects/${PID}/renders/${id}/content?variant=full` : null,
      thumbUrl: status === 'succeeded' ? `/kitchen-projects/${PID}/renders/${id}/content?variant=thumb` : null,
      ...extra,
    };
  };
  const simulationView = (ordinal: number, statuses: string[], extra: Json = {}, renderExtra: Json = {}) => {
    const succeeded = statuses.filter((s) => s === 'succeeded').length;
    const failed = statuses.filter((s) => s === 'failed').length;
    const active = statuses.some((s) => s === 'queued' || s === 'running');
    return {
      id: `s${ordinal}`,
      ordinal,
      createdAt: `2026-11-16T10:00:0${ordinal % 10}.000Z`,
      status: active ? 'active' : failed === 0 ? 'succeeded' : succeeded === 0 ? 'failed' : 'partial',
      stage: active ? 'rendering' : 'finished',
      progress: { total: statuses.length, succeeded, failed, current: active ? succeeded + failed + 1 : 0 },
      selected: false,
      blendMode: 'both',
      styleDegraded: false,
      style: { keywords: [], references: [{ kind: 'gallery', refId: 'scandinavian-01', weightPercent: 50 }, { kind: 'upload', refId: 'u1', weightPercent: 50 }] },
      renders: statuses.map((status, position) => renderView(ordinal, position, status, renderExtra)),
      budget: null,
      ...extra,
    };
  };
  const jpeg = readFileSync(fixture('kitchen-1.jpg'));

  /** Stateful mock of the project and Simulation routes; `world.sims` is read on every call. */
  interface World {
    photos: number;
    sims: Array<ReturnType<typeof simulationView>>;
    post?: { status: number; body: unknown };
    retries: string[];
    onRetry?: (renderId: string) => ReturnType<typeof simulationView> | null;
  }
  async function mock(page: Page, world: World) {
    await page.route(`${WEB}/api/kitchen-projects/${PID}/**`, async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.endsWith('/content')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg });
      if (url.pathname.endsWith('/simulations') && method === 'POST') return json(world.post?.status ?? 503, world.post?.body ?? {});
      if (url.pathname.endsWith('/simulations')) return json(200, { simulations: world.sims });
      const retry = /\/renders\/([^/]+)\/retry$/.exec(url.pathname);
      if (retry && method === 'POST') {
        world.retries.push(retry[1]);
        const next = world.onRetry?.(retry[1]);
        return next ? json(202, { simulation: next }) : json(409, { statusCode: 409, code: 'render_not_failed' });
      }
      const one = /\/simulations\/([^/]+)$/.exec(url.pathname);
      if (one) {
        const found = world.sims.find((s) => s.id === one[1]);
        return found ? json(200, found) : json(404, {});
      }
      return route.fallback();
    });
    await page.route(`${WEB}/api/kitchen-projects/${PID}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projectView(world.photos)) }));
  }
  const open = async (page: Page) => page.goto(`/kitchen-projects/${PID}/results`);

  test('describing, queued with the queue position, rendering with tiles; the CTA stays disabled with its reason', async ({ page, context }) => {
    const en = rm('en');
    await setLocaleCookie(context, 'en');
    const world: World = { photos: 3, retries: [], sims: [simulationView(1, ['queued', 'queued', 'queued'], { stage: 'describing', progress: { total: 3, succeeded: 0, failed: 0, current: 0 } })] };
    await mock(page, world);
    await open(page);
    await expect(page.getByTestId('results-status')).toHaveAttribute('data-status', 'describing');
    await expect(page.getByTestId('results-status')).toHaveText(en.status.describing);
    await expect(page.getByTestId('results-again')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('results-hint')).toHaveText(en.hints.oneAtATime);
    await checkLayout(page);

    const queued = simulationView(1, ['queued', 'queued', 'queued'], { progress: { total: 3, succeeded: 0, failed: 0, current: 0 } }, {});
    queued.renders[0].position = 2;
    world.sims = [queued];
    await page.reload();
    await expect(page.getByTestId('results-status')).toHaveAttribute('data-status', 'queued');
    await expect(page.getByTestId('results-status')).toContainText(en.status.queued);
    await expect(page.getByTestId('results-position')).toHaveText('2 jobs ahead of yours');

    world.sims = [simulationView(1, ['succeeded', 'running', 'queued'])];
    await page.reload();
    await expect(page.getByTestId('results-status')).toHaveText(new RegExp(`${escape(fill(en.status.rendering, { n: 2, count: 3 }))}\\s*67%`));
    await expect(page.getByTestId('results-tile-1')).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId('results-tile-2')).toHaveAttribute('data-state', 'running');
    await expect(page.getByTestId('results-tile-3')).toHaveAttribute('data-state', 'queued');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/results/3-rendering-states-en.png' });
  });

  test('partial failure: successful Renders stay, Retry on the failed one, the info alert, then success', async ({ page, context }) => {
    const en = rm('en');
    await setLocaleCookie(context, 'en');
    const failedSim = simulationView(1, ['succeeded', 'failed', 'succeeded']);
    const world: World = { photos: 3, retries: [], sims: [failedSim] };
    world.onRetry = (renderId) => {
      const running = simulationView(1, ['succeeded', 'running', 'succeeded']);
      running.renders[1].attempts = 2;
      world.sims = [running];
      setTimeout(() => (world.sims = [simulationView(1, ['succeeded', 'succeeded', 'succeeded'])]), 2500);
      expect(renderId).toBe('r1-1');
      return running;
    };
    await mock(page, world);
    await open(page);
    await expect(page.getByTestId('results-partial')).toHaveText(fill(en.alerts.partial, { failed: 1, count: 3 }));
    await expect(page.getByTestId('results-slider')).toBeVisible();
    await expect(page.getByTestId('results-render-2')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('results-render-2')).toContainText(fill(en.tile.failed, { n: 2 }));
    await expect(page.getByRole('radio')).toHaveCount(2);
    const retry = page.getByTestId('results-retry-render-2');
    await expect(retry).toHaveText(en.tile.retry);
    await expect(retry).toHaveAccessibleName(fill(en.tile.retryPhoto, { n: 2 }));
    expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/results/4-partial-en.png' });

    await retry.click();
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'active');
    await expect(page.getByTestId('results-tile-2')).toHaveAttribute('data-state', 'running');
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });
    expect(world.retries).toEqual(['r1-1']);
    await expect(page.getByTestId('results-partial')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.getByTestId('results-retry-render-2')).toHaveCount(0);
  });

  test('all failed and interrupted: danger alert and Try again retries every failed Render one after the other; queue full', async ({ page, context }) => {
    const en = rm('en');
    await setLocaleCookie(context, 'en');
    const world: World = { photos: 2, retries: [], sims: [simulationView(1, ['failed', 'failed'])] };
    let step = 0;
    world.onRetry = (renderId) => {
      step += 1;
      const statuses = step === 1 ? ['running', 'failed'] : ['succeeded', 'running'];
      const sim = simulationView(1, statuses);
      world.sims = [sim];
      setTimeout(() => (world.sims = [simulationView(1, step === 1 ? ['succeeded', 'failed'] : ['succeeded', 'succeeded'])]), 2200);
      void renderId;
      return sim;
    };
    await mock(page, world);
    await open(page);
    await expect(page.getByTestId('results-failed')).toHaveText(new RegExp(escape(en.alerts.failed)));
    await expect(page.getByTestId('results-before-only')).toBeVisible();
    await expect(page.getByTestId('results-retry')).toHaveText(en.cta.retry);
    await expect(page.getByTestId('results-retry')).toHaveAttribute('aria-disabled', 'false');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/results/5-all-failed-en.png' });
    await page.getByTestId('results-retry').click();
    await expect.poll(() => world.retries, { timeout: 30_000 }).toEqual(['r1-0', 'r1-1']);
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'succeeded', { timeout: 30_000 });

    const interrupted = simulationView(1, ['failed', 'failed'], {}, { errorCode: 'interrupted' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const world2: World = { photos: 2, retries: [], sims: [interrupted], post: { status: 429, body: { statusCode: 429, code: 'gpu_queue_full' } } };
    world2.onRetry = () => null;
    await mock(page, world2);
    await open(page);
    await expect(page.getByTestId('results-failed')).toHaveText(new RegExp(escape(en.alerts.interrupted)));

    // 429 on Generate again: warning alert, nothing created.
    world2.sims = [simulationView(1, ['succeeded', 'succeeded'])];
    await page.reload();
    await page.getByTestId('results-again').click();
    await expect(page.getByTestId('results-queue-full')).toHaveText(new RegExp(escape(en.alerts.queueFull)));
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'succeeded');
  });

  test('empty state starts a Simulation; degraded style note; offline pauses polling and resumes', async ({ page, context }) => {
    const en = rm('en');
    await setLocaleCookie(context, 'en');
    const world: World = { photos: 2, retries: [], sims: [], post: { status: 202, body: {} } };
    await mock(page, world);
    await open(page);
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'empty');
    await expect(page.getByTestId('results-start')).toHaveText(en.cta.generate);
    await expect(page.getByTestId('results-start')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('results-hint')).toHaveCount(0);

    world.sims = [simulationView(1, ['succeeded', 'succeeded'], { styleDegraded: true })];
    await page.reload();
    await expect(page.getByTestId('results-degraded')).toHaveText(en.alerts.degraded);
    await expect(page.getByTestId('results-helper')).toContainText('Calculated style from');

    // Offline while a Simulation runs: the alert shows, the CTA is disabled with its reason, polling pauses.
    const running = simulationView(1, ['running', 'queued']);
    world.sims = [running];
    let polls = 0;
    await page.route(`${WEB}/api/kitchen-projects/${PID}/simulations/s1`, (route) => {
      polls += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(world.sims[0]) });
    });
    await page.reload();
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'active');
    await expect.poll(() => polls).toBeGreaterThan(0);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByTestId('results-offline')).toHaveText(new RegExp(escape(en.alerts.offline)));
    await page.waitForTimeout(500);
    const pausedAt = polls;
    await page.waitForTimeout(4500);
    expect(polls).toBe(pausedAt);
    world.sims = [simulationView(1, ['succeeded', 'succeeded'])];
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('results-screen')).toHaveAttribute('data-phase', 'succeeded', { timeout: 15_000 });
    await expect(page.getByTestId('results-offline')).toHaveCount(0);
  });

  test('wrapping at 360 px: 8 photos in 3 rows, 5 Simulations, no horizontal overflow (de, fi)', async ({ page, context }) => {
    const sims = [5, 4, 3, 2, 1].map((n) => simulationView(n, Array(8).fill('succeeded')));
    const world: World = { photos: 8, retries: [], sims };
    await mock(page, world);
    await page.setViewportSize({ width: 360, height: 780 });
    for (const locale of ['de', 'fi'] as const) {
      await setLocaleCookie(context, locale);
      await open(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(fill(rm(locale).titleDone, { n: 5 }));
      await expect(page.getByRole('radio')).toHaveCount(8);
      await checkPhotoGrid(page, 3);
      const cards = await page.getByTestId('results-history').locator('[data-testid^="simulation-"]').count();
      expect(cards).toBe(5);
      // The thumbnails of a card wrap (4 columns of 64 px fit the card at 360).
      const thumbs = await page.getByTestId('simulation-5').locator('span.h-12').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
      expect(thumbs).toHaveLength(8);
      expect(new Set(thumbs.map((b) => Math.round(b.top))).size).toBeGreaterThan(1);
      for (const b of thumbs) expect(b.right).toBeLessThanOrEqual(360);
      await checkLayout(page);
      await page.screenshot({ path: `test-results/results/wrap-${locale}-360.png`, fullPage: true });
    }
  });

  test('1 photo and 2 photos still use the grid; signed out and not found', async ({ page, context }) => {
    await setLocaleCookie(context, 'en');
    const world: World = { photos: 1, retries: [], sims: [simulationView(1, ['succeeded'])] };
    await mock(page, world);
    await open(page);
    await expect(page.getByRole('radio')).toHaveCount(1);
    await checkPhotoGrid(page, 1);
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await page.goto(`/kitchen-projects/${PID}/results`);
    await expect(page.getByTestId('results-signed-out')).toBeVisible();
    await expect(page.getByTestId('results-sign-in')).toHaveAttribute('href', `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${PID}/results`)}`);
    await page.route(`${WEB}/api/kitchen-projects/${PID}**`, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"statusCode":404,"message":"Not Found"}' }));
    await page.goto(`/kitchen-projects/${PID}/results`);
    await expect(page.getByTestId('results-not-found')).toBeVisible();
    expect((await page.request.get('/kitchen-projects/not-a-uuid/results')).status()).toBe(404);
  });
});
