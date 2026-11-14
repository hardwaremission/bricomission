import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKitchenApp, HOMEOWNER_SUB, type KitchenApp, OTHER_SUB } from '../support/kitchen-app.js';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';

// Feature login-gate-claim, Scenario 5: owner routes and the costly placeholders (Renders are real
// since controlnet-render and Budgets since budget-tier-computation: 202 instead of 501; test/renders/
// and test/budget/ cover them in depth).
describe('HTTP /kitchen-projects/:projectId (owner routes and costly placeholders)', () => {
  let k: KitchenApp;
  let owned: { id: string; photoId: string; uploadId: string; galleryId: string };
  let incompleteId: string;
  let draftId: string;

  beforeAll(async () => {
    k = await createKitchenApp();
    const seeded = await k.seedDraft({ photo: true, measurements: true, moodboard: true, upload: true });
    const claimed = await k.claim(await k.token(), seeded.draftToken);
    expect(claimed.status).toBe(200);
    const { project } = claimed.body;
    owned = { id: project.id, photoId: project.photos[0].id, galleryId: project.moodboard[0].id, uploadId: project.moodboard[1].id };
    const incomplete = await k.seedDraft({ photo: true });
    expect((await k.claim(await k.token(), incomplete.draftToken)).status).toBe(200);
    incompleteId = incomplete.id;
    draftId = (await k.seedDraft({})).id;
  });

  afterAll(async () => {
    await k.app.close();
  });

  const get = async (path: string, bearer?: string | null) => {
    const req = k.http().get(path);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const post = async (path: string, bearer?: string | null) => {
    const req = k.http().post(path);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };

  it('GET project: owner 200 with the owner content URLs', async () => {
    const res = await get(`/kitchen-projects/${owned.id}`, await k.token());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: owned.id, status: 'claimed', measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 } });
    expect(res.body.photos[0].thumbUrl).toBe(`/kitchen-projects/${owned.id}/photos/${owned.photoId}/content?variant=thumb`);
    expect(res.body.moodboard[0].thumbUrl).toBe('/style-gallery/images/modern-01/content?variant=thumb');
  });

  it('GET project: another Homeowner 404, a draft id 404, unknown 404 (same body); anonymous 401; professional/admin 403; malformed 400', async () => {
    const owner = await k.token();
    for (const [path, bearer] of [
      [`/kitchen-projects/${owned.id}`, await k.token(OTHER_SUB)],
      [`/kitchen-projects/${draftId}`, owner],
      [`/kitchen-projects/${UNKNOWN}`, owner],
    ] as const) {
      const res = await get(path, bearer);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Not Found', statusCode: 404 });
    }
    expect((await get(`/kitchen-projects/${owned.id}`)).status).toBe(401);
    expect((await get(`/kitchen-projects/${owned.id}`, await k.token(HOMEOWNER_SUB, ['professional']))).status).toBe(403);
    expect((await get(`/kitchen-projects/${owned.id}`, await k.token(HOMEOWNER_SUB, ['admin']))).status).toBe(403);
    expect((await get('/kitchen-projects/not-a-uuid', owner)).status).toBe(400);
    // Anonymous on a malformed id still gets 401 first (no probing before authentication).
    expect((await get('/kitchen-projects/not-a-uuid')).status).toBe(401);
  });

  it('content routes: owner 200 JPEG (private cache); gallery items 404; others 404/401/403; bad variant 400', async () => {
    const owner = await k.token();
    const photo = await get(`/kitchen-projects/${owned.id}/photos/${owned.photoId}/content?variant=thumb`, owner);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect(photo.headers['cache-control']).toBe('private, max-age=3600');
    const upload = await get(`/kitchen-projects/${owned.id}/moodboard/items/${owned.uploadId}/content?variant=full`, owner);
    expect(upload.status).toBe(200);
    expect(upload.headers['content-type']).toBe('image/jpeg');
    expect((await get(`/kitchen-projects/${owned.id}/moodboard/items/${owned.galleryId}/content?variant=thumb`, owner)).status).toBe(404);
    expect((await get(`/kitchen-projects/${owned.id}/photos/${UNKNOWN}/content?variant=thumb`, owner)).status).toBe(404);
    expect((await get(`/kitchen-projects/${owned.id}/photos/${owned.photoId}/content?variant=huge`, owner)).status).toBe(400);
    const path = `/kitchen-projects/${owned.id}/photos/${owned.photoId}/content?variant=thumb`;
    expect((await get(path, await k.token(OTHER_SUB))).status).toBe(404);
    expect((await get(path)).status).toBe(401);
    expect((await get(path, await k.token(HOMEOWNER_SUB, ['professional']))).status).toBe(403);
    k.storage.down = true;
    const down = await get(path, owner);
    k.storage.down = false;
    expect(down.status).toBe(503);
    expect(down.body.code).toBe('storage_unavailable');
  });

  for (const action of ['renders', 'budget'] as const) {
    it(`POST ${action}: 401 anonymous, 403 other roles, 404 non-owner and drafts, 409 not ready, then 202 owner + ready`, async () => {
      expect((await post(`/kitchen-projects/${owned.id}/${action}`)).status).toBe(401);
      expect((await post(`/kitchen-projects/${UNKNOWN}/${action}`)).status).toBe(401);
      expect((await post(`/kitchen-projects/${owned.id}/${action}`, await k.token(HOMEOWNER_SUB, ['professional']))).status).toBe(403);
      expect((await post(`/kitchen-projects/${owned.id}/${action}`, await k.token(HOMEOWNER_SUB, ['admin']))).status).toBe(403);
      expect((await post(`/kitchen-projects/${owned.id}/${action}`, await k.token(OTHER_SUB))).status).toBe(404);
      expect((await post(`/kitchen-projects/${draftId}/${action}`, await k.token())).status).toBe(404);
      const incomplete = await post(`/kitchen-projects/${incompleteId}/${action}`, await k.token());
      expect(incomplete.status).toBe(409);
      expect(incomplete.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'project_incomplete' });
      const ready = await post(`/kitchen-projects/${owned.id}/${action}`, await k.token());
      expect(ready.status).toBe(202);
      if (action === 'renders') expect(ready.body.render).toMatchObject({ status: 'queued', photoId: owned.photoId });
      else expect(ready.body.budget).toMatchObject({ status: 'queued', currency: 'EUR', tiers: [] });
    });
  }

  it('OpenAPI: owner and costly routes are bearer-only and document 401/403/404 (+409/202 renders and budget)', async () => {
    const doc = (await k.http().get('/docs-json')).body;
    const routes: Array<[string, 'get' | 'post']> = [
      ['/kitchen-projects/{projectId}', 'get'],
      ['/kitchen-projects/{projectId}/photos/{photoId}/content', 'get'],
      ['/kitchen-projects/{projectId}/moodboard/items/{itemId}/content', 'get'],
      ['/kitchen-projects/{projectId}/renders', 'post'],
      ['/kitchen-projects/{projectId}/budget', 'post'],
    ];
    for (const [path, method] of routes) {
      const op = doc.paths[path][method];
      expect(op.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['401', '403', '404']));
    }
    expect(Object.keys(doc.paths['/kitchen-projects/{projectId}/renders'].post.responses)).toEqual(expect.arrayContaining(['202', '409', '429']));
    expect(Object.keys(doc.paths['/kitchen-projects/{projectId}/renders'].post.responses)).not.toContain('501');
    expect(Object.keys(doc.paths['/kitchen-projects/{projectId}/budget'].post.responses)).toEqual(expect.arrayContaining(['202', '409', '429', '503']));
    expect(Object.keys(doc.paths['/kitchen-projects/{projectId}/budget'].post.responses)).not.toContain('501');
  });
});
