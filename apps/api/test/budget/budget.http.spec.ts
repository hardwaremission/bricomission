import { afterEach, describe, expect, it } from 'vitest';
import type { LlmAdapter, LlmRequest, LlmResult } from '../../src/ai/adapters/llm-adapter.js';
import { createKitchenApp, HOMEOWNER_SUB, type KitchenApp, type KitchenAppOptions, OTHER_SUB } from '../support/kitchen-app.js';
import { flush, GateQueue } from '../gpu-test-helpers.js';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const TIERS = ['luxury', 'high', 'medium', 'low'];
const VIEW_KEYS = ['createdAt', 'currency', 'errorCode', 'finishedAt', 'id', 'lineItemsCount', 'position', 'startedAt', 'status', 'tiers', 'vatPercent', 'waitingFor'];

/** An LlmAdapter that answers from a script (the last answer repeats); `throwError` makes it fail. */
class ScriptedLlm implements LlmAdapter {
  readonly calls: LlmRequest[] = [];
  constructor(
    private readonly answers: Array<string | Error>,
    private readonly gate?: () => Promise<void>,
  ) {}

  async complete(req: LlmRequest): Promise<LlmResult> {
    this.calls.push(req);
    await this.gate?.();
    const answer = this.answers[Math.min(this.calls.length - 1, this.answers.length - 1)] as string | Error;
    if (answer instanceof Error) throw answer;
    return { text: answer, promptTokens: 100, completionTokens: 50 };
  }
}

const item = (sku: string, price: string, quantity = '1') => ({ name: `Product ${sku}`, sku, chunkRef: 1, quotedPrice: price, quantity, unit: 'unit' });
const answer = (luxury: object[], rest: object[] = [item('BM-SYN-WTP-300', '189.90')]) => JSON.stringify({ tiers: { luxury: { items: luxury }, high: { items: rest }, medium: { items: rest }, low: { items: rest } } });
const GOOD = answer([item('BM-SYN-WTP-300', '189.90', '2.5')]);

// Feature budget-tier-computation, Scenarios 1-5: Budgets with the fake LLM (no GPU, no database,
// no MinIO, no embedder); the Catalog search is a stub that returns the sample catalog's lines.
describe('HTTP /kitchen-projects/:projectId/budget(s)', () => {
  let k: KitchenApp;

  afterEach(async () => {
    await k?.app.close();
  });

  async function start(options: KitchenAppOptions = {}) {
    k = await createKitchenApp(options);
    return k;
  }

  async function ownedProject(sub = HOMEOWNER_SUB, ready = true) {
    const seeded = await k.seedDraft(ready ? { photo: true, measurements: true, moodboard: true } : { photo: true });
    const claimed = await k.claim(await k.token(sub), seeded.draftToken);
    expect(claimed.status).toBe(200);
    return claimed.body.project as { id: string };
  }

  const auth = async (sub = HOMEOWNER_SUB, roles = ['user']) => `Bearer ${await k.token(sub, roles)}`;
  const post = async (projectId: string, sub = HOMEOWNER_SUB) => k.http().post(`/kitchen-projects/${projectId}/budget`).set('Authorization', await auth(sub));
  const get = async (path: string, sub = HOMEOWNER_SUB) => k.http().get(path).set('Authorization', await auth(sub));

  async function settle(projectId: string, budgetId: string) {
    for (let i = 0; i < 300; i++) {
      const res = await get(`/kitchen-projects/${projectId}/budgets/${budgetId}`);
      if (res.body.status === 'succeeded' || res.body.status === 'failed') return res.body;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('budget did not settle');
  }

  it('Scenario 1: 202 queued, then succeeded with four tiers whose items cite the chunk page; list is newest first', async () => {
    const gates = new GateQueue();
    await start({ llmOptions: { gate: gates.next } });
    const project = await ownedProject();
    const created = await post(project.id);
    expect(created.status).toBe(202);
    expect(Object.keys(created.body)).toEqual(['budget']);
    expect(Object.keys(created.body.budget).sort()).toEqual(VIEW_KEYS);
    expect(created.body.budget).toMatchObject({ status: 'queued', currency: 'EUR', vatPercent: 21, errorCode: null, lineItemsCount: 0, tiers: [] });
    await flush();
    gates.open(0);
    const done = await settle(project.id, created.body.budget.id);
    expect(done.status).toBe('succeeded');
    expect(done.tiers.map((t: { tier: string }) => t.tier)).toEqual(TIERS);
    for (const tier of done.tiers) {
      expect(tier.items.length).toBeGreaterThanOrEqual(1);
      expect(tier.subtotalCents + tier.vatCents).toBe(tier.totalCents);
      expect(tier.totalCents).toBe(tier.items.reduce((sum: number, i: { subtotalCents: number }) => sum + i.subtotalCents, 0));
      for (const line of tier.items) {
        expect(['unit', 'm2']).toContain(line.unit);
        expect(line.catalogName).toBe('BricoMission Sample Kitchen Catalog');
        expect([2, 3]).toContain(line.pageNumber);
        expect(Object.keys(line).sort()).toEqual(['catalogName', 'name', 'pageNumber', 'quantity', 'quotedPrice', 'sku', 'subtotalCents', 'unit', 'unitPriceCents']);
      }
    }
    expect(done.lineItemsCount).toBeGreaterThanOrEqual(4);
    k.clock.now = new Date(k.clock.now.getTime() + 60_000);
    const second = await post(project.id);
    expect(second.status).toBe(202);
    await flush();
    gates.open(1);
    await settle(project.id, second.body.budget.id);
    const list = await get(`/kitchen-projects/${project.id}/budgets`);
    expect(list.status).toBe(200);
    expect(list.body.maxBudgets).toBe(5);
    expect(list.body.budgets.map((b: { id: string }) => b.id)).toEqual([second.body.budget.id, created.body.budget.id]);
    // Nothing internal leaks.
    expect(JSON.stringify(list.body)).not.toMatch(/prompt|gpuJobId|promptTokens|sourceQuote/);
  });

  it('Scenario 4: two fake-adapter Budgets of one project end with equal tier totals', async () => {
    await start();
    const project = await ownedProject();
    const run = async () => {
      const created = await post(project.id);
      expect(created.status).toBe(202);
      return settle(project.id, created.body.budget.id);
    };
    const a = await run();
    const b = await run();
    expect(a.status).toBe('succeeded');
    expect(a.tiers).toEqual(b.tiers);
  });

  it('Scenario 2: guards (401, 403, 404 foreign and draft, 400, 409 project_incomplete before search and broker)', async () => {
    await start();
    const project = await ownedProject();
    const incomplete = await ownedProject(HOMEOWNER_SUB, false);
    const draft = await k.seedDraft({});
    const path = (id: string) => `/kitchen-projects/${id}/budget`;
    expect((await k.http().post(path(project.id))).status).toBe(401);
    expect((await k.http().post(path(project.id)).set('Authorization', await auth(HOMEOWNER_SUB, ['professional']))).status).toBe(403);
    expect((await k.http().post(path(project.id)).set('Authorization', await auth(HOMEOWNER_SUB, ['admin']))).status).toBe(403);
    expect((await post(project.id, OTHER_SUB)).status).toBe(404);
    expect((await post(draft.id)).status).toBe(404);
    expect((await post(UNKNOWN)).status).toBe(404);
    expect((await k.http().post(path('not-a-uuid')).set('Authorization', await auth())).status).toBe(400);
    const searchBefore = k.searchCalls.count;
    const llmCallsBefore = (k.llm as { calls: unknown[] }).calls.length;
    const res = await post(incomplete.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'project_incomplete' });
    expect(k.searchCalls.count).toBe(searchBefore);
    expect((k.llm as { calls: unknown[] }).calls.length).toBe(llmCallsBefore);
    expect([...k.budgets.rows.values()].filter((row) => row.kitchenProjectId === incomplete.id)).toEqual([]);
  });

  it('Scenario 2: reads are owner-only (404 foreign, 403 professional, 400 malformed ids)', async () => {
    await start();
    const project = await ownedProject();
    const created = await post(project.id);
    await settle(project.id, created.body.budget.id);
    const one = `/kitchen-projects/${project.id}/budgets/${created.body.budget.id}`;
    expect((await get(one)).status).toBe(200);
    expect((await get(one, OTHER_SUB)).status).toBe(404);
    expect((await get(`/kitchen-projects/${project.id}/budgets`, OTHER_SUB)).status).toBe(404);
    expect((await k.http().get(one)).status).toBe(401);
    expect((await k.http().get(one).set('Authorization', await auth(HOMEOWNER_SUB, ['professional']))).status).toBe(403);
    expect((await get(`/kitchen-projects/${project.id}/budgets/${UNKNOWN}`)).status).toBe(404);
    expect((await get(`/kitchen-projects/${project.id}/budgets/nope`)).status).toBe(400);
  });

  it('Scenario 2: 409 budget_in_progress, 409 budget_limit_reached on the 6th non-failed, failed ones do not count', async () => {
    const gates = new GateQueue();
    await start({ llmOptions: { gate: gates.next }, budgetConfig: { maxPerProject: 2 } });
    const project = await ownedProject();
    const first = await post(project.id);
    expect(first.status).toBe(202);
    const busy = await post(project.id);
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe('budget_in_progress');
    gates.open(0);
    await settle(project.id, first.body.budget.id);
    const second = await post(project.id);
    await flush();
    gates.open(1);
    await settle(project.id, second.body.budget.id);
    const limit = await post(project.id);
    expect(limit.status).toBe(409);
    expect(limit.body.code).toBe('budget_limit_reached');
    expect(k.budgets.rows.size).toBe(2);
    // A failed Budget frees a slot.
    const failedRow = [...k.budgets.rows.values()][0];
    Object.assign(failedRow as object, { status: 'failed', errorCode: 'timeout' });
    const again = await post(project.id);
    expect(again.status).toBe(202);
    await flush();
    gates.open(2);
    await settle(project.id, again.body.budget.id);
  });

  it('Scenario 2: 429 gpu_queue_full leaves no row; queued Budgets show their position', async () => {
    const gates = new GateQueue();
    await start({ llmOptions: { gate: gates.next }, broker: { maxQueued: 1 } });
    const a = await ownedProject();
    const b = await ownedProject();
    const c = await ownedProject();
    expect((await post(a.id)).status).toBe(202);
    const queued = await post(b.id);
    expect(queued.status).toBe(202);
    const view = await get(`/kitchen-projects/${b.id}/budgets/${queued.body.budget.id}`);
    expect(view.body).toMatchObject({ status: 'queued', position: 1, waitingFor: 'llm' });
    const full = await post(c.id);
    expect(full.status).toBe(429);
    expect(full.body).toEqual({ statusCode: 429, message: 'Too Many Requests', code: 'gpu_queue_full' });
    expect([...k.budgets.rows.values()].filter((row) => row.kitchenProjectId === c.id)).toEqual([]);
    await flush();
    gates.open(0);
    await settle(a.id, (await get(`/kitchen-projects/${a.id}/budgets`)).body.budgets[0].id);
    await flush();
    gates.open(1);
    await settle(b.id, queued.body.budget.id);
    expect((k.llm as { maxActive: number }).maxActive).toBe(1);
  });

  it('Scenario 2: embedder down gives 503 embedding_unavailable, an empty index 409 catalog_empty; no row, no broker job', async () => {
    await start({ catalogHits: new Error('embedder down') });
    const project = await ownedProject();
    const down = await post(project.id);
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ statusCode: 503, message: 'Service Unavailable', code: 'embedding_unavailable' });
    expect(k.budgets.rows.size).toBe(0);
    await k.app.close();
    await start({ catalogHits: [] });
    const other = await ownedProject();
    const empty = await post(other.id);
    expect(empty.status).toBe(409);
    expect(empty.body.code).toBe('catalog_empty');
    expect(k.budgets.rows.size).toBe(0);
    expect((k.llm as { calls: unknown[] }).calls).toHaveLength(0);
  });

  it('database failure gives 503 without a code', async () => {
    await start();
    const project = await ownedProject();
    k.budgets.failNext = new Error('db down');
    const res = await post(project.id);
    expect(res.status).toBe(503);
  });

  it('Scenario 3: a Line Item quoting 199.90 against a chunk printing 189.90 is rejected and in no total', async () => {
    const llm = new ScriptedLlm([answer([item('BM-SYN-WTP-300', '199.90'), item('BM-SYN-WTP-300', '189.90', '1')])]);
    await start({ llm });
    const project = await ownedProject();
    const created = await post(project.id);
    const done = await settle(project.id, created.body.budget.id);
    expect(done.status).toBe('succeeded');
    expect(llm.calls).toHaveLength(1); // kept items exist everywhere: no retry
    expect(done.tiers[0].items).toHaveLength(1);
    expect(done.tiers[0].items[0]).toMatchObject({ quotedPrice: '189.90', unitPriceCents: 18990, subtotalCents: 18990 });
    expect(JSON.stringify(done)).not.toContain('199.90');
    expect(done.tiers[0].totalCents).toBe(18990);
    expect(llm.calls[0]?.jsonSchema).toBeDefined();
  });

  it('Scenario 3: all items rejected retries exactly once with feedback, then verification_failed', async () => {
    const bad = answer([item('BM-SYN-WTP-300', '199.90')], [item('BM-SYN-WTP-300', '199.90')]);
    const llm = new ScriptedLlm([bad]);
    await start({ llm });
    const project = await ownedProject();
    const created = await post(project.id);
    const done = await settle(project.id, created.body.budget.id);
    expect(done).toMatchObject({ status: 'failed', errorCode: 'verification_failed', tiers: [] });
    expect(llm.calls).toHaveLength(2);
    const retry = llm.calls[1]?.messages.at(-1)?.content ?? '';
    expect(retry).toContain('rejected');
    expect(retry).toContain('price');
    expect(llm.calls[0]?.messages).toHaveLength(2);
  });

  it('Scenario 3: a retry that fixes the answer succeeds; malformed JSON retries once then fails', async () => {
    const fixed = new ScriptedLlm(['{oops', GOOD]);
    await start({ llm: fixed });
    const project = await ownedProject();
    const ok = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(ok.status).toBe('succeeded');
    expect(fixed.calls).toHaveLength(2);
    expect(k.budgets.rows.get(ok.id)).toMatchObject({ attempts: 2, promptTokens: 200, completionTokens: 100 });
    await k.app.close();
    const broken = new ScriptedLlm(['{oops']);
    await start({ llm: broken });
    const other = await ownedProject();
    const failed = await settle(other.id, (await post(other.id)).body.budget.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'verification_failed' });
    expect(broken.calls).toHaveLength(2);
  });

  it('Scenario 5: adapter error -> adapter_error; broker timeout -> timeout; the next POST is 202', async () => {
    await start({ llm: new ScriptedLlm([new Error('boom backend secret')]) });
    const project = await ownedProject();
    const failed = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'adapter_error' });
    expect(JSON.stringify(failed)).not.toContain('secret');
    expect((await post(project.id)).status).toBe(202);
    await k.app.close();

    const never = () => new Promise<void>(() => undefined);
    await start({ llm: new ScriptedLlm([GOOD], never), broker: { llmTimeoutMs: 30 } });
    const other = await ownedProject();
    const timedOut = await settle(other.id, (await post(other.id)).body.budget.id);
    expect(timedOut).toMatchObject({ status: 'failed', errorCode: 'timeout' });
  });

  it('OpenAPI: budget routes are bearer-only with 202/409/429/503 on the POST', async () => {
    await start();
    const doc = (await k.http().get('/docs-json')).body;
    const post202 = doc.paths['/kitchen-projects/{projectId}/budget'].post;
    expect(Object.keys(post202.responses)).toEqual(expect.arrayContaining(['202', '400', '401', '403', '404', '409', '429', '503']));
    for (const path of ['/kitchen-projects/{projectId}/budgets', '/kitchen-projects/{projectId}/budgets/{budgetId}']) {
      expect(doc.paths[path].get.security).toEqual([{ bearer: [] }]);
    }
  });
});
