import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, newContext } from './fixtures';
import { baseURL, guardLocalhost, horizontalOverflow, type Locale, messages, pageFetch, setLocaleCookie, smallTargets } from './support';

// Feature moodboard-selection: anonymous Moodboard screen (Style Gallery picks + own references).
// Every browser request must stay on the web origin (localhost guard).
test.use({ locale: 'en-US' });

const ORIGIN = new URL(baseURL()).origin;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const CAPTURE = '/kitchen-projects/new';
const MOODBOARD = '/kitchen-projects/new/moodboard';
const CURRENT = '/api/kitchen-projects/drafts/current';
const ITEMS = `${CURRENT}/moodboard`;
const GALLERY_IDS = [
  'modern-01', 'modern-02', 'modern-03', 'scandinavian-01', 'scandinavian-02', 'scandinavian-03',
  'industrial-01', 'industrial-02', 'industrial-03', 'farmhouse-01', 'farmhouse-02', 'farmhouse-03', 'classic-01',
];

interface MoodboardMessages {
  title: string;
  step: string;
  board: { counter: string; empty: string; limitReached: string };
  gallery: { alt: string };
  styles: Record<string, string>;
  continueHints: Record<'items' | 'capture' | 'goToCapture', string>;
  alerts: Record<'offline' | 'expired', string>;
}
const moodboard = (locale: Locale) => (messages(locale) as unknown as { moodboard: MoodboardMessages }).moodboard;
const fill = (message: string, values: Record<string, string | number>) => message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

interface DraftJson {
  moodboard: Array<{ id: string; source: string; galleryImageId: string | null; position: number; thumbUrl: string }>;
}

let blocked: string[] = [];
test.beforeEach(async ({ context }) => {
  blocked = await guardLocalhost(context, [ORIGIN]);
});
test.afterEach(() => {
  expect(blocked).toEqual([]);
});

/** JSON call from the page (same origin, so the browser adds Origin and the bm_draft cookie). */
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

/** Multipart upload from the page (field `photo`). */
async function apiUpload(page: Page, path: string, file: string, type = 'image/jpeg') {
  const bytes = Array.from(readFileSync(fixture(file)));
  return page.evaluate(
    async ({ path, bytes, type }) => {
      const form = new FormData();
      form.append('photo', new Blob([new Uint8Array(bytes)], { type }), 'photo');
      const res = await fetch(path, { method: 'POST', body: form, credentials: 'same-origin' });
      return { status: res.status, body: await res.text() };
    },
    { path, bytes, type },
  );
}

/** Starts this browser's draft with a complete Capture (1 photo, 3 measurements) through the API. */
async function seedCapture(page: Page, locale: Locale = 'en', complete = true) {
  await setLocaleCookie(page.context(), locale);
  await page.goto('/language');
  expect((await pageFetch(page, '/api/kitchen-projects/drafts', { method: 'POST' })).status).toBe(201);
  if (!complete) return;
  expect((await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).status).toBe(201);
  expect((await apiJson(page, `${CURRENT}/measurements`, 'PUT', { lengthCm: 420, widthCm: 310, heightCm: 260 })).status).toBe(200);
}

async function open(page: Page, locale: Locale = 'en') {
  await setLocaleCookie(page.context(), locale);
  await page.goto(MOODBOARD);
  await expect(page.getByTestId('moodboard-screen')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('moodboard-gallery-image')).toHaveCount(24);
}

const galleryTile = (page: Page, id: string) => page.locator(`[data-testid="moodboard-gallery-image"][data-gallery-id="${id}"]`);

async function itemIds(page: Page) {
  return page.locator('[data-testid="moodboard-item"]').evaluateAll((items) => items.map((item) => `${item.getAttribute('data-source')}:${item.getAttribute('data-gallery-id') ?? item.getAttribute('data-item-id')}`));
}

async function imagesLoaded(page: Page) {
  await expect
    .poll(() => page.$$eval('[data-testid="moodboard-item"] img', (imgs) => imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
}

test('Capture Continue opens the empty Moodboard with the 24-image Style Gallery', async ({ page }) => {
  await seedCapture(page);
  await page.goto(CAPTURE);
  await expect(page.getByTestId('capture-continue')).toHaveAttribute('aria-disabled', 'false');
  await page.getByTestId('capture-continue').click();
  await page.waitForURL(`${ORIGIN}${MOODBOARD}`);
  await expect(page.getByTestId('moodboard-screen')).toHaveAttribute('data-phase', 'ready');
  const m = moodboard('en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.title);
  await expect(page.getByText(fill(m.step, { current: 2, total: 3 }))).toBeVisible();
  await expect(page.getByTestId('moodboard-gallery-image')).toHaveCount(24);
  await expect(page.getByTestId('moodboard-item')).toHaveCount(0);
  await expect(page.getByTestId('moodboard-empty')).toHaveText(m.board.empty);
  await expect(page.getByTestId('moodboard-counter')).toHaveText(fill(m.board.counter, { count: 0, max: 12 }));
  await expect(page.getByTestId('moodboard-continue')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('moodboard-continue-hint')).toHaveText(m.continueHints.items);
  await expect(page.getByRole('button', { name: 'Modern kitchen 1' })).toHaveAttribute('aria-pressed', 'false');
  // Gallery thumbnails come from the API through the same-origin proxy.
  await expect
    .poll(() => page.$$eval('[data-testid="moodboard-gallery-image"] img', (imgs) => imgs.slice(0, 4).every((img) => (img as HTMLImageElement).naturalWidth === 512)))
    .toBe(true);
  // Style filter: one style shows its 3 images.
  await page.getByTestId('moodboard-style-filter').getByRole('button', { name: m.styles.japandi, exact: true }).click();
  await expect(page.getByTestId('moodboard-gallery-image')).toHaveCount(3);
  // Multi-select: a second style adds its images; the selected chips show a check icon.
  await page.getByTestId('moodboard-style-filter').getByRole('button', { name: m.styles.minimalist, exact: true }).click();
  await expect(page.getByTestId('moodboard-gallery-image')).toHaveCount(6);
  await expect(page.getByTestId('moodboard-style-filter').locator('[aria-pressed="true"] svg')).toHaveCount(2);
  await page.getByTestId('moodboard-style-filter').getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByTestId('moodboard-gallery-image')).toHaveCount(24);
  await page.screenshot({ path: 'test-results/moodboard/1-empty.png' });
  // Back returns to Capture with its data.
  await page.getByTestId('moodboard-back').click();
  await page.waitForURL(`${ORIGIN}${CAPTURE}`);
  await expect(page.locator('[data-testid="capture-photo-tile"][data-state="ready"]')).toHaveCount(1);
  await expect(page.getByTestId('capture-length')).toContainText('420');
});

test('1 upload + 2 gallery, deselect 1, reload: the Moodboard is intact', async ({ page }) => {
  await seedCapture(page);
  await open(page);
  const m = moodboard('en');

  await page.getByTestId('moodboard-file-input').setInputFiles(fixture('kitchen-2.jpg'));
  await expect(page.locator('[data-testid="moodboard-item"][data-source="upload"]')).toHaveCount(1, { timeout: 30_000 });
  await galleryTile(page, 'modern-01').click();
  await expect(galleryTile(page, 'modern-01')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="moodboard-item"][data-gallery-id="modern-01"]')).toHaveCount(1);
  await galleryTile(page, 'scandinavian-02').click();
  await expect(page.locator('[data-testid="moodboard-item"][data-gallery-id="scandinavian-02"]')).toHaveCount(1);
  await expect(page.getByTestId('moodboard-item')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/moodboard/2-three-items.png', fullPage: true });

  // Tap a selected gallery image again: deselected.
  await galleryTile(page, 'modern-01').click();
  await expect(galleryTile(page, 'modern-01')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('moodboard-item')).toHaveCount(2);
  await expect(page.getByTestId('moodboard-counter')).toHaveText(fill(m.board.counter, { count: 2, max: 12 }));
  await expect(page.getByTestId('moodboard-continue')).toHaveAttribute('aria-disabled', 'false');
  await imagesLoaded(page);
  const before = await itemIds(page);
  expect(before).toHaveLength(2);
  expect(before[0]).toMatch(/^upload:/);
  expect(before[1]).toBe('gallery:scandinavian-02');
  await expect(page.getByRole('img', { name: 'Your reference photo 1' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Scandinavian kitchen 2' })).toBeVisible();
  await page.screenshot({ path: 'test-results/moodboard/2-filled.png', fullPage: true });

  await page.reload();
  await expect(page.getByTestId('moodboard-screen')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('moodboard-item')).toHaveCount(2);
  await imagesLoaded(page);
  expect(await itemIds(page)).toEqual(before);
  await expect(galleryTile(page, 'modern-01')).toHaveAttribute('aria-pressed', 'false');
  await expect(galleryTile(page, 'scandinavian-02')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('moodboard-continue')).toHaveAttribute('aria-disabled', 'false');

  const draft = JSON.parse((await pageFetch(page, CURRENT)).body) as DraftJson;
  expect(draft.moodboard.map((item) => [item.source, item.galleryImageId, item.position])).toEqual([
    ['upload', null, 0],
    ['gallery', 'scandinavian-02', 1],
  ]);
  const upload = draft.moodboard[0];
  const thumb = await pageFetch(page, `/api${upload?.thumbUrl ?? ''}`);
  expect(thumb.status).toBe(200);
});

test('the Moodboard belongs to the draft: second browser, forged header, foreign ids, CSRF', async ({ page, browser, playwright }) => {
  await seedCapture(page);
  const pick = await apiJson(page, `${ITEMS}/gallery-items`, 'POST', { galleryImageId: 'japandi-01' });
  expect(pick.status).toBe(201);
  const upload = await apiUpload(page, `${ITEMS}/uploads`, 'kitchen-2.jpg');
  expect(upload.status).toBe(201);
  const ids = [JSON.parse(pick.body).id as string, JSON.parse(upload.body).id as string];
  const token = (await page.context().cookies()).find((c) => c.name === 'bm_draft')?.value ?? '';

  const other = await newContext(browser, { locale: 'en-US', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const otherBlocked = await guardLocalhost(other, [ORIGIN]);
  const second = await other.newPage();
  try {
    await open(second);
    await expect(second.getByTestId('moodboard-item')).toHaveCount(0);
    await expect(galleryTile(second, 'japandi-01')).toHaveAttribute('aria-pressed', 'false');
    expect((await pageFetch(second, CURRENT, { headers: { 'x-draft-token': token } })).status).toBe(404);
    // No draft yet: adding is impossible without a valid token.
    expect((await apiJson(second, `${ITEMS}/gallery-items`, 'POST', { galleryImageId: 'modern-01' })).status).toBe(404);
    expect((await pageFetch(second, '/api/kitchen-projects/drafts', { method: 'POST' })).status).toBe(201);
    for (const id of ids) {
      expect((await pageFetch(second, `${ITEMS}/items/${id}/content?variant=thumb`)).status).toBe(404);
      expect((await pageFetch(second, `${ITEMS}/items/${id}`, { method: 'DELETE' })).status).toBe(404);
    }
    expect(otherBlocked).toEqual([]);
  } finally {
    await other.close();
  }
  expect((JSON.parse((await pageFetch(page, CURRENT)).body) as DraftJson).moodboard).toHaveLength(2);

  const api = await playwright.request.newContext({ baseURL: ORIGIN });
  try {
    const cookie = `bm_draft=${token}`;
    for (const origin of [undefined, 'http://evil.example']) {
      const headers: Record<string, string> = { cookie, 'content-type': 'application/json' };
      if (origin) headers.origin = origin;
      expect((await api.post(`${ITEMS}/gallery-items`, { headers, data: { galleryImageId: 'modern-01' } })).status()).toBe(403);
      expect((await api.delete(`${ITEMS}/items/${ids[0]}`, { headers })).status()).toBe(403);
    }
    expect((await api.post(`${ITEMS}/gallery-items`, { headers: { cookie, origin: ORIGIN }, data: { galleryImageId: 'modern-01' } })).status()).toBe(201);
  } finally {
    await api.dispose();
  }
});

test('limits and validation: 12 items, 13th refused, unknown id 400, duplicate 200; the UI disables adding', async ({ page }) => {
  await seedCapture(page);
  for (const id of GALLERY_IDS.slice(0, 12)) expect((await apiJson(page, `${ITEMS}/gallery-items`, 'POST', { galleryImageId: id })).status).toBe(201);
  const thirteenth = await apiJson(page, `${ITEMS}/gallery-items`, 'POST', { galleryImageId: GALLERY_IDS[12] });
  expect(thirteenth.status).toBe(409);
  expect(JSON.parse(thirteenth.body).code).toBe('moodboard_limit_reached');
  expect((await apiUpload(page, `${ITEMS}/uploads`, 'kitchen-2.jpg')).status).toBe(409);
  const unknown = await apiJson(page, `${ITEMS}/gallery-items`, 'POST', { galleryImageId: 'modern-99' });
  expect(unknown.status).toBe(400);
  expect(JSON.parse(unknown.body).code).toBe('gallery_image_unknown');
  expect((await apiJson(page, `${ITEMS}/gallery-items`, 'POST', { galleryImageId: 'modern-01' })).status).toBe(200);

  await open(page);
  const m = moodboard('en');
  await expect(page.getByTestId('moodboard-counter')).toHaveText(fill(m.board.counter, { count: 12, max: 12 }));
  await expect(page.getByTestId('moodboard-add-reference')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('moodboard-limit')).toHaveText(fill(m.board.limitReached, { max: 12 }));
  await expect(galleryTile(page, 'classic-01')).toHaveAttribute('aria-disabled', 'true');
  await galleryTile(page, 'classic-01').dispatchEvent('click');
  await expect(galleryTile(page, 'classic-01')).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: 'test-results/moodboard/4-limit.png', fullPage: true });
  // A selected tile stays pressable: tapping it removes the item.
  await expect(galleryTile(page, 'modern-02')).toHaveAttribute('aria-disabled', 'false');
  await galleryTile(page, 'modern-02').click();
  await expect(page.getByTestId('moodboard-counter')).toHaveText(fill(m.board.counter, { count: 11, max: 12 }));
  await expect(galleryTile(page, 'classic-01')).toHaveAttribute('aria-disabled', 'false');
  await expect(page.getByTestId('moodboard-add-reference')).toHaveAttribute('aria-disabled', 'false');
});

test('references: HEIC thumbnail, client pre-check errors, 503 with Retry while gallery picks keep working, remove', async ({ page }) => {
  await seedCapture(page);
  await open(page);
  await page.getByTestId('moodboard-file-input').setInputFiles(fixture('kitchen-3.heic'));
  const heic = page.locator('[data-testid="moodboard-item"][data-source="upload"]');
  await expect(heic).toHaveCount(1, { timeout: 30_000 });
  await imagesLoaded(page);
  expect(await heic.locator('img').evaluate((el) => [(el as HTMLImageElement).naturalWidth, (el as HTMLImageElement).naturalHeight])).toEqual([512, 384]);
  await expect(heic.getByText('Your photo')).toBeVisible();

  const errors = (messages('en') as unknown as { capture: { photos: { errors: Record<string, string> } } }).capture.photos.errors;
  await page.getByTestId('moodboard-file-input').setInputFiles([
    { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(15 * 1024 * 1024 + 1, 0xff) },
    { name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
  ]);
  await expect(page.locator('[data-testid="moodboard-upload-tile"][data-error="photo_too_large"]')).toContainText(errors.tooLarge);
  await expect(page.locator('[data-testid="moodboard-upload-tile"][data-error="photo_unsupported_type"]')).toContainText(errors.unsupported);

  await page.route('**/api/kitchen-projects/drafts/current/moodboard/uploads', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Service Unavailable', code: 'storage_unavailable' }) }),
  );
  await page.getByTestId('moodboard-file-input').setInputFiles(fixture('kitchen-1.jpg'));
  const failed = page.locator('[data-testid="moodboard-upload-tile"][data-error="storage_unavailable"]');
  await expect(failed).toContainText(errors.failed);
  await galleryTile(page, 'industrial-02').click();
  await expect(page.locator('[data-testid="moodboard-item"][data-gallery-id="industrial-02"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/moodboard/3-upload-errors.png', fullPage: true });
  await page.unroute('**/api/kitchen-projects/drafts/current/moodboard/uploads');
  await failed.getByTestId('moodboard-upload-retry').click();
  await expect(page.locator('[data-testid="moodboard-item"][data-source="upload"]')).toHaveCount(2, { timeout: 30_000 });
  for (const error of ['photo_too_large', 'photo_unsupported_type']) {
    await page.locator(`[data-testid="moodboard-upload-tile"][data-error="${error}"]`).getByTestId('moodboard-upload-remove').click();
  }
  await expect(page.getByTestId('moodboard-upload-tile')).toHaveCount(0);

  // Remove the HEIC reference: row and objects gone, positions compacted.
  await page.getByRole('button', { name: 'Remove reference 1' }).click();
  await expect(page.locator('[data-testid="moodboard-item"][data-source="upload"]')).toHaveCount(1);
  const draft = JSON.parse((await pageFetch(page, CURRENT)).body) as DraftJson;
  expect(draft.moodboard.map((item) => [item.source, item.position])).toEqual([
    ['gallery', 0],
    ['upload', 1],
  ]);
  expect(await smallTargets(page)).toEqual([]);
});

test('Continue rules: Capture hint with link when Capture is incomplete; complete opens Generate', async ({ page }) => {
  await seedCapture(page, 'en', false);
  expect((await apiJson(page, `${ITEMS}/gallery-items`, 'POST', { galleryImageId: 'farmhouse-02' })).status).toBe(201);
  await open(page);
  const m = moodboard('en');
  await expect(page.getByTestId('moodboard-continue')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('moodboard-continue-hint')).toHaveText(m.continueHints.capture);
  await expect(page.getByTestId('moodboard-capture-link')).toHaveText(m.continueHints.goToCapture);
  await page.screenshot({ path: 'test-results/moodboard/5-capture-hint.png' });
  await page.getByTestId('moodboard-capture-link').click();
  await page.waitForURL(`${ORIGIN}${CAPTURE}`);

  expect((await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).status).toBe(201);
  expect((await apiJson(page, `${CURRENT}/measurements`, 'PUT', { lengthCm: 420, widthCm: 310, heightCm: 260 })).status).toBe(200);
  await open(page);
  await expect(page.getByTestId('moodboard-continue')).toHaveAttribute('aria-disabled', 'false');
  await expect(page.getByTestId('moodboard-save-status')).toHaveAttribute('data-state', 'saved');
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/kitchen-projects/new/generate'),
    page.getByTestId('moodboard-continue').click(),
  ]);
  await page.waitForURL(`${ORIGIN}/kitchen-projects/new/generate`);
  // login-gate-claim: Continue opens the Generate step.
  expect(response.status()).toBe(200);
  await expect(page.getByTestId('generate-render')).toHaveAttribute('aria-disabled', 'false');
});

test('no draft: the first pick starts one; an expired draft shows the notice', async ({ page }) => {
  await setLocaleCookie(page.context(), 'en');
  await page.goto('/language');
  await page.evaluate(() => window.localStorage.setItem('bm_draft_started', '1'));
  await open(page);
  const m = moodboard('en');
  await expect(page.getByTestId('moodboard-expired')).toHaveText(m.alerts.expired);
  expect((await page.context().cookies()).some((c) => c.name === 'bm_draft')).toBe(false);
  await galleryTile(page, 'mediterranean-03').click();
  await expect(page.locator('[data-testid="moodboard-item"][data-gallery-id="mediterranean-03"]')).toHaveCount(1);
  await expect(page.getByTestId('moodboard-expired')).toHaveCount(0);
  expect((await page.context().cookies()).some((c) => c.name === 'bm_draft')).toBe(true);
  // Items but no Capture yet: the Capture hint.
  await expect(page.getByTestId('moodboard-continue-hint')).toHaveText(m.continueHints.capture);
});

test('offline: offline alert, controls disabled, filter still works; cached shell on reload', async ({ page, context }) => {
  await seedCapture(page);
  expect((await apiJson(page, `${ITEMS}/gallery-items`, 'POST', { galleryImageId: 'minimalist-01' })).status).toBe(201);
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByTestId('moodboard-gallery-image')).toHaveCount(24);
  const m = moodboard('en');

  await context.setOffline(true);
  try {
    await expect(page.getByTestId('moodboard-offline')).toHaveText(m.alerts.offline);
    await expect(page.getByTestId('moodboard-add-reference')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('moodboard-item-remove')).toBeDisabled();
    await expect(galleryTile(page, 'minimalist-01')).toHaveAttribute('aria-disabled', 'true');
    await expect(galleryTile(page, 'modern-01')).toHaveAttribute('aria-disabled', 'true');
    await galleryTile(page, 'modern-01').dispatchEvent('click');
    await expect(galleryTile(page, 'modern-01')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('moodboard-continue')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('moodboard-style-filter').getByRole('button', { name: m.styles.minimalist, exact: true }).click();
    await expect(page.getByTestId('moodboard-gallery-image')).toHaveCount(3);
    await page.screenshot({ path: 'test-results/moodboard/6-offline.png' });

    await page.reload();
    await expect(page.getByTestId('moodboard-offline')).toHaveText(m.alerts.offline);
    await expect(page.getByTestId('moodboard-add-reference')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('moodboard-continue')).toHaveAttribute('aria-disabled', 'true');
  } finally {
    await context.setOffline(false);
  }
  await expect(page.getByTestId('moodboard-offline')).toHaveCount(0);
  await expect(page.locator('[data-testid="moodboard-item"][data-gallery-id="minimalist-01"]')).toHaveCount(1);
});

for (const [width, height, locales] of [
  [390, 844, ['en', 'es'] as Locale[]],
  [360, 780, ['de', 'fi'] as Locale[]],
] as const) {
  for (const locale of locales) {
    test(`layout ${width}x${height} ${locale}: no overflow, 44 px targets, sticky Continue`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await seedCapture(page, locale);
      await open(page, locale);
      const check = async () => {
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
        await expect(page.getByTestId('moodboard-continue')).toBeInViewport();
      };
      await check();
      await page.getByTestId('moodboard-file-input').setInputFiles(fixture('kitchen-2.jpg'));
      await expect(page.locator('[data-testid="moodboard-item"][data-source="upload"]')).toHaveCount(1, { timeout: 30_000 });
      await galleryTile(page, 'scandinavian-02').click();
      await galleryTile(page, 'modern-01').click();
      await expect(page.getByTestId('moodboard-item')).toHaveCount(3);
      await check();
      const tile = await page.getByTestId('moodboard-item').first().boundingBox();
      expect(Math.round(tile?.width ?? 0)).toBe((width - 32 - 16) / 2);
      expect(Math.round(((tile?.width ?? 0) / (tile?.height ?? 1)) * 100) / 100).toBeCloseTo(4 / 3, 1);
      const m = moodboard(locale);
      await expect(page.getByRole('button', { name: fill(m.gallery.alt, { style: m.styles.modern, n: 1 }), exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: `test-results/moodboard/layout-${width}-${locale}.png`, fullPage: true });
    });
  }
}

test.describe('Style Gallery filter chips wrap (simulations-ux-overhaul S2)', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('360 px in de: every chip visible, wrapped over several rows, 44 px high, no horizontal scroll', async ({ page }) => {
    await seedCapture(page, 'de');
    await page.goto(MOODBOARD);
    await expect(page.getByTestId('moodboard-screen')).toHaveAttribute('data-phase', 'ready');
    const chips = page.getByTestId('moodboard-style-filter').getByRole('button');
    await expect(chips).toHaveCount(9);
    const boxes = await chips.evaluateAll((els) => els.map((el) => ({ ...el.getBoundingClientRect().toJSON(), scroll: el.scrollWidth - el.clientWidth })));
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.right).toBeLessThanOrEqual(360);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.scroll).toBeLessThanOrEqual(1);
    }
    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBeGreaterThan(1);
    const box = page.getByTestId('moodboard-style-filter');
    expect(await box.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await horizontalOverflow(page)).toEqual([]);
  });
});
