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

// Feature simulations-ux-overhaul, phase E2: the owned project page (My simulations: select, delete,
// edit entries) and the edit pages (photos, measurements, styles), fake adapters
// (AI_ADAPTERS=fake in the compose api; each fake Render takes about 3 s). The designed states run
// with the API mocked in the browser.
test.use({ locale: 'en-US' });

const WEB = new URL(baseURL()).origin;
const GENERATE = '/kitchen-projects/new/generate';
const DRAFTS = '/api/kitchen-projects/drafts';
const CURRENT = `${DRAFTS}/current`;
const RESULTS_URL = /\/kitchen-projects\/([0-9a-f-]{36})\/results$/;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

interface SimMessages {
  title: string;
  instruction: string;
  empty: { title: string; helper: string };
  name: string;
  meta: string;
  rendering: string;
  selected: string;
  select: string;
  open: string;
  openRetry: string;
  delete: string;
  photosFailed: string;
  deleteDialog: { title: string; message: string; confirm: string; cancel: string };
}
interface ProjectMessages {
  title: string;
  helper: string;
  seeBudget: string;
  budgetReason: string;
  generateMore: string;
  actionFailed: string;
  summary: Record<'editPhotos' | 'editMeasurements' | 'editStyles', string>;
  edit: Record<'back' | 'photosTitle' | 'measurementsTitle' | 'stylesTitle' | 'save' | 'blockedSimulation' | 'blockedBudget', string>;
}
const sm = (locale: Locale) => (messages(locale) as unknown as { simulations: SimMessages }).simulations;
const pm = (locale: Locale) => (messages(locale) as unknown as { project: ProjectMessages }).project;
const gm = (locale: Locale) => (messages(locale) as unknown as { generate: { cta: { budget: string; render: string } }; results: { hints: { oneAtATime: string } } });
const fill = (message: string, values: Record<string, string | number>) => message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const plural = (message: string, count: number) => {
  const m = /\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/.exec(message);
  return m ? message.replace(m[0], (count === 1 ? (m[1] as string) : (m[2] as string)).replace('#', String(count))) : message;
};

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

/** A ready anonymous draft with 2 photos and a Moodboard of two gallery styles. */
async function seedDraft(page: Page): Promise<string> {
  await setLocaleCookie(page.context(), 'en');
  await page.goto('/language');
  const start = await pageFetch(page, DRAFTS, { method: 'POST' });
  expect(start.status).toBe(201);
  const id = (JSON.parse(start.body) as { draft: { id: string } }).draft.id;
  expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
  expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-2.jpg')).toBe(201);
  expect((await apiJson(page, `${CURRENT}/measurements`, 'PUT', { lengthCm: 420, widthCm: 310, heightCm: 260 })).status).toBe(200);
  for (const galleryImageId of ['modern-01', 'scandinavian-01']) {
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

/** Types on the keypad buttons (digits only: cm has no separator). */
async function keys(page: Page, sequence: string) {
  for (const key of sequence) await page.getByTestId(`keypad-key-${key}`).click();
}

test.describe.serial('Project page and edit pages (fake adapters)', () => {
  test.setTimeout(240_000);
  let projectId = '';

  test('My simulations: select, running card blocks edits and deletes, delete confirm (focus trap, Escape), selection cleared by delete', async ({ page, request }) => {
    const en = sm('en');
    const pj = pm('en');
    projectId = await seedDraft(page);
    await page.goto(GENERATE);
    await page.getByTestId('generate-render').click();
    await page.getByTestId('login-gate-sign-in').click();
    await keycloakSignIn(page, request);
    await page.waitForURL(RESULTS_URL, { timeout: 30_000 });
    await expect(page.getByTestId('results-slider')).toBeVisible({ timeout: 90_000 });
    await page.goto(`/kitchen-projects/${projectId}`);

    // Summary card: three 44 px rows with their edit links (no thumbnails any more).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pj.title);
    await expect(page.getByTestId('summary-photos')).toContainText('2 photos');
    await expect(page.getByTestId('summary-measurements')).toContainText('420 x 310 x 260 cm');
    await expect(page.getByTestId('summary-styles')).toContainText('2 styles and references');
    await expect(page.getByTestId('project-edit-photos')).toHaveText(pj.summary.editPhotos);
    await expect(page.getByTestId('project-edit-photos')).toHaveAttribute('href', `/kitchen-projects/${projectId}/edit/photos`);
    await expect(page.getByTestId('project-edit-measurements')).toHaveAttribute('href', `/kitchen-projects/${projectId}/edit/measurements`);
    await expect(page.getByTestId('project-edit-styles')).toHaveAttribute('href', `/kitchen-projects/${projectId}/edit/styles`);
    await expect(page.getByTestId('project-edit-hint')).toHaveCount(0);

    // Simulation 1 (made by the claim): not selected, instruction shown, budget disabled with its reason.
    await expect(page.getByTestId('my-simulations-count')).toHaveText('1');
    const card1 = page.getByTestId('simulation-1');
    await expect(card1).toContainText(fill(en.name, { n: 1 }));
    await expect(card1).toContainText('2 photos');
    await expect(card1.locator('img')).toHaveCount(2);
    await expect(page.getByTestId('simulation-open-1')).toHaveText(en.open);
    await expect(page.getByTestId('simulation-open-1')).toHaveAttribute('href', new RegExp(`/kitchen-projects/${projectId}/results\\?simulation=[0-9a-f-]{36}$`));
    await expect(page.getByTestId('simulations-instruction')).toHaveText(en.instruction);
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('role', 'radio');
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('project-budget')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-budget-reason')).toHaveText(pj.budgetReason);
    await expect(page.getByTestId('project-render')).toHaveText(pj.generateMore);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/simulations/1-project-en.png', fullPage: true });

    // Select through the real API: stroke + Selected badge + aria-checked, Delete pill, instruction gone, budget enabled.
    await page.getByTestId('simulation-select-1').click();
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('simulation-select-1')).toContainText(en.selected);
    await expect(card1).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('simulations-instruction')).toHaveCount(0);
    await expect(page.getByTestId('simulation-delete-1')).toContainText(en.delete);
    await expect(page.getByTestId('project-budget')).toHaveText(gm('en').generate.cta.budget);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('href', `/kitchen-projects/${projectId}/budget?start=1`);
    const selection = JSON.parse((await apiJson(page, `/api/kitchen-projects/${projectId}/simulations`, 'GET')).body) as { simulations: Array<{ ordinal: number; selected: boolean }> };
    expect(selection.simulations.map((s) => [s.ordinal, s.selected])).toEqual([[1, true]]);
    await page.screenshot({ path: 'test-results/simulations/2-selected-en.png', fullPage: true });
    await page.reload();
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('aria-checked', 'true');

    // A running Simulation: progress on its card, its Select and Delete disabled, the edit entries blocked with the hint.
    expect((await apiJson(page, `/api/kitchen-projects/${projectId}/simulations`, 'POST')).status).toBe(202);
    await page.reload();
    const card2 = page.getByTestId('simulation-2');
    await expect(card2).toHaveAttribute('data-status', 'active');
    await expect(page.getByTestId('simulation-progress')).toHaveText(/Rendering \d of 2/);
    await expect(page.getByTestId('simulation-select-2')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('simulation-delete-2')).toHaveAttribute('aria-disabled', 'true');
    for (const section of ['photos', 'measurements', 'styles']) {
      await expect(page.getByTestId(`project-edit-${section}`)).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByTestId(`project-edit-${section}`)).not.toHaveAttribute('href');
    }
    await expect(page.getByTestId('project-edit-hint')).toHaveText(pj.edit.blockedSimulation);
    await expect(page.getByTestId('project-render')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-generate-reason')).toHaveText(gm('en').results.hints.oneAtATime);
    await expect(page.getByTestId('simulation-delete-1')).not.toHaveAttribute('aria-disabled', 'true'); // the others can be deleted
    const refused = await apiJson(page, `/api/kitchen-projects/${projectId}/measurements`, 'PUT', { lengthCm: 430, widthCm: 310, heightCm: 260 });
    expect(refused.status).toBe(409);
    expect(JSON.parse(refused.body)).toMatchObject({ code: 'simulation_in_progress' });
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/simulations/3-running-en.png', fullPage: true });

    // Polling ends the running state by itself: the card is ready and the edit links work again.
    await expect(card2).toHaveAttribute('data-status', 'succeeded', { timeout: 90_000 });
    await expect(page.getByTestId('project-edit-photos')).toHaveAttribute('href', `/kitchen-projects/${projectId}/edit/photos`);
    await expect(page.getByTestId('project-edit-hint')).toHaveCount(0);
    await expect(card2.locator('img')).toHaveCount(2);
    await expect(page.getByTestId('simulation-select-2')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('my-simulations-count')).toHaveText('2');
    // Newest first.
    expect(await page.locator('[data-testid^="simulation-"][data-status]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))).toEqual(['simulation-2', 'simulation-1']);

    // Delete confirm: modal dialog, focus on Cancel and trapped, Escape closes without deleting.
    await page.getByTestId('simulation-delete-2').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText(fill(en.deleteDialog.title, { n: 2 }));
    await expect(dialog).toContainText(en.deleteDialog.message);
    await expect(page.getByTestId('delete-simulation-confirm')).toHaveText(en.deleteDialog.confirm);
    await expect(page.getByTestId('delete-simulation-cancel')).toBeFocused();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(card2).toBeVisible();
    await page.getByTestId('simulation-delete-2').click();
    await page.getByTestId('delete-simulation-cancel').click();
    await expect(dialog).toBeHidden();
    await expect(card2).toBeVisible();

    // Confirm: gone from the list and from the API; the selected Simulation is untouched.
    await page.getByTestId('simulation-delete-2').click();
    await page.getByTestId('delete-simulation-confirm').click();
    await expect(card2).toHaveCount(0);
    await expect(page.getByTestId('my-simulations-count')).toHaveText('1');
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('aria-checked', 'true');
    const afterDelete = JSON.parse((await apiJson(page, `/api/kitchen-projects/${projectId}/simulations`, 'GET')).body) as { simulations: unknown[] };
    expect(afterDelete.simulations).toHaveLength(1);

    // Deleting the selected Simulation clears the selection: empty state, budget disabled, Generate my kitchen.
    await page.getByTestId('simulation-delete-1').click();
    await page.getByTestId('delete-simulation-confirm').click();
    await expect(page.getByTestId('simulations-empty')).toBeVisible();
    await expect(page.getByTestId('simulations-empty')).toContainText(en.empty.title);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-budget-reason')).toHaveText(pj.budgetReason);
    await expect(page.getByTestId('project-render')).toHaveText(gm('en').generate.cta.render);
    await expect(page.getByTestId('project-render')).toHaveAttribute('href', `/kitchen-projects/${projectId}/results?start=1`);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/simulations/4-empty-en.png', fullPage: true });
  });

  test('edit pages: photos, measurements and styles save through the owner routes and return to the project; blocked while a Simulation runs', async ({ page, request }) => {
    const pj = pm('en');
    expect(projectId).not.toBe('');
    await page.goto(`/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${projectId}`)}`);
    await keycloakSignIn(page, request);
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}`);

    // Photos: only the photos section, Back to the project, Save changes.
    await page.getByTestId('project-edit-photos').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}/edit/photos`);
    await expect(page.getByTestId('capture-screen')).toHaveAttribute('data-phase', 'ready');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pj.edit.photosTitle);
    await expect(page.locator('[data-testid="capture-photo-tile"][data-state="ready"]')).toHaveCount(2);
    await expect(page.getByTestId('capture-length')).toHaveCount(0);
    await expect(page.getByTestId('edit-back')).toHaveAttribute('href', `/kitchen-projects/${projectId}`);
    await expect(page.getByTestId('edit-save')).toHaveText(pj.edit.save);
    await expect(page.getByTestId('edit-save')).toHaveAttribute('aria-disabled', 'false');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/simulations/5-edit-photos-en.png', fullPage: true });
    await page.getByTestId('capture-file-input').setInputFiles(fixture('kitchen-1.jpg'));
    await expect(page.locator('[data-testid="capture-photo-tile"][data-state="ready"]')).toHaveCount(3, { timeout: 30_000 });
    await expect(page.getByTestId('edit-save')).toHaveAttribute('aria-disabled', 'false');
    await page.getByTestId('edit-save').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}`);
    await expect(page.getByTestId('summary-photos')).toContainText('3 photos');

    // Measurements: the three fields, cm keypad, saved through PUT .../measurements.
    await page.getByTestId('project-edit-measurements').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}/edit/measurements`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pj.edit.measurementsTitle);
    await expect(page.getByTestId('capture-photo-tile')).toHaveCount(0);
    await expect(page.getByTestId('capture-length')).toContainText('420');
    await page.getByTestId('capture-length').click();
    await expect(page.getByTestId('keypad-sheet')).toBeVisible();
    for (const value of ['450', '320', '270']) {
      await page.getByTestId('keypad-clear').click();
      await keys(page, value);
      await page.getByTestId('keypad-next').click();
    }
    await expect(page.getByTestId('keypad-sheet')).toBeHidden();
    await expect(page.getByTestId('capture-save-status')).toHaveAttribute('data-state', 'saved');
    await page.getByTestId('edit-save').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}`);
    await expect(page.getByTestId('summary-measurements')).toContainText('450 x 320 x 270 cm');

    // Styles: pick one more gallery image, then save.
    await page.getByTestId('project-edit-styles').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}/edit/styles`);
    await expect(page.getByTestId('moodboard-screen')).toHaveAttribute('data-phase', 'ready');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pj.edit.stylesTitle);
    await expect(page.getByTestId('moodboard-counter')).toHaveText(/^2/);
    await page.locator('[data-testid="moodboard-gallery-image"][data-gallery-id="modern-02"]').click();
    await expect(page.getByTestId('moodboard-counter')).toHaveText(/^3/);
    await page.getByTestId('edit-save').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}`);
    await expect(page.getByTestId('summary-styles')).toContainText('3 styles and references');
    const project = JSON.parse((await apiJson(page, `/api/kitchen-projects/${projectId}`, 'GET')).body) as { photos: unknown[]; moodboard: unknown[]; measurements: { lengthCm: number } };
    expect([project.photos.length, project.moodboard.length, project.measurements.lengthCm]).toEqual([3, 3, 450]);

    // Blocked while a Simulation runs: the hint, disabled controls, the API still refuses.
    expect((await apiJson(page, `/api/kitchen-projects/${projectId}/simulations`, 'POST')).status).toBe(202);
    await page.goto(`/kitchen-projects/${projectId}/edit/measurements`);
    await expect(page.getByTestId('edit-blocked')).toHaveText(new RegExp(pj.edit.blockedSimulation.replace('.', '\\.')));
    await expect(page.getByTestId('capture-length')).toBeDisabled();
    await expect(page.getByTestId('edit-save')).toHaveAttribute('aria-disabled', 'true');
    await page.goto(`/kitchen-projects/${projectId}/edit/styles`);
    await expect(page.getByTestId('edit-blocked')).toBeVisible();
    await expect(page.locator('[data-testid="moodboard-gallery-image"][data-gallery-id="modern-03"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('edit-save')).toHaveAttribute('aria-disabled', 'true');
    await page.screenshot({ path: 'test-results/simulations/6-edit-blocked-en.png', fullPage: true });
    // Wait the Simulation out, then delete the test Simulation so the project is idle again.
    await expect
      .poll(async () => (JSON.parse((await apiJson(page, `/api/kitchen-projects/${projectId}/simulations`, 'GET')).body) as { simulations: Array<{ status: string }> }).simulations[0]?.status, { timeout: 90_000 })
      .toBe('succeeded');
  });
});

// The designed states, with the API answers mocked in the browser.
test.describe('Project page and edit pages (mocked API)', () => {
  const PID = '11111111-1111-4111-8111-111111111111';
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const sid = (n: number) => `22222222-2222-4222-8222-22222222222${n}`;
  const render = (sim: number, n: number, status = 'succeeded') => ({
    id: `33333333-3333-4333-8333-3333333333${sim}${n}`,
    simulationId: sid(sim),
    status,
    photoId: null,
    photoPosition: n,
    attempts: 1,
    mode: 'canny',
    width: 1216,
    height: 832,
    position: null,
    waitingFor: null,
    errorCode: status === 'failed' ? 'adapter_error' : null,
    createdAt: '2026-11-17T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    beforeUrl: `/kitchen-projects/${PID}/renders/x/content?variant=before`,
    fullUrl: status === 'succeeded' ? `/kitchen-projects/${PID}/renders/x/content?variant=full` : null,
    thumbUrl: status === 'succeeded' ? `/kitchen-projects/${PID}/renders/x/content?variant=thumb` : null,
  });
  const sim = (n: number, extra: Record<string, unknown> = {}, count = 6) => ({
    id: sid(n),
    ordinal: n,
    createdAt: `2026-11-1${n}T17:19:00.000Z`,
    status: 'succeeded',
    stage: 'finished',
    progress: { total: count, succeeded: count, failed: 0, current: 0 },
    selected: false,
    blendMode: 'both',
    styleDegraded: false,
    style: { keywords: [], references: [] },
    renders: Array.from({ length: count }, (_, i) => render(n, i)),
    budget: null,
    ...extra,
  });
  const project = {
    id: PID,
    status: 'claimed',
    measurements: { lengthCm: 420, widthCm: 310, heightCm: 250 },
    photos: Array.from({ length: 6 }, (_, i) => ({ id: `44444444-4444-4444-8444-44444444444${i}`, position: i, width: 1200, height: 800, thumbUrl: `/kitchen-projects/${PID}/photos/x/content?variant=thumb`, fullUrl: `/kitchen-projects/${PID}/photos/x/content?variant=full` })),
    moodboard: Array.from({ length: 4 }, (_, i) => ({ id: `55555555-5555-4555-8555-55555555555${i}`, source: 'gallery', galleryImageId: `modern-0${i + 1}`, styleId: 'modern', position: i, width: 768, height: 512, thumbUrl: '/style-gallery/images/modern-01/content?variant=thumb', fullUrl: '/style-gallery/images/modern-01/content?variant=full' })),
    claimedAt: '2026-11-17T09:00:00.000Z',
  };

  interface Calls {
    select: Array<unknown>;
    deleted: string[];
    puts: number;
    lists: number;
  }

  /** Stateful mock of the project, its Simulations, selection and delete. `onList` may change the list per GET. */
  async function mock(page: Page, initial: unknown[], options: { onList?: (call: number, current: Array<Record<string, unknown>>) => Array<Record<string, unknown>>; selectStatus?: number; deleteStatus?: number; projectStatus?: number; put?: { status: number; body: unknown } } = {}) {
    let sims = initial as Array<Record<string, unknown>>;
    const calls: Calls = { select: [], deleted: [], puts: 0, lists: 0 };
    await page.route(`${WEB}/api/kitchen-projects/${PID}**`, async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.includes('/content')) return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
      if (url.pathname.endsWith('/selected-simulation') && method === 'PUT') {
        const body = route.request().postDataJSON() as { simulationId: string | null };
        calls.select.push(body);
        if (options.selectStatus && options.selectStatus !== 200) return json(options.selectStatus, { statusCode: options.selectStatus, code: 'simulation_not_ready' });
        sims = sims.map((s) => ({ ...s, selected: s.id === body.simulationId }));
        return json(200, { selectedSimulationId: body.simulationId });
      }
      if (/\/simulations\/[^/]+$/.test(url.pathname) && method === 'DELETE') {
        if (options.deleteStatus && options.deleteStatus !== 204) return json(options.deleteStatus, { statusCode: options.deleteStatus, code: 'storage_unavailable' });
        const id = url.pathname.split('/').pop() as string;
        calls.deleted.push(id);
        sims = sims.filter((s) => s.id !== id);
        return route.fulfill({ status: 204 });
      }
      if (url.pathname.endsWith('/simulations') && method === 'GET') {
        calls.lists += 1;
        if (options.onList) sims = options.onList(calls.lists, sims);
        return json(200, { simulations: sims });
      }
      if (url.pathname.endsWith('/measurements') && method === 'PUT') {
        calls.puts += 1;
        return json(options.put?.status ?? 200, options.put?.body ?? { ...project });
      }
      if (url.pathname === `/api/kitchen-projects/${PID}` && method === 'GET') return json(options.projectStatus ?? 200, options.projectStatus && options.projectStatus !== 200 ? { statusCode: options.projectStatus } : project);
      return route.fallback();
    });
    return calls;
  }
  const open = (page: Page, path = '') => page.goto(`/kitchen-projects/${PID}${path}`);

  test('empty project: the empty card, Generate my kitchen as the primary action and a disabled budget button', async ({ page, context }) => {
    const en = sm('en');
    const pj = pm('en');
    await setLocaleCookie(context, 'en');
    await mock(page, []);
    await open(page);
    await expect(page.getByTestId('simulations-empty')).toContainText(en.empty.title);
    await expect(page.getByTestId('simulations-empty')).toContainText(en.empty.helper);
    await expect(page.getByTestId('simulations-instruction')).toHaveCount(0);
    await expect(page.getByTestId('my-simulations-count')).toHaveText('0');
    await expect(page.getByTestId('project-render')).toHaveText(gm('en').generate.cta.render);
    await expect(page.getByTestId('project-render')).toHaveClass(/bg-primary/);
    await expect(page.getByTestId('project-render')).toHaveAttribute('href', `/kitchen-projects/${PID}/results?start=1`);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-budget-reason')).toHaveText(pj.budgetReason);
    await expect(page.getByTestId('summary-photos')).toContainText('6 photos');
    await expect(page.getByTestId('summary-styles')).toContainText('4 styles and references');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/simulations/m1-empty-en.png', fullPage: true });
  });

  test('selection: partial failure is not selectable, selecting calls the API, the budget button follows the Budget state', async ({ page, context }) => {
    const en = sm('en');
    const pj = pm('en');
    await setLocaleCookie(context, 'en');
    const partial = sim(1, { status: 'partial', progress: { total: 6, succeeded: 5, failed: 1, current: 0 }, renders: [...[0, 1, 2, 3, 4].map((i) => render(1, i)), render(1, 5, 'failed')] });
    const calls = await mock(page, [sim(3), sim(2), partial]);
    await open(page);
    await expect(page.getByTestId('my-simulations-count')).toHaveText('3');
    await expect(page.getByTestId('simulations-instruction')).toHaveText(en.instruction);
    // Partial failure: warning stroke, badge, "Open and retry", a disabled Select that never calls the API.
    await expect(page.getByTestId('simulation-failed-1')).toHaveText(plural(en.photosFailed, 1));
    await expect(page.getByTestId('simulation-open-1')).toHaveText(en.openRetry);
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('simulation-select-1').click({ force: true });
    expect(calls.select).toEqual([]);
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('aria-checked', 'false');
    // Three thumbnails and a +n cell; metadata with date and count.
    await expect(page.getByTestId('simulation-3').locator('img')).toHaveCount(3);
    await expect(page.getByTestId('simulation-more-3')).toHaveText('+3');
    await expect(page.getByTestId('simulation-3')).toContainText('6 photos');
    // Select 3: PUT with its id, one checked radio, Selected badge, Delete pill, instruction gone, budget enabled.
    await page.getByTestId('simulation-select-3').click();
    expect(calls.select).toEqual([{ simulationId: sid(3) }]);
    await expect(page.getByTestId('simulation-select-3')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('simulation-select-3')).toContainText(en.selected);
    await expect(page.getByTestId('simulation-3')).toHaveAttribute('data-selected', 'true');
    await expect(page.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);
    await expect(page.getByTestId('simulation-delete-3')).toContainText(en.delete);
    await expect(page.getByTestId('simulations-instruction')).toHaveCount(0);
    await expect(page.getByTestId('project-budget')).toHaveText(gm('en').generate.cta.budget);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('data-state', 'get');
    await expect(page.getByTestId('project-budget')).toHaveClass(/bg-primary/);
    await expect(page.getByTestId('project-render')).toHaveText(pj.generateMore);
    await expect(page.getByTestId('project-render')).not.toHaveClass(/bg-primary/);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/simulations/m2-selected-en.png', fullPage: true });
    // Switching the selection moves the checked radio.
    await page.getByTestId('simulation-select-2').click();
    await expect(page.getByTestId('simulation-select-2')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('simulation-select-3')).toHaveAttribute('aria-checked', 'false');
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // A current Budget: "See my budget" opens the Budget page; a running one: the same label with the spinner.
    await mock(page, [sim(2, { selected: true, budget: { id: 'b1', status: 'succeeded' } })]);
    await open(page);
    await expect(page.getByTestId('project-budget')).toHaveText(pj.seeBudget);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('data-state', 'see');
    await expect(page.getByTestId('project-budget')).toHaveAttribute('href', `/kitchen-projects/${PID}/budget`);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mock(page, [sim(2, { selected: true, budget: { id: 'b1', status: 'running' } })]);
    await open(page);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('data-state', 'computing');
    await expect(page.getByTestId('project-budget')).toHaveText(pj.seeBudget);
    await expect(page.getByTestId('project-budget').locator('svg.animate-spin')).toHaveCount(1);
    await expect(page.getByTestId('project-edit-hint')).toHaveText(pj.edit.blockedBudget);
    await expect(page.getByTestId('project-edit-photos')).toHaveAttribute('aria-disabled', 'true');
  });

  test('delete: the dialog (focus trapped, Escape closes), confirm calls DELETE, deleting the selected one clears the selection', async ({ page, context }) => {
    const en = sm('en');
    const pj = pm('en');
    await setLocaleCookie(context, 'en');
    const calls = await mock(page, [sim(2, { selected: true }), sim(1)]);
    await open(page);
    await page.getByTestId('simulation-delete-1').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText(fill(en.deleteDialog.title, { n: 1 }));
    await expect(dialog).toContainText(en.deleteDialog.message);
    await expect(page.getByTestId('delete-simulation-cancel')).toBeFocused();
    await expect(page.getByTestId('delete-simulation-confirm')).toHaveClass(/bg-danger/);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
    }
    await page.screenshot({ path: 'test-results/simulations/m3-delete-dialog-en.png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(calls.deleted).toEqual([]);
    await page.getByTestId('simulation-delete-1').click();
    await page.getByTestId('delete-simulation-confirm').click();
    await expect(page.getByTestId('simulation-1')).toHaveCount(0);
    expect(calls.deleted).toEqual([sid(1)]);
    // The selected one: Delete (pill) -> confirm -> no selection left, instruction hidden by the empty state, budget disabled.
    await page.getByTestId('simulation-delete-2').click();
    await page.getByTestId('delete-simulation-confirm').click();
    await expect(page.getByTestId('simulations-empty')).toBeVisible();
    expect(calls.deleted).toEqual([sid(1), sid(2)]);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-budget-reason')).toHaveText(pj.budgetReason);
  });

  test('a running Simulation: progress, Select and Delete disabled, edit entries blocked with the hint; polling re-enables them', async ({ page, context }) => {
    const en = sm('en');
    const pj = pm('en');
    await setLocaleCookie(context, 'en');
    const running = sim(4, { status: 'active', stage: 'rendering', progress: { total: 6, succeeded: 1, failed: 0, current: 2 }, renders: [render(4, 0), render(4, 1, 'running'), ...[2, 3, 4, 5].map((i) => render(4, i, 'queued'))] });
    await mock(page, [running, sim(3, { selected: true })], {
      onList: (call, current) => (call < 3 ? current : current.map((s) => (s.ordinal === 4 ? sim(4) : s))),
    });
    await open(page);
    await expect(page.getByTestId('simulation-4')).toHaveAttribute('data-status', 'active');
    await expect(page.getByTestId('simulation-progress')).toHaveText(fill(en.rendering, { n: 2, count: 6 }));
    await expect(page.getByTestId('simulation-progress-bar')).toHaveAttribute('data-percent', '33');
    await expect(page.getByTestId('simulation-open-4')).toHaveText(en.open);
    await expect(page.getByTestId('simulation-select-4')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('simulation-delete-4')).toHaveAttribute('aria-disabled', 'true');
    for (const section of ['photos', 'measurements', 'styles']) await expect(page.getByTestId(`project-edit-${section}`)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-edit-hint')).toHaveText(pj.edit.blockedSimulation);
    await expect(page.getByTestId('project-render')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-generate-reason')).toHaveText(gm('en').results.hints.oneAtATime);
    await expect(page.getByTestId('simulation-delete-3')).not.toHaveAttribute('aria-disabled', 'true');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/simulations/m4-running-en.png', fullPage: true });
    // Two polls later the Simulation is done: edit links, Select and Generate work again.
    await expect(page.getByTestId('simulation-4')).toHaveAttribute('data-status', 'succeeded', { timeout: 15_000 });
    await expect(page.getByTestId('project-edit-photos')).toHaveAttribute('href', `/kitchen-projects/${PID}/edit/photos`);
    await expect(page.getByTestId('project-edit-hint')).toHaveCount(0);
    await expect(page.getByTestId('simulation-select-4')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('project-render')).toHaveAttribute('href', `/kitchen-projects/${PID}/results?start=1`);
  });

  test('failed calls: select 409 reloads the list, delete failure alerts', async ({ page, context }) => {
    const pj = pm('en');
    await setLocaleCookie(context, 'en');
    const calls = await mock(page, [sim(2), sim(1)], { selectStatus: 409, deleteStatus: 503 });
    await open(page);
    await page.getByTestId('simulation-select-2').click();
    await expect.poll(() => calls.lists).toBeGreaterThanOrEqual(2); // reloaded after the 409
    await expect(page.getByTestId('simulation-select-2')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('simulation-delete-1').click();
    await page.getByTestId('delete-simulation-confirm').click();
    await expect(page.getByTestId('project-action-failed')).toContainText(pj.actionFailed);
    await expect(page.getByTestId('simulation-1')).toBeVisible();
  });

  test('offline pauses the page', async ({ page, context }) => {
    await setLocaleCookie(context, 'en');
    await mock(page, [sim(2), sim(1)]);
    await open(page);
    await expect(page.getByTestId('simulation-select-2')).toHaveAttribute('aria-disabled', 'false');
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByTestId('project-render')).toHaveAttribute('aria-disabled', 'true');
    await context.setOffline(false);
  });

  test('signed out and not found', async ({ page, context }) => {
    await setLocaleCookie(context, 'en');
    await page.goto(`/kitchen-projects/${PID}`);
    await expect(page.getByTestId('project-signed-out')).toBeVisible();
    await expect(page.getByTestId('project-sign-in')).toHaveAttribute('href', `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${PID}`)}`);
    await page.route(`${WEB}/api/kitchen-projects/${PID}**`, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"statusCode":404,"message":"Not Found"}' }));
    await page.goto(`/kitchen-projects/${PID}`);
    await expect(page.getByTestId('project-not-found')).toBeVisible();
  });

  test('360 px: no horizontal overflow with 8 Simulations in de and fi', async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const many = Array.from({ length: 8 }, (_, i) => sim(8 - i, i === 0 ? { selected: true } : i === 7 ? { status: 'partial', renders: [...[0, 1, 2, 3, 4].map((n) => render(1, n)), render(1, 5, 'failed')] } : {}));
    await mock(page, many);
    for (const locale of ['de', 'fi'] as const) {
      await setLocaleCookie(context, locale);
      await open(page);
      await expect(page.getByTestId('simulation-8')).toBeVisible();
      await expect(page.getByTestId('my-simulations-count')).toHaveText('8');
      await checkLayout(page);
      await page.screenshot({ path: `test-results/simulations/m6-360-${locale}.png`, fullPage: true });
    }
  });

  test('edit pages: signed out, not found, blocked by a 409 on save (budget), blocked at load, 360 px', async ({ page, context }) => {
    const pj = pm('en');
    await setLocaleCookie(context, 'en');
    // Signed out and not found.
    for (const section of ['photos', 'measurements', 'styles']) {
      await page.goto(`/kitchen-projects/${PID}/edit/${section}`);
      await expect(page.getByTestId('edit-signed-out')).toBeVisible();
      await expect(page.getByTestId('edit-sign-in')).toHaveAttribute('href', `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${PID}/edit/${section}`)}`);
    }
    expect((await page.request.get('/kitchen-projects/not-a-uuid/edit/photos')).status()).toBe(404);
    await mock(page, [], { projectStatus: 404 });
    await page.goto(`/kitchen-projects/${PID}/edit/photos`);
    await expect(page.getByTestId('edit-not-found')).toBeVisible();
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // The API refuses a measurement save with budget_in_progress: the blocked hint (budget variant) appears.
    await mock(page, [], { put: { status: 409, body: { statusCode: 409, code: 'budget_in_progress' } } });
    await page.goto(`/kitchen-projects/${PID}/edit/measurements`);
    await expect(page.getByTestId('capture-screen')).toHaveAttribute('data-phase', 'ready');
    await expect(page.getByTestId('edit-blocked')).toHaveCount(0);
    await page.getByTestId('capture-length').click();
    await expect(page.getByTestId('keypad-sheet')).toBeVisible();
    await page.getByTestId('keypad-clear').click();
    await keys(page, '430');
    await page.getByTestId('keypad-next').click();
    await page.getByTestId('keypad-close').click();
    await expect(page.getByTestId('edit-blocked')).toContainText(pj.edit.blockedBudget);
    await expect(page.getByTestId('edit-save')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('capture-length')).toBeDisabled();
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // Blocked at load by a running Simulation, on every edit page; Back goes to the project.
    await mock(page, [sim(1, { status: 'active', progress: { total: 6, succeeded: 0, failed: 0, current: 1 } })]);
    for (const [section, readyTestId] of [['photos', 'capture-screen'], ['measurements', 'capture-screen'], ['styles', 'moodboard-screen']] as const) {
      await page.goto(`/kitchen-projects/${PID}/edit/${section}`);
      await expect(page.getByTestId(readyTestId)).toHaveAttribute('data-phase', 'ready');
      await expect(page.getByTestId('edit-blocked')).toContainText(pj.edit.blockedSimulation);
      await expect(page.getByTestId('edit-save')).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByTestId('edit-back')).toHaveAttribute('href', `/kitchen-projects/${PID}`);
    }
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // 360 px (de, fi): no horizontal overflow, targets >= 44 px.
    await page.setViewportSize({ width: 360, height: 780 });
    await mock(page, []);
    for (const locale of ['de', 'fi'] as const) {
      await setLocaleCookie(context, locale);
      for (const [section, readyTestId] of [['photos', 'capture-screen'], ['measurements', 'capture-screen'], ['styles', 'moodboard-screen']] as const) {
        await page.goto(`/kitchen-projects/${PID}/edit/${section}`);
        await expect(page.getByTestId(readyTestId)).toHaveAttribute('data-phase', 'ready');
        await expect(page.getByTestId('edit-save')).toHaveText(pm(locale).edit.save);
        await checkLayout(page);
      }
    }
    await page.screenshot({ path: 'test-results/simulations/m7-edit-360-fi.png', fullPage: true });
  });
});
