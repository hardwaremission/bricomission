import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, newContext, test, type APIRequestContext, type BrowserContext, type Page } from './fixtures';
import { authOrigins, guardLocalhost, HOMEOWNER, HOMEOWNER_EMAIL, homeownerPassword, mailpitCode, pageFetch, setLocaleCookie } from './support';

// Feature diagnostics-dashboard: the separate desktop dashboard (compose profile "diagnostics",
// http://localhost:3200) watched while the portrait app runs a Simulation and a Budget on the fake
// adapters. Project desktop-1920 only. Full run, including the stack states: `pnpm test:e2e:diagnostics`
// (scripts/diagnostics/e2e.sh). Without the dashboard (plain `pnpm test:e2e` on the default stack) every
// test here is skipped with the message below.
const DASHBOARD = (process.env.E2E_DIAGNOSTICS_URL ?? '').replace(/\/$/, '');
const STATE = process.env.E2E_DIAGNOSTICS_STATE || 'live';
const REQUIRED = process.env.E2E_DIAGNOSTICS_REQUIRED === '1';
const TOKEN = process.env.E2E_DIAGNOSTICS_TOKEN ?? '';
const SKIP_MESSAGE =
  'diagnostics dashboard not running with the API events on: run `pnpm test:e2e:diagnostics`, or start it with ' +
  '`DIAGNOSTICS_ENABLED=true docker compose --profile diagnostics up -d --build --wait` (see AGENTS.md, Diagnostics)';

/** Written by the `reconnect` state test once its page is connected (read by scripts/diagnostics/e2e.sh). */
const READY_FILE = fileURLToPath(new URL('../test-results/diagnostics-e2e-ready', import.meta.url));

const NODES = 23;
const EDGES = 24;
const CONTAINER_WIDGETS = ['web', 'api', 'keycloak', 'postgres', 'minio', 'mailpit', 'llama-server', 'comfyui', 'embedder'];
const DRAFTS = '/api/kitchen-projects/drafts';
const CURRENT = `${DRAFTS}/current`;
const PROJECT_URL = /\/kitchen-projects\/([0-9a-f-]{36})$/;
const RESULTS_URL = /\/kitchen-projects\/([0-9a-f-]{36})\/results$/;
const BUDGET_URL = /\/kitchen-projects\/([0-9a-f-]{36})\/budget$/;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

interface Activation {
  edge: string;
  seq: number;
  simulated: boolean;
  direction: string;
}
interface SeenLine {
  seq: string;
  from: string;
  to: string;
  kind: string;
  phase: string;
}
interface Watch {
  activations: Activation[];
  lines: SeenLine[];
}

/** True when the dashboard answers and (for the live tests) its API proxy serves the topology. */
async function dashboardReady(request: APIRequestContext, needApi: boolean): Promise<boolean> {
  if (!DASHBOARD) return false;
  try {
    const health = await request.get(`${DASHBOARD}/api/health`, { timeout: 5000 });
    if (!health.ok()) return false;
    if (!needApi) return true;
    return (await request.get(`${DASHBOARD}/api/topology`, { timeout: 5000 })).ok();
  } catch {
    return false;
  }
}

/** Records every edge activation and every log line the dashboard draws from now on (read with `watched`). */
async function watch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store: Watch = { activations: [], lines: [] };
    (window as unknown as { bmWatch: Watch }).bmWatch = store;
    const seenLines = new Set<string>();
    const edge = (el: Element): void => {
      const id = el.getAttribute('data-testid') ?? '';
      if (!id.startsWith('edge-') || el.getAttribute('data-active') !== 'true') return;
      store.activations.push({
        edge: id.slice(5),
        seq: Number(el.getAttribute('data-last-seq') || 0),
        simulated: el.getAttribute('data-simulated') === 'true',
        direction: el.getAttribute('data-direction') ?? '',
      });
    };
    const line = (el: Element): void => {
      const id = el.getAttribute('data-testid') ?? '';
      if (!id.startsWith('log-line-') || seenLines.has(id)) return;
      seenLines.add(id);
      store.lines.push({
        seq: id.slice(9),
        from: el.getAttribute('data-from') ?? '',
        to: el.getAttribute('data-to') ?? '',
        kind: el.getAttribute('data-kind') ?? '',
        phase: el.getAttribute('data-phase') ?? '',
      });
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') edge(mutation.target as Element);
        for (const added of mutation.addedNodes) {
          if (!(added instanceof Element)) continue;
          line(added);
          for (const child of added.querySelectorAll('[data-testid^="log-line-"]')) line(child);
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-active', 'data-last-seq', 'data-direction'] });
  });
}

const watched = (page: Page): Promise<Watch> => page.evaluate(() => (window as unknown as { bmWatch: Watch }).bmWatch);

async function openDashboard(context: BrowserContext, query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${DASHBOARD}/${query}`);
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(NODES);
  return page;
}

/** A few plain (non polling) API calls from the app: each lights browser > web > api-guards > style-gallery. */
async function traffic(app: Page, calls = 3): Promise<void> {
  for (let i = 0; i < calls; i += 1) expect((await pageFetch(app, '/api/style-gallery')).status).toBe(200);
}

async function apiJson(page: Page, path: string, method: string, body: unknown) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return res.status;
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
      return (await fetch(path, { method: 'POST', body: form, credentials: 'same-origin' })).status;
    },
    { path, bytes },
  );
}

const count = async (page: Page): Promise<number> => Number(await page.getByTestId('log-count').innerText());

/** Waits until no new row arrived for one second: the web emits its events in batches, after the response. */
async function settle(page: Page): Promise<void> {
  let last = -1;
  for (let i = 0; i < 20; i += 1) {
    const now = await count(page);
    if (now === last) return;
    last = now;
    await page.waitForTimeout(1000);
  }
}

test.describe.serial('Diagnostics dashboard, live (fake adapters)', () => {
  test.skip(STATE !== 'live', `state run (${STATE}): the live tests are not part of it`);
  test.setTimeout(300_000);

  let dashContext: BrowserContext;
  let appContext: BrowserContext;
  let dash: Page;
  let app: Page;
  let dashBlocked: string[] = [];
  let appBlocked: string[] = [];
  const tokenLeaks: string[] = [];
  let ready = false;

  test.beforeAll(async ({ browser, request }) => {
    ready = await dashboardReady(request, true);
    if (!ready) return;
    const origin = new URL(DASHBOARD).origin;
    dashContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ['clipboard-read', 'clipboard-write'] });
    dashBlocked = await guardLocalhost(dashContext, [origin]);
    // The token must never reach the browser: no request header, no response header, no finished body.
    dashContext.on('request', (req) => {
      if (Object.keys(req.headers()).includes('x-diagnostics-token')) tokenLeaks.push(`request header: ${req.url()}`);
    });
    dashContext.on('response', (res) => {
      if (TOKEN && JSON.stringify(res.headers()).includes(TOKEN)) tokenLeaks.push(`response header: ${res.url()}`);
      if (!TOKEN || new URL(res.url()).pathname === '/stream') return;
      res.text().then(
        (body) => {
          if (body.includes(TOKEN)) tokenLeaks.push(`response body: ${res.url()}`);
        },
        () => undefined,
      );
    });
    appContext = await newContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'en-US' });
    appBlocked = await guardLocalhost(appContext, authOrigins());
    dash = await openDashboard(dashContext);
    app = await appContext.newPage();
    await setLocaleCookie(appContext, 'en');
    await app.goto('/language');
  });

  test.beforeEach(() => {
    if (REQUIRED) expect(ready, SKIP_MESSAGE).toBe(true);
    test.skip(!ready, SKIP_MESSAGE);
  });

  test.afterAll(async () => {
    await dashContext?.close();
    await appContext?.close();
  });

  test('loads without login: 23 nodes, 24 edges, widgets, model names, legend, LIVE; localhost only; no token in the browser', async () => {
    await expect(dash.getByTestId('status-chip')).toHaveAttribute('data-status', 'LIVE', { timeout: 20_000 });
    await expect(dash.getByTestId('status-chip')).not.toHaveText('REPLAY');
    await expect(dash.locator('[data-testid^="node-"]')).toHaveCount(NODES);
    await expect(dash.locator('[data-testid^="edge-"]')).toHaveCount(EDGES);
    await expect(dash.locator('[data-testid^="box-"]')).toHaveCount(6);
    await expect(dash.getByTestId('legend')).toBeVisible();
    await expect(dash.getByTestId('log-panel')).toHaveAttribute('data-collapsed', 'false');
    expect((await dash.getByTestId('log-panel').boundingBox())?.width).toBe(560);

    // A widget for every container, fed by the agent (CPU and RAM are measured for every running container).
    for (const id of CONTAINER_WIDGETS) await expect(dash.getByTestId(`widget-${id}`), id).toHaveCount(1);
    await expect(dash.getByTestId('widget-browser')).toHaveAttribute('data-cpu', 'n/a');
    await expect(dash.getByTestId('widget-api')).toHaveAttribute('data-ram', /\d+(\.\d+)? (MB|GB)/, { timeout: 20_000 });
    await expect(dash.getByTestId('widget-web')).toHaveAttribute('data-cpu', /\d+%/);
    for (const metric of ['cpu', 'ram', 'vram', 'gpu']) await expect(dash.getByTestId(`host-${metric}`)).toHaveAttribute('data-value', /\d/);

    // Model names come from the API topology (real configuration), never from the page.
    await expect(dash.getByTestId('models-llama-server')).toContainText('Qwen3-VL-30B-A3B-Instruct-Q4_K_M');
    await expect(dash.getByTestId('models-llama-server')).toContainText('mmproj F16');
    await expect(dash.getByTestId('models-llama-server')).toContainText(/ctx \d+/);
    await expect(dash.getByTestId('models-comfyui')).toContainText('RealVisXL_V5.0_fp16');
    await expect(dash.getByTestId('models-comfyui')).toContainText('IP-Adapter');
    await expect(dash.getByTestId('models-embedder')).toContainText(/1024 dimensions/);

    // No login, nothing stored in the browser, no page overflow.
    expect(new URL(dash.url()).origin).toBe(new URL(DASHBOARD).origin);
    expect(await dashContext.cookies()).toEqual([]);
    expect(await dash.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    if (TOKEN) {
      const inPage = await dash.evaluate((token) => document.documentElement.outerHTML.includes(token) || JSON.stringify({ ...localStorage, ...sessionStorage }).includes(token), TOKEN);
      expect(inPage, 'diagnostics token in the page or its storage').toBe(false);
      // Two seconds of the live stream as the browser reads it.
      const inStream = await dash.evaluate(async (token) => {
        const abort = new AbortController();
        const res = await fetch('/stream', { signal: abort.signal });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let text = '';
        const end = Date.now() + 2000;
        while (Date.now() < end) {
          const chunk = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 500))]);
          if (chunk === null) continue;
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
        }
        abort.abort();
        return text.includes(token);
      }, TOKEN);
      expect(inStream, 'diagnostics token in the browser stream').toBe(false);
    }
  });

  test('demo path: a Simulation and a Budget in the portrait app light the edges in order and write the log', async ({ request }) => {
    await watch(dash);
    // Draft with 2 photos and 2 style references, then claim it by signing in (Keycloak code by email).
    expect((await pageFetch(app, DRAFTS, { method: 'POST' })).status).toBe(201);
    expect(await apiUpload(app, `${CURRENT}/photos`, 'kitchen-1.jpg')).toBe(201);
    expect(await apiUpload(app, `${CURRENT}/photos`, 'kitchen-2.jpg')).toBe(201);
    expect(await apiJson(app, `${CURRENT}/measurements`, 'PUT', { lengthCm: 420, widthCm: 310, heightCm: 260 })).toBe(200);
    for (const galleryImageId of ['modern-01', 'scandinavian-01']) expect(await apiJson(app, `${CURRENT}/moodboard/gallery-items`, 'POST', { galleryImageId })).toBe(201);
    await app.goto('/kitchen-projects/new/generate');
    await app.getByTestId('generate-budget').click();
    await app.getByTestId('login-gate-sign-in').click();
    await expect(app.locator('#username')).toBeVisible();
    await app.locator('#username').fill(HOMEOWNER);
    await app.locator('#password').fill(homeownerPassword());
    const mail = await mailpitCode(request, HOMEOWNER_EMAIL, () => app.locator('#kc-login').click());
    await app.locator('#emailCode').fill(mail.code);
    await app.locator('#kc-login').click();
    await app.waitForURL(PROJECT_URL, { timeout: 30_000 });
    await expect(app.getByTestId('project-claimed')).toBeVisible();
    await expect(app.getByTestId('simulations-empty')).toBeVisible();
    await expect(app.getByTestId('project-render')).not.toHaveAttribute('aria-disabled', 'true');

    // The Simulation: the edge to ComfyUI is seen moving and dashed (fake adapter) while it renders.
    await app.getByTestId('project-render').click();
    await app.waitForURL(RESULTS_URL);
    await expect(dash.locator('[data-testid="edge-ai-adapters-comfyui"][data-active="true"][data-simulated="true"]')).toHaveCount(1, { timeout: 60_000 });
    await expect(app.getByTestId('results-slider')).toBeVisible({ timeout: 90_000 });
    const afterSimulation = Math.max(0, ...(await watched(dash)).lines.map((l) => Number(l.seq)).filter(Number.isFinite));

    // The Budget for the selected Simulation.
    await app.getByTestId('results-back-project').click();
    await app.waitForURL(PROJECT_URL);
    await app.getByTestId('simulation-select-1').click();
    await expect(app.getByTestId('simulation-select-1')).toHaveAttribute('aria-checked', 'true');
    await app.getByTestId('project-budget').click();
    await app.waitForURL(BUDGET_URL, { timeout: 30_000 });
    await expect(app.getByTestId('budget-tiers')).toBeVisible({ timeout: 90_000 });
    await dash.waitForTimeout(2500); // the last edges finish their fade

    const seen = await watched(dash);
    // Edges: each hop was seen moving (data-active). The dashboard applies events in 50 ms batches, so the
    // order of neighbouring hops is read from the log (exact sequence per row) and the edges are compared
    // only stage to stage.
    const first = (edge: string, after = 0): number => {
      const seqs = seen.activations.filter((a) => a.edge === edge && a.seq > after).map((a) => a.seq);
      expect(seqs.length, `edge ${edge} was active${after ? ' during the Budget' : ''}`).toBeGreaterThan(0);
      return Math.min(...seqs);
    };
    const firstLine = (hop: string, after = 0): number => {
      const [from, to] = hop.split('>');
      const seqs = seen.lines.filter((l) => l.from === from && l.to === to && l.phase !== 'end').map((l) => Number(l.seq)).filter((n) => Number.isFinite(n) && n > after);
      expect(seqs.length, `log line ${hop}${after ? ' during the Budget' : ''}`).toBeGreaterThan(0);
      return Math.min(...seqs);
    };
    const increasing = (chain: string[], after = 0): void => {
      const seqs = chain.map((hop) => firstLine(hop, after));
      for (let i = 1; i < seqs.length; i += 1) expect(seqs[i] as number, `${chain[i - 1]} before ${chain[i]}`).toBeGreaterThan(seqs[i - 1] as number);
      for (const hop of chain) first(hop.replace('>', '-'), after);
    };
    // Simulation: request in, guard, runner, broker, adapters, ComfyUI.
    increasing(['browser>web', 'web>api-guards', 'api-guards>simulation-runner', 'simulation-runner>gpu-broker', 'gpu-broker>ai-adapters', 'ai-adapters>comfyui']);
    // Budget: guard, retrieval through the embedder, vision and pricing jobs on the LLM, verify and compute.
    increasing(['api-guards>budget-engine', 'budget-engine>catalog-search', 'catalog-search>embedder'], afterSimulation);
    increasing(['api-guards>budget-engine', 'budget-engine>gpu-broker', 'ai-adapters>llama-server', 'budget-engine>budget-math'], afterSimulation);
    // Stage to stage, by the sequence each edge carried when it first moved.
    const stages = [first('browser-web'), first('api-guards-simulation-runner'), first('ai-adapters-comfyui'), first('api-guards-budget-engine', afterSimulation), first('budget-engine-budget-math', afterSimulation)];
    expect([...stages].sort((a, b) => a - b)).toEqual(stages);
    // Everything else the flow touches, in any order.
    for (const edge of ['web-postgres', 'api-guards-project-service', 'simulation-runner-style-engine', 'gpu-broker-residency-hook', 'storage-client-minio', 'data-access-postgres', 'image-pipeline-storage-client']) first(edge);
    // Fake adapters: every hop to an AI container is dashed; real hops are not.
    for (const edge of ['ai-adapters-comfyui', 'ai-adapters-llama-server']) expect(seen.activations.filter((a) => a.edge === edge).every((a) => a.simulated), `${edge} simulated`).toBe(true);
    for (const edge of ['browser-web', 'data-access-postgres', 'catalog-search-embedder']) expect(seen.activations.some((a) => a.edge === edge && a.simulated), `${edge} not simulated`).toBe(false);
    // Responses travel back on the same edge.
    expect(seen.activations.some((a) => a.edge === 'browser-web' && a.direction === 'reverse')).toBe(true);

    // The log narrated every hop with its source, destination and kind.
    const hop = (from: string, to: string, kind: string): boolean => seen.lines.some((l) => l.from === from && l.to === to && l.kind === kind);
    for (const [from, to, kind] of [
      ['browser', 'web', 'http'],
      ['web', 'api-guards', 'http'],
      ['api-guards', 'simulation-runner', 'guard'],
      ['simulation-runner', 'style-engine', 'compute'],
      ['simulation-runner', 'gpu-broker', 'queue'],
      ['gpu-broker', 'ai-adapters', 'queue'],
      ['ai-adapters', 'comfyui', 'image'],
      ['ai-adapters', 'llama-server', 'llm'],
      ['storage-client', 'minio', 'object'],
      ['data-access', 'postgres', 'sql'],
      ['budget-engine', 'catalog-search', 'step'],
      ['catalog-search', 'embedder', 'embed'],
      ['budget-engine', 'budget-math', 'compute'],
    ] as const) {
      expect(hop(from, to, kind), `log line ${from} > ${to} (${kind})`).toBe(true);
    }
    // The sign-in: the web exchanges the code with Keycloak, and the code email is inferred from Mailpit.
    expect(first('web-keycloak')).toBeGreaterThan(0);
    expect(seen.lines.some((l) => l.seq.startsWith('mail-') && l.from === 'keycloak' && l.to === 'mailpit' && l.kind === 'mail'), 'inferred keycloak > mailpit log line').toBe(true);
    expect(seen.activations.some((a) => a.edge === 'keycloak-mailpit'), 'edge keycloak-mailpit was active').toBe(true);
    await expect(dash.getByTestId('log-thread').first()).toBeAttached();
    expect(await count(dash)).toBeGreaterThan(100);
  });

  test('node selection filters the log, the payload expands with prompts and thumbnails, Wrap and Copy work, Esc clears', async () => {
    // ComfyUI: the request row carries the prompts and thumbnails, never image bytes beyond them.
    await dash.getByTestId('node-comfyui').click();
    await expect(dash.getByTestId('node-comfyui')).toHaveAttribute('data-selected', 'true');
    await expect(dash.getByTestId('filter-node')).toHaveText('comfyui');
    const lines = dash.locator('[data-testid^="log-line-"]');
    expect(await lines.count()).toBeGreaterThan(0);
    expect(await lines.evaluateAll((els) => els.every((el) => el.getAttribute('data-from') === 'comfyui' || el.getAttribute('data-to') === 'comfyui'))).toBe(true);
    const render = dash.locator('[data-testid^="log-line-"][data-from="ai-adapters"][data-to="comfyui"][data-phase="start"]').last();
    await expect(render).toContainText('SIMULATED');
    await render.getByRole('button').first().click();
    const payload = render.getByTestId('payload');
    await expect(payload).toBeVisible();
    await expect(payload).toContainText(/prompt/i);
    await expect(payload.getByTestId('payload-thumb').first()).toBeVisible();
    expect(await payload.locator('img').evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).src.startsWith('data:image/jpeg;base64,') && (img as HTMLImageElement).src.length < 12_000))).toBe(true);

    // Wrap toggles, Copy puts the text (never image data) on the clipboard.
    const wrap = payload.getByRole('button', { name: 'Wrap' });
    await expect(wrap).toHaveAttribute('aria-pressed', 'true');
    await wrap.click();
    await expect(wrap).toHaveAttribute('aria-pressed', 'false');
    await wrap.click();
    await payload.getByRole('button', { name: 'Copy' }).click();
    await expect(payload.getByRole('button', { name: 'Copied' })).toBeVisible();
    const copied = await dash.evaluate(() => navigator.clipboard.readText());
    expect(copied.length).toBeGreaterThan(50);
    expect(copied).not.toContain('data:image');
    await render.getByRole('button').first().click();
    await expect(payload).toHaveCount(0);

    // Esc clears the selection and the node filter.
    await dash.keyboard.press('Escape');
    await expect(dash.getByTestId('node-comfyui')).toHaveAttribute('data-selected', 'false');
    await expect(dash.getByTestId('filter-node')).toHaveCount(0);

    // llama-server: the budget prompt is shown in full.
    await dash.getByTestId('node-llama-server').click();
    const llm = dash.locator('[data-testid^="log-line-"][data-from="ai-adapters"][data-to="llama-server"][data-kind="llm"][data-phase="start"]').last();
    await llm.getByRole('button').first().click();
    await expect(llm.getByTestId('payload')).toContainText('SYSTEM');
    expect((await llm.getByTestId('payload').innerText()).length).toBeGreaterThan(1000);
    await llm.getByRole('button').first().click();
    // Clicking the selected node again also clears it.
    await dash.getByTestId('node-llama-server').click();
    await expect(dash.getByTestId('filter-node')).toHaveCount(0);
  });

  test('kind chips and the +9 menu filter the log; All resets', async () => {
    const lines = dash.locator('[data-testid^="log-line-"]');
    const kindsShown = () => lines.evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-kind')))].sort());
    await expect(dash.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
    await dash.getByTestId('filter-sql').click();
    await expect(dash.getByTestId('filter-sql')).toHaveAttribute('aria-pressed', 'true');
    await expect(dash.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'false');
    expect(await kindsShown()).toEqual(['sql']);
    // Thread headers, poll rows and markers are hidden while a filter is on.
    await expect(dash.getByTestId('log-thread')).toHaveCount(0);

    await dash.getByTestId('filter-more').click();
    await expect(dash.getByTestId('filter-menu')).toBeVisible();
    await expect(dash.getByTestId('filter-opt-sql')).toHaveAttribute('aria-checked', 'true');
    await expect(dash.getByTestId('filter-opt-object')).toHaveAttribute('aria-checked', 'false');
    await dash.getByTestId('filter-opt-object').click();
    await expect(dash.getByTestId('filter-opt-object')).toHaveAttribute('aria-checked', 'true');
    expect(await kindsShown()).toEqual(['object', 'sql']);
    await dash.getByTestId('filter-opt-sql').click();
    expect(await kindsShown()).toEqual(['object']);
    await dash.getByTestId('filter-more').click();
    await expect(dash.getByTestId('filter-menu')).toHaveCount(0);

    await dash.getByTestId('filter-all').click();
    await expect(dash.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
    expect((await kindsShown()).length).toBeGreaterThan(3);
    await expect(dash.getByTestId('log-thread').first()).toBeAttached();
  });

  test('follow mode: scrolling up enables Jump to live, which returns to the newest row', async () => {
    const rows = dash.getByTestId('log-rows');
    const jump = dash.getByTestId('jump-to-live');
    await expect(jump).toBeDisabled();
    await rows.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(jump).toBeEnabled();
    await traffic(app); // new rows arrive but the view stays where the user scrolled
    expect(await rows.evaluate((el) => el.scrollTop)).toBeLessThan(50);
    await jump.click();
    await expect(jump).toBeDisabled();
    expect(await rows.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(24);
  });

  test('the log collapses to a 44 px rail with an unread badge while the edges keep animating, and expands again', async () => {
    const webX = (await dash.getByTestId('node-web').boundingBox())?.x ?? 0;
    await settle(dash); // trailing events of the previous test land first
    const before = await count(dash);
    await dash.getByTestId('log-collapse').click();
    await expect(dash.getByTestId('log-panel')).toHaveAttribute('data-collapsed', 'true');
    expect((await dash.getByTestId('log-panel').boundingBox())?.width).toBe(44);
    await expect(dash.getByTestId('log-unread')).toHaveCount(0);
    // The graph takes the freed width and recentres.
    await expect.poll(async () => (await dash.getByTestId('node-web').boundingBox())?.x ?? 0).toBeGreaterThan(webX + 100);

    const moving = dash.waitForFunction(() => document.querySelector('[data-testid="edge-browser-web"][data-active="true"] .bm-packet') !== null, null, { timeout: 15_000 });
    await traffic(app);
    await moving;
    await expect(dash.getByTestId('log-unread')).toHaveText(/^\+\d+$/);
    const unread = Number((await dash.getByTestId('log-unread').innerText()).slice(1));
    expect(unread).toBeGreaterThanOrEqual(3);

    await dash.getByTestId('log-expand').click();
    await expect(dash.getByTestId('log-panel')).toHaveAttribute('data-collapsed', 'false');
    await expect.poll(() => count(dash)).toBeGreaterThanOrEqual(before + unread);
    // The badge lives only on the rail and expanding resets it.
    await expect(dash.getByTestId('log-unread')).toHaveCount(0);
  });

  test('Pause holds new rows, resume adds them, Clear empties the log and the stream keeps writing', async () => {
    await dash.getByTestId('log-pause').click();
    await expect(dash.getByTestId('log-pause')).toHaveAttribute('aria-pressed', 'true');
    const before = await count(dash);
    await traffic(app);
    await expect(dash.getByTestId('log-panel')).toContainText(/paused · [1-9]\d* held/);
    expect(await count(dash)).toBe(before);
    // The graph is not paused: only the log is.
    await dash.getByTestId('log-pause').click();
    await expect(dash.getByTestId('log-pause')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => count(dash)).toBeGreaterThan(before);

    await settle(dash);
    await dash.getByTestId('log-clear').click();
    await expect(dash.getByTestId('log-count')).toHaveText('0');
    await expect(dash.getByTestId('log-empty')).toBeVisible();
    await expect(dash.locator('[data-testid^="log-line-"]')).toHaveCount(0);
    await traffic(app, 1);
    await expect(dash.locator('[data-testid^="log-line-"][data-from="browser"][data-to="web"]').first()).toBeVisible();
    await expect(dash.getByTestId('log-empty')).toHaveCount(0);
  });

  test('motion: a packet travels on an active edge; with prefers-reduced-motion the packet is replaced by static marks', async ({ browser }) => {
    const styles = (page: Page) =>
      page.waitForFunction(
        () => {
          const edge = document.querySelector('[data-testid="edge-browser-web"][data-active="true"]');
          const packet = edge?.querySelector('.bm-packet');
          const marks = edge?.querySelector('.bm-marks');
          if (!packet || !marks) return null;
          const p = getComputedStyle(packet);
          return { packet: p.display, animation: p.animationName, marks: getComputedStyle(marks).display };
        },
        null,
        { timeout: 15_000 },
      );
    const normal = styles(dash);
    await traffic(app);
    const moving = (await (await normal).jsonValue()) as { packet: string; animation: string; marks: string };
    expect(moving.packet).not.toBe('none');
    expect(moving.animation).not.toBe('none');
    expect(moving.marks).toBe('none');

    const reducedContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    try {
      const reduced = await openDashboard(reducedContext);
      await expect(reduced.getByTestId('status-chip')).toHaveAttribute('data-status', 'LIVE', { timeout: 20_000 });
      const still = styles(reduced);
      await traffic(app);
      const value = (await (await still).jsonValue()) as { packet: string; animation: string; marks: string };
      expect(value.packet).toBe('none');
      expect(value.marks).not.toBe('none');
    } finally {
      await reducedContext.close();
    }
  });

  test('1440x1080 and 1366x768: narrower log, every node inside the canvas, no overflow, no label over a value, filter menu reachable', async ({ browser }) => {
    for (const [width, height, log] of [
      [1440, 1080, 480],
      [1366, 768, 400],
    ] as const) {
      const context = await browser.newContext({ viewport: { width, height } });
      try {
        const page = await openDashboard(context);
        await expect(page.locator('[data-testid^="edge-"]')).toHaveCount(EDGES);
        expect((await page.getByTestId('log-panel').boundingBox())?.width, `${width}: log width`).toBe(log);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight), `${width}: no overflow`).toBe(true);
        const canvas = await page.getByTestId('graph').boundingBox();
        const clipped = await page.locator('[data-testid^="node-"]').evaluateAll(
          (els, box) =>
            els
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.left < box.x - 1 || r.top < box.y - 1 || r.right > box.x + box.width + 1 || r.bottom > box.y + box.height + 1;
              })
              .map((el) => el.getAttribute('data-testid')),
          canvas as { x: number; y: number; width: number; height: number },
        );
        expect(clipped, `${width}: nodes clipped by the canvas`).toEqual([]);

        // Scaled down (fit-view zoom about 0.7) the micro labels grow to stay 9 px effective: the label line of every
        // metric tile must still end above its value, and the labels must really be at least 9 px on screen.
        const zoom = await page.getByTestId('graph').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--bm-zoom')));
        expect(zoom, `${width}: fit-view zoom`).toBeGreaterThan(0.6);
        expect(zoom, `${width}: fit-view zoom`).toBeLessThan(0.8);
        const tiles = await page.locator('[data-metric]').evaluateAll((els, zoom) =>
          els.map((el) => {
            const label = el.querySelector('[data-testid="tile-label"]') as HTMLElement;
            const value = el.querySelector('[data-testid="tile-value"]') as HTMLElement;
            const l = label.getBoundingClientRect();
            const v = value.getBoundingClientRect();
            return {
              id: `${el.closest('[data-testid^="widget-"]')?.getAttribute('data-testid')}/${el.getAttribute('data-metric')}`,
              overlap: !(l.bottom <= v.top + 0.01 || v.bottom <= l.top || l.right <= v.left || v.right <= l.left),
              effectivePx: parseFloat(getComputedStyle(label.firstElementChild as Element).fontSize) * zoom,
            };
          }),
          zoom,
        );
        expect(tiles.length, `${width}: metric tiles`).toBe(28);
        expect(tiles.filter((t) => t.overlap).map((t) => t.id), `${width}: tile labels over their value`).toEqual([]);
        expect(tiles.filter((t) => t.effectivePx < 8.99).map((t) => t.id), `${width}: tile labels under 9 px effective`).toEqual([]);

        // The API TOTALS title is one line inside its card, above the first tile label.
        const title = await page.getByTestId('widget-api-title').evaluate((el, zoom) => {
          const r = el.getBoundingClientRect();
          const card = (el.parentElement as HTMLElement).getBoundingClientRect();
          const firstLabel = (el.parentElement as HTMLElement).querySelector('[data-testid="tile-label"]')?.getBoundingClientRect();
          return {
            lines: Math.round(r.height / (parseFloat(getComputedStyle(el).fontSize) * 1.25 * zoom)),
            inside: r.left >= card.left && r.right <= card.right,
            aboveTiles: firstLabel !== undefined && r.bottom <= firstLabel.top + 0.01,
          };
        }, zoom);
        expect(title, `${width}: API TOTALS title`).toEqual({ lines: 1, inside: true, aboveTiles: true });

        // The filter row may wrap in the narrow log, but the kinds menu button stays inside the panel and opens the menu there.
        const inside = async (testId: string): Promise<boolean> => {
          const panel = (await page.getByTestId('log-panel').boundingBox()) as { x: number; y: number; width: number; height: number };
          const box = (await page.getByTestId(testId).boundingBox()) as { x: number; y: number; width: number; height: number };
          return box.x >= panel.x && box.y >= panel.y && box.x + box.width <= panel.x + panel.width && box.y + box.height <= panel.y + panel.height;
        };
        await expect(page.getByTestId('filter-more')).toBeVisible();
        expect(await inside('filter-more'), `${width}: filter-more inside the log panel`).toBe(true);
        await page.getByTestId('filter-more').click();
        await expect(page.getByTestId('filter-menu')).toBeVisible();
        expect(await inside('filter-menu'), `${width}: filter menu inside the log panel`).toBe(true);
        await expect(page.locator('[data-testid^="filter-opt-"]')).toHaveCount(14);
        await page.getByTestId('filter-more').click();
        await expect(page.getByTestId('filter-menu')).toHaveCount(0);
      } finally {
        await context.close();
      }
    }
  });

  test('replay: ?source=replay plays the committed recording with the REPLAY chip and never the live stream', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    try {
      const page = await openDashboard(context, '?source=replay&speed=20');
      await expect(page.getByTestId('status-chip')).toHaveAttribute('data-status', 'REPLAY');
      await expect(page.getByTestId('log-footer')).toContainText('replay');
      await expect(page.locator('[data-testid^="log-line-"]').first()).toBeVisible({ timeout: 20_000 });
      // Replayed traffic is drawn dashed, and the recording contains a render on ComfyUI.
      await expect(page.locator('[data-testid^="edge-"][data-active="true"][data-simulated="true"]').first()).toBeAttached({ timeout: 30_000 });
      await expect(page.locator('[data-testid^="log-line-"][data-to="comfyui"]').first()).toBeAttached({ timeout: 60_000 });
      await expect(page.getByTestId('widget-api')).toHaveAttribute('data-ram', /\d/);
    } finally {
      await context.close();
    }
    await expect(dash.getByTestId('status-chip')).toHaveAttribute('data-status', 'LIVE');
  });

  test('nothing left the machine and the token never reached the browser', async () => {
    expect(dashBlocked, 'dashboard requests outside its own localhost origin').toEqual([]);
    expect(appBlocked, 'app requests outside the web and Keycloak localhost origins').toEqual([]);
    expect(tokenLeaks, 'diagnostics token seen by the browser').toEqual([]);
  });
});

// Stack states the page must explain by itself. Each needs the stack changed from outside the browser, so
// scripts/diagnostics/e2e.sh runs this group once per state with E2E_DIAGNOSTICS_STATE set.
test.describe('Diagnostics dashboard, stack states', () => {
  test.skip(STATE === 'live', 'stack states run from scripts/diagnostics/e2e.sh (pnpm test:e2e:diagnostics)');
  test.setTimeout(60_000);

  test.beforeEach(async ({ request }) => {
    const ready = await dashboardReady(request, false);
    if (REQUIRED) expect(ready, SKIP_MESSAGE).toBe(true);
    test.skip(!ready, SKIP_MESSAGE);
  });

  test('RECONNECTING: the dashboard server restarts; chip, card and marker row, the graph stays, then LIVE again', async ({ page }) => {
    test.skip(STATE !== 'reconnect', `state is ${STATE}`);
    test.setTimeout(180_000);
    await page.goto(`${DASHBOARD}/`);
    await expect(page.getByTestId('status-chip')).toHaveAttribute('data-status', 'LIVE', { timeout: 30_000 });
    await expect(page.locator('[data-testid^="node-"]')).toHaveCount(NODES);
    // The outage lasts only as long as the container restart, so what the page showed meanwhile is recorded
    // in the page and asserted afterwards.
    await page.evaluate(() => {
      const seen = { statuses: [] as string[], card: false, retry: false, footer: false, nodes: 0, edges: 0 };
      (window as unknown as { bmOutage: typeof seen }).bmOutage = seen;
      const read = (): void => {
        const status = document.querySelector('[data-testid="status-chip"]')?.getAttribute('data-status') ?? '';
        if (seen.statuses[seen.statuses.length - 1] !== status) seen.statuses.push(status);
        if (status !== 'RECONNECTING') return;
        seen.card ||= (document.querySelector('[data-testid="card-disconnected"]')?.textContent ?? '').includes('Connection lost');
        seen.retry ||= document.querySelector('[data-testid="retry-now"]') !== null;
        seen.footer ||= (document.querySelector('[data-testid="log-footer"]')?.textContent ?? '').includes('stream reconnecting');
        seen.nodes = Math.max(seen.nodes, document.querySelectorAll('[data-testid^="node-"]').length);
        seen.edges = Math.max(seen.edges, document.querySelectorAll('[data-testid^="edge-"]').length);
      };
      new MutationObserver(read).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      read();
    });
    // Tells scripts/diagnostics/e2e.sh that the page is connected: it restarts the dashboard container now.
    mkdirSync(dirname(READY_FILE), { recursive: true });
    writeFileSync(READY_FILE, 'ready\n');
    const outage = () => page.evaluate(() => (window as unknown as { bmOutage: { statuses: string[]; card: boolean; retry: boolean; footer: boolean; nodes: number; edges: number } }).bmOutage);
    await expect.poll(async () => (await outage()).statuses, { timeout: 60_000 }).toContain('RECONNECTING');
    // The page reconnects by itself with back-off (the same document, no reload).
    await expect(page.getByTestId('status-chip')).toHaveAttribute('data-status', 'LIVE', { timeout: 90_000 });
    await expect(page.getByTestId('card-disconnected')).toHaveCount(0);
    const seen = await outage();
    expect(seen.statuses.slice(0, 3)).toEqual(['LIVE', 'RECONNECTING', 'LIVE']);
    expect(seen.card, 'card "Connection lost" while reconnecting').toBe(true);
    expect(seen.retry, 'Retry now button while reconnecting').toBe(true);
    expect(seen.footer, 'footer "stream reconnecting"').toBe(true);
    // The graph kept its last known state while the stream was away.
    expect([seen.nodes, seen.edges]).toEqual([NODES, EDGES]);
    await expect(page.locator('[data-testid^="node-"]')).toHaveCount(NODES);
    // Both ends of the outage are written in the log.
    await expect(page.locator('[data-testid="log-marker"][data-tone="reconnect"]').first()).toContainText('Stream lost');
    await expect(page.locator('[data-testid="log-marker"][data-tone="reconnect"]').last()).toContainText('Stream reconnected');
  });

  test('NO AGENT: the metrics agent is stopped; chip NO AGENT, widgets without numbers, events still flow', async ({ page }) => {
    test.skip(STATE !== 'no-agent', `state is ${STATE}`);
    await page.goto(`${DASHBOARD}/`);
    await expect(page.getByTestId('status-chip')).toHaveAttribute('data-status', 'NO AGENT', { timeout: 30_000 });
    await expect(page.locator('[data-testid^="node-"]')).toHaveCount(NODES);
    for (const id of ['web', 'api', 'postgres']) {
      await expect(page.getByTestId(`widget-${id}`)).not.toHaveAttribute('data-cpu', /\d/);
      await expect(page.getByTestId(`widget-${id}`)).not.toHaveAttribute('data-ram', /\d/);
    }
    await expect(page.getByTestId('host-cpu')).not.toHaveAttribute('data-value', /\d/);
    await expect(page.getByTestId('log-footer')).toContainText('stream connected');
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);
  });

  test('TOKEN MISMATCH: the dashboard holds another token; chip and card say so, no event is shown', async ({ page }) => {
    test.skip(STATE !== 'token-mismatch', `state is ${STATE}`);
    await page.goto(`${DASHBOARD}/`);
    await expect(page.getByTestId('status-chip')).toHaveAttribute('data-status', 'TOKEN MISMATCH', { timeout: 30_000 });
    await expect(page.getByTestId('card-token-mismatch')).toContainText('DIAGNOSTICS_TOKEN');
    await expect(page.locator('[data-testid^="node-"]')).toHaveCount(NODES);
    await expect(page.locator('[data-testid^="log-line-"]')).toHaveCount(0);
    await expect(page.getByTestId('log-footer')).toContainText('token rejected');
    if (TOKEN) expect(await page.evaluate((token) => document.documentElement.outerHTML.includes(token), TOKEN)).toBe(false);
  });

  test('API DISABLED: the API runs without DIAGNOSTICS_ENABLED; chip and card name the fix, no event is shown', async ({ page }) => {
    test.skip(STATE !== 'api-disabled', `state is ${STATE}`);
    await page.goto(`${DASHBOARD}/`);
    await expect(page.getByTestId('status-chip')).toHaveAttribute('data-status', 'API DISABLED', { timeout: 30_000 });
    await expect(page.getByTestId('card-api-disabled')).toContainText('./launch-demo.sh');
    await expect(page.locator('[data-testid^="node-"]')).toHaveCount(NODES);
    await expect(page.locator('[data-testid^="log-line-"]')).toHaveCount(0);
    await expect(page.getByTestId('log-footer')).toContainText('API stream disabled');
  });
});
