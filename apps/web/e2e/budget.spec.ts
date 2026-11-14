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

// Feature budget-tier-computation, Scenario 6: the Budget Tier Overview with the fake LLM
// (AI_ADAPTERS=fake in the compose api; the fake Budget is derived from the real Catalog chunks, so the
// sample Catalog must be ingested: docker compose --profile rag up -d --wait embedder and
// ./scripts/catalog/ingest.sh infra/catalog/samples). The claim with intent=budget lands on /budget and
// starts the first Budget automatically.
test.use({ locale: 'en-US' });

const WEB = new URL(baseURL()).origin;
const GENERATE = '/kitchen-projects/new/generate';
const DRAFTS = '/api/kitchen-projects/drafts';
const CURRENT = `${DRAFTS}/current`;
const BUDGET_URL = /\/kitchen-projects\/([0-9a-f-]{36})\/budget$/;
const TIERS = ['luxury', 'high', 'medium', 'low'] as const;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

interface BudgetMessages {
  back: string;
  title: string;
  helper: string;
  titleActive: string;
  helperActive: string;
  tiers: Record<(typeof TIERS)[number], string>;
  meta: string;
  citation: string;
  more: string;
  totals: Record<'subtotal' | 'vat' | 'total', string>;
  history: { title: string; counter: string; item: string };
  status: Record<'running' | 'queued' | 'ahead', string>;
  hints: Record<'oneAtATime' | 'limit', string>;
  empty: { title: string; helper: string };
  cta: Record<'again' | 'retry' | 'start' | 'back', string>;
  alerts: Record<'failed' | 'interrupted' | 'catalogEmpty' | 'searchDown' | 'queueFull' | 'incomplete' | 'offline', string>;
}
const bm = (locale: Locale) => (messages(locale) as unknown as { budget: BudgetMessages }).budget;
const fill = (message: string, values: Record<string, string | number>) => message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const money = (cents: number, locale: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
/** ICU plural in the messages, evaluated for English (`one`/`other`) and the German/Finnish labels used here. */
const icu = (message: string, count: number) => {
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

async function seedDraft(page: Page): Promise<string> {
  await setLocaleCookie(page.context(), 'en');
  await page.goto('/language');
  const start = await pageFetch(page, DRAFTS, { method: 'POST' });
  expect(start.status).toBe(201);
  const id = (JSON.parse(start.body) as { draft: { id: string } }).draft.id;
  expect(await apiUpload(page, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
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

interface ApiBudget {
  id: string;
  status: string;
  tiers: Array<{ tier: string; subtotalCents: number; vatCents: number; totalCents: number; items: Array<{ name: string; sku: string; catalogName: string; pageNumber: number; unit: string; quantity: string; quotedPrice: string; unitPriceCents: number; subtotalCents: number }> }>;
}

test.describe.serial('Budget Tier Overview (fake LLM)', () => {
  test.setTimeout(150_000);

  test('Scenario 6: claim with intent=budget starts a Budget; running then four tier cards; expansion shows items, citations and totals; Calculate again; history; layouts', async ({ page, request }) => {
    const en = bm('en');
    const draftId = await seedDraft(page);
    await page.goto(GENERATE);
    await page.getByTestId('generate-budget').click();
    await page.getByTestId('login-gate-sign-in').click();
    await keycloakSignIn(page, request);
    await page.waitForURL(BUDGET_URL, { timeout: 30_000 });
    expect(BUDGET_URL.exec(new URL(page.url()).pathname)?.[1]).toBe(draftId);
    const projectId = draftId;

    // Active (or already done: the fake LLM is fast): the first Budget started once and the query is stripped.
    await expect(page.getByTestId('budget-tiers')).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).search).toBe('');
    const first = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}/budgets`)).body) as { budgets: ApiBudget[]; maxBudgets: number };
    expect(first.budgets).toHaveLength(1);
    expect(first.maxBudgets).toBe(5);
    const budget = first.budgets[0] as ApiBudget;
    expect(budget.status).toBe('succeeded');

    // Collapsed: four cards in order, totals from the API cents, one-per-card meta, no selection control.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.title);
    await expect(page.getByTestId('budget-helper')).toHaveText(en.helper);
    await expect(page.locator('[data-testid^="budget-card-"]')).toHaveCount(4);
    for (const [index, tier] of TIERS.entries()) {
      const api = budget.tiers[index] as ApiBudget['tiers'][number];
      expect(api.tier).toBe(tier);
      await expect(page.getByTestId(`budget-tier-${tier}`)).toContainText(en.tiers[tier]);
      await expect(page.getByTestId(`budget-tier-${tier}`)).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByTestId(`budget-total-${tier}`)).toHaveText(money(api.totalCents, 'en'));
      await expect(page.getByTestId(`budget-tier-${tier}`)).toContainText(icu(en.meta, api.items.length));
    }
    await expect(page.getByTestId('budget-again')).toHaveText(en.cta.again);
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('budget-back-project')).toHaveText(en.cta.back);
    await expect(page.getByTestId('budget-back')).toHaveAttribute('aria-label', en.back);
    await expect(page.getByTestId('budget-history')).toHaveCount(0); // needs two Budgets
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/1-succeeded-en.png' });

    // Expansion: Line Items with price x quantity and the citation; totals block from the API.
    const luxury = budget.tiers[0] as ApiBudget['tiers'][number];
    await page.getByTestId('budget-tier-luxury').click();
    await expect(page.getByTestId('budget-tier-luxury')).toHaveAttribute('aria-expanded', 'true');
    const items = page.getByTestId('budget-items-luxury');
    await expect(items).toBeVisible();
    const shownCount = Math.min(3, luxury.items.length);
    await expect(items.locator('[data-testid^="budget-item-"]')).toHaveCount(shownCount);
    for (const [index, item] of luxury.items.slice(0, shownCount).entries()) {
      const row = items.getByTestId(`budget-item-${index}`);
      await expect(row).toContainText(item.name);
      await expect(row).toContainText(money(item.subtotalCents, 'en'));
      await expect(row).toContainText(`SKU ${item.sku}`);
      await expect(row).toContainText(money(item.unitPriceCents, 'en'));
      await expect(items.getByTestId(`budget-source-${index}`)).toHaveText(fill(en.citation, { catalog: item.catalogName, page: item.pageNumber }));
    }
    const totals = page.getByTestId('budget-totals-luxury');
    await expect(totals).toContainText(en.totals.subtotal);
    await expect(totals).toContainText(fill(en.totals.vat, { percent: 21 }));
    await expect(totals).toContainText(en.totals.total);
    await expect(totals).toContainText(money(luxury.subtotalCents, 'en'));
    await expect(totals).toContainText(money(luxury.vatCents, 'en'));
    await expect(totals).toContainText(money(luxury.totalCents, 'en'));
    expect(luxury.subtotalCents + luxury.vatCents).toBe(luxury.totalCents);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/2-expanded-en.png' });
    // Opening another tier does not close this one.
    await page.getByTestId('budget-tier-low').click();
    await expect(page.getByTestId('budget-tier-luxury')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('budget-tier-low')).toHaveAttribute('aria-expanded', 'true');
    await page.getByTestId('budget-tier-luxury').click();
    await expect(page.getByTestId('budget-items-luxury')).toHaveCount(0);

    // Calculate again: a second Budget (the queued/running card, the disabled CTA and its hint), then two in the history.
    await page.getByTestId('budget-again').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(new RegExp(`${escape(en.titleActive)}|${escape(en.title)}`));
    await expect(page.getByTestId('budget-history')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('budget-history-item')).toHaveCount(2);
    await expect(page.getByTestId('budget-history-count')).toHaveText(fill(en.history.counter, { count: 2, max: 5 }));
    await expect(page.getByTestId('budget-history-item').first()).toHaveAttribute('aria-current', 'true');
    const second = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}/budgets`)).body) as { budgets: ApiBudget[] };
    expect(second.budgets).toHaveLength(2);
    // Same fake prompt, same Line Items: equal tier totals.
    expect(second.budgets[0]?.tiers.map((t) => t.totalCents)).toEqual(second.budgets[1]?.tiers.map((t) => t.totalCents));
    await page.getByTestId('budget-history-item').nth(1).click();
    await expect(page.getByTestId('budget-history-item').nth(1)).toHaveAttribute('aria-current', 'true');

    // Layouts: 390x844 es, 360x780 de and fi (tiers expanded for the long labels).
    for (const [locale, width, height] of [['es', 390, 844], ['de', 360, 780], ['fi', 360, 780]] as const) {
      await page.setViewportSize({ width, height });
      await setLocaleCookie(page.context(), locale);
      await page.goto(`/kitchen-projects/${projectId}/budget`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(bm(locale).title);
      await page.getByTestId('budget-tier-luxury').click();
      await expect(page.getByTestId('budget-totals-luxury')).toContainText(fill(bm(locale).totals.vat, { percent: 21 }));
      await expect(page.getByTestId('budget-total-luxury')).toHaveText(money(luxury.totalCents, locale === 'es' ? 'es' : locale));
      await checkLayout(page);
      await page.screenshot({ path: `test-results/budget/succeeded-${locale}-${width}.png`, fullPage: true });
    }

    // The owned page now offers "See my budget" and opens the Budget page.
    await page.setViewportSize({ width: 390, height: 844 });
    await setLocaleCookie(page.context(), 'en');
    await page.goto(`/kitchen-projects/${projectId}`);
    const project = (messages('en') as unknown as { project: { seeBudget: string; helper: string } }).project;
    await expect(page.getByTestId('project-budget')).toHaveText(project.seeBudget);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('href', `/kitchen-projects/${projectId}/budget`);
    await expect(page.getByTestId('project-budgets-soon')).toHaveCount(0);
    await expect(page.getByText(project.helper)).toBeVisible();
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/owned-see-budget-en.png' });
    await page.getByTestId('project-budget').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}/budget`);
    await expect(page.getByTestId('budget-tiers')).toBeVisible();
    await page.getByTestId('budget-back-project').click();
    await page.waitForURL(`${WEB}/kitchen-projects/${projectId}`);
  });
});

// The remaining designed states, with the API answers mocked in the browser (no session needed).
test.describe('Budget states (mocked API)', () => {
  const PID = '11111111-1111-4111-8111-111111111111';
  const item = (n: number) => ({
    name: `Product ${n}`,
    sku: `BM-SYN-TST-${n}`,
    catalogName: 'Sample Catalog',
    pageNumber: n,
    unit: 'unit',
    quantity: '2.5',
    quotedPrice: '189.90',
    unitPriceCents: 18990,
    subtotalCents: 47475,
  });
  const tier = (name: string, count: number) => ({ tier: name, subtotalCents: 1000000 + count, vatCents: 210000, totalCents: 1210000 + count, items: Array.from({ length: count }, (_, i) => item(i + 1)) });
  const budgetView = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    status,
    position: null,
    waitingFor: null,
    currency: 'EUR',
    vatPercent: 21,
    errorCode: null,
    createdAt: `2026-11-17T10:00:0${id.slice(-1)}.000Z`,
    startedAt: null,
    finishedAt: null,
    lineItemsCount: status === 'succeeded' ? 20 : 0,
    tiers: status === 'succeeded' ? [tier('luxury', 5), tier('high', 5), tier('medium', 5), tier('low', 5)] : [],
    ...extra,
  });

  async function mock(page: Page, budgets: unknown[], options: { max?: number; post?: { status: number; body: unknown }; one?: unknown } = {}) {
    await page.route(`${WEB}/api/kitchen-projects/${PID}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/budget') && route.request().method() === 'POST') {
        const post = options.post ?? { status: 503, body: {} };
        return route.fulfill({ status: post.status, contentType: 'application/json', body: JSON.stringify(post.body) });
      }
      if (url.pathname.endsWith('/budgets')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ budgets, maxBudgets: options.max ?? 5 }) });
      if (/\/budgets\/[^/]+$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(options.one ?? budgets[0]) });
      return route.fallback();
    });
  }

  test('first run, queued with the position, failed and interrupted, long list, limit, and the start alerts', async ({ page, context }) => {
    const en = bm('en');
    await setLocaleCookie(context, 'en');

    await mock(page, []);
    await page.goto(`/kitchen-projects/${PID}/budget`);
    await expect(page.getByTestId('budget-empty')).toBeVisible();
    await expect(page.getByTestId('budget-empty')).toContainText(en.empty.title);
    await expect(page.getByTestId('budget-empty-helper')).toHaveText(en.empty.helper);
    await expect(page.getByTestId('budget-start')).toHaveText(en.cta.start);
    await expect(page.getByTestId('budget-start')).toHaveAttribute('aria-disabled', 'false');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/3-first-run-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [budgetView('b1', 'queued', { position: 2, waitingFor: 'llm' })]);
    await page.goto(`/kitchen-projects/${PID}/budget`);
    await expect(page.getByTestId('budget-status')).toHaveAttribute('data-status', 'queued');
    await expect(page.getByTestId('budget-status')).toContainText(en.status.queued);
    await expect(page.getByTestId('budget-position')).toHaveText('2 jobs ahead of yours');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.titleActive);
    await expect(page.getByTestId('budget-hint')).toHaveText(en.hints.oneAtATime);
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'true');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/4-queued-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [budgetView('b1', 'running')]);
    await page.goto(`/kitchen-projects/${PID}/budget`);
    await expect(page.getByTestId('budget-status')).toHaveAttribute('data-status', 'running');
    await expect(page.getByTestId('budget-placeholder')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('budget-status')).toContainText(en.status.running);
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [budgetView('b2', 'failed', { errorCode: 'verification_failed', finishedAt: '2026-11-17T10:01:00.000Z' }), budgetView('b1', 'succeeded')]);
    await page.goto(`/kitchen-projects/${PID}/budget`);
    await expect(page.getByTestId('budget-failed')).toHaveText(new RegExp(escape(en.alerts.failed)));
    await expect(page.getByTestId('budget-tiers')).toHaveCount(0);
    await expect(page.getByTestId('budget-retry')).toHaveText(en.cta.retry);
    await expect(page.getByTestId('budget-retry')).toHaveAttribute('aria-disabled', 'false');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/5-failed-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [budgetView('b2', 'failed', { errorCode: 'interrupted' })], { post: { status: 429, body: { statusCode: 429, code: 'gpu_queue_full' } } });
    await page.goto(`/kitchen-projects/${PID}/budget`);
    await expect(page.getByTestId('budget-failed')).toHaveText(new RegExp(escape(en.alerts.interrupted)));
    await page.getByTestId('budget-retry').click();
    await expect(page.getByTestId('budget-alert-queueFull')).toHaveText(new RegExp(escape(en.alerts.queueFull)));
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    for (const [post, alert, text] of [
      [{ status: 409, body: { statusCode: 409, code: 'catalog_empty' } }, 'catalogEmpty', en.alerts.catalogEmpty],
      [{ status: 503, body: { statusCode: 503, code: 'embedding_unavailable' } }, 'searchDown', en.alerts.searchDown],
      [{ status: 409, body: { statusCode: 409, code: 'project_incomplete' } }, 'incomplete', en.alerts.incomplete],
    ] as const) {
      await mock(page, [], { post });
      await page.goto(`/kitchen-projects/${PID}/budget`);
      await page.getByTestId('budget-start').click();
      await expect(page.getByTestId(`budget-alert-${alert}`)).toHaveText(new RegExp(escape(text)));
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }

    // Long list: the first 3 items, "+ N more items" reveals the rest; the limit disables the CTA with its hint.
    await mock(page, [budgetView('b2', 'succeeded'), budgetView('b1', 'succeeded')], { max: 2 });
    await page.goto(`/kitchen-projects/${PID}/budget`);
    await page.getByTestId('budget-tier-high').click();
    await expect(page.getByTestId('budget-items-high').locator('[data-testid^="budget-item-"]')).toHaveCount(3);
    await expect(page.getByTestId('budget-more-high')).toHaveText(icu(en.more, 2));
    await page.getByTestId('budget-more-high').click();
    await expect(page.getByTestId('budget-items-high').locator('[data-testid^="budget-item-"]')).toHaveCount(5);
    await expect(page.getByTestId('budget-more-high')).toHaveCount(0);
    await expect(page.getByTestId('budget-source-4')).toHaveText(fill(en.citation, { catalog: 'Sample Catalog', page: 5 }));
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('budget-hint')).toHaveText(fill(en.hints.limit, { max: 2 }));
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/6-limit-en.png' });

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByTestId('budget-offline')).toHaveText(new RegExp(escape(en.alerts.offline)));
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'true');
    await context.setOffline(false);
  });

  test('signed out and not found', async ({ page, context }) => {
    await setLocaleCookie(context, 'en');
    await page.goto(`/kitchen-projects/${PID}/budget`);
    await expect(page.getByTestId('budget-signed-out')).toBeVisible();
    await expect(page.getByTestId('budget-sign-in')).toHaveAttribute('href', `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${PID}/budget`)}`);
    await page.route(`${WEB}/api/kitchen-projects/${PID}**`, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"statusCode":404,"message":"Not Found"}' }));
    await page.goto(`/kitchen-projects/${PID}/budget`);
    await expect(page.getByTestId('budget-not-found')).toBeVisible();
    expect((await page.request.get('/kitchen-projects/not-a-uuid/budget')).status()).toBe(404);
  });
});
