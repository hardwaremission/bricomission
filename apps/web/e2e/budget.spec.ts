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

// Feature simulations-ux-overhaul, phase E2: the Budget for the selected Simulation, fake adapters
// (AI_ADAPTERS=fake in the compose api; the fake Budget is derived from the real Catalog chunks, so the
// sample Catalog must be ingested: docker compose --profile rag up -d --wait embedder and
// ./scripts/catalog/ingest.sh infra/catalog/samples). Live flow: claim, generate a Simulation, select it
// on the project page, get the budget, recalculate. The designed states run with the API mocked.
test.use({ locale: 'en-US' });

const WEB = new URL(baseURL()).origin;
const GENERATE = '/kitchen-projects/new/generate';
const DRAFTS = '/api/kitchen-projects/drafts';
const CURRENT = `${DRAFTS}/current`;
const PROJECT_URL = /\/kitchen-projects\/([0-9a-f-]{36})$/;
const RESULTS_URL = /\/kitchen-projects\/([0-9a-f-]{36})\/results$/;
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
  basedOn: string;
  change: string;
  relabeled: string;
  recalculating: string;
  goToSimulations: string;
  status: Record<'queued' | 'ahead' | 'reading' | 'matching', string>;
  hints: Record<'oneAtATime', string>;
  empty: { title: string; helper: string };
  cta: Record<'again' | 'retry' | 'start' | 'back', string>;
  alerts: Record<'failed' | 'interrupted' | 'catalogEmpty' | 'searchDown' | 'queueFull' | 'incomplete' | 'offline' | 'noSelection' | 'notReady', string>;
}
interface ProjectMessages {
  seeBudget: string;
  budgetReason: string;
  generateMore: string;
}
const pm = (locale: Locale) => (messages(locale) as unknown as { project: ProjectMessages }).project;
const getBudgetLabel = (locale: Locale) => (messages(locale) as unknown as { generate: { cta: { budget: string } } }).generate.cta.budget;
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

interface ApiBudget {
  id: string;
  status: string;
  tiers: Array<{ tier: string; subtotalCents: number; vatCents: number; totalCents: number; items: Array<{ name: string; sku: string; catalogName: string; pageNumber: number; unit: string; quantity: string; quotedPrice: string; unitPriceCents: number; subtotalCents: number }> }>;
}

test.describe.serial('Budget for the selected Simulation (fake adapters)', () => {
  test.setTimeout(240_000);

  test('Scenario 6: claim with intent=budget lands on the project page; generate, select, get the budget; four ordered tiers; expansion; recalculate keeps one Budget; layouts', async ({ page, request }) => {
    const en = bm('en');
    const pj = pm('en');
    const draftId = await seedDraft(page);
    await page.goto(GENERATE);
    await page.getByTestId('generate-budget').click();
    await page.getByTestId('login-gate-sign-in').click();
    await keycloakSignIn(page, request);
    // A new project has no Simulation to price, so the budget intent lands on the project page.
    await page.waitForURL(PROJECT_URL, { timeout: 30_000 });
    expect(PROJECT_URL.exec(new URL(page.url()).pathname)?.[1]).toBe(draftId);
    const projectId = draftId;
    await expect(page.getByTestId('project-claimed')).toBeVisible();
    await expect(page.getByTestId('simulations-empty')).toBeVisible();
    await expect(page.getByTestId('project-budget')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('project-budget-reason')).toHaveText(pj.budgetReason);

    // Generate the Simulation (Generate my kitchen opens AI Results and starts it).
    await page.getByTestId('project-render').click();
    await page.waitForURL(RESULTS_URL);
    await expect(page.getByTestId('results-slider')).toBeVisible({ timeout: 90_000 });
    await page.getByTestId('results-back-project').click();
    await page.waitForURL(PROJECT_URL);

    // Not selected yet: the instruction shows and the budget button stays disabled; select it.
    await expect(page.getByTestId('simulations-instruction')).toBeVisible();
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('project-budget')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('simulation-select-1').click();
    await expect(page.getByTestId('simulation-select-1')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('simulations-instruction')).toHaveCount(0);
    await expect(page.getByTestId('project-budget')).toHaveText(getBudgetLabel('en'));
    await expect(page.getByTestId('project-budget')).toHaveAttribute('href', `/kitchen-projects/${projectId}/budget?start=1`);

    // Get my budget: the first Budget starts by itself and the query is stripped.
    await page.getByTestId('project-budget').click();
    await page.waitForURL(BUDGET_URL, { timeout: 30_000 });
    await expect(page.getByTestId('budget-tiers')).toBeVisible({ timeout: 90_000 });
    expect(new URL(page.url()).search).toBe('');
    const first = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}/budgets`)).body) as { budgets: ApiBudget[] };
    expect(first.budgets).toHaveLength(1);
    const budget = first.budgets[0] as ApiBudget;
    expect(budget.status).toBe('succeeded');
    // Strictly ordered in code: Luxury > High > Medium > Low.
    const totals = budget.tiers.map((tier) => tier.totalCents);
    expect(budget.tiers.map((tier) => tier.tier)).toEqual([...TIERS]);
    for (let i = 1; i < totals.length; i++) expect(totals[i - 1] as number).toBeGreaterThan(totals[i] as number);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.title);
    await expect(page.getByTestId('budget-helper')).toHaveText(en.helper);
    // "Based on Simulation 1" with the thumbnails of its two images and a Change link to the project page.
    await expect(page.getByTestId('budget-simulation')).toContainText(fill(en.basedOn, { n: 1 }));
    await expect(page.getByTestId('budget-simulation-thumbs').locator('img')).toHaveCount(2);
    await expect(page.getByTestId('budget-change-simulation')).toHaveText(en.change);
    await expect(page.getByTestId('budget-change-simulation')).toHaveAttribute('href', `/kitchen-projects/${projectId}`);
    await expect(page.getByTestId('budget-relabeled')).toHaveCount(0);
    await expect(page.locator('[data-testid^="budget-card-"]')).toHaveCount(4);
    for (const [index, tier] of TIERS.entries()) {
      const api = budget.tiers[index] as ApiBudget['tiers'][number];
      await expect(page.getByTestId(`budget-tier-${tier}`)).toContainText(en.tiers[tier]);
      await expect(page.getByTestId(`budget-tier-${tier}`)).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByTestId(`budget-total-${tier}`)).toHaveText(money(api.totalCents, 'en'));
      await expect(page.getByTestId(`budget-tier-${tier}`)).toContainText(icu(en.meta, api.items.length));
    }
    // Bottom bar: primary Back to my kitchen, secondary Recalculate budget; no history strip, no limit.
    await expect(page.getByTestId('budget-back-project')).toHaveText(en.cta.back);
    await expect(page.getByTestId('budget-again')).toHaveText(en.cta.again);
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('budget-back')).toHaveAttribute('aria-label', en.back);
    await expect(page.getByTestId('budget-history')).toHaveCount(0);
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
    const totalsBlock = page.getByTestId('budget-totals-luxury');
    await expect(totalsBlock).toContainText(en.totals.subtotal);
    await expect(totalsBlock).toContainText(fill(en.totals.vat, { percent: 21 }));
    await expect(totalsBlock).toContainText(money(luxury.subtotalCents, 'en'));
    await expect(totalsBlock).toContainText(money(luxury.vatCents, 'en'));
    await expect(totalsBlock).toContainText(money(luxury.totalCents, 'en'));
    expect(luxury.subtotalCents + luxury.vatCents).toBe(luxury.totalCents);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/2-expanded-en.png' });
    await page.getByTestId('budget-tier-low').click();
    await expect(page.getByTestId('budget-tier-luxury')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('budget-tier-low')).toHaveAttribute('aria-expanded', 'true');
    await page.getByTestId('budget-tier-luxury').click();
    await expect(page.getByTestId('budget-items-luxury')).toHaveCount(0);

    // Recalculate budget: still exactly one Budget afterwards (the old one is replaced on success), same fake totals.
    await page.getByTestId('budget-again').click();
    await expect(page.getByTestId('budget-tiers')).toBeVisible();
    // While it computes the old Budget is still listed (current + active); on success only the new one remains.
    await expect
      .poll(
        async () => {
          const { budgets } = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}/budgets`)).body) as { budgets: ApiBudget[] };
          return budgets.length === 1 && budgets[0]?.status === 'succeeded' && budgets[0]?.id !== budget.id;
        },
        { timeout: 90_000 },
      )
      .toBe(true);
    const second = JSON.parse((await pageFetch(page, `/api/kitchen-projects/${projectId}/budgets`)).body) as { budgets: ApiBudget[] };
    expect(second.budgets).toHaveLength(1);
    expect(second.budgets[0]?.status).toBe('succeeded');
    expect(second.budgets[0]?.tiers.map((t) => t.totalCents)).toEqual(totals);

    // Layouts: 390x844 es, 360x780 de and fi (tiers expanded for the long labels).
    for (const [locale, width, height] of [['es', 390, 844], ['de', 360, 780], ['fi', 360, 780]] as const) {
      await page.setViewportSize({ width, height });
      await setLocaleCookie(page.context(), locale);
      await page.goto(`/kitchen-projects/${projectId}/budget`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(bm(locale).title);
      await expect(page.getByTestId('budget-simulation')).toContainText(fill(bm(locale).basedOn, { n: 1 }));
      await page.getByTestId('budget-tier-luxury').click();
      await expect(page.getByTestId('budget-totals-luxury')).toContainText(fill(bm(locale).totals.vat, { percent: 21 }));
      await expect(page.getByTestId('budget-total-luxury')).toHaveText(money(luxury.totalCents, locale));
      await checkLayout(page);
      await page.screenshot({ path: `test-results/budget/succeeded-${locale}-${width}.png`, fullPage: true });
    }

    // The project page now offers "See my budget" and opens the Budget page; Back to my kitchen returns.
    await page.setViewportSize({ width: 390, height: 844 });
    await setLocaleCookie(page.context(), 'en');
    await page.goto(`/kitchen-projects/${projectId}`);
    await expect(page.getByTestId('project-budget')).toHaveText(pj.seeBudget);
    await expect(page.getByTestId('project-budget')).toHaveAttribute('href', `/kitchen-projects/${projectId}/budget`);
    await expect(page.getByTestId('project-render')).toHaveText(pj.generateMore);
    await checkLayout(page);
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
  const SID = '22222222-2222-4222-8222-222222222222';
  const item = (n: number, base = 18990) => ({
    name: `Product ${n}`,
    sku: `BM-SYN-TST-${n}`,
    catalogName: 'Sample Catalog',
    pageNumber: n,
    unit: 'unit',
    quantity: '2.5',
    quotedPrice: '189.90',
    unitPriceCents: base,
    subtotalCents: base * 3,
  });
  const tier = (name: string, count: number, total: number) => ({ tier: name, subtotalCents: total - 210000, vatCents: 210000, totalCents: total, items: Array.from({ length: count }, (_, i) => item(i + 1)) });
  /** Strictly ordered totals; `shift` makes a second Budget distinguishable from the first. */
  const tiers = (shift = 0) => [tier('luxury', 5, 986040 + shift), tier('high', 5, 721530 + shift), tier('medium', 5, 498000 + shift), tier('low', 5, 276000 + shift)];
  const budgetView = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    simulationId: SID,
    status,
    stage: status === 'succeeded' ? 'pricing' : 'inventory',
    progress: { total: 6, done: status === 'succeeded' ? 6 : 0 },
    relabeled: false,
    position: null,
    waitingFor: null,
    currency: 'EUR',
    vatPercent: 21,
    errorCode: null,
    createdAt: `2026-11-17T10:00:0${id.slice(-1)}.000Z`,
    startedAt: null,
    finishedAt: null,
    lineItemsCount: status === 'succeeded' ? 20 : 0,
    tiers: status === 'succeeded' ? tiers() : [],
    ...extra,
  });
  const render = (n: number) => ({
    id: `33333333-3333-4333-8333-33333333333${n}`,
    simulationId: SID,
    status: 'succeeded',
    photoId: null,
    photoPosition: n,
    attempts: 1,
    mode: 'canny',
    width: 1216,
    height: 832,
    position: null,
    waitingFor: null,
    errorCode: null,
    createdAt: '2026-11-17T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    beforeUrl: `/kitchen-projects/${PID}/renders/x/content?variant=before`,
    fullUrl: `/kitchen-projects/${PID}/renders/x/content?variant=full`,
    thumbUrl: `/kitchen-projects/${PID}/renders/x/content?variant=thumb`,
  });
  const simulation = (extra: Record<string, unknown> = {}) => ({
    id: SID,
    ordinal: 2,
    createdAt: '2026-11-17T09:00:00.000Z',
    status: 'succeeded',
    stage: 'finished',
    progress: { total: 6, succeeded: 6, failed: 0, current: 0 },
    selected: true,
    blendMode: 'both',
    styleDegraded: false,
    style: { keywords: [], references: [] },
    renders: [0, 1, 2, 3, 4, 5].map(render),
    budget: null,
    ...extra,
  });

  interface MockOptions {
    simulations?: unknown[];
    post?: { status: number; body: unknown };
    one?: () => unknown;
    /** Called for every GET .../budgets; return the list to answer. */
    list?: () => unknown[];
  }

  async function mock(page: Page, budgets: unknown[], options: MockOptions = {}) {
    await page.route(`${WEB}/api/kitchen-projects/${PID}/**`, async (route) => {
      const url = new URL(route.request().url());
      const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.endsWith('/budget') && route.request().method() === 'POST') {
        const post = options.post ?? { status: 503, body: {} };
        return json(post.status, post.body);
      }
      if (url.pathname.endsWith('/simulations')) return json(200, { simulations: options.simulations ?? [simulation()] });
      if (url.pathname.endsWith('/budgets')) return json(200, { budgets: options.list ? options.list() : budgets });
      if (/\/budgets\/[^/]+$/.test(url.pathname)) return json(200, options.one ? options.one() : budgets[0]);
      if (url.pathname.includes('/content')) return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
      return route.fallback();
    });
  }
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const open = (page: Page) => page.goto(`/kitchen-projects/${PID}/budget`);

  test('first run, computing stages, recalculating, relabel note, failed and interrupted, and the start alerts', async ({ page, context }) => {
    const en = bm('en');
    await setLocaleCookie(context, 'en');

    // Selected Simulation, no Budget yet: the first-run card; Back is the primary action, Get my budget the secondary one.
    await mock(page, []);
    await open(page);
    await expect(page.getByTestId('budget-empty')).toContainText(en.empty.title);
    await expect(page.getByTestId('budget-empty-helper')).toHaveText(en.empty.helper);
    await expect(page.getByTestId('budget-simulation')).toContainText(fill(en.basedOn, { n: 2 }));
    await expect(page.getByTestId('budget-simulation-thumbs').locator('img')).toHaveCount(6);
    await expect(page.getByTestId('budget-start')).toHaveText(en.cta.start);
    await expect(page.getByTestId('budget-start')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('budget-back-project')).toHaveText(en.cta.back);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/3-first-run-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // Computing: waiting for the GPU with the jobs ahead, then "Reading image n of N" with the bar, then matching products.
    await mock(page, [budgetView('b1', 'queued', { position: 2, waitingFor: 'llm' })]);
    await open(page);
    await expect(page.getByTestId('budget-status')).toHaveAttribute('data-status', 'queued');
    await expect(page.getByTestId('budget-status')).toContainText(en.status.queued);
    await expect(page.getByTestId('budget-position')).toHaveText('2 jobs ahead of yours');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.titleActive);
    await expect(page.getByTestId('budget-hint')).toHaveText(en.hints.oneAtATime);
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'true');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/4-queued-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [budgetView('b1', 'running', { stage: 'inventory', progress: { total: 6, done: 1 } })], { one: () => budgetView('b1', 'running', { stage: 'inventory', progress: { total: 6, done: 1 } }) });
    await open(page);
    await expect(page.getByTestId('budget-status')).toHaveAttribute('data-stage', 'inventory');
    await expect(page.getByTestId('budget-placeholder')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('budget-status')).toContainText(fill(en.status.reading, { n: 2, count: 6 }));
    await expect(page.getByTestId('budget-status')).toHaveAttribute('data-percent', '33');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/4b-reading-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [budgetView('b1', 'running', { stage: 'pricing', progress: { total: 6, done: 6 } })]);
    await open(page);
    await expect(page.getByTestId('budget-status')).toHaveAttribute('data-stage', 'pricing');
    await expect(page.getByTestId('budget-status')).toContainText(en.status.matching);
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // Recalculating: the previous Budget stays visible under the banner; the buttons are disabled with the hint.
    await mock(page, [budgetView('b2', 'running', { stage: 'inventory', progress: { total: 6, done: 2 } }), budgetView('b1', 'succeeded')]);
    await open(page);
    await expect(page.getByTestId('budget-recalculating')).toContainText(en.recalculating);
    await expect(page.getByTestId('budget-recalculating')).toContainText(fill(en.status.reading, { n: 3, count: 6 }));
    await expect(page.getByTestId('budget-tiers')).toBeVisible();
    await expect(page.getByTestId('budget-total-luxury')).toHaveText(money(986040, 'en'));
    await expect(page.getByTestId('budget-hint')).toHaveText(en.hints.oneAtATime);
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'true');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/4c-recalculating-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // Relabeled: the quiet note shows only then.
    await mock(page, [budgetView('b1', 'succeeded', { relabeled: true })]);
    await open(page);
    await expect(page.getByTestId('budget-relabeled')).toHaveText(en.relabeled);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/5a-relabeled-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // Failed (verification) with the old Budget kept, interrupted, queue full on retry.
    await mock(page, [budgetView('b2', 'failed', { errorCode: 'verification_failed', finishedAt: '2026-11-17T10:01:00.000Z' }), budgetView('b1', 'succeeded')]);
    await open(page);
    await expect(page.getByTestId('budget-failed')).toHaveText(new RegExp(escape(en.alerts.failed)));
    await expect(page.getByTestId('budget-tiers')).toBeVisible();
    await expect(page.getByTestId('budget-retry')).toHaveText(en.cta.retry);
    await expect(page.getByTestId('budget-retry')).toHaveAttribute('aria-disabled', 'false');
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/5-failed-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [budgetView('b2', 'failed', { errorCode: 'interrupted' })], { post: { status: 429, body: { statusCode: 429, code: 'gpu_queue_full' } } });
    await open(page);
    await expect(page.getByTestId('budget-failed')).toHaveText(new RegExp(escape(en.alerts.interrupted)));
    await page.getByTestId('budget-retry').click();
    await expect(page.getByTestId('budget-alert-queueFull')).toHaveText(new RegExp(escape(en.alerts.queueFull)));
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    for (const [post, alert, text] of [
      [{ status: 409, body: { statusCode: 409, code: 'catalog_empty' } }, 'catalogEmpty', en.alerts.catalogEmpty],
      [{ status: 503, body: { statusCode: 503, code: 'embedding_unavailable' } }, 'searchDown', en.alerts.searchDown],
      [{ status: 409, body: { statusCode: 409, code: 'project_incomplete' } }, 'incomplete', en.alerts.incomplete],
      [{ status: 409, body: { statusCode: 409, code: 'no_simulation_selected' } }, 'noSelection', en.alerts.noSelection],
      [{ status: 409, body: { statusCode: 409, code: 'simulation_not_ready' } }, 'notReady', en.alerts.notReady],
    ] as const) {
      await mock(page, [], { post });
      await open(page);
      await page.getByTestId('budget-start').click();
      await expect(page.getByTestId(`budget-alert-${alert}`)).toContainText(text);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });

  test('recalculate keeps the previous Budget until the new one succeeds, then replaces it', async ({ page, context }) => {
    const en = bm('en');
    await setLocaleCookie(context, 'en');
    const old = budgetView('b1', 'succeeded');
    const fresh = budgetView('b2', 'succeeded', { tiers: tiers(100000), createdAt: '2026-11-17T10:05:00.000Z' });
    let phase: 'idle' | 'running' | 'done' = 'idle';
    let polls = 0;
    await mock(page, [], {
      post: { status: 202, body: { budget: budgetView('b2', 'queued', { createdAt: '2026-11-17T10:05:00.000Z' }) } },
      list: () => (phase === 'idle' ? [old] : phase === 'running' ? [budgetView('b2', 'running', { createdAt: '2026-11-17T10:05:00.000Z' }), old] : [fresh]),
      one: () => {
        polls += 1;
        if (polls < 3) return budgetView('b2', 'running', { createdAt: '2026-11-17T10:05:00.000Z', stage: 'inventory', progress: { total: 6, done: polls } });
        phase = 'done';
        return fresh;
      },
    });
    await open(page);
    await expect(page.getByTestId('budget-total-luxury')).toHaveText(money(986040, 'en'));
    phase = 'running';
    await page.getByTestId('budget-again').click();
    // While the new Budget computes the old totals stay on screen under the banner.
    await expect(page.getByTestId('budget-recalculating')).toBeVisible();
    await expect(page.getByTestId('budget-total-luxury')).toHaveText(money(986040, 'en'));
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'true');
    // Replaced only when the new one succeeded.
    await expect(page.getByTestId('budget-total-luxury')).toHaveText(money(1086040, 'en'), { timeout: 20_000 });
    await expect(page.getByTestId('budget-recalculating')).toHaveCount(0);
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('budget-again')).toHaveText(en.cta.again);
  });

  test('no Simulation selected and Simulation not ready show their alerts with a link to the project page', async ({ page, context }) => {
    const en = bm('en');
    await setLocaleCookie(context, 'en');
    await mock(page, [], { simulations: [simulation({ selected: false })] });
    await open(page);
    await expect(page.getByTestId('budget-alert-noSelection')).toContainText(en.alerts.noSelection);
    await expect(page.getByTestId('budget-go-simulations')).toHaveText(en.goToSimulations);
    await expect(page.getByTestId('budget-go-simulations')).toHaveAttribute('href', `/kitchen-projects/${PID}`);
    await expect(page.getByTestId('budget-simulation')).toHaveCount(0);
    await expect(page.getByTestId('budget-again')).toHaveCount(0);
    await expect(page.getByTestId('budget-back-project')).toHaveText(en.cta.back);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/6-no-selection-en.png' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await mock(page, [], { simulations: [simulation({ status: 'partial', renders: [render(0), { ...render(1), status: 'failed', fullUrl: null, thumbUrl: null, errorCode: 'adapter_error' }] })] });
    await open(page);
    await expect(page.getByTestId('budget-alert-notReady')).toContainText(en.alerts.notReady);
    await expect(page.getByTestId('budget-again')).toHaveCount(0);
    await expect(page.getByTestId('budget-start')).toHaveCount(0);
    await checkLayout(page);
    await page.screenshot({ path: 'test-results/budget/6b-not-ready-en.png' });
  });

  test('offline, 360 px layouts (de, fi) and the end of the old limits', async ({ page, context }) => {
    const en = bm('en');
    await setLocaleCookie(context, 'en');
    await mock(page, [budgetView('b1', 'succeeded')]);
    await open(page);
    // Long list: the first 3 items, "+ N more items" reveals the rest.
    await page.getByTestId('budget-tier-high').click();
    await expect(page.getByTestId('budget-items-high').locator('[data-testid^="budget-item-"]')).toHaveCount(3);
    await expect(page.getByTestId('budget-more-high')).toHaveText(icu(en.more, 2));
    await page.getByTestId('budget-more-high').click();
    await expect(page.getByTestId('budget-items-high').locator('[data-testid^="budget-item-"]')).toHaveCount(5);
    // The 5-budget limit and the history strip are gone.
    await expect(page.getByTestId('budget-history')).toHaveCount(0);
    await expect(page.getByTestId('budget-hint')).toHaveCount(0);
    await expect(page.getByTestId('budget-again')).toHaveAttribute('aria-disabled', 'false');
    for (const [locale, width, height] of [['de', 360, 780], ['fi', 360, 780]] as const) {
      await page.setViewportSize({ width, height });
      await setLocaleCookie(context, locale);
      await open(page);
      await expect(page.getByTestId('budget-simulation')).toContainText(fill(bm(locale).basedOn, { n: 2 }));
      await expect(page.getByTestId('budget-simulation-thumbs').locator('img')).toHaveCount(6);
      await checkLayout(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await setLocaleCookie(context, 'en');
    await open(page);
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
