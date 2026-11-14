import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { generateDraftToken } from '../../src/kitchen-projects/draft-token.js';
import { KITCHEN_CLOCK, KITCHEN_DRAFT_CONFIG, type KitchenDraftConfig } from '../../src/kitchen-projects/kitchen-projects.config.js';
import { KITCHEN_DRAFT_REPOSITORY } from '../../src/kitchen-projects/kitchen-drafts.repository.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { OBJECT_STORAGE } from '../../src/storage/object-storage.js';
import { fixture, makeImage } from '../support/images.js';
import { MemoryKitchenDraftRepository } from '../support/memory-kitchen-draft-repository.js';
import { MemoryObjectStorage } from '../support/memory-object-storage.js';

const DAY = 24 * 60 * 60 * 1000;
const BASE = '/kitchen-projects/drafts';
const MOODBOARD = `${BASE}/current/moodboard`;
const GALLERY_IDS = [
  'modern-01', 'modern-02', 'modern-03', 'scandinavian-01', 'scandinavian-02', 'scandinavian-03',
  'industrial-01', 'industrial-02', 'industrial-03', 'farmhouse-01', 'farmhouse-02', 'farmhouse-03', 'classic-01',
];

// DB-free, MinIO-free HTTP tests of the Moodboard routes (feature moodboard-selection).
describe('HTTP /kitchen-projects/drafts/current/moodboard', () => {
  let app: INestApplication;
  const repo = new MemoryKitchenDraftRepository();
  const storage = new MemoryObjectStorage();
  const config: KitchenDraftConfig = { ttlDays: 7, cleanupIntervalMs: 0, maxOpen: 2000 };
  let now = new Date('2026-11-14T10:00:00.000Z');
  let jpeg: Buffer;

  const http = () => request(app.getHttpServer());
  async function start(): Promise<{ token: string; id: string }> {
    const res = await http().post(BASE);
    expect(res.status).toBe(201);
    return { token: res.body.draftToken, id: res.body.draft.id };
  }
  const pick = (token: string, galleryImageId: unknown) =>
    http().post(`${MOODBOARD}/gallery-items`).set('X-Draft-Token', token).send({ galleryImageId });
  const upload = (token: string, body: Buffer, filename = 'ref.jpg') =>
    http().post(`${MOODBOARD}/uploads`).set('X-Draft-Token', token).attach('photo', body, { filename, contentType: 'image/jpeg' });
  const current = (token: string) => http().get(`${BASE}/current`).set('X-Draft-Token', token);

  beforeAll(async () => {
    jpeg = await makeImage(800, 600, 'jpeg');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn(), $disconnect: vi.fn() })
      .overrideProvider(KITCHEN_DRAFT_REPOSITORY)
      .useValue(repo)
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .overrideProvider(KITCHEN_DRAFT_CONFIG)
      .useValue(config)
      .overrideProvider(KITCHEN_CLOCK)
      .useValue(() => now)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    storage.down = false;
  });

  it('the draft view lists an empty Moodboard and its limit', async () => {
    const { token } = await start();
    const res = await current(token);
    expect(res.status).toBe(200);
    expect(res.body.moodboard).toEqual([]);
    expect(res.body.limits).toEqual({ maxPhotos: 8, maxPhotoBytes: 15 * 1024 * 1024, maxMoodboardItems: 12 });
  });

  it('gallery pick: 201 with the gallery URLs, then 200 with the same item; expiry slides once', async () => {
    const { token, id } = await start();
    now = new Date(now.getTime() + DAY);
    const first = await pick(token, 'scandinavian-02');
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      source: 'gallery',
      galleryImageId: 'scandinavian-02',
      styleId: 'scandinavian',
      position: 0,
      width: 1216,
      height: 832,
      thumbUrl: '/style-gallery/images/scandinavian-02/content?variant=thumb',
      fullUrl: '/style-gallery/images/scandinavian-02/content?variant=full',
    });
    expect(repo.rows.get(id)?.expiresAt.toISOString()).toBe(new Date(now.getTime() + 7 * DAY).toISOString());

    const again = await pick(token, 'scandinavian-02');
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(repo.rows.get(id)?.moodboard).toHaveLength(1);
    // Gallery picks store no objects.
    expect(storage.keys().filter((key) => key.includes(id))).toEqual([]);
    const view = await current(token);
    expect(view.body.moodboard).toEqual([first.body]);
  });

  it('gallery pick: 400 gallery_image_unknown for unknown ids; plain 400 for a malformed body', async () => {
    const { token } = await start();
    for (const unknown of ['modern-99', '../manifest', 'MODERN-01', '']) {
      const res = await pick(token, unknown);
      expect(res.status, unknown).toBe(400);
      expect(res.body).toEqual({ statusCode: 400, message: 'Bad Request', code: 'gallery_image_unknown' });
    }
    for (const body of [{}, { galleryImageId: 7 }, [], 'modern-01']) {
      const res = await http().post(`${MOODBOARD}/gallery-items`).set('X-Draft-Token', token).send(body as object);
      expect(res.status).toBe(400);
      expect(res.body.code).toBeUndefined();
    }
  });

  it('upload: 201, two metadata-free objects under moodboard/, content route, gallery item content 404', async () => {
    const { token, id } = await start();
    const res = await upload(token, fixture('kitchen-gps-orient6.jpg'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ source: 'upload', galleryImageId: null, styleId: null, position: 0, width: 1024, height: 768 });
    expect(res.body.thumbUrl).toBe(`${MOODBOARD}/items/${res.body.id}/content?variant=thumb`);
    expect(res.body.fullUrl).toBe(`${MOODBOARD}/items/${res.body.id}/content?variant=full`);
    const prefix = `kitchen-projects/${id}/moodboard/${res.body.id}`;
    expect(storage.keys().filter((key) => key.includes(id))).toEqual([`${prefix}/full.jpg`, `${prefix}/thumb.jpg`]);
    for (const key of [`${prefix}/full.jpg`, `${prefix}/thumb.jpg`]) {
      const meta = await sharp(storage.objects.get(key)?.body).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    }

    const thumb = await http().get(`${MOODBOARD}/items/${res.body.id}/content?variant=thumb`).set('X-Draft-Token', token).buffer(true);
    expect(thumb.status).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/jpeg');
    expect(thumb.headers['cache-control']).toBe('private, max-age=3600');

    const gallery = await pick(token, 'modern-01');
    const galleryContent = await http().get(`${MOODBOARD}/items/${gallery.body.id}/content?variant=thumb`).set('X-Draft-Token', token);
    expect(galleryContent.status).toBe(404);
    expect((await http().get(`${MOODBOARD}/items/${res.body.id}/content?variant=raw`).set('X-Draft-Token', token)).status).toBe(400);
    expect((await http().get(`${MOODBOARD}/items/not-a-uuid/content?variant=thumb`).set('X-Draft-Token', token)).status).toBe(400);
  });

  it('upload: HEIC 201; photo rule codes 413/415/422 and photo_missing', async () => {
    const { token, id } = await start();
    const heic = await upload(token, fixture('kitchen-gps.heic'), 'IMG_1.heic');
    expect(heic.status).toBe(201);
    expect(heic.body).toMatchObject({ width: 1024, height: 768 });

    const gif = await upload(token, await makeImage(800, 600, 'gif'), 'a.gif');
    expect(gif.status).toBe(415);
    expect(gif.body.code).toBe('photo_unsupported_type');
    const small = await upload(token, await makeImage(300, 200, 'jpeg'));
    expect(small.status).toBe(422);
    expect(small.body.code).toBe('photo_too_small');
    const big = await upload(token, Buffer.concat([jpeg, Buffer.alloc(15 * 1024 * 1024)]));
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('photo_too_large');
    const missing = await http().post(`${MOODBOARD}/uploads`).set('X-Draft-Token', token).field('x', 'y');
    expect(missing.status).toBe(400);
    expect(repo.rows.get(id)?.moodboard).toHaveLength(1);
  });

  it('the Moodboard belongs to the draft: foreign, missing and expired tokens get the generic 404', async () => {
    const a = await start();
    const b = await start();
    const item = (await upload(a.token, jpeg)).body;
    const pickA = (await pick(a.token, 'japandi-01')).body;

    const foreign = await current(b.token);
    expect(foreign.body.moodboard).toEqual([]);
    for (const itemId of [item.id, pickA.id]) {
      expect((await http().get(`${MOODBOARD}/items/${itemId}/content?variant=thumb`).set('X-Draft-Token', b.token)).status).toBe(404);
      expect((await http().delete(`${MOODBOARD}/items/${itemId}`).set('X-Draft-Token', b.token)).status).toBe(404);
    }
    for (const header of [undefined, 'malformed', generateDraftToken()]) {
      const withHeader = <T extends request.Test>(req: T) => (header ? req.set('X-Draft-Token', header) : req);
      const add = await withHeader(http().post(`${MOODBOARD}/gallery-items`)).send({ galleryImageId: 'modern-01' });
      expect(add.status).toBe(404);
      expect(add.body).toEqual({ message: 'Not Found', statusCode: 404 });
      expect((await withHeader(http().post(`${MOODBOARD}/uploads`)).attach('photo', jpeg, 'r.jpg')).status).toBe(404);
      expect((await withHeader(http().delete(`${MOODBOARD}/items/${item.id}`))).status).toBe(404);
    }
    const saved = now;
    now = new Date(now.getTime() + 8 * DAY);
    expect((await pick(a.token, 'modern-02')).status).toBe(404);
    now = saved;
    expect((await current(a.token)).body.moodboard).toHaveLength(2);
  });

  it('limit: 12 items across sources; the 13th gives 409 and leaves no objects', async () => {
    const { token, id } = await start();
    expect((await upload(token, jpeg)).status).toBe(201);
    for (const galleryId of GALLERY_IDS.slice(0, 11)) expect((await pick(token, galleryId)).status).toBe(201);
    const objectsBefore = storage.keys().filter((key) => key.includes(id));

    const thirteenth = await pick(token, GALLERY_IDS[11]);
    expect(thirteenth.status).toBe(409);
    expect(thirteenth.body).toEqual({ statusCode: 409, message: 'Conflict', code: 'moodboard_limit_reached' });
    const upload13 = await upload(token, jpeg);
    expect(upload13.status).toBe(409);
    expect(upload13.body.code).toBe('moodboard_limit_reached');
    expect(storage.keys().filter((key) => key.includes(id))).toEqual(objectsBefore);
    // An image already in the Moodboard is still answered (idempotent), even when full.
    expect((await pick(token, GALLERY_IDS[0])).status).toBe(200);
    expect(repo.rows.get(id)?.moodboard).toHaveLength(12);
  });

  it('limit holds under concurrent adds', async () => {
    const { token, id } = await start();
    const results = await Promise.all(GALLERY_IDS.map((galleryId) => pick(token, galleryId)));
    expect(results.filter((res) => res.status === 201)).toHaveLength(12);
    expect(results.filter((res) => res.status === 409)).toHaveLength(1);
    expect(repo.rows.get(id)?.moodboard).toHaveLength(12);
  });

  it('delete: 204, upload objects first, positions compacted, expiry slides; gallery delete deselects', async () => {
    const { token, id } = await start();
    const first = (await pick(token, 'classic-01')).body;
    const ref = (await upload(token, jpeg)).body;
    const last = (await pick(token, 'classic-02')).body;
    now = new Date(now.getTime() + 2 * DAY);

    const res = await http().delete(`${MOODBOARD}/items/${ref.id}`).set('X-Draft-Token', token);
    expect(res.status).toBe(204);
    expect(storage.keys().filter((key) => key.includes(ref.id))).toEqual([]);
    const view = (await current(token)).body;
    expect(view.moodboard.map((item: { id: string; position: number }) => [item.id, item.position])).toEqual([
      [first.id, 0],
      [last.id, 1],
    ]);
    expect(view.expiresAt).toBe(new Date(now.getTime() + 7 * DAY).toISOString());

    expect((await http().delete(`${MOODBOARD}/items/${first.id}`).set('X-Draft-Token', token)).status).toBe(204);
    expect((await pick(token, 'classic-01')).status).toBe(201);
    expect(repo.rows.get(id)?.moodboard.map((item) => item.galleryImageId)).toEqual(['classic-02', 'classic-01']);
    expect((await http().delete(`${MOODBOARD}/items/${first.id}`).set('X-Draft-Token', token)).status).toBe(404);
  });

  it('storage down: upload 503 storage_unavailable, gallery picks and the draft still work, delete keeps the row', async () => {
    const { token, id } = await start();
    const ref = (await upload(token, jpeg)).body;
    storage.down = true;
    const res = await upload(token, jpeg);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('storage_unavailable');
    expect((await pick(token, 'minimalist-01')).status).toBe(201);
    expect((await current(token)).status).toBe(200);
    const del = await http().delete(`${MOODBOARD}/items/${ref.id}`).set('X-Draft-Token', token);
    expect(del.status).toBe(503);
    expect(del.body.code).toBe('storage_unavailable');
    expect(repo.rows.get(id)?.moodboard).toHaveLength(2);
    const content = await http().get(`${MOODBOARD}/items/${ref.id}/content?variant=thumb`).set('X-Draft-Token', token);
    expect(content.status).toBe(503);
  });

  it('database failure on add gives 503', async () => {
    const { token } = await start();
    // The guard's lookup succeeds; the insert fails.
    const spy = vi.spyOn(repo, 'addMoodboardItem').mockRejectedValueOnce(new Error('connection lost'));
    const res = await pick(token, 'modern-01');
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('connection lost');
  });

  it('OpenAPI documents the Moodboard routes under the draftToken scheme and the gallery as public', async () => {
    const doc = (await http().get('/docs-json')).body;
    for (const path of [
      '/kitchen-projects/drafts/current/moodboard/gallery-items',
      '/kitchen-projects/drafts/current/moodboard/uploads',
    ]) {
      expect(doc.paths[path].post.security).toEqual([{ draftToken: [] }]);
    }
    expect(doc.paths['/kitchen-projects/drafts/current/moodboard/items/{itemId}'].delete.security).toEqual([{ draftToken: [] }]);
    expect(doc.paths['/style-gallery'].get.security).toBeUndefined();
  });
});
