import { afterEach, describe, expect, it } from 'vitest';
import { fixture, makeImage } from '../support/images.js';
import { createKitchenApp, HOMEOWNER_SUB, type KitchenApp, type KitchenAppOptions, OTHER_SUB } from '../support/kitchen-app.js';
import { GateQueue } from '../gpu-test-helpers.js';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const GALLERY_IDS = [
  'modern-01', 'modern-02', 'modern-03', 'scandinavian-01', 'scandinavian-02', 'scandinavian-03',
  'industrial-01', 'industrial-02', 'industrial-03', 'farmhouse-01', 'farmhouse-02', 'farmhouse-03', 'classic-01',
];

// Feature simulations-ux-overhaul, phase D, Decision 14: owner edit routes of claimed projects.
describe('HTTP owner edit routes /kitchen-projects/:projectId (photos, measurements, Moodboard)', () => {
  let k: KitchenApp;

  afterEach(async () => {
    await k?.app.close();
  });

  async function start(options: KitchenAppOptions = {}) {
    k = await createKitchenApp(options);
    return k;
  }

  const auth = async (sub = HOMEOWNER_SUB, roles = ['user']) => `Bearer ${await k.token(sub, roles)}`;
  const base = (id: string) => `/kitchen-projects/${id}`;
  const getProject = async (id: string) => (await k.http().get(base(id)).set('Authorization', await auth())).body;
  const putMeasurements = async (id: string, body: unknown, sub = HOMEOWNER_SUB) =>
    k.http().put(`${base(id)}/measurements`).set('Authorization', await auth(sub)).send(body as object);
  const addPhoto = async (id: string, body: Buffer, sub = HOMEOWNER_SUB) =>
    k.http().post(`${base(id)}/photos`).set('Authorization', await auth(sub)).attach('photo', body, { filename: 'k.jpg', contentType: 'image/jpeg' });
  const delPhoto = async (id: string, photoId: string, sub = HOMEOWNER_SUB) =>
    k.http().delete(`${base(id)}/photos/${photoId}`).set('Authorization', await auth(sub));
  const pick = async (id: string, galleryImageId: unknown, sub = HOMEOWNER_SUB) =>
    k.http().post(`${base(id)}/moodboard/gallery-items`).set('Authorization', await auth(sub)).send({ galleryImageId });
  const upload = async (id: string, body: Buffer, sub = HOMEOWNER_SUB) =>
    k.http().post(`${base(id)}/moodboard/uploads`).set('Authorization', await auth(sub)).attach('photo', body, { filename: 'r.jpg', contentType: 'image/jpeg' });
  const delItem = async (id: string, itemId: string, sub = HOMEOWNER_SUB) =>
    k.http().delete(`${base(id)}/moodboard/items/${itemId}`).set('Authorization', await auth(sub));

  const keysOf = (id: string, part: string) => k.storage.keys().filter((key) => key.startsWith(`kitchen-projects/${id}/${part}/`));

  it('measurements: replaces the values (same validation as the draft route), keeps the claimed row without expiry', async () => {
    await start();
    const project = await k.ownedProject();
    const ok = await putMeasurements(project.id, { lengthCm: 500, widthCm: 350, heightCm: 270 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: project.id, status: 'claimed', measurements: { lengthCm: 500, widthCm: 350, heightCm: 270 } });
    expect((await getProject(project.id)).measurements).toEqual({ lengthCm: 500, widthCm: 350, heightCm: 270 });
    expect(k.repo.rows.get(project.id)).toMatchObject({ status: 'claimed', expiresAt: null });
    // null clears a value (readiness then answers project_incomplete, as for drafts).
    const cleared = await putMeasurements(project.id, { lengthCm: null, widthCm: 350, heightCm: 270 });
    expect(cleared.status).toBe(200);
    expect(cleared.body.measurements.lengthCm).toBeNull();
    expect((await k.createSimulation(project.id)).body.code).toBe('project_incomplete');
    // Validation errors.
    const bad = await putMeasurements(project.id, { lengthCm: 10.5, widthCm: 5000, heightCm: 270 });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'invalid_measurements', fields: { lengthCm: 'not_integer', widthCm: 'out_of_range' } });
    expect((await putMeasurements(project.id, 'nope')).status).toBe(400);
    expect((await getProject(project.id)).measurements.lengthCm).toBeNull();
  });

  it('photos: add (owner URLs, metadata-free objects), limit 8, delete compacts positions and removes both objects', async () => {
    await start();
    const project = await k.ownedProject();
    const res = await addPhoto(project.id, await makeImage(900, 700, 'jpeg'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ position: 1, width: 900, height: 700 });
    expect(res.body.thumbUrl).toBe(`${base(project.id)}/photos/${res.body.id}/content?variant=thumb`);
    const prefix = `kitchen-projects/${project.id}/photos/${res.body.id}`;
    expect(keysOf(project.id, 'photos')).toEqual(expect.arrayContaining([`${prefix}/full.jpg`, `${prefix}/thumb.jpg`]));
    const content = await k.http().get(res.body.thumbUrl).set('Authorization', await auth());
    expect(content.status).toBe(200);
    // HEIC with GPS goes through the same pipeline.
    const heic = await addPhoto(project.id, fixture('kitchen-gps.heic'));
    expect(heic.status).toBe(201);
    expect((await getProject(project.id)).photos.map((p: { position: number }) => p.position)).toEqual([0, 1, 2]);
    // Fill to 8, the 9th is refused and leaves no object behind.
    for (let i = 3; i < 8; i++) expect((await addPhoto(project.id, await makeImage(600 + i, 800, 'jpeg'))).status).toBe(201);
    const before = k.storage.keys().length;
    const full = await addPhoto(project.id, await makeImage(640, 640, 'jpeg'));
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('photo_limit_reached');
    expect(k.storage.keys().length).toBe(before);
    // Delete the second photo: later ones move up, both objects go.
    const second = (await getProject(project.id)).photos[1];
    expect((await delPhoto(project.id, second.id)).status).toBe(204);
    const after = await getProject(project.id);
    expect(after.photos).toHaveLength(7);
    expect(after.photos.map((p: { position: number }) => p.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(k.storage.keys().filter((key) => key.includes(`/photos/${second.id}/`))).toEqual([]);
    expect((await delPhoto(project.id, second.id)).status).toBe(404);
    expect((await delPhoto(project.id, 'not-a-uuid')).status).toBe(400);
  });

  it('photos: validation errors use the draft codes; storage down gives 503 without rows; storage-down delete keeps the row', async () => {
    await start();
    const project = await k.ownedProject();
    const noFile = await k.http().post(`${base(project.id)}/photos`).set('Authorization', await auth());
    expect(noFile.status).toBe(400);
    expect(noFile.body.code).toBe('photo_missing');
    const cases: Array<[Buffer, number, string]> = [
      [Buffer.from('not an image at all'), 415, 'photo_unsupported_type'],
      [await makeImage(400, 300, 'jpeg'), 422, 'photo_too_small'],
    ];
    for (const [body, status, code] of cases) {
      const res = await addPhoto(project.id, body);
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    }
    expect((await getProject(project.id)).photos).toHaveLength(1);
    k.storage.down = true;
    const down = await addPhoto(project.id, await makeImage(900, 700, 'jpeg'));
    expect(down.status).toBe(503);
    expect(down.body.code).toBe('storage_unavailable');
    const photoId = project.photos[0].id;
    const delDown = await delPhoto(project.id, photoId);
    k.storage.down = false;
    expect(delDown.status).toBe(503);
    expect(delDown.body.code).toBe('storage_unavailable');
    expect((await getProject(project.id)).photos).toHaveLength(1);
  });

  it('photos: removing the last photo is allowed; Generate then answers project_incomplete (as for a draft)', async () => {
    await start();
    const project = await k.ownedProject();
    expect((await delPhoto(project.id, project.photos[0].id)).status).toBe(204);
    expect((await getProject(project.id)).photos).toEqual([]);
    const sim = await k.createSimulation(project.id);
    expect(sim.status).toBe(409);
    expect(sim.body.code).toBe('project_incomplete');
    expect((await addPhoto(project.id, await makeImage(900, 700, 'jpeg'))).status).toBe(201);
    expect((await k.createSimulation(project.id)).status).toBe(202);
  });

  it('Moodboard: add gallery item (201, then idempotent 200), unknown id 400, add upload, limit 12, remove with object lifecycle', async () => {
    await start();
    const project = await k.ownedProject(HOMEOWNER_SUB, 1, { gallery: true, upload: false });
    const created = await pick(project.id, 'modern-02');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ source: 'gallery', galleryImageId: 'modern-02', position: 1 });
    const again = await pick(project.id, 'modern-02');
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(created.body.id);
    expect((await pick(project.id, 'nope-99')).body.code).toBe('gallery_image_unknown');
    expect((await pick(project.id, 12)).status).toBe(400);
    const up = await upload(project.id, await makeImage(800, 600, 'jpeg'));
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ source: 'upload', position: 2 });
    expect(up.body.thumbUrl).toBe(`${base(project.id)}/moodboard/items/${up.body.id}/content?variant=thumb`);
    const prefix = `kitchen-projects/${project.id}/moodboard/${up.body.id}`;
    expect(keysOf(project.id, 'moodboard').sort()).toEqual([`${prefix}/full.jpg`, `${prefix}/thumb.jpg`]);
    expect((await k.http().get(up.body.thumbUrl).set('Authorization', await auth())).status).toBe(200);
    expect(k.repo.rows.get(project.id)).toMatchObject({ status: 'claimed', expiresAt: null });
    // Limit 12 (3 so far): fill with gallery picks, then refuse both kinds.
    for (const id of GALLERY_IDS.filter((g) => g !== 'modern-01' && g !== 'modern-02').slice(0, 9)) expect((await pick(project.id, id)).status).toBe(201);
    expect((await getProject(project.id)).moodboard).toHaveLength(12);
    const limitPick = await pick(project.id, 'classic-01');
    expect(limitPick.status).toBe(409);
    expect(limitPick.body.code).toBe('moodboard_limit_reached');
    const limitUp = await upload(project.id, await makeImage(800, 600, 'jpeg'));
    expect(limitUp.status).toBe(409);
    expect(limitUp.body.code).toBe('moodboard_limit_reached');
    expect(keysOf(project.id, 'moodboard')).toHaveLength(2);
    // Remove: an upload loses both objects, a gallery item has none; positions compact.
    expect((await delItem(project.id, up.body.id)).status).toBe(204);
    expect(keysOf(project.id, 'moodboard')).toEqual([]);
    expect((await delItem(project.id, created.body.id)).status).toBe(204);
    const items = (await getProject(project.id)).moodboard;
    expect(items).toHaveLength(10);
    expect(items.map((i: { position: number }) => i.position)).toEqual([...Array(10).keys()]);
    expect((await delItem(project.id, up.body.id)).status).toBe(404);
    expect((await delItem(project.id, 'bad')).status).toBe(400);
  });

  it('Moodboard: upload errors and storage failures follow the draft routes; a storage-down remove keeps the row', async () => {
    await start();
    const project = await k.ownedProject(HOMEOWNER_SUB, 1, { gallery: true, upload: true });
    const uploadItem = (await getProject(project.id)).moodboard.find((i: { source: string }) => i.source === 'upload');
    expect((await upload(project.id, Buffer.from('nope'))).body.code).toBe('photo_unsupported_type');
    expect((await upload(project.id, await makeImage(300, 300, 'jpeg'))).body.code).toBe('photo_too_small');
    k.storage.down = true;
    const down = await upload(project.id, await makeImage(800, 600, 'jpeg'));
    const delDown = await delItem(project.id, uploadItem.id);
    k.storage.down = false;
    expect(down.status).toBe(503);
    expect(down.body.code).toBe('storage_unavailable');
    expect(delDown.status).toBe(503);
    expect((await getProject(project.id)).moodboard).toHaveLength(2);
    expect(keysOf(project.id, 'moodboard')).toHaveLength(2);
  });

  it('409 simulation_in_progress on every edit route while a Simulation is active; allowed again afterwards', async () => {
    const gates = new GateQueue();
    await start({ image: { gate: gates.next } });
    const project = await k.ownedProject(HOMEOWNER_SUB, 1, { gallery: true, upload: true });
    const item = (await getProject(project.id)).moodboard[0];
    const created = await k.createSimulation(project.id);
    expect(created.status).toBe(202);
    const jpeg = await makeImage(900, 700, 'jpeg');
    const before = JSON.stringify(await getProject(project.id));
    const keysBefore = k.storage.keys().sort();
    const responses = [
      await putMeasurements(project.id, { lengthCm: 500, widthCm: 350, heightCm: 270 }),
      await addPhoto(project.id, jpeg),
      await delPhoto(project.id, project.photos[0].id),
      await pick(project.id, 'modern-03'),
      await upload(project.id, jpeg),
      await delItem(project.id, item.id),
    ];
    for (const res of responses) {
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'simulation_in_progress' });
    }
    expect(JSON.stringify(await getProject(project.id))).toBe(before);
    expect(k.storage.keys().sort()).toEqual(keysBefore);
    for (let i = 0; i < 40 && gates.gates.length < 1; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    gates.open(0);
    await k.settleSimulation(project.id, created.body.simulation.id);
    expect((await putMeasurements(project.id, { lengthCm: 500, widthCm: 350, heightCm: 270 })).status).toBe(200);
    expect((await addPhoto(project.id, jpeg)).status).toBe(201);
  });

  it('409 budget_in_progress while a Budget of the project is queued or running', async () => {
    await start();
    const project = await k.ownedProject();
    const simulation = k.seedReadySimulation(project.id);
    const budget = await k.budgets.createQueued({
      id: '00000000-0000-4000-8000-0000000000b1',
      kitchenProjectId: project.id,
      simulationId: simulation.id,
      currency: 'EUR',
      vatBps: 2100,
      prompt: 'p',
      createdAt: new Date(),
      stage: 'pricing',
      progressDone: 0,
      progressTotal: 0,
    });
    expect(budget).not.toBe('in_progress');
    for (const res of [await putMeasurements(project.id, { lengthCm: 500, widthCm: 350, heightCm: 270 }), await pick(project.id, 'modern-02'), await delPhoto(project.id, project.photos[0].id)]) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('budget_in_progress');
    }
    await k.budgets.markFailed('00000000-0000-4000-8000-0000000000b1', 'interrupted', new Date());
    expect((await pick(project.id, 'modern-02')).status).toBe(201);
  });

  it('editing never touches existing Simulations: Renders keep their before objects after the photo is removed', async () => {
    await start();
    const project = await k.ownedProject();
    const created = await k.createSimulation(project.id);
    const done = await k.settleSimulation(project.id, created.body.simulation.id);
    expect(done.status).toBe('succeeded');
    const renderKeys = keysOf(project.id, 'renders');
    expect(renderKeys.length).toBeGreaterThanOrEqual(3);
    expect((await delPhoto(project.id, project.photos[0].id)).status).toBe(204);
    expect(keysOf(project.id, 'renders')).toEqual(renderKeys);
    const after = await k.http().get(`${base(project.id)}/simulations/${done.id}`).set('Authorization', await auth());
    expect(after.body).toMatchObject({ id: done.id, status: 'succeeded', selected: false });
    expect(after.body.renders).toHaveLength(1);
    const content = await k.http().get(`${base(project.id)}/renders/${done.renders[0].id}/content?variant=before`).set('Authorization', await auth());
    expect(content.status).toBe(200);
  });

  it('ownership matrix on every route: anonymous 401, Professional/Admin 403, other Homeowner 404, draft id 404, malformed 400', async () => {
    await start();
    const project = await k.ownedProject();
    const draft = await k.seedDraft({});
    const item = (await getProject(project.id)).moodboard[0];
    const jpeg = await makeImage(900, 700, 'jpeg');
    const send = async (method: 'put' | 'post' | 'delete', path: string, bearer: string | null, kind: 'json' | 'file' | 'none') => {
      let req = k.http()[method](path);
      if (bearer) req = req.set('Authorization', bearer);
      if (kind === 'json') req = req.send({ lengthCm: 500, widthCm: 350, heightCm: 270, galleryImageId: 'modern-02' });
      if (kind === 'file') req = req.attach('photo', jpeg, { filename: 'k.jpg', contentType: 'image/jpeg' });
      return req;
    };
    const routes: Array<['put' | 'post' | 'delete', (id: string) => string, 'json' | 'file' | 'none']> = [
      ['put', (id) => `${base(id)}/measurements`, 'json'],
      ['post', (id) => `${base(id)}/photos`, 'file'],
      ['delete', (id) => `${base(id)}/photos/${project.photos[0].id}`, 'none'],
      ['post', (id) => `${base(id)}/moodboard/gallery-items`, 'json'],
      ['post', (id) => `${base(id)}/moodboard/uploads`, 'file'],
      ['delete', (id) => `${base(id)}/moodboard/items/${item.id}`, 'none'],
    ];
    const professional = await auth(HOMEOWNER_SUB, ['professional']);
    const admin = await auth(HOMEOWNER_SUB, ['admin']);
    const stranger = await auth(OTHER_SUB);
    const owner = await auth();
    for (const [method, path, kind] of routes) {
      expect((await send(method, path(project.id), null, kind)).status, `${method} ${path(project.id)} anonymous`).toBe(401);
      expect((await send(method, path(UNKNOWN), null, kind)).status).toBe(401);
      expect((await send(method, path(project.id), professional, kind)).status).toBe(403);
      expect((await send(method, path(project.id), admin, kind)).status).toBe(403);
      const foreign = await send(method, path(project.id), stranger, kind);
      expect(foreign.status).toBe(404);
      expect((foreign as unknown as { body: unknown }).body).toEqual({ message: 'Not Found', statusCode: 404 });
      expect((await send(method, path(draft.id), owner, kind)).status).toBe(404);
      expect((await send(method, path(UNKNOWN), owner, kind)).status).toBe(404);
      expect((await send(method, path('not-a-uuid'), owner, kind)).status).toBe(400);
    }
    // Nothing changed by any refused call.
    const state = await getProject(project.id);
    expect(state.photos).toHaveLength(1);
    expect(state.moodboard).toHaveLength(2);
    expect(state.measurements.lengthCm).toBe(420);
    expect(k.repo.rows.get(draft.id)?.photos).toEqual([]);
  });

  it('draft routes are unchanged: a claimed token no longer edits, a draft still slides its expiry', async () => {
    await start();
    const seeded = await k.seedDraft({ photo: true });
    const expiry = k.repo.rows.get(seeded.id)?.expiresAt?.getTime();
    k.clock.now = new Date(k.clock.now.getTime() + 24 * 3600 * 1000);
    const res = await k.http().post('/kitchen-projects/drafts/current/photos').set('X-Draft-Token', seeded.draftToken).attach('photo', k.jpeg, { filename: 'k.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.thumbUrl).toBe(`/kitchen-projects/drafts/current/photos/${res.body.id}/content?variant=thumb`);
    expect(k.repo.rows.get(seeded.id)?.expiresAt?.getTime()).toBeGreaterThan(expiry as number);
    expect((await k.claim(await k.token(), seeded.draftToken)).status).toBe(200);
    const after = await k.http().post('/kitchen-projects/drafts/current/photos').set('X-Draft-Token', seeded.draftToken).attach('photo', k.jpeg, { filename: 'k.jpg', contentType: 'image/jpeg' });
    expect(after.status).toBe(404);
  });

  it('OpenAPI: the edit routes are bearer-only and document 401/403/404/409', async () => {
    await start();
    const doc = (await k.http().get('/docs-json')).body;
    const routes: Array<[string, 'put' | 'post' | 'delete']> = [
      ['/kitchen-projects/{projectId}/measurements', 'put'],
      ['/kitchen-projects/{projectId}/photos', 'post'],
      ['/kitchen-projects/{projectId}/photos/{photoId}', 'delete'],
      ['/kitchen-projects/{projectId}/moodboard/gallery-items', 'post'],
      ['/kitchen-projects/{projectId}/moodboard/uploads', 'post'],
      ['/kitchen-projects/{projectId}/moodboard/items/{itemId}', 'delete'],
    ];
    for (const [path, method] of routes) {
      const op = doc.paths[path][method];
      expect(op.security, path).toEqual([{ bearer: [] }]);
      expect(Object.keys(op.responses), path).toEqual(expect.arrayContaining(['401', '403', '404', '409']));
    }
  });
});
