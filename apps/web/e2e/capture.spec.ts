import { fileURLToPath } from 'node:url';
import { expect, test, type Page, newContext } from './fixtures';
import { baseURL, guardLocalhost, horizontalOverflow, type Locale, messages, pageFetch, setLocaleCookie, smallTargets } from './support';

// Feature kitchen-capture-draft: anonymous Capture screen (photos + measurement keypad).
// Every browser request must stay on the web origin (localhost guard).
test.use({ locale: 'en-US' });

const ORIGIN = new URL(baseURL()).origin;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const CAPTURE = '/kitchen-projects/new';
const CURRENT = '/api/kitchen-projects/drafts/current';

interface CaptureMessages {
  title: string;
  continueHint: string;
  photos: { errors: Record<'tooLarge' | 'unsupported' | 'tooSmall' | 'failed', string>; limitReached: string };
  save: Record<'saving' | 'saved' | 'offline' | 'failed', string>;
  alerts: Record<'offline' | 'expired', string>;
  keypad: { next: string; done: string };
  measurements: { fields: Record<'lengthCm' | 'widthCm' | 'heightCm', string> };
}
const capture = (locale: Locale) => (messages(locale) as unknown as { capture: CaptureMessages }).capture;

let blocked: string[] = [];
test.beforeEach(async ({ context }) => {
  blocked = await guardLocalhost(context, [ORIGIN]);
});
test.afterEach(() => {
  expect(blocked).toEqual([]);
});

async function open(page: Page, locale: Locale = 'en') {
  await setLocaleCookie(page.context(), locale);
  await page.goto(CAPTURE);
  await expect(page.getByTestId('capture-screen')).toHaveAttribute('data-phase', 'ready');
}

async function upload(page: Page, files: Parameters<Page['setInputFiles']>[1]) {
  await page.getByTestId('capture-file-input').setInputFiles(files);
}

async function readyTiles(page: Page, count: number) {
  const tiles = page.locator('[data-testid="capture-photo-tile"][data-state="ready"]');
  await expect(tiles).toHaveCount(count, { timeout: 30_000 });
  await expect
    .poll(() => page.$$eval('[data-testid="capture-photo-img"]', (imgs) => imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  return tiles;
}

/** Types on the keypad buttons: digits, `.` = separator key, `<` = backspace. */
async function keys(page: Page, sequence: string) {
  for (const key of sequence) {
    const id = key === '.' ? 'keypad-key-separator' : key === '<' ? 'keypad-key-backspace' : `keypad-key-${key}`;
    await page.getByTestId(id).click();
  }
}

async function enterMeasurements(page: Page, length: string, width: string, height: string) {
  await page.getByTestId('capture-length').click();
  await expect(page.getByTestId('keypad-sheet')).toBeVisible();
  for (const value of [length, width, height]) {
    await page.getByTestId('keypad-clear').click();
    await keys(page, value);
    await page.getByTestId('keypad-next').click();
  }
  await expect(page.getByTestId('keypad-sheet')).toBeHidden();
}

async function noTextInputs(page: Page) {
  return page.evaluate(() => ({
    inputs: document.querySelectorAll('input:not([type="file"]), textarea, [contenteditable="true"]').length,
    active: document.activeElement?.tagName ?? '',
  }));
}

test('Home CTA opens the empty Capture screen; no draft is created before the first save', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') posts.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await setLocaleCookie(page.context(), 'en');
  await page.goto('/');
  await page.getByTestId('home-cta-start').click();
  await page.waitForURL(`${ORIGIN}${CAPTURE}`);
  await expect(page.getByTestId('capture-screen')).toHaveAttribute('data-phase', 'ready');
  const m = capture('en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.title);
  await expect(page.getByTestId('capture-photo-tile')).toHaveCount(0);
  await expect(page.getByTestId('capture-continue')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('capture-continue')).toHaveAttribute('aria-describedby', 'capture-continue-hint');
  await expect(page.getByTestId('capture-continue-hint')).toHaveText(m.continueHint);
  await expect(page.getByTestId('capture-length')).toContainText('0.00');
  await page.screenshot({ path: 'test-results/capture/1-empty.png' });
  expect(posts).toEqual([]);
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'bm_draft')).toBe(false);
  // Clicking the disabled Continue goes nowhere (Playwright treats aria-disabled as disabled).
  await page.getByTestId('capture-continue').dispatchEvent('click');
  await expect(page).toHaveURL(`${ORIGIN}${CAPTURE}`);
});

test('two photos and es measurements survive a reload; the draft identity is private', async ({ page, browser }) => {
  await open(page, 'es');
  const m = capture('es');
  await upload(page, [fixture('kitchen-1.jpg'), fixture('kitchen-2.jpg')]);
  await readyTiles(page, 2);
  await enterMeasurements(page, '4.2', '3.1', '2.6');
  await expect(page.getByTestId('capture-length')).toContainText('4,20');
  await expect(page.getByTestId('capture-width')).toContainText('3,10');
  await expect(page.getByTestId('capture-height')).toContainText('2,60');
  await expect(page.getByTestId('capture-save-status')).toHaveText(m.save.saved);
  await expect(page.getByTestId('capture-continue')).toHaveAttribute('aria-disabled', 'false');
  await page.screenshot({ path: 'test-results/capture/2-filled-es.png', fullPage: true });

  const before = await page.locator('[data-testid="capture-photo-tile"]').evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-photo-id')));
  await page.reload();
  await expect(page.getByTestId('capture-screen')).toHaveAttribute('data-phase', 'ready');
  await readyTiles(page, 2);
  const after = await page.locator('[data-testid="capture-photo-tile"]').evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-photo-id')));
  expect(after).toEqual(before);
  await expect(page.getByTestId('capture-length')).toContainText('4,20');
  await expect(page.getByTestId('capture-width')).toContainText('3,10');
  await expect(page.getByTestId('capture-height')).toContainText('2,60');
  const draft = JSON.parse((await pageFetch(page, CURRENT)).body) as { measurements: unknown; photos: Array<{ position: number }> };
  expect(draft.measurements).toEqual({ lengthCm: 420, widthCm: 310, heightCm: 260 });
  expect(draft.photos.map((photo) => photo.position)).toEqual([0, 1]);

  // Private and unforgeable identity.
  const cookie = (await page.context().cookies()).find((c) => c.name === 'bm_draft');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  const token = cookie?.value ?? '';
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await page.evaluate(() => document.cookie)).not.toContain('bm_draft');
  expect(await page.content()).not.toContain(token);
  expect((await pageFetch(page, CAPTURE)).body).not.toContain(token);

  const other = await newContext(browser, { locale: 'en-US', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const otherBlocked = await guardLocalhost(other, [ORIGIN]);
  const second = await other.newPage();
  try {
    await open(second, 'en');
    await expect(second.getByTestId('capture-photo-tile')).toHaveCount(0);
    await expect(second.getByTestId('capture-length')).toContainText('0.00');
    // A forged X-Draft-Token is dropped by the proxy.
    expect((await pageFetch(second, CURRENT, { headers: { 'x-draft-token': token } })).status).toBe(404);
    // Foreign photo ids give 404 (content and DELETE), also once this browser has its own draft.
    expect((await pageFetch(second, '/api/kitchen-projects/drafts', { method: 'POST' })).status).toBe(201);
    const photoId = before[0] ?? '';
    expect((await pageFetch(second, `${CURRENT}/photos/${photoId}/content?variant=thumb`)).status).toBe(404);
    expect((await pageFetch(second, `${CURRENT}/photos/${photoId}`, { method: 'DELETE' })).status).toBe(404);
    expect(otherBlocked).toEqual([]);
  } finally {
    await other.close();
  }
  // The first draft is untouched.
  expect(JSON.parse((await pageFetch(page, CURRENT)).body).photos).toHaveLength(2);
});

test('CSRF: unsafe draft calls and the start route need a same-origin Origin', async ({ page, playwright }) => {
  await open(page);
  expect((await pageFetch(page, '/api/kitchen-projects/drafts', { method: 'POST' })).status).toBe(201);
  const token = (await page.context().cookies()).find((c) => c.name === 'bm_draft')?.value ?? '';
  const api = await playwright.request.newContext({ baseURL: ORIGIN });
  try {
    const cookie = `bm_draft=${token}`;
    for (const origin of [undefined, 'http://evil.example']) {
      const headers: Record<string, string> = { cookie, 'content-type': 'application/json' };
      if (origin) headers.origin = origin;
      expect((await api.put(`${CURRENT}/measurements`, { headers, data: { lengthCm: 400, widthCm: 300, heightCm: 250 } })).status()).toBe(403);
      expect((await api.delete(`${CURRENT}/photos/00000000-0000-4000-8000-000000000000`, { headers })).status()).toBe(403);
      expect((await api.post('/api/kitchen-projects/drafts', { headers })).status()).toBe(403);
    }
    expect((await api.put(`${CURRENT}/measurements`, { headers: { cookie, origin: ORIGIN }, data: { lengthCm: 400, widthCm: 300, heightCm: 250 } })).status()).toBe(200);
  } finally {
    await api.dispose();
  }
});

test('HEIC upload shows the server thumbnail', async ({ page }) => {
  await open(page);
  await upload(page, fixture('kitchen-3.heic'));
  const tiles = await readyTiles(page, 1);
  const img = tiles.first().getByTestId('capture-photo-img');
  await expect(img).toHaveAttribute('alt', 'Kitchen photo 1');
  expect(await img.evaluate((el) => [(el as HTMLImageElement).naturalWidth, (el as HTMLImageElement).naturalHeight])).toEqual([512, 384]);
});

test('photo errors: client pre-check (too large, unsupported) and server 422, with Remove; 503 offers Retry', async ({ page }) => {
  await open(page);
  const m = capture('en');
  await upload(page, [
    { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(15 * 1024 * 1024 + 1, 0xff) },
    { name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
  ]);
  const large = page.locator('[data-testid="capture-photo-tile"][data-error="photo_too_large"]');
  const unsupported = page.locator('[data-testid="capture-photo-tile"][data-error="photo_unsupported_type"]');
  await expect(large).toContainText(m.photos.errors.tooLarge);
  await expect(unsupported).toContainText(m.photos.errors.unsupported);
  await expect(large.getByTestId('capture-photo-retry')).toHaveCount(0);

  // A real JPEG that is too small: rejected by the server (422).
  const small = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#c86';
      ctx.fillRect(0, 0, 300, 200);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await (blob as Blob).arrayBuffer()));
  });
  await upload(page, { name: 'small.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(small) });
  await expect(page.locator('[data-testid="capture-photo-tile"][data-error="photo_too_small"]')).toContainText(m.photos.errors.tooSmall);

  // Storage unavailable (503): retryable tile error.
  await page.route('**/api/kitchen-projects/drafts/current/photos', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Service Unavailable', code: 'storage_unavailable' }) }),
  );
  await upload(page, fixture('kitchen-1.jpg'));
  const failed = page.locator('[data-testid="capture-photo-tile"][data-error="storage_unavailable"]');
  await expect(failed).toContainText(m.photos.errors.failed);
  await page.screenshot({ path: 'test-results/capture/4-tile-errors.png', fullPage: true });
  await page.unroute('**/api/kitchen-projects/drafts/current/photos');
  await failed.getByTestId('capture-photo-retry').click();
  await readyTiles(page, 1);

  for (const locator of [large, unsupported]) await locator.getByTestId('capture-photo-remove').click();
  await expect(page.locator('[data-testid="capture-photo-tile"][data-state="error"]')).toHaveCount(1);
  expect(await smallTargets(page)).toEqual([]);
});

test('measurement keypad: rules, keyboard, and no system keyboard', async ({ page }) => {
  await open(page);
  const m = capture('en');
  expect(await noTextInputs(page)).toMatchObject({ inputs: 0 });
  for (const id of ['capture-length', 'capture-width', 'capture-height']) {
    expect(await page.getByTestId(id).evaluate((el) => el.tagName)).toBe('BUTTON');
  }
  await page.getByTestId('capture-width').click();
  const sheet = page.getByTestId('keypad-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('keypad-tab-widthCm')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('capture-width')).toHaveClass(/outline-focus/);
  const value = page.getByTestId('keypad-value');
  const next = page.getByTestId('keypad-next');
  const hint = page.getByTestId('keypad-hint');

  // Empty: error row, Next disabled.
  await expect(hint).toHaveAttribute('data-state', 'error');
  await expect(next).toBeDisabled();
  // Digits, one separator, at most 2 decimals.
  await keys(page, '3.2.55');
  await expect(value).toHaveText('3.25');
  await expect(hint).toHaveAttribute('data-state', 'valid');
  await expect(next).toBeEnabled();
  await expect(next).toHaveText(m.keypad.next.replace('{field}', m.measurements.fields.heightCm));
  // Backspace, then out of range.
  await keys(page, '<<<<');
  await expect(value).toHaveText('');
  await keys(page, '.5');
  await expect(value).toHaveText('0.5');
  await expect(hint).toHaveAttribute('data-state', 'error');
  await expect(hint).toHaveText('Between 1.00 m and 20.00 m.');
  await expect(next).toBeDisabled();
  // + clamps into the range; long press on backspace clears.
  await page.getByTestId('keypad-increase').click();
  await expect(value).toHaveText('1');
  await page.getByTestId('keypad-decrease').click();
  await expect(value).toHaveText('1');
  const backspace = await page.getByTestId('keypad-key-backspace').boundingBox();
  if (!backspace) throw new Error('no backspace key');
  await page.mouse.move(backspace.x + backspace.width / 2, backspace.y + backspace.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(value).toHaveText('');
  // Hold + to repeat.
  const plus = await page.getByTestId('keypad-increase').boundingBox();
  if (!plus) throw new Error('no + key');
  await page.mouse.move(plus.x + plus.width / 2, plus.y + plus.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  expect(Number((await value.textContent()) ?? '0')).toBeGreaterThan(1.03);

  // Physical keyboard: digits, separator, Backspace, Enter = Next.
  await page.getByTestId('keypad-clear').click();
  await page.keyboard.type('3,105');
  await expect(value).toHaveText('3.10');
  await page.keyboard.press('Backspace');
  await expect(value).toHaveText('3.1');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('keypad-tab-heightCm')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('keypad-tab-widthCm')).toContainText('3.1 m');
  // Tabs keep values; an invalid edit is discarded on Close (Escape).
  await keys(page, '9');
  await page.getByTestId('keypad-tab-lengthCm').click();
  await keys(page, '4');
  await expect(page.getByTestId('keypad-tab-heightCm')).toContainText('9 m');
  await page.getByTestId('keypad-tab-heightCm').click();
  await expect(value).toHaveText('9');
  expect(await noTextInputs(page)).toMatchObject({ inputs: 0 });
  expect((await noTextInputs(page)).active).not.toBe('INPUT');
  await page.screenshot({ path: 'test-results/capture/3-keypad.png' });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('capture-width')).toContainText('3.10');
  await expect(page.getByTestId('capture-length')).toContainText('4.00');
  await expect(page.getByTestId('capture-height')).toContainText('0.00');
  // Without photos Continue stays disabled, so the bar shows the hint (design frame 1), not "Saved".
  await expect(page.getByTestId('capture-continue-hint')).toHaveText(m.continueHint);
  await expect.poll(async () => JSON.parse((await pageFetch(page, CURRENT)).body).measurements).toEqual({ lengthCm: 400, widthCm: 310, heightCm: null });

  // cm mode: whole numbers, separator disabled, values converted.
  await page.getByTestId('capture-unit-cm').click();
  await expect(page.getByTestId('capture-width')).toContainText('310');
  await expect(page.getByTestId('capture-range-hint')).toHaveText('Length and width between 100 and 2000 cm · height between 180 and 600 cm');
  await page.getByTestId('capture-height').click();
  await expect(page.getByTestId('keypad-key-separator')).toHaveAttribute('aria-disabled', 'true');
  await keys(page, '25');
  // aria-disabled separator: a click (and the keyboard separator) does nothing in cm.
  await page.getByTestId('keypad-key-separator').dispatchEvent('click');
  await page.keyboard.type(',');
  await keys(page, '0');
  await expect(value).toHaveText('250');
  await expect(next).toHaveText(m.keypad.done);
  await next.click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('capture-height')).toContainText('250');
  await expect.poll(async () => JSON.parse((await pageFetch(page, CURRENT)).body).measurements).toEqual({ lengthCm: 400, widthCm: 310, heightCm: 250 });
  await expect(page.getByTestId('capture-continue')).toHaveAttribute('aria-disabled', 'true');
});

test('remove a photo, Continue to the Moodboard screen', async ({ page }) => {
  await open(page);
  await upload(page, [fixture('kitchen-1.jpg'), fixture('kitchen-2.jpg')]);
  const tiles = await readyTiles(page, 2);
  const secondId = await tiles.nth(1).getAttribute('data-photo-id');
  await enterMeasurements(page, '4.2', '3.1', '2.6');
  await expect(page.getByTestId('capture-continue')).toHaveAttribute('aria-disabled', 'false');

  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await readyTiles(page, 1);
  await page.reload();
  const remaining = await readyTiles(page, 1);
  expect(await remaining.first().getAttribute('data-photo-id')).toBe(secondId);
  expect(JSON.parse((await pageFetch(page, CURRENT)).body).photos.map((p: { id: string; position: number }) => [p.id, p.position])).toEqual([[secondId, 0]]);

  await page.getByTestId('capture-continue').click();
  await page.waitForURL(`${ORIGIN}/kitchen-projects/new/moodboard`);
  await expect(page.getByTestId('moodboard-screen')).toHaveAttribute('data-phase', 'ready');
  expect((await page.request.get('/kitchen-projects/new/moodboard')).status()).toBe(200);

  await page.goto(CAPTURE);
  await readyTiles(page, 1);
  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(page.getByTestId('capture-photo-tile')).toHaveCount(0);
  await expect(page.getByTestId('capture-continue')).toHaveAttribute('aria-disabled', 'true');
});

test('offline: cached shell, offline alert, controls disabled; back online reloads the draft', async ({ page, context }) => {
  await open(page);
  await upload(page, fixture('kitchen-1.jpg'));
  await readyTiles(page, 1);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await readyTiles(page, 1);

  await context.setOffline(true);
  try {
    await page.reload();
    const m = capture('en');
    await expect(page.getByTestId('capture-offline')).toHaveText(m.alerts.offline);
    await expect(page.getByTestId('capture-add-photo')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('capture-length')).toBeDisabled();
    await expect(page.getByTestId('capture-unit-cm')).toBeDisabled();
    await expect(page.getByTestId('capture-continue')).toHaveAttribute('aria-disabled', 'true');
    await page.screenshot({ path: 'test-results/capture/6-offline.png' });
  } finally {
    await context.setOffline(false);
  }
  await expect(page.getByTestId('capture-offline')).toHaveCount(0);
  await readyTiles(page, 1);
});

test('API unreachable (proxy 502) shows the unavailable state', async ({ page }) => {
  await page.route(`**${CURRENT}`, (route) => route.fulfill({ status: 502, contentType: 'application/json', body: '{"status":"error"}' }));
  await open(page);
  await expect(page.getByTestId('capture-offline')).toBeVisible();
  await expect(page.getByTestId('capture-add-photo')).toHaveAttribute('aria-disabled', 'true');
});

test('a draft that disappeared shows the expired notice; the next save starts a new draft', async ({ page }) => {
  // This browser had a draft (marker) but holds no live one: the API answers 404.
  await setLocaleCookie(page.context(), 'en');
  await page.goto('/language');
  await page.evaluate(() => window.localStorage.setItem('bm_draft_started', '1'));
  await page.goto(CAPTURE);
  const m = capture('en');
  await expect(page.getByTestId('capture-expired')).toHaveText(m.alerts.expired);
  await page.screenshot({ path: 'test-results/capture/7-expired.png' });
  await page.getByTestId('capture-expired-dismiss').click();
  await expect(page.getByTestId('capture-expired')).toHaveCount(0);
  await enterMeasurements(page, '5', '4', '2.5');
  await expect.poll(async () => JSON.parse((await pageFetch(page, CURRENT)).body).measurements).toEqual({ lengthCm: 500, widthCm: 400, heightCm: 250 });
  expect((await page.context().cookies()).some((c) => c.name === 'bm_draft')).toBe(true);
});

for (const [width, height, locales] of [
  [390, 844, ['en', 'es'] as Locale[]],
  [360, 780, ['de', 'fi'] as Locale[]],
] as const) {
  for (const locale of locales) {
    test(`layout ${width}x${height} ${locale}: no overflow, 44 px targets, sticky Continue, keypad fits`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, locale);
      const check = async () => {
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
        await expect(page.getByTestId('capture-continue')).toBeInViewport();
      };
      await check();
      await upload(page, [fixture('kitchen-1.jpg'), fixture('kitchen-2.jpg')]);
      await readyTiles(page, 2);
      await enterMeasurements(page, '4.2', '3.1', '2.6');
      await check();
      const tile = await page.getByTestId('capture-photo-tile').first().boundingBox();
      expect(Math.round((tile?.width ?? 0) / (tile?.height ?? 1) * 100) / 100).toBeCloseTo(4 / 3, 1);
      expect(Math.round(tile?.width ?? 0)).toBe((width - 32 - 16) / 2);
      await page.screenshot({ path: `test-results/capture/layout-${width}-${locale}.png`, fullPage: true });
      await page.getByTestId('capture-height').click();
      await expect(page.getByTestId('keypad-next')).toBeInViewport();
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTargets(page)).toEqual([]);
      await page.screenshot({ path: `test-results/capture/keypad-${width}-${locale}.png` });
    });
  }
}
