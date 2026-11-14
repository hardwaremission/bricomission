import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { LlmAdapter, LlmRequest, LlmResult } from '../../src/ai/adapters/llm-adapter.js';
import { createKitchenApp, HOMEOWNER_SUB, type KitchenApp, type KitchenAppOptions, OTHER_SUB } from '../support/kitchen-app.js';
import { flush, GateQueue } from '../gpu-test-helpers.js';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const TIERS = ['luxury', 'high', 'medium', 'low'];
const VIEW_KEYS = ['createdAt', 'currency', 'errorCode', 'finishedAt', 'id', 'lineItemsCount', 'position', 'progress', 'relabeled', 'simulationId', 'stage', 'startedAt', 'status', 'tiers', 'vatPercent', 'waitingFor'];
const INVENTORY = JSON.stringify({ elements: [{ category: 'base_cabinet', label: 'Base cabinets', count: 3 }] });

/**
 * An LlmAdapter that answers budget calls from a script (the last answer repeats; an Error is thrown) and
 * inventory calls from `inventories` (the last repeats). `gate` runs on every call.
 */
class ScriptedLlm implements LlmAdapter {
  readonly calls: LlmRequest[] = [];
  constructor(
    private readonly answers: Array<string | Error>,
    private readonly gate?: () => Promise<void>,
    private readonly inventories: string[] = [INVENTORY],
  ) {}

  get budgetCalls(): LlmRequest[] {
    return this.calls.filter((call) => call.task === 'budget');
  }

  get inventoryCalls(): LlmRequest[] {
    return this.calls.filter((call) => call.task === 'inventory');
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    this.calls.push(req);
    await this.gate?.();
    if (req.task === 'inventory') {
      return { text: this.inventories[Math.min(this.inventoryCalls.length - 1, this.inventories.length - 1)] as string, promptTokens: 10, completionTokens: 5 };
    }
    const answer = this.answers[Math.min(this.budgetCalls.length - 1, this.answers.length - 1)] as string | Error;
    if (answer instanceof Error) throw answer;
    return { text: answer, promptTokens: 100, completionTokens: 50 };
  }
}

// Sample catalog (edition 1): chunk 1 = worktops, chunk 2 = cabinets.
const item = (sku: string, price: string, quantity = '1', chunkRef = 1) => ({ name: `Product ${sku}`, sku, chunkRef, quotedPrice: price, quantity, unit: 'unit' });
const A = (quantity = '1') => item('BM-SYN-WTP-240', '649.00', quantity); // 649.00
const B = (quantity = '1') => item('BM-SYN-WTP-300', '189.90', quantity); // 189.90
const C = (quantity = '1') => item('BM-SYN-CAB-060', '129.00', quantity, 2); // 129.00
const D = (quantity = '1') => item('BM-SYN-CAB-040', '96.50', quantity, 2); // 96.50
const tiersOf = (luxury: object[], high: object[], medium: object[], low: object[]) => JSON.stringify({ tiers: { luxury: { items: luxury }, high: { items: high }, medium: { items: medium }, low: { items: low } } });
/** luxury 649.00 > high 379.80 > medium 129.00 > low 96.50 */
const ORDERED = tiersOf([A()], [B('2')], [C()], [D()]);
/** luxury 189.90 < high 649.00: out of order. */
const UNORDERED = tiersOf([B()], [A()], [C()], [D()]);
const GOOD = ORDERED;

/** Waits until the adapter has been called `count` times (the vision step takes real time: image scaling). */
async function gateRequested(gates: GateQueue, count: number): Promise<void> {
  for (let i = 0; i < 400 && gates.gates.length < count; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(gates.gates.length).toBeGreaterThanOrEqual(count);
}

/** Opens every gate as it appears until `until` settles (several jobs wait on gates in order). */
async function release<T>(gates: GateQueue, until: () => Promise<T>): Promise<T> {
  let done = false;
  const result = until().finally(() => {
    done = true;
  });
  while (!done) {
    gates.gates.forEach((gate) => gate.open());
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return result;
}

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

  /** A claimed project; when ready it also has a finished, selected Simulation (the Budget precondition). */
  async function ownedProject(sub = HOMEOWNER_SUB, ready = true, selected = true) {
    const seeded = await k.seedDraft(ready ? { photo: true, measurements: true, moodboard: true } : { photo: true });
    const claimed = await k.claim(await k.token(sub), seeded.draftToken);
    expect(claimed.status).toBe(200);
    const project = claimed.body.project as { id: string };
    if (ready && selected) k.seedReadySimulation(project.id);
    return project;
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

  it('Scenario 1: 202 queued, inventory then pricing, succeeded with four ordered tiers citing the chunk page; the recompute keeps the old Budget until the new one succeeds', async () => {
    const gates = new GateQueue();
    await start({ llmOptions: { gate: gates.next } });
    const project = await ownedProject();
    const created = await post(project.id);
    expect(created.status).toBe(202);
    expect(Object.keys(created.body)).toEqual(['budget']);
    expect(Object.keys(created.body.budget).sort()).toEqual(VIEW_KEYS);
    expect(['queued', 'running']).toContain(created.body.budget.status);
    expect(created.body.budget).toMatchObject({ stage: 'inventory', progress: { total: 1, done: 0 }, relabeled: false, currency: 'EUR', vatPercent: 21, errorCode: null, lineItemsCount: 0, tiers: [] });
    await gateRequested(gates, 1);
    gates.open(0); // the inventory job
    for (let i = 0; i < 200 && (await get(`/kitchen-projects/${project.id}/budgets/${created.body.budget.id}`)).body.stage !== 'pricing'; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    const pricing = await get(`/kitchen-projects/${project.id}/budgets/${created.body.budget.id}`);
    expect(pricing.body).toMatchObject({ status: 'running', stage: 'pricing', progress: { total: 1, done: 1 } });
    await gateRequested(gates, 2);
    gates.open(1);
    const done = await settle(project.id, created.body.budget.id);
    expect(done.status).toBe('succeeded');
    expect(done.relabeled).toBe(false);
    expect(done.tiers.map((t: { tier: string }) => t.tier)).toEqual(TIERS);
    const totals = done.tiers.map((t: { totalCents: number }) => t.totalCents);
    expect(totals).toEqual([...totals].sort((x: number, y: number) => y - x));
    expect(new Set(totals).size).toBe(4);
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
    expect((await get(`/kitchen-projects/${project.id}/simulations`)).body.simulations[0].budget).toEqual({ id: done.id, status: 'succeeded' });

    // Recompute: the inventory is cached on the Render (no new vision call); the old Budget stays readable until the new one succeeds.
    k.clock.now = new Date(k.clock.now.getTime() + 60_000);
    const second = await post(project.id);
    expect(second.status).toBe(202);
    expect(second.body.budget.progress).toEqual({ total: 1, done: 1 });
    expect(second.body.budget.stage).toBe('pricing');
    await flush();
    const during = await get(`/kitchen-projects/${project.id}/budgets`);
    expect(during.body.budgets.map((b: { id: string; status: string }) => [b.id, b.status === 'succeeded'])).toEqual([[second.body.budget.id, false], [done.id, true]]);
    expect((await get(`/kitchen-projects/${project.id}/budgets/${done.id}`)).body.tiers).toHaveLength(4);
    await gateRequested(gates, 3);
    gates.open(2);
    const replaced = await settle(project.id, second.body.budget.id);
    expect(replaced.status).toBe('succeeded');
    const list = await get(`/kitchen-projects/${project.id}/budgets`);
    expect(list.status).toBe(200);
    expect(list.body.budgets.map((b: { id: string }) => b.id)).toEqual([second.body.budget.id]);
    expect(Object.keys(list.body)).toEqual(['budgets']);
    expect((await get(`/kitchen-projects/${project.id}/budgets/${done.id}`)).status).toBe(404);
    expect((k.llm as { calls: Array<{ task?: string }> }).calls.filter((call) => call.task === 'inventory')).toHaveLength(1);
    // 500 truncated the real inventory JSON; the vision read must keep room for 570-690 tokens.
    expect((k.llm as { calls: Array<{ task?: string; maxTokens?: number }> }).calls.find((call) => call.task === 'inventory')?.maxTokens).toBe(1200);
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
    // The fake answers a strictly ordered Budget by default: no retry, no relabel.
    expect(a.relabeled).toBe(false);
    const totals = a.tiers.map((t: { totalCents: number }) => t.totalCents);
    expect(totals.every((total: number, i: number) => i === 0 || (totals[i - 1] as number) > total)).toBe(true);
    expect([...k.budgets.rows.values()].every((row) => row.attempts === 1)).toBe(true);
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

  it('Scenario 2: 409 budget_in_progress; the selection is required (409 no_simulation_selected / simulation_not_ready) and the broker never runs', async () => {
    const gates = new GateQueue();
    await start({ llmOptions: { gate: gates.next } });
    const project = await ownedProject();
    const first = await post(project.id);
    expect(first.status).toBe(202);
    const busy = await post(project.id);
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe('budget_in_progress');
    await release(gates, () => settle(project.id, first.body.budget.id));
    // No per-project cap any more: further recomputes keep succeeding.
    for (let i = 0; i < 3; i++) {
      const again = await post(project.id);
      expect(again.status).toBe(202);
      await release(gates, () => settle(project.id, again.body.budget.id));
    }
    expect(k.budgets.rows.size).toBe(1);

    const none = await ownedProject(HOMEOWNER_SUB, true, false);
    const calls = (k.llm as { calls: unknown[] }).calls.length;
    const unselected = await post(none.id);
    expect(unselected.status).toBe(409);
    expect(unselected.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'no_simulation_selected' });
    expect((await get(`/kitchen-projects/${none.id}/budgets`)).body).toEqual({ budgets: [] });

    const partial = await ownedProject();
    for (const render of k.renders.rows.values()) if (render.kitchenProjectId === partial.id) render.status = 'failed';
    const notReady = await post(partial.id);
    expect(notReady.status).toBe(409);
    expect(notReady.body.code).toBe('simulation_not_ready');
    expect((k.llm as { calls: unknown[] }).calls.length).toBe(calls);
  });

  it('Scenario 2: 429 gpu_queue_full leaves no row; queued Budgets show their position', async () => {
    const gates = new GateQueue();
    await start({ llmOptions: { gate: gates.next }, broker: { maxQueued: 1 } });
    const a = await ownedProject();
    const b = await ownedProject();
    const c = await ownedProject();
    const first = await post(a.id);
    expect(first.status).toBe(202);
    const queued = await post(b.id);
    expect(queued.status).toBe(202);
    const view = await get(`/kitchen-projects/${b.id}/budgets/${queued.body.budget.id}`);
    expect(view.body).toMatchObject({ status: 'queued', position: 1, waitingFor: 'llm' });
    const full = await post(c.id);
    expect(full.status).toBe(429);
    expect(full.body).toEqual({ statusCode: 429, message: 'Too Many Requests', code: 'gpu_queue_full' });
    expect([...k.budgets.rows.values()].filter((row) => row.kitchenProjectId === c.id)).toEqual([]);
    await release(gates, async () => {
      await settle(a.id, first.body.budget.id);
      return settle(b.id, queued.body.budget.id);
    });
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

  it('Scenario 3: a Line Item quoting 659.00 against a chunk printing 649.00 is rejected and in no total', async () => {
    const llm = new ScriptedLlm([tiersOf([item('BM-SYN-WTP-240', '659.00'), A()], [B('2')], [C()], [D()])]);
    await start({ llm });
    const project = await ownedProject();
    const created = await post(project.id);
    const done = await settle(project.id, created.body.budget.id);
    expect(done.status).toBe('succeeded');
    expect(llm.budgetCalls).toHaveLength(1); // kept items exist everywhere and the totals are ordered: no retry
    expect(done.tiers[0].items).toHaveLength(1);
    expect(done.tiers[0].items[0]).toMatchObject({ quotedPrice: '649.00', unitPriceCents: 64900, subtotalCents: 64900 });
    expect(JSON.stringify(done)).not.toContain('659.00');
    expect(done.tiers[0].totalCents).toBe(64900);
    expect(llm.budgetCalls[0]?.jsonSchema).toBeDefined();
  });

  it('Scenario 3: all items rejected retries with feedback up to BUDGET_MAX_ATTEMPTS (3), then verification_failed', async () => {
    const bad = tiersOf([item('BM-SYN-WTP-300', '199.90')], [item('BM-SYN-WTP-300', '199.90')], [item('BM-SYN-WTP-300', '199.90')], [item('BM-SYN-WTP-300', '199.90')]);
    const llm = new ScriptedLlm([bad]);
    await start({ llm });
    const project = await ownedProject();
    const created = await post(project.id);
    const done = await settle(project.id, created.body.budget.id);
    expect(done).toMatchObject({ status: 'failed', errorCode: 'verification_failed', tiers: [] });
    expect(llm.budgetCalls).toHaveLength(3);
    const retry = llm.budgetCalls[1]?.messages.at(-1)?.content ?? '';
    expect(retry).toContain('rejected');
    expect(retry).toContain('price');
    expect(llm.budgetCalls[0]?.messages).toHaveLength(2);
  });

  it('Scenario 3: a retry that fixes the answer succeeds; malformed JSON retries then fails', async () => {
    const fixed = new ScriptedLlm(['{oops', GOOD]);
    await start({ llm: fixed });
    const project = await ownedProject();
    const ok = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(ok.status).toBe('succeeded');
    expect(fixed.budgetCalls).toHaveLength(2);
    expect(k.budgets.rows.get(ok.id)).toMatchObject({ attempts: 2, promptTokens: 200, completionTokens: 100 });
    await k.app.close();
    const broken = new ScriptedLlm(['{oops']);
    await start({ llm: broken });
    const other = await ownedProject();
    const failed = await settle(other.id, (await post(other.id)).body.budget.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'verification_failed' });
    expect(broken.budgetCalls).toHaveLength(3);
  });

  it('OQ-5: an out-of-order attempt is rejected with feedback naming the totals, the retry succeeds without relabel', async () => {
    const llm = new ScriptedLlm([UNORDERED, ORDERED]);
    await start({ llm });
    const project = await ownedProject();
    const done = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(done).toMatchObject({ status: 'succeeded', relabeled: false });
    expect(llm.budgetCalls).toHaveLength(2);
    const feedback = String(llm.budgetCalls[1]?.messages.at(-1)?.content);
    expect(feedback).toContain('luxury 189.90 EUR, high 649.00 EUR, medium 129.00 EUR, low 96.50 EUR');
    expect(feedback).toContain('luxury > high > medium > low');
    expect(done.tiers.map((t: { totalCents: number }) => t.totalCents)).toEqual([64900, 37980, 12900, 9650]);
    expect(k.budgets.rows.get(done.id)?.attempts).toBe(2);
  });

  it('OQ-5: still out of order after the last attempt relabels the tiers by total rank (names only), relabeled = true', async () => {
    const llm = new ScriptedLlm([UNORDERED]);
    await start({ llm });
    const project = await ownedProject();
    const done = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(llm.budgetCalls).toHaveLength(3);
    expect(done).toMatchObject({ status: 'succeeded', relabeled: true });
    expect(done.tiers.map((t: { tier: string }) => t.tier)).toEqual(TIERS);
    // The totals, SKUs and prices are exactly the verified ones: only the names moved (649.00 was the "high" tier).
    expect(done.tiers.map((t: { totalCents: number }) => t.totalCents)).toEqual([64900, 18990, 12900, 9650]);
    expect(done.tiers.map((t: { items: Array<{ sku: string }> }) => t.items[0]?.sku)).toEqual(['BM-SYN-WTP-240', 'BM-SYN-WTP-300', 'BM-SYN-CAB-060', 'BM-SYN-CAB-040']);
    expect(done.tiers[0].items[0]).toMatchObject({ quotedPrice: '649.00', unitPriceCents: 64900, subtotalCents: 64900 });
    expect(k.budgets.rows.get(done.id)?.attempts).toBe(3);
  });

  it('OQ-5: equal totals even after ranking fail verification_failed', async () => {
    const tie = tiersOf([A()], [A()], [C()], [D()]);
    const llm = new ScriptedLlm([tie]);
    await start({ llm });
    const project = await ownedProject();
    const done = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(llm.budgetCalls).toHaveLength(3);
    expect(done).toMatchObject({ status: 'failed', errorCode: 'verification_failed', tiers: [], relabeled: false });
  });

  it('OQ-5: the fake adapter in misordered mode exercises retry and relabel end to end', async () => {
    await start({ llmOptions: { budgetOrder: 'misordered' } });
    const project = await ownedProject();
    const done = await settle(project.id, (await post(project.id)).body.budget.id);
    expect((k.llm as { calls: Array<{ task?: string }> }).calls.filter((call) => call.task === 'budget')).toHaveLength(3);
    expect(done).toMatchObject({ status: 'succeeded', relabeled: true });
    const totals = done.tiers.map((t: { totalCents: number }) => t.totalCents);
    expect(totals.every((total: number, i: number) => i === 0 || (totals[i - 1] as number) > total)).toBe(true);
  });

  it('OQ-5: when the last attempt fails verification the latest complete (verified) answer is relabelled', async () => {
    const llm = new ScriptedLlm([UNORDERED, UNORDERED, '{oops']);
    await start({ llm });
    const project = await ownedProject();
    const done = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(done).toMatchObject({ status: 'succeeded', relabeled: true });
    expect(done.tiers.map((t: { totalCents: number }) => t.totalCents)).toEqual([64900, 18990, 12900, 9650]);
  });

  it('inventory: one vision job per Render image (<= 768 px, cached), merged by max count, extends the retrieval queries and the prompt', async () => {
    const inventories = [
      JSON.stringify({ elements: [{ category: 'base_cabinet', label: 'Base cabinets', count: 4 }, { category: 'sink', label: 'Steel sink', count: 1 }] }),
      JSON.stringify({ elements: [{ category: 'base_cabinet', label: 'Base units', count: 6 }, { category: 'bogus', label: 'x', count: 9 }] }),
      JSON.stringify({ elements: [{ category: 'base_cabinet', label: 'Base cabinets', count: 5 }, { category: 'hob', label: 'Induction hob', count: 1 }] }),
    ];
    const llm = new ScriptedLlm([GOOD], undefined, inventories);
    await start({ llm });
    const project = await ownedProject(HOMEOWNER_SUB, true, false);
    const simulation = k.seedReadySimulation(project.id, { renders: 3 });
    const searchBefore = k.searchCalls.count;
    const done = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(done.status).toBe('succeeded');
    expect(llm.inventoryCalls).toHaveLength(3);
    for (const call of llm.inventoryCalls) {
      const part = (call.messages[1]?.content as Array<{ type: string; data?: Buffer }>).find((p) => p.type === 'image');
      const meta = await sharp(part?.data).metadata();
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(768);
    }
    // Retrieval: 8 fixed queries + one extra ("hob cooktop"; base cabinet and sink are covered by the fixed ones).
    expect(k.searchCalls.count - searchBefore).toBe(9);
    // The merged inventory is in the pricing prompt: the highest count per category, never the sum.
    const prompt = llm.budgetCalls[0]?.messages.map((m) => String(m.content)).join('\n') ?? '';
    expect(prompt).toContain('6 x base cabinet (Base cabinets; Base units)');
    expect(prompt).toContain('1 x hob (Induction hob)');
    expect(prompt).toContain('1 x sink (Steel sink)');
    expect(prompt).not.toContain('15 x');
    expect(prompt).not.toContain('bogus');
    // Cached on every Render: a recompute reads no image again and its progress starts complete.
    for (const render of k.renders.rows.values()) if (render.simulationId === simulation.id) expect(render.inventory).toMatchObject({ elements: expect.any(Array) });
    const again = await post(project.id);
    expect(again.body.budget).toMatchObject({ stage: 'pricing', progress: { total: 3, done: 3 } });
    await settle(project.id, again.body.budget.id);
    expect(llm.inventoryCalls).toHaveLength(3);
  });

  it('inventory: a failed vision read skips that image only; the Budget is still priced', async () => {
    const llm = new ScriptedLlm([GOOD], undefined, ['{not json']);
    await start({ llm });
    const project = await ownedProject();
    const done = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(done.status).toBe('succeeded');
    expect(llm.inventoryCalls).toHaveLength(1);
    expect(String(llm.budgetCalls[0]?.messages[1]?.content)).not.toContain('Room inventory');
  });

  it('recompute: a failed recompute keeps the old Budget; the next compute removes the failed row; delete cascades with the Simulation', async () => {
    const llm = new ScriptedLlm([GOOD, new Error('boom'), GOOD]);
    await start({ llm });
    const project = await ownedProject();
    const first = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(first.status).toBe('succeeded');
    k.clock.now = new Date(k.clock.now.getTime() + 60_000); // newest-first order needs distinct creation times
    const failed = await settle(project.id, (await post(project.id)).body.budget.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'adapter_error' });
    const list = await get(`/kitchen-projects/${project.id}/budgets`);
    expect(list.body.budgets.map((b: { id: string; status: string }) => [b.id, b.status])).toEqual([[failed.id, 'failed'], [first.id, 'succeeded']]);
    const third = await post(project.id);
    expect(third.status).toBe(202);
    expect(k.budgets.rows.has(failed.id)).toBe(false);
    await settle(project.id, third.body.budget.id);
    expect(k.budgets.rows.size).toBe(1);
    const sim = (await get(`/kitchen-projects/${project.id}/simulations`)).body.simulations[0];
    expect(sim.budget).toMatchObject({ status: 'succeeded' });
    const del = await k.http().delete(`/kitchen-projects/${project.id}/simulations/${sim.id}`).set('Authorization', await auth());
    expect(del.status).toBe(204);
    expect(k.budgets.rows.size).toBe(0);
    expect((await get(`/kitchen-projects/${project.id}/budgets/${third.body.budget.id}`)).status).toBe(404);
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
