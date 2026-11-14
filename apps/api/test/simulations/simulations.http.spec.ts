import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GpuJobBrokerService } from '../../src/ai/jobs/gpu-job-broker.service.js';
import { ipAdapterWeight, renderSeed, seededWeights } from '../../src/kitchen-projects/simulations/calculated-style.js';
import { createKitchenApp, HOMEOWNER_SUB, type KitchenApp, type KitchenAppOptions, OTHER_SUB } from '../support/kitchen-app.js';
import { flush, GateQueue } from '../gpu-test-helpers.js';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const SIM_KEYS = ['blendMode', 'budget', 'createdAt', 'id', 'ordinal', 'progress', 'renders', 'selected', 'stage', 'status', 'style', 'styleDegraded'];
const RENDER_KEYS = [
  'attempts',
  'beforeUrl',
  'createdAt',
  'errorCode',
  'finishedAt',
  'fullUrl',
  'height',
  'id',
  'mode',
  'photoId',
  'photoPosition',
  'position',
  'simulationId',
  'startedAt',
  'status',
  'thumbUrl',
  'waitingFor',
  'width',
];

// Feature simulations-ux-overhaul, phase B, Scenarios 1-4: Simulations over the fake adapters, the
// memory repositories and the memory storage (no GPU, database, MinIO or Keycloak).
describe('HTTP /kitchen-projects/:projectId/simulations', () => {
  let k: KitchenApp;

  afterEach(async () => {
    await k?.app.close();
  });

  async function start(options: KitchenAppOptions = {}) {
    k = await createKitchenApp(options);
    return k;
  }

  const get = async (path: string, sub = HOMEOWNER_SUB) => k.http().get(path).set('Authorization', await k.bearer(sub));
  const simPath = (projectId: string, id = '') => `/kitchen-projects/${projectId}/simulations${id ? `/${id}` : ''}`;

  /** Waits until `check` is true (jobs run in the background of the POST). */
  async function until(check: () => boolean | Promise<boolean>) {
    for (let i = 0; i < 300; i++) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('condition not reached');
  }

  it('Scenario 1: 3 photos and 2 references give one Simulation, 3 Renders, "n of N" progress and one shared style', async () => {
    const llmGates = new GateQueue();
    const imageGates = new GateQueue();
    await start({ llmOptions: { gate: llmGates.next }, image: { gate: imageGates.next } });
    const project = await k.ownedProject(HOMEOWNER_SUB, 3);
    const res = await k.createSimulation(project.id);
    expect(res.status).toBe(202);
    const created = res.body.simulation;
    expect(Object.keys(created).sort()).toEqual(SIM_KEYS);
    expect(Object.keys(created.renders[0]).sort()).toEqual(RENDER_KEYS);
    expect(created).toMatchObject({ ordinal: 1, status: 'active', stage: 'describing', selected: false, blendMode: 'both', styleDegraded: false, budget: null });
    expect(created.progress).toEqual({ total: 3, succeeded: 0, failed: 0, current: 0 });
    expect(created.renders.map((r: { photoPosition: number }) => r.photoPosition)).toEqual([0, 1, 2]);
    expect(created.style.references).toHaveLength(2);
    expect(created.style.references.reduce((sum: number, r: { weightPercent: number }) => sum + r.weightPercent, 0)).toBe(100);
    expect(JSON.stringify(res.body)).not.toMatch(/prompt|seed|gpuJob|comfy|traits/i);

    // describing: two references, one vision call each, held by the gate.
    await until(() => llmGates.gates.length === 1);
    expect((await get(simPath(project.id, created.id))).body).toMatchObject({ stage: 'describing' });
    llmGates.open(0);
    await until(() => llmGates.gates.length === 2);
    llmGates.open(1);
    // rendering: current 1, 2, 3 as each image job finishes.
    for (let n = 1; n <= 3; n++) {
      await until(() => imageGates.gates.length === n);
      const view = (await get(simPath(project.id, created.id))).body;
      expect(view).toMatchObject({ stage: 'rendering', status: 'active' });
      expect(view.progress).toEqual({ total: 3, succeeded: n - 1, failed: 0, current: n });
      imageGates.open(n - 1);
    }
    const done = await k.settleSimulation(project.id, created.id);
    expect(done).toMatchObject({ status: 'succeeded', stage: 'finished', styleDegraded: false });
    expect(done.progress).toEqual({ total: 3, succeeded: 3, failed: 0, current: 0 });
    expect(done.style.keywords.length).toBeGreaterThan(0);
    expect(done.renders.map((r: { status: string; photoPosition: number }) => [r.status, r.photoPosition])).toEqual([['succeeded', 0], ['succeeded', 1], ['succeeded', 2]]);

    // Every Render has before/full/thumb objects, metadata-free JPEGs.
    for (const render of done.renders) {
      const base = `kitchen-projects/${project.id}/renders/${render.id}`;
      for (const variant of ['before', 'full', 'thumb']) {
        const object = k.storage.objects.get(`${base}/${variant}.jpg`);
        expect(object?.contentType, `${render.id} ${variant}`).toBe('image/jpeg');
        const meta = await sharp(object!.body).metadata();
        expect(meta.format).toBe('jpeg');
        expect(meta.exif).toBeUndefined();
        expect((await get(`/kitchen-projects/${project.id}/renders/${render.id}/content?variant=${variant}`)).status).toBe(200);
      }
    }
    // One style seed: the render seed is hash(styleSeed, photo position); first Simulation = equal weights.
    const row = k.simulations.rows.get(created.id)!;
    expect(k.image.calls.map((call) => call.seed)).toEqual([0, 1, 2].map((position) => renderSeed(row.styleSeed, position)));
    expect(new Set(k.image.calls.map((call) => call.seed)).size).toBe(3);
    expect(row.styleWeights?.map((w) => w.weight)).toEqual([0.5, 0.5]);
    // Mode `both` (default): merged traits text in the prompt and 2 references at the reduced base weight.
    expect(k.image.calls[0]?.prompt).toContain(row.styleText);
    expect(k.image.calls[0]?.references?.map((r) => r.weight)).toEqual([ipAdapterWeight(0.4, 2, 0.5), ipAdapterWeight(0.4, 2, 0.5)]);
    expect(k.llm.calls.every((call) => call.task === 'style_traits')).toBe(true);
    expect(k.llm.calls).toHaveLength(2);
  });

  it('Scenario 1: "Generate again" draws new bounded weights that follow from the stored seed; the vision cache needs no new GPU work', async () => {
    await start();
    const project = await k.ownedProject(HOMEOWNER_SUB, 1);
    const first = (await k.createSimulation(project.id)).body.simulation;
    await k.settleSimulation(project.id, first.id);
    const llmCalls = k.llm.calls.length;
    const second = (await k.createSimulation(project.id)).body.simulation;
    expect(second.ordinal).toBe(2);
    await k.settleSimulation(project.id, second.id);
    expect(k.llm.calls).toHaveLength(llmCalls); // both references were cached by the first Simulation
    const row = k.simulations.rows.get(second.id)!;
    const weights = row.styleWeights!.map((w) => w.weight);
    expect(weights).toEqual(seededWeights(2, row.styleSeed));
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(Math.max(...weights) / Math.min(...weights)).toBeLessThanOrEqual(3);
    expect(weights).not.toEqual([0.5, 0.5]);
    // Different weights, different tint of the fake Render.
    const tint = async (id: string) => {
      const sim = (await get(simPath(project.id, id))).body;
      return sharp(k.storage.objects.get(`kitchen-projects/${project.id}/renders/${sim.renders[0].id}/full.jpg`)!.body).resize(1, 1).raw().toBuffer();
    };
    expect((await tint(first.id)).equals(await tint(second.id))).toBe(false);
    // newest first
    expect((await get(simPath(project.id))).body.simulations.map((s: { ordinal: number }) => s.ordinal)).toEqual([2, 1]);
  });

  it('there is no per-project cap: 11 Simulations in a row are all accepted', async () => {
    await start();
    const project = await k.ownedProject(HOMEOWNER_SUB, 1, { gallery: true });
    for (let i = 1; i <= 11; i++) {
      const res = await k.createSimulation(project.id);
      expect(res.status, `simulation ${i}`).toBe(202);
      await k.settleSimulation(project.id, res.body.simulation.id);
    }
    expect((await get(simPath(project.id))).body.simulations).toHaveLength(11);
  });

  it('blend mode setting: vlm_text sends no references; ip_adapter skips the vision step; a missing row means both', async () => {
    await start();
    k.platformSettings.rows.set('style_blend_mode', { key: 'style_blend_mode', value: { mode: 'vlm_text' }, updatedAt: new Date(), updatedBy: null });
    const project = await k.ownedProject(HOMEOWNER_SUB, 1);
    const a = (await k.createSimulation(project.id)).body.simulation;
    expect(a.blendMode).toBe('vlm_text');
    await k.settleSimulation(project.id, a.id);
    expect(k.image.calls.at(-1)?.references).toEqual([]);
    expect(k.image.calls.at(-1)?.prompt).toContain(k.simulations.rows.get(a.id)!.styleText);
    expect(k.llm.calls).toHaveLength(2);

    k.platformSettings.rows.set('style_blend_mode', { key: 'style_blend_mode', value: { mode: 'ip_adapter' }, updatedAt: new Date(), updatedBy: null });
    const llmCalls = k.llm.calls.length;
    const b = (await k.createSimulation(project.id)).body.simulation;
    expect(b.blendMode).toBe('ip_adapter');
    const done = await k.settleSimulation(project.id, b.id);
    expect(k.llm.calls).toHaveLength(llmCalls);
    expect(k.image.calls.at(-1)?.references).toHaveLength(2);
    expect(k.image.calls.at(-1)?.prompt).toContain('modern kitchen');
    expect(done.styleDegraded).toBe(false);

    k.platformSettings.rows.set('style_blend_mode', { key: 'style_blend_mode', value: { mode: 'nonsense' }, updatedAt: new Date(), updatedBy: null });
    expect((await k.createSimulation(project.id)).body.simulation.blendMode).toBe('both');
  });

  it('a failing vision step does not fail the Simulation: dominant style text and styleDegraded', async () => {
    await start();
    vi.spyOn(k.llm, 'complete').mockRejectedValue(new Error('ECONNREFUSED http://llama-server:8080 secret'));
    const project = await k.ownedProject(HOMEOWNER_SUB, 1);
    const created = (await k.createSimulation(project.id)).body.simulation;
    const done = await k.settleSimulation(project.id, created.id);
    expect(done).toMatchObject({ status: 'succeeded', styleDegraded: true });
    expect(done.style.keywords).toEqual([]);
    expect(k.image.calls[0]?.prompt).toContain('modern kitchen');
    expect(JSON.stringify(done)).not.toMatch(/secret|llama-server/);
  });

  it('Scenario 2: every route is owner-only (401, 403, 404 for others and drafts, 400 malformed ids)', async () => {
    await start();
    const project = await k.ownedProject();
    const sim = (await k.createSimulation(project.id)).body.simulation;
    const done = await k.settleSimulation(project.id, sim.id);
    const renderId = done.renders[0].id;
    const draftId = (await k.seedDraft({})).id;
    const routes: Array<['get' | 'post' | 'put' | 'delete', string]> = [
      ['post', simPath(project.id)],
      ['get', simPath(project.id)],
      ['get', simPath(project.id, sim.id)],
      ['delete', simPath(project.id, sim.id)],
      ['put', `/kitchen-projects/${project.id}/selected-simulation`],
      ['post', `/kitchen-projects/${project.id}/renders/${renderId}/retry`],
      ['get', `/kitchen-projects/${project.id}/renders/${renderId}`],
      ['get', `/kitchen-projects/${project.id}/renders/${renderId}/content?variant=before`],
    ];
    for (const [method, path] of routes) {
      const call = async (token: string | null, p = path) => {
        let req = k.http()[method](p);
        if (token !== null) req = req.set('Authorization', token);
        return method === 'put' ? req.send({ simulationId: null }) : req;
      };
      expect((await call(null)).status, `${method} ${path} anonymous`).toBe(401);
      expect((await call(await k.bearer(HOMEOWNER_SUB, ['professional']))).status, `${method} ${path} professional`).toBe(403);
      expect((await call(await k.bearer(HOMEOWNER_SUB, ['admin']))).status, `${method} ${path} admin`).toBe(403);
      const other = await call(await k.bearer(OTHER_SUB));
      expect(other.status, `${method} ${path} other homeowner`).toBe(404);
      expect(other.body).toEqual({ message: 'Not Found', statusCode: 404 });
      expect((await call(await k.bearer(), path.replace(project.id, draftId))).status, `${method} ${path} draft id`).toBe(404);
    }
    expect((await get(simPath(project.id, 'not-a-uuid'))).status).toBe(400);
    expect((await get(simPath(project.id, UNKNOWN))).status).toBe(404);
    expect((await get(`/kitchen-projects/${project.id}/renders/${UNKNOWN}`)).status).toBe(404);
    expect((await get(`/kitchen-projects/${project.id}/renders/${renderId}/content?variant=huge`)).status).toBe(400);
    // A Simulation or Render of another project of the same owner is not found under this project.
    const second = await k.ownedProject();
    expect((await get(simPath(second.id, sim.id))).status).toBe(404);
    expect((await get(`/kitchen-projects/${second.id}/renders/${renderId}`)).status).toBe(404);
    expect((await k.http().post(`/kitchen-projects/${second.id}/renders/${renderId}/retry`).set('Authorization', await k.bearer())).status).toBe(404);
    // The removed routes are gone.
    expect((await k.http().post(`/kitchen-projects/${project.id}/renders`).set('Authorization', await k.bearer())).status).toBe(404);
    expect((await get(`/kitchen-projects/${project.id}/renders`)).status).toBe(404);
  });

  it('Scenario 2: not ready gives 409 project_incomplete and the broker is never called; a second POST or a delete while active gives 409', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next } });
    const submit = vi.spyOn(k.moduleRef.get(GpuJobBrokerService), 'submit');
    const seeded = await k.seedDraft({ photo: true });
    expect((await k.claim(await k.token(), seeded.draftToken)).status).toBe(200);
    const incomplete = await k.createSimulation(seeded.id);
    expect(incomplete.status).toBe(409);
    expect(incomplete.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'project_incomplete' });
    expect(submit).not.toHaveBeenCalled();
    expect(k.simulations.rows.size).toBe(0);
    expect(k.storage.keys().filter((key) => key.includes('/renders/'))).toEqual([]);

    const project = await k.ownedProject();
    const first = await k.createSimulation(project.id);
    expect(first.status).toBe(202);
    const busy = await k.createSimulation(project.id);
    expect(busy.status).toBe(409);
    expect(busy.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'simulation_in_progress' });
    const del = await k.http().delete(simPath(project.id, first.body.simulation.id)).set('Authorization', await k.bearer());
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('simulation_in_progress');
    // Another project of the same owner is independent.
    const other = await k.ownedProject();
    expect((await k.createSimulation(other.id)).status).toBe(202);
    await until(() => gates.gates.length >= 1);
    gates.open(0);
    await until(() => gates.gates.length >= 2);
    gates.open(1);
    await k.settleSimulation(project.id, first.body.simulation.id);
    await k.settleSimulation(other.id, (await get(simPath(other.id))).body.simulations[0].id);
  });

  it('Scenario 3b: the fake adapter\'s poison photo fails once without mocks; Retry heals it with the same seed', async () => {
    await start();
    const seeded = await k.seedDraft({ photo: true, measurements: true, moodboard: true });
    const poison = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 255, g: 0, b: 255 } } }).jpeg().toBuffer();
    const upload = await k.http().post('/kitchen-projects/drafts/current/photos').set('X-Draft-Token', seeded.draftToken).attach('photo', poison, { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(upload.status).toBe(201);
    const project = (await k.claim(await k.token(HOMEOWNER_SUB), seeded.draftToken)).body.project as { id: string };
    const created = (await k.createSimulation(project.id)).body.simulation;
    const partial = await k.settleSimulation(project.id, created.id);
    expect(partial.status).toBe('partial');
    expect(partial.renders.map((r: { status: string }) => r.status)).toEqual(['succeeded', 'failed']);
    expect(partial.renders[1]).toMatchObject({ errorCode: 'adapter_error', attempts: 1 });
    const retry = await k.http().post(`/kitchen-projects/${project.id}/renders/${partial.renders[1].id}/retry`).set('Authorization', await k.bearer());
    expect(retry.status).toBe(202);
    const healed = await k.settleSimulation(project.id, created.id);
    expect(healed.status).toBe('succeeded');
    expect(healed.renders[1]).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('Scenario 3: partial failure keeps the successful Renders; Retry reuses the seed; selection needs every Render succeeded', async () => {
    await start();
    const project = await k.ownedProject(HOMEOWNER_SUB, 3);
    // Photo 1 renders, photo 2 fails, photo 3 renders.
    const original = k.image.render.bind(k.image);
    vi.spyOn(k.image, 'render').mockImplementationOnce(original).mockRejectedValueOnce(new Error('ECONNREFUSED http://comfyui:8188 secret-body'));
    const created = (await k.createSimulation(project.id)).body.simulation;
    const partial = await k.settleSimulation(project.id, created.id);
    expect(partial.status).toBe('partial');
    expect(partial.progress).toEqual({ total: 3, succeeded: 2, failed: 1, current: 0 });
    expect(partial.renders.map((r: { status: string }) => r.status)).toEqual(['succeeded', 'failed', 'succeeded']);
    expect(partial.renders[1]).toMatchObject({ errorCode: 'adapter_error', fullUrl: null, thumbUrl: null, attempts: 1 });
    expect(JSON.stringify(partial)).not.toMatch(/secret|comfyui/);
    for (const index of [0, 2]) {
      const content = await get(`/kitchen-projects/${project.id}/renders/${partial.renders[index].id}/content?variant=full`);
      expect(content.status).toBe(200);
    }
    expect((await get(`/kitchen-projects/${project.id}/renders/${partial.renders[1].id}/content?variant=full`)).status).toBe(404);
    const select = await k.http().put(`/kitchen-projects/${project.id}/selected-simulation`).set('Authorization', await k.bearer()).send({ simulationId: partial.id });
    expect(select.status).toBe(409);
    expect(select.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'simulation_not_ready' });

    // Retry a Render that did not fail: 409.
    const notFailed = await k.http().post(`/kitchen-projects/${project.id}/renders/${partial.renders[0].id}/retry`).set('Authorization', await k.bearer());
    expect(notFailed.status).toBe(409);
    expect(notFailed.body.code).toBe('render_not_failed');

    const seedBefore = k.renders.rows.get(partial.renders[1].id)!.seed;
    const retry = await k.http().post(`/kitchen-projects/${project.id}/renders/${partial.renders[1].id}/retry`).set('Authorization', await k.bearer());
    expect(retry.status).toBe(202);
    expect(retry.body.simulation.renders[1]).toMatchObject({ id: partial.renders[1].id, attempts: 2 });
    const healed = await k.settleSimulation(project.id, created.id);
    expect(healed).toMatchObject({ status: 'succeeded' });
    expect(healed.renders[1]).toMatchObject({ status: 'succeeded', attempts: 2, errorCode: null });
    expect(k.image.calls.at(-1)?.seed).toBe(seedBefore);
    expect(k.renders.rows.get(partial.renders[1].id)!.seed).toBe(seedBefore);

    const ok = await k.http().put(`/kitchen-projects/${project.id}/selected-simulation`).set('Authorization', await k.bearer()).send({ simulationId: created.id });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ selectedSimulationId: created.id });
    expect((await get(simPath(project.id, created.id))).body.selected).toBe(true);
    // A second Simulation takes over the selection; null clears it.
    const next = (await k.createSimulation(project.id)).body.simulation;
    await k.settleSimulation(project.id, next.id);
    await k.http().put(`/kitchen-projects/${project.id}/selected-simulation`).set('Authorization', await k.bearer()).send({ simulationId: next.id });
    const selected = (await get(simPath(project.id))).body.simulations.filter((s: { selected: boolean }) => s.selected);
    expect(selected.map((s: { id: string }) => s.id)).toEqual([next.id]);
    expect((await k.http().put(`/kitchen-projects/${project.id}/selected-simulation`).set('Authorization', await k.bearer()).send({ simulationId: null })).body).toEqual({ selectedSimulationId: null });
    expect((await k.http().put(`/kitchen-projects/${project.id}/selected-simulation`).set('Authorization', await k.bearer()).send({ simulationId: UNKNOWN })).status).toBe(404);
    for (const body of [{}, { simulationId: 'x' }, { simulationId: 5 }]) {
      expect((await k.http().put(`/kitchen-projects/${project.id}/selected-simulation`).set('Authorization', await k.bearer()).send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('Scenario 3: a broker timeout fails that Render only; later Renders still run', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next }, broker: { imageTimeoutMs: 80 } });
    const project = await k.ownedProject(HOMEOWNER_SUB, 2);
    const created = (await k.createSimulation(project.id)).body.simulation;
    await until(() => gates.gates.length === 1);
    // The first image job times out (gate never opened); the second one is released at once.
    await until(() => gates.gates.length === 2);
    gates.open(1);
    const done = await k.settleSimulation(project.id, created.id);
    expect(done.renders.map((r: { status: string; errorCode: string | null }) => [r.status, r.errorCode])).toEqual([['failed', 'timeout'], ['succeeded', null]]);
    expect(done.status).toBe('partial');
    gates.open(0); // a late result must not revive the failed Render
    await flush();
    expect((await get(simPath(project.id, created.id))).body.renders[0].status).toBe('failed');
    const base = `kitchen-projects/${project.id}/renders/${done.renders[0].id}`;
    expect(k.storage.keys().filter((key) => key.startsWith(base))).toEqual([`${base}/before.jpg`]);
  });

  it('Scenario 4: delete removes the Renders, every stored object and the Budget, and clears the selection', async () => {
    await start();
    const project = await k.ownedProject(HOMEOWNER_SUB, 2);
    const created = (await k.createSimulation(project.id)).body.simulation;
    const done = await k.settleSimulation(project.id, created.id);
    await k.http().put(`/kitchen-projects/${project.id}/selected-simulation`).set('Authorization', await k.bearer()).send({ simulationId: done.id });
    k.budgets.rows.set('b1', {
      id: 'b1', kitchenProjectId: project.id, simulationId: done.id, status: 'succeeded', stage: 'pricing', progressDone: 0, progressTotal: 0, relabeled: false, errorCode: null, currency: 'EUR', vatBps: 2100, attempts: 1, prompt: 'p',
      promptTokens: null, completionTokens: null, gpuJobId: null, createdAt: new Date(), startedAt: null, finishedAt: new Date(), tiers: [],
    });
    expect((await get(simPath(project.id, done.id))).body.budget).toEqual({ id: 'b1', status: 'succeeded' });
    const other = (await k.createSimulation(project.id)).body.simulation;
    await k.settleSimulation(project.id, other.id);
    const otherKeys = k.storage.keys().filter((key) => other.renders.some((r: { id: string }) => key.includes(r.id)));
    expect(otherKeys).toHaveLength(6);

    // Storage down: 503 and nothing is deleted.
    k.storage.down = true;
    const down = await k.http().delete(simPath(project.id, done.id)).set('Authorization', await k.bearer());
    k.storage.down = false;
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ statusCode: 503, message: 'Service Unavailable', code: 'storage_unavailable' });
    expect(k.simulations.rows.has(done.id)).toBe(true);
    expect(k.budgets.rows.has('b1')).toBe(true);
    expect(k.storage.keys().filter((key) => done.renders.some((r: { id: string }) => key.includes(r.id)))).toHaveLength(6);

    const del = await k.http().delete(simPath(project.id, done.id)).set('Authorization', await k.bearer());
    expect(del.status).toBe(204);
    expect(k.simulations.rows.has(done.id)).toBe(false);
    expect([...k.renders.rows.values()].filter((r) => r.simulationId === done.id)).toEqual([]);
    expect(k.budgets.rows.has('b1')).toBe(false);
    expect(k.storage.keys().filter((key) => done.renders.some((r: { id: string }) => key.includes(r.id)))).toEqual([]);
    expect(k.storage.keys().filter((key) => other.renders.some((r: { id: string }) => key.includes(r.id)))).toEqual(otherKeys);
    expect((await get(simPath(project.id, done.id))).status).toBe(404);
    expect((await get(simPath(project.id))).body.simulations.filter((s: { selected: boolean }) => s.selected)).toEqual([]);
    // Ordinals are never reused.
    const again = (await k.createSimulation(project.id)).body.simulation;
    expect(again.ordinal).toBe(3);
    await k.settleSimulation(project.id, again.id);
  });

  it('MinIO down at POST gives 503 storage_unavailable with no row; a database failure gives 503', async () => {
    await start();
    const project = await k.ownedProject(HOMEOWNER_SUB, 2);
    k.storage.down = true;
    const down = await k.createSimulation(project.id);
    k.storage.down = false;
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ statusCode: 503, message: 'Service Unavailable', code: 'storage_unavailable' });
    expect(k.simulations.rows.size).toBe(0);
    expect(k.renders.rows.size).toBe(0);
    expect(k.image.calls).toHaveLength(0);
    k.simulations.failNext = new Error('ECONNREFUSED');
    expect((await k.createSimulation(project.id)).status).toBe(503);
  });

  it('a full GPU queue gives 429 gpu_queue_full with no rows and no objects left; queued Renders show their position', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next }, broker: { maxQueued: 1 } });
    const a = await k.ownedProject(HOMEOWNER_SUB, 1, { gallery: true });
    const b = await k.ownedProject(HOMEOWNER_SUB, 1, { gallery: true });
    const c = await k.ownedProject(HOMEOWNER_SUB, 1, { gallery: true });
    const first = (await k.createSimulation(a.id)).body.simulation;
    await until(() => gates.gates.length === 1); // a's Render holds the GPU
    const queued = await k.createSimulation(b.id);
    expect(queued.status).toBe(202);
    const full = await k.createSimulation(c.id);
    expect(full.status).toBe(429);
    expect(full.body).toEqual({ statusCode: 429, message: 'Too Many Requests', code: 'gpu_queue_full' });
    expect([...k.simulations.rows.values()].filter((row) => row.kitchenProjectId === c.id)).toEqual([]);
    expect(k.storage.keys().filter((key) => key.startsWith(`kitchen-projects/${c.id}/renders/`))).toEqual([]);
    gates.open(0);
    await k.settleSimulation(a.id, first.id);
    await until(() => gates.gates.length === 2);
    gates.open(1);
    await k.settleSimulation(b.id, queued.body.simulation.id);
    expect(k.image.maxActive).toBe(1);
  });

  it('OpenAPI: the Simulation routes are bearer-only, document their responses and expose no internals', async () => {
    await start();
    const doc = (await k.http().get('/docs-json')).body;
    const create = doc.paths['/kitchen-projects/{projectId}/simulations'].post;
    expect(Object.keys(create.responses)).toEqual(expect.arrayContaining(['202', '400', '401', '403', '404', '409', '429', '503']));
    expect(create.security).toEqual([{ bearer: [] }]);
    for (const [path, method] of [
      ['/kitchen-projects/{projectId}/simulations', 'get'],
      ['/kitchen-projects/{projectId}/simulations/{simulationId}', 'get'],
      ['/kitchen-projects/{projectId}/simulations/{simulationId}', 'delete'],
      ['/kitchen-projects/{projectId}/selected-simulation', 'put'],
      ['/kitchen-projects/{projectId}/renders/{renderId}/retry', 'post'],
    ] as const) {
      expect(doc.paths[path][method].security, `${method} ${path}`).toEqual([{ bearer: [] }]);
      expect(Object.keys(doc.paths[path][method].responses), `${method} ${path}`).toEqual(expect.arrayContaining(['401', '403', '404']));
    }
    expect(doc.paths['/kitchen-projects/{projectId}/renders']).toBeUndefined();
    expect(JSON.stringify(doc.components.schemas.SimulationViewDto)).not.toMatch(/prompt|seed|gpuJob|inventory|traits/i);
    expect(JSON.stringify(doc.components.schemas.RenderViewDto)).not.toMatch(/prompt|seed|gpuJob/i);
  });
});
