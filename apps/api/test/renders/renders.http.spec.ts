import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GpuJobBrokerService } from '../../src/ai/jobs/gpu-job-broker.service.js';
import { createKitchenApp, DRAFTS, HOMEOWNER_SUB, type KitchenApp, type KitchenAppOptions, OTHER_SUB } from '../support/kitchen-app.js';
import { makeImage } from '../support/images.js';
import { GateQueue } from '../gpu-test-helpers.js';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const VIEW_KEYS = [
  'beforeUrl',
  'createdAt',
  'errorCode',
  'finishedAt',
  'fullUrl',
  'height',
  'id',
  'mode',
  'photoId',
  'position',
  'startedAt',
  'status',
  'styleId',
  'thumbUrl',
  'waitingFor',
  'width',
];

// Feature controlnet-render, Scenarios 1-3: Renders with the fake image adapter (no GPU, no
// database, no MinIO). The fake returns a tinted copy of its input.
describe('HTTP /kitchen-projects/:projectId/renders', () => {
  let k: KitchenApp;

  afterEach(async () => {
    await k?.app.close();
  });

  async function start(options: KitchenAppOptions = {}) {
    k = await createKitchenApp(options);
    return k;
  }

  /** A claimed, ready project of `sub` with `photos` photos (the second one is portrait). */
  async function ownedProject(sub = HOMEOWNER_SUB, photos = 1, moodboard = true) {
    const seeded = await k.seedDraft({ photo: true, measurements: true, moodboard, upload: !moodboard });
    if (photos > 1) {
      const portrait = await makeImage(600, 900, 'jpeg');
      const res = await k.http().post(`${DRAFTS}/current/photos`).set('X-Draft-Token', seeded.draftToken).attach('photo', portrait, { filename: 'p.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(201);
    }
    const claimed = await k.claim(await k.token(sub), seeded.draftToken);
    expect(claimed.status).toBe(200);
    return claimed.body.project as { id: string; photos: Array<{ id: string }> };
  }

  const auth = async (sub = HOMEOWNER_SUB, roles = ['user']) => `Bearer ${await k.token(sub, roles)}`;
  const post = async (projectId: string, body?: unknown, sub = HOMEOWNER_SUB) => {
    const req = k.http().post(`/kitchen-projects/${projectId}/renders`).set('Authorization', await auth(sub));
    return body === undefined ? req : req.send(body as object);
  };
  const get = async (path: string, sub = HOMEOWNER_SUB) => k.http().get(path).set('Authorization', await auth(sub));

  /** Polls the Render until it is terminal (fake jobs finish within milliseconds). */
  async function settle(projectId: string, renderId: string) {
    for (let i = 0; i < 200; i++) {
      const res = await get(`/kitchen-projects/${projectId}/renders/${renderId}`);
      if (res.body.status === 'succeeded' || res.body.status === 'failed') return res.body;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('render did not settle');
  }

  it('Scenario 1: 202 queued, then running, then succeeded; three metadata-free JPEGs, before = full size; content 200', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next } });
    const project = await ownedProject();
    const res = await post(project.id);
    expect(res.status).toBe(202);
    const render = res.body.render;
    expect(Object.keys(render).sort()).toEqual(VIEW_KEYS);
    expect(render).toMatchObject({
      status: 'queued',
      photoId: project.photos[0].id,
      styleId: 'modern',
      mode: 'canny',
      width: 1216,
      height: 832,
      errorCode: null,
      fullUrl: null,
      thumbUrl: null,
      beforeUrl: `/kitchen-projects/${project.id}/renders/${render.id}/content?variant=before`,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/prompt|seed|gpuJob|comfy/i);

    const running = await get(`/kitchen-projects/${project.id}/renders/${render.id}`);
    expect(running.body).toMatchObject({ status: 'running', position: null });
    expect(running.body.startedAt).not.toBeNull();
    // full/thumb do not exist yet; before does.
    expect((await get(`/kitchen-projects/${project.id}/renders/${render.id}/content?variant=full`)).status).toBe(404);
    expect((await get(`/kitchen-projects/${project.id}/renders/${render.id}/content?variant=before`)).status).toBe(200);

    gates.open(0);
    const done = await settle(project.id, render.id);
    expect(done).toMatchObject({ status: 'succeeded', errorCode: null });
    expect(done.fullUrl).toBe(`/kitchen-projects/${project.id}/renders/${render.id}/content?variant=full`);
    expect(done.thumbUrl).toBe(`/kitchen-projects/${project.id}/renders/${render.id}/content?variant=thumb`);
    expect(done.finishedAt).not.toBeNull();

    const base = `kitchen-projects/${project.id}/renders/${render.id}`;
    expect(k.storage.keys().filter((key) => key.includes('/renders/'))).toEqual([`${base}/before.jpg`, `${base}/full.jpg`, `${base}/thumb.jpg`]);
    const sizes: Record<string, { width?: number; height?: number }> = {};
    for (const variant of ['before', 'full', 'thumb']) {
      const object = k.storage.objects.get(`${base}/${variant}.jpg`);
      expect(object?.contentType).toBe('image/jpeg');
      const meta = await sharp(object!.body).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.comments).toBeUndefined();
      sizes[variant] = { width: meta.width, height: meta.height };
      const content = await get(`/kitchen-projects/${project.id}/renders/${render.id}/content?variant=${variant}`);
      expect(content.status).toBe(200);
      expect(content.headers['content-type']).toBe('image/jpeg');
      expect(content.headers['cache-control']).toBe('private, max-age=3600');
    }
    expect(sizes.before).toEqual({ width: 1216, height: 832 });
    expect(sizes.full).toEqual(sizes.before);
    expect(Math.max(sizes.thumb.width ?? 0, sizes.thumb.height ?? 0)).toBe(512);
    // The adapter got the exact before crop, with the internal prompt (never returned).
    expect(k.image.calls).toHaveLength(1);
    expect(k.image.calls[0]).toMatchObject({ mode: 'canny', width: 1216, height: 832 });
    expect(k.image.calls[0].image.equals(k.storage.objects.get(`${base}/before.jpg`)!.body)).toBe(true);
    expect(k.image.calls[0].prompt).toMatch(/^photorealistic renovated kitchen, \(clean empty countertops:1\.3\).*modern kitchen, handleless/);
    expect(k.image.calls[0].negativePrompt).toContain('(kettle:1.3)');
    expect(k.image.calls[0].control).toEqual(k.renderConfig.control);
  });

  it('Scenario 2: every Render route is owner-only: 401, 403, 404 for others and drafts; 400 malformed ids and variants', async () => {
    await start();
    const project = await ownedProject();
    const render = (await post(project.id)).body.render;
    await settle(project.id, render.id);
    const draftId = (await k.seedDraft({})).id;
    const routes: Array<['get' | 'post', string]> = [
      ['post', `/kitchen-projects/${project.id}/renders`],
      ['get', `/kitchen-projects/${project.id}/renders`],
      ['get', `/kitchen-projects/${project.id}/renders/${render.id}`],
      ['get', `/kitchen-projects/${project.id}/renders/${render.id}/content?variant=before`],
    ];
    for (const [method, path] of routes) {
      expect((await k.http()[method](path)).status, `${method} ${path} anonymous`).toBe(401);
      expect((await k.http()[method](path).set('Authorization', await auth(HOMEOWNER_SUB, ['professional']))).status, `${method} ${path} professional`).toBe(403);
      expect((await k.http()[method](path).set('Authorization', await auth(HOMEOWNER_SUB, ['admin']))).status, `${method} ${path} admin`).toBe(403);
      const other = await k.http()[method](path).set('Authorization', await auth(OTHER_SUB));
      expect(other.status, `${method} ${path} other homeowner`).toBe(404);
      expect(other.body).toEqual({ message: 'Not Found', statusCode: 404 });
      const draft = await k.http()[method](path.replace(project.id, draftId)).set('Authorization', await auth());
      expect(draft.status, `${method} ${path} draft id`).toBe(404);
    }
    expect((await get(`/kitchen-projects/${project.id}/renders/not-a-uuid`)).status).toBe(400);
    expect((await get(`/kitchen-projects/${project.id}/renders/${UNKNOWN}`)).status).toBe(404);
    expect((await get(`/kitchen-projects/${project.id}/renders/${render.id}/content?variant=huge`)).status).toBe(400);
    expect((await get(`/kitchen-projects/${project.id}/renders/${render.id}/content`)).status).toBe(400);
    // A Render of another project of the same owner is not found under this project.
    const second = await ownedProject();
    expect((await get(`/kitchen-projects/${second.id}/renders/${render.id}`)).status).toBe(404);
    expect((await get(`/kitchen-projects/${second.id}/renders/${render.id}/content?variant=before`)).status).toBe(404);
  });

  it('Scenario 2: a not-ready project gets 409 project_incomplete and the broker is never called', async () => {
    await start();
    const submit = vi.spyOn(k.moduleRef.get(GpuJobBrokerService), 'submit');
    const seeded = await k.seedDraft({ photo: true });
    expect((await k.claim(await k.token(), seeded.draftToken)).status).toBe(200);
    const res = await post(seeded.id, { photoId: 'nonsense' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'project_incomplete' });
    expect(submit).not.toHaveBeenCalled();
    expect(k.renders.rows.size).toBe(0);
    expect(k.storage.keys().filter((key) => key.includes('/renders/'))).toEqual([]);
  });

  it('Scenario 2: photoId picks the photo (portrait bucket); malformed or foreign photoId gives 400 render_photo_unknown', async () => {
    await start();
    const project = await ownedProject(HOMEOWNER_SUB, 2);
    const other = await ownedProject(HOMEOWNER_SUB, 1);
    for (const body of [{ photoId: 'x' }, { photoId: other.photos[0].id }, { photoId: 42 }, [1]]) {
      const res = await post(project.id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body).toEqual({ statusCode: 400, message: 'Bad Request', code: 'render_photo_unknown' });
    }
    const res = await post(project.id, { photoId: project.photos[1].id });
    expect(res.status).toBe(202);
    expect(res.body.render).toMatchObject({ photoId: project.photos[1].id, width: 832, height: 1216 });
    await settle(project.id, res.body.render.id);
    expect(k.image.calls.at(-1)).toMatchObject({ width: 832, height: 1216 });
  });

  it('Scenario 2: one active Render per project (409 render_in_progress); the limit counts non-failed Renders only', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next }, renderConfig: { maxPerProject: 2 } });
    const project = await ownedProject();
    const first = await post(project.id);
    expect(first.status).toBe(202);
    const busy = await post(project.id);
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe('render_in_progress');
    gates.open(0);
    await settle(project.id, first.body.render.id);

    // A failed Render does not count.
    vi.spyOn(k.image, 'render').mockRejectedValueOnce(new Error('ECONNREFUSED http://comfyui:8188 secret-body'));
    const failing = await post(project.id);
    expect(failing.status).toBe(202);
    const failed = await settle(project.id, failing.body.render.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'adapter_error', fullUrl: null, thumbUrl: null });
    expect(JSON.stringify(failed)).not.toMatch(/secret|comfyui/);

    k.clock.now = new Date(k.clock.now.getTime() + 60_000);
    const second = await post(project.id);
    expect(second.status).toBe(202);
    gates.open(1);
    await settle(project.id, second.body.render.id);
    const limit = await post(project.id);
    expect(limit.status).toBe(409);
    expect(limit.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'render_limit_reached' });

    const list = await get(`/kitchen-projects/${project.id}/renders`);
    expect(list.status).toBe(200);
    expect(list.body.maxRenders).toBe(2);
    expect(list.body.renders.map((r: { id: string }) => r.id)[0]).toBe(second.body.render.id);
    expect(list.body.renders).toHaveLength(3);
    expect(JSON.stringify(list.body)).not.toMatch(/prompt|seed|gpuJob/i);
  });

  it('Scenario 3: adapter error -> failed/adapter_error without result objects; the next POST is accepted', async () => {
    await start();
    const project = await ownedProject();
    vi.spyOn(k.image, 'render').mockRejectedValueOnce(new Error('boom'));
    const res = await post(project.id);
    const failed = await settle(project.id, res.body.render.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'adapter_error' });
    const base = `kitchen-projects/${project.id}/renders/${res.body.render.id}`;
    expect(k.storage.keys().filter((key) => key.startsWith(base))).toEqual([`${base}/before.jpg`]);
    expect((await get(`/kitchen-projects/${project.id}/renders/${res.body.render.id}/content?variant=full`)).status).toBe(404);
    expect((await get(`/kitchen-projects/${project.id}/renders/${res.body.render.id}/content?variant=before`)).status).toBe(200);
    expect((await post(project.id)).status).toBe(202);
  });

  it('Scenario 3: a broker timeout gives failed/timeout and no result objects', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next }, broker: { imageTimeoutMs: 50 } });
    const project = await ownedProject();
    const res = await post(project.id);
    const failed = await settle(project.id, res.body.render.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'timeout' });
    gates.open(0); // the late adapter result must not revive the Render
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await get(`/kitchen-projects/${project.id}/renders/${res.body.render.id}`)).body.status).toBe('failed');
    const base = `kitchen-projects/${project.id}/renders/${res.body.render.id}`;
    expect(k.storage.keys().filter((key) => key.startsWith(base))).toEqual([`${base}/before.jpg`]);
    expect((await post(project.id)).status).toBe(202);
  });

  it('Scenario 3: MinIO down at POST gives 503 storage_unavailable and no row; down during the job gives failed/storage_unavailable', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next } });
    const project = await ownedProject();
    k.storage.down = true;
    const down = await post(project.id);
    k.storage.down = false;
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ statusCode: 503, message: 'Service Unavailable', code: 'storage_unavailable' });
    expect(k.renders.rows.size).toBe(0);
    expect(k.image.calls).toHaveLength(0);

    const res = await post(project.id);
    expect(res.status).toBe(202);
    k.storage.down = true;
    gates.open(0);
    for (let i = 0; i < 100 && k.renders.rows.get(res.body.render.id)?.status !== 'failed'; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    k.storage.down = false;
    expect(k.renders.rows.get(res.body.render.id)).toMatchObject({ status: 'failed', errorCode: 'storage_unavailable', fullKey: null });
  });

  it('a database failure gives 503 and no Render', async () => {
    await start();
    const project = await ownedProject();
    k.renders.failNext = new Error('ECONNREFUSED');
    expect((await post(project.id)).status).toBe(503);
    expect(k.renders.rows.size).toBe(0);
  });

  it('a full GPU queue gives 429 gpu_queue_full; no row and no before object are left; queued Renders show their position', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next }, broker: { maxQueued: 1 } });
    const a = await ownedProject();
    const b = await ownedProject();
    const c = await ownedProject();
    expect((await post(a.id)).status).toBe(202);
    const queued = await post(b.id);
    expect(queued.status).toBe(202);
    const view = await get(`/kitchen-projects/${b.id}/renders/${queued.body.render.id}`);
    expect(view.body).toMatchObject({ status: 'queued', position: 1, waitingFor: 'image' });
    const full = await post(c.id);
    expect(full.status).toBe(429);
    expect(full.body).toEqual({ statusCode: 429, message: 'Too Many Requests', code: 'gpu_queue_full' });
    expect([...k.renders.rows.values()].filter((row) => row.kitchenProjectId === c.id)).toEqual([]);
    expect(k.storage.keys().filter((key) => key.startsWith(`kitchen-projects/${c.id}/renders/`))).toEqual([]);
    gates.open(0);
    await settle(a.id, (await get(`/kitchen-projects/${a.id}/renders`)).body.renders[0].id);
    gates.open(1);
    await settle(b.id, queued.body.render.id);
    // Never two image jobs at once.
    expect(k.image.maxActive).toBe(1);
  });

  it('an uploads-only Moodboard renders with the neutral modern style and styleId null', async () => {
    await start();
    const project = await ownedProject(HOMEOWNER_SUB, 1, false);
    const res = await post(project.id);
    expect(res.status).toBe(202);
    expect(res.body.render.styleId).toBeNull();
    await settle(project.id, res.body.render.id);
    expect(k.image.calls[0].prompt).toContain('same walls, doors and windows, modern kitchen, handleless glossy white');
  });

  it('OpenAPI: the Render routes are bearer-only and document their responses', async () => {
    await start();
    const doc = (await k.http().get('/docs-json')).body;
    const post202 = doc.paths['/kitchen-projects/{projectId}/renders'].post;
    expect(Object.keys(post202.responses)).toEqual(expect.arrayContaining(['202', '400', '401', '403', '404', '409', '429', '503']));
    expect(post202.security).toEqual([{ bearer: [] }]);
    for (const path of ['/kitchen-projects/{projectId}/renders', '/kitchen-projects/{projectId}/renders/{renderId}', '/kitchen-projects/{projectId}/renders/{renderId}/content']) {
      expect(doc.paths[path].get.security, path).toEqual([{ bearer: [] }]);
      expect(Object.keys(doc.paths[path].get.responses), path).toEqual(expect.arrayContaining(['200', '401', '403', '404']));
    }
    const schema = JSON.stringify(doc.components.schemas.RenderViewDto);
    expect(schema).not.toMatch(/prompt|seed|gpuJob/i);
  });
});
