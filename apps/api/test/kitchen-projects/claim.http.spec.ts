import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../src/auth/auth.decorators.js';
import { DraftCleanupService } from '../../src/kitchen-projects/draft-cleanup.service.js';
import { generateDraftToken } from '../../src/kitchen-projects/draft-token.js';
import { KitchenProjectsController } from '../../src/kitchen-projects/kitchen-projects.controller.js';
import { createKitchenApp, DRAFTS, HOMEOWNER_SUB, type KitchenApp, OTHER_SUB } from '../support/kitchen-app.js';

const DAY = 24 * 60 * 60 * 1000;

// Feature login-gate-claim, Scenario 4: POST /kitchen-projects/drafts/current/claim.
describe('HTTP POST /kitchen-projects/drafts/current/claim', () => {
  let k: KitchenApp;

  beforeAll(async () => {
    k = await createKitchenApp();
  });

  afterAll(async () => {
    await k.app.close();
  });

  it('claims the draft: same id and content, owner = sub, claimedAt = now, no expiry', async () => {
    const { draftToken, id } = await k.seedDraft({ photo: true, measurements: true, moodboard: true, upload: true });
    const before = (await k.http().get(`${DRAFTS}/current`).set('X-Draft-Token', draftToken)).body;
    const res = await k.claim(await k.token(), draftToken);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeUndefined();
    const project = res.body.project;
    expect(project).toMatchObject({ id, status: 'claimed', measurements: before.measurements, claimedAt: k.clock.now.toISOString() });
    expect(project).not.toHaveProperty('expiresAt');
    expect(project).not.toHaveProperty('limits');
    expect(project.photos.map((p: { id: string }) => p.id)).toEqual(before.photos.map((p: { id: string }) => p.id));
    expect(project.photos[0].thumbUrl).toBe(`/kitchen-projects/${id}/photos/${before.photos[0].id}/content?variant=thumb`);
    expect(project.moodboard.map((m: { id: string }) => m.id)).toEqual(before.moodboard.map((m: { id: string }) => m.id));
    // Gallery items keep the public gallery URL; uploads move to the owner route.
    expect(project.moodboard[0].thumbUrl).toBe(before.moodboard[0].thumbUrl);
    expect(project.moodboard[1].fullUrl).toBe(`/kitchen-projects/${id}/moodboard/items/${before.moodboard[1].id}/content?variant=full`);
    const row = k.repo.rows.get(id);
    expect(row).toMatchObject({ status: 'claimed', ownerSub: HOMEOWNER_SUB, claimedAt: k.clock.now, expiresAt: null });
    expect(JSON.stringify(res.body)).not.toContain(draftToken);
  });

  it('a repeated claim by the same sub gives 200 with the same body; claimedAt unchanged', async () => {
    const { draftToken, id } = await k.seedDraft();
    const bearer = await k.token();
    const first = await k.claim(bearer, draftToken);
    const saved = k.clock.now;
    k.clock.now = new Date(saved.getTime() + 60_000);
    const second = await k.claim(bearer, draftToken);
    k.clock.now = saved;
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(k.repo.rows.get(id)?.claimedAt).toEqual(saved);
  });

  it('the same token with another sub gives the generic 404 and changes nothing', async () => {
    const { draftToken, id } = await k.seedDraft();
    expect((await k.claim(await k.token(), draftToken)).status).toBe(200);
    const other = await k.claim(await k.token(OTHER_SUB), draftToken);
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ message: 'Not Found', statusCode: 404 });
    expect(k.repo.rows.get(id)?.ownerSub).toBe(HOMEOWNER_SUB);
  });

  it('401 without a Bearer token, or with an invalid one; the draft stays anonymous', async () => {
    const { draftToken, id } = await k.seedDraft();
    const none = await k.claim(null, draftToken);
    expect(none.status).toBe(401);
    expect(none.headers['www-authenticate']).toBe('Bearer realm="BricoMission"');
    expect((await k.claim('not-a-jwt', draftToken)).status).toBe(401);
    expect(k.repo.rows.get(id)?.status).toBe('draft');
  });

  it('403 for professional and admin tokens; the draft stays anonymous and reachable', async () => {
    const { draftToken, id } = await k.seedDraft();
    for (const roles of [['professional'], ['admin'], []]) {
      const res = await k.claim(await k.token(OTHER_SUB, roles), draftToken);
      expect(res.status).toBe(403);
    }
    expect(k.repo.rows.get(id)).toMatchObject({ status: 'draft', ownerSub: null, claimedAt: null });
    expect((await k.http().get(`${DRAFTS}/current`).set('X-Draft-Token', draftToken)).status).toBe(200);
  });

  it('404 (same generic body) for missing, malformed, unknown and expired draft tokens', async () => {
    const bearer = await k.token();
    for (const header of [null, 'malformed', generateDraftToken()]) {
      const res = await k.claim(bearer, header);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Not Found', statusCode: 404 });
    }
    const { draftToken, id } = await k.seedDraft();
    const saved = k.clock.now;
    k.clock.now = new Date(saved.getTime() + 7 * DAY);
    const expired = await k.claim(bearer, draftToken);
    k.clock.now = saved;
    expect(expired.status).toBe(404);
    expect(expired.body).toEqual({ message: 'Not Found', statusCode: 404 });
    expect(k.repo.rows.get(id)?.status).toBe('draft');
  });

  it('completeness is not required for a claim', async () => {
    const { draftToken } = await k.seedDraft({});
    const res = await k.claim(await k.token(), draftToken);
    expect(res.status).toBe(200);
    expect(res.body.project).toMatchObject({ photos: [], moodboard: [], measurements: { lengthCm: null, widthCm: null, heightCm: null } });
  });

  it('two concurrent claims with different subs: exactly one 200, the other 404', async () => {
    const { draftToken, id } = await k.seedDraft();
    const [a, b] = await Promise.all([k.claim(await k.token(), draftToken), k.claim(await k.token(OTHER_SUB), draftToken)]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
    const winner = a.status === 200 ? HOMEOWNER_SUB : OTHER_SUB;
    expect(k.repo.rows.get(id)?.ownerSub).toBe(winner);
  });

  it('after a claim the draft routes give 404 for that token and nothing can change the project', async () => {
    const { draftToken, id } = await k.seedDraft();
    expect((await k.claim(await k.token(), draftToken)).status).toBe(200);
    const photoId = k.repo.rows.get(id)?.photos[0]?.id;
    const draft = (path: string) => k.http().get(`${DRAFTS}/current${path}`).set('X-Draft-Token', draftToken);
    expect((await draft('')).status).toBe(404);
    expect((await draft(`/photos/${photoId}/content?variant=thumb`)).status).toBe(404);
    const put = await k.http().put(`${DRAFTS}/current/measurements`).set('X-Draft-Token', draftToken).send({ lengthCm: 500, widthCm: 500, heightCm: 300 });
    expect(put.status).toBe(404);
    const pick = await k.http().post(`${DRAFTS}/current/moodboard/gallery-items`).set('X-Draft-Token', draftToken).send({ galleryImageId: 'modern-02' });
    expect(pick.status).toBe(404);
    expect(k.repo.rows.get(id)?.measurements).toEqual({ lengthCm: 420, widthCm: 310, heightCm: 260 });
  });

  it('claimed projects never expire: countOpen, findExpired and the sweeper ignore them', async () => {
    const { draftToken, id } = await k.seedDraft();
    expect((await k.claim(await k.token(), draftToken)).status).toBe(200);
    const far = new Date(k.clock.now.getTime() + 365 * DAY);
    expect((await k.repo.findExpired(far, 1000)).map((row) => row.id)).not.toContain(id);
    expect(await k.repo.deleteDrafts([id])).toBe(0);
    const keysBefore = k.storage.keys().filter((key) => key.includes(id));
    const sweeper = new DraftCleanupService(k.repo, k.storage, k.config, () => far);
    await sweeper.runOnce();
    expect(k.repo.rows.has(id)).toBe(true);
    expect(k.storage.keys().filter((key) => key.includes(id))).toEqual(keysBefore);
    expect(keysBefore.length).toBeGreaterThan(0);
    const open = await k.repo.countOpen(k.clock.now);
    expect([...k.repo.rows.values()].filter((row) => row.status === 'draft').length).toBeGreaterThanOrEqual(open);
  });

  it('503 when the database is down', async () => {
    const { draftToken } = await k.seedDraft({});
    k.repo.failNext = new Error('DatabaseDown');
    expect((await k.claim(await k.token(), draftToken)).status).toBe(503);
  });

  it('OpenAPI: the claim needs bearer AND draftToken; the new controller has no @Public()', async () => {
    const doc = (await k.http().get('/docs-json')).body;
    expect(doc.paths[`${DRAFTS}/current/claim`].post.security).toEqual([{ bearer: [], draftToken: [] }]);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, KitchenProjectsController)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, KitchenProjectsController)).toEqual(['user']);
    const proto = KitchenProjectsController.prototype as unknown as Record<string, object>;
    const handlers = Object.getOwnPropertyNames(proto).filter((name) => name !== 'constructor');
    expect(handlers).toEqual(expect.arrayContaining(['claim', 'get', 'photoContent', 'moodboardContent', 'createSimulation', 'requestBudget']));
    for (const name of handlers) expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto[name] as object)).toBeUndefined();
  });
});
