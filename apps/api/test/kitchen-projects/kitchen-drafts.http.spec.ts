import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { generateDraftToken, hashDraftToken } from '../../src/kitchen-projects/draft-token.js';
import { KITCHEN_CLOCK, KITCHEN_DRAFT_CONFIG, type KitchenDraftConfig } from '../../src/kitchen-projects/kitchen-projects.config.js';
import { KITCHEN_DRAFT_REPOSITORY } from '../../src/kitchen-projects/kitchen-drafts.repository.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { OBJECT_STORAGE } from '../../src/storage/object-storage.js';
import { fixture, makeImage } from '../support/images.js';
import { MemoryKitchenDraftRepository } from '../support/memory-kitchen-draft-repository.js';
import { MemoryObjectStorage } from '../support/memory-object-storage.js';

const DAY = 24 * 60 * 60 * 1000;
const BASE = '/kitchen-projects/drafts';

// DB-free, MinIO-free HTTP tests: in-memory repository and storage, controllable clock.
describe('HTTP /kitchen-projects/drafts', () => {
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
  const upload = (token: string, body: Buffer, filename = 'photo.jpg') =>
    http().post(`${BASE}/current/photos`).set('X-Draft-Token', token).attach('photo', body, { filename, contentType: 'image/jpeg' });

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
    config.maxOpen = 2000;
  });

  it('POST creates a draft without any Authorization and returns the token once', async () => {
    const res = await http().post(BASE);
    expect(res.status).toBe(201);
    expect(res.body.draftToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.draft).toMatchObject({
      status: 'draft',
      measurements: { lengthCm: null, widthCm: null, heightCm: null },
      photos: [],
      limits: { maxPhotos: 8, maxPhotoBytes: 15 * 1024 * 1024 },
      expiresAt: new Date(now.getTime() + 7 * DAY).toISOString(),
    });
    // Only the 32-byte hash is stored.
    const row = repo.rows.get(res.body.draft.id);
    expect(row?.tokenHash).toHaveLength(32);
    expect(row?.tokenHash.equals(hashDraftToken(res.body.draftToken))).toBe(true);
    expect(JSON.stringify([...repo.rows.values()])).not.toContain(res.body.draftToken);
  });

  it('GET current: 200 with the token; generic 404 when missing, malformed, unknown or expired', async () => {
    const { token, id } = await start();
    const ok = await http().get(`${BASE}/current`).set('X-Draft-Token', token);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(id);

    for (const header of [undefined, 'malformed', generateDraftToken()]) {
      const req = http().get(`${BASE}/current`);
      const res = await (header ? req.set('X-Draft-Token', header) : req);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Not Found', statusCode: 404 });
    }

    const saved = now;
    now = new Date(now.getTime() + 7 * DAY);
    const expired = await http().get(`${BASE}/current`).set('X-Draft-Token', token);
    now = saved;
    expect(expired.status).toBe(404);
    expect(expired.body).toEqual({ message: 'Not Found', statusCode: 404 });
  });

  it('a Bearer token is irrelevant: draft routes are public and guarded by the draft token only', async () => {
    const res = await http().get(`${BASE}/current`).set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(404);
  });

  it('PUT measurements: 200 with valid values, expiry slides; 400 with per-field codes', async () => {
    const { token, id } = await start();
    now = new Date(now.getTime() + DAY);
    const ok = await http().put(`${BASE}/current/measurements`).set('X-Draft-Token', token).send({ lengthCm: 420, widthCm: 310, heightCm: 260 });
    expect(ok.status).toBe(200);
    expect(ok.body.measurements).toEqual({ lengthCm: 420, widthCm: 310, heightCm: 260 });
    expect(ok.body.expiresAt).toBe(new Date(now.getTime() + 7 * DAY).toISOString());
    expect(repo.rows.get(id)?.expiresAt.toISOString()).toBe(ok.body.expiresAt);

    const bad = await http().put(`${BASE}/current/measurements`).set('X-Draft-Token', token).send({ lengthCm: 99, widthCm: 3.5, heightCm: '300' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      statusCode: 400,
      message: 'Bad Request',
      code: 'invalid_measurements',
      fields: { lengthCm: 'out_of_range', widthCm: 'not_integer', heightCm: 'not_integer' },
    });
    expect(repo.rows.get(id)?.measurements).toEqual({ lengthCm: 420, widthCm: 310, heightCm: 260 });

    const nulls = await http().put(`${BASE}/current/measurements`).set('X-Draft-Token', token).send({ lengthCm: null, widthCm: 310, heightCm: null });
    expect(nulls.status).toBe(200);
    expect(nulls.body.measurements).toEqual({ lengthCm: null, widthCm: 310, heightCm: null });
  });

  it('upload: 201, two metadata-free objects under the draft prefix, view and content', async () => {
    const { token, id } = await start();
    now = new Date(now.getTime() + DAY);
    const res = await upload(token, fixture('kitchen-gps-orient6.jpg'), 'IMG_0001.png');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ position: 0, width: 1024, height: 768 });
    expect(res.body.thumbUrl).toBe(`${BASE}/current/photos/${res.body.id}/content?variant=thumb`);
    expect(res.body.fullUrl).toBe(`${BASE}/current/photos/${res.body.id}/content?variant=full`);
    const prefix = `kitchen-projects/${id}/photos/${res.body.id}`;
    expect(storage.keys().filter((key) => key.startsWith(`kitchen-projects/${id}/`))).toEqual([`${prefix}/full.jpg`, `${prefix}/thumb.jpg`]);
    expect(storage.objects.get(`${prefix}/full.jpg`)?.body.includes(Buffer.from('GPS-Test'))).toBe(false);
    expect(repo.rows.get(id)?.expiresAt.getTime()).toBe(now.getTime() + 7 * DAY);

    const content = await http().get(res.body.thumbUrl).set('X-Draft-Token', token).buffer(true);
    expect(content.status).toBe(200);
    expect(content.headers['content-type']).toBe('image/jpeg');
    expect(content.headers['cache-control']).toBe('private, max-age=3600');
    expect(content.body.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    const current = await http().get(`${BASE}/current`).set('X-Draft-Token', token);
    expect(current.body.photos).toHaveLength(1);
  });

  it('upload: HEIC with GPS is accepted and stored as JPEG', async () => {
    const { token, id } = await start();
    const res = await upload(token, fixture('kitchen-gps.heic'), 'IMG_0002.HEIC');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ width: 1024, height: 768 });
    const full = storage.objects.get(`kitchen-projects/${id}/photos/${res.body.id}/full.jpg`);
    expect(full?.contentType).toBe('image/jpeg');
    expect(full?.body.includes(Buffer.from('GPS-Test'))).toBe(false);
  });

  it('upload errors carry codes: 413, 415, 422, 400, and nothing is stored', async () => {
    const { token, id } = await start();
    const cases: Array<[Buffer, number, string]> = [
      [Buffer.alloc(15 * 1024 * 1024 + 1, 0xff), 413, 'photo_too_large'],
      [await makeImage(600, 600, 'gif'), 415, 'photo_unsupported_type'],
      [Buffer.from('plain text renamed to kitchen.jpg'), 415, 'photo_unsupported_type'],
      [await makeImage(640, 640, 'avif'), 415, 'photo_unsupported_type'],
      [fixture('not-heic.heic'), 415, 'photo_unsupported_type'],
      [await makeImage(300, 200, 'jpeg'), 422, 'photo_too_small'],
      [fixture('kitchen-small.heic'), 422, 'photo_too_small'],
    ];
    for (const [body, status, code] of cases) {
      const res = await upload(token, body);
      expect(res.status, code).toBe(status);
      expect(res.body.code).toBe(code);
    }
    const missing = await http().post(`${BASE}/current/photos`).set('X-Draft-Token', token).field('other', 'x');
    expect(missing.status).toBe(400);
    const empty = await http().post(`${BASE}/current/photos`).set('X-Draft-Token', token);
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('photo_missing');
    expect(storage.keys().filter((key) => key.includes(id))).toEqual([]);
  });

  it('upload: no draft token gives 404 before the body is read', async () => {
    const res = await http().post(`${BASE}/current/photos`).attach('photo', jpeg, 'a.jpg');
    expect(res.status).toBe(404);
  });

  it('9th photo gives 409 photo_limit_reached', async () => {
    const { token, id } = await start();
    for (let i = 0; i < 8; i++) expect((await upload(token, jpeg)).status).toBe(201);
    const res = await upload(token, jpeg);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('photo_limit_reached');
    expect(repo.rows.get(id)?.photos).toHaveLength(8);
    expect(storage.keys().filter((key) => key.includes(id))).toHaveLength(16);
  });

  it('storage down: upload 503 storage_unavailable, the draft still loads', async () => {
    const { token } = await start();
    storage.down = true;
    const res = await upload(token, jpeg);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('storage_unavailable');
    expect((await http().get(`${BASE}/current`).set('X-Draft-Token', token)).status).toBe(200);
  });

  it('delete compacts positions and removes both objects; foreign photo ids give 404', async () => {
    const a = await start();
    const b = await start();
    const first = (await upload(a.token, jpeg)).body;
    const second = (await upload(a.token, jpeg)).body;
    const foreign = (await upload(b.token, jpeg)).body;

    // IDOR guard: b's photo through a's token.
    expect((await http().get(foreign.thumbUrl).set('X-Draft-Token', a.token)).status).toBe(404);
    expect((await http().delete(`${BASE}/current/photos/${foreign.id}`).set('X-Draft-Token', a.token)).status).toBe(404);
    expect((await http().get(`${BASE}/current/photos/not-a-uuid/content?variant=thumb`).set('X-Draft-Token', a.token)).status).toBe(400);
    expect((await http().get(`${BASE}/current/photos/${first.id}/content?variant=original`).set('X-Draft-Token', a.token)).status).toBe(400);
    expect((await http().get(`${BASE}/current/photos/${first.id}/content`).set('X-Draft-Token', a.token)).status).toBe(400);

    const del = await http().delete(`${BASE}/current/photos/${first.id}`).set('X-Draft-Token', a.token);
    expect(del.status).toBe(204);
    const current = await http().get(`${BASE}/current`).set('X-Draft-Token', a.token);
    expect(current.body.photos.map((p: { id: string; position: number }) => [p.id, p.position])).toEqual([[second.id, 0]]);
    expect(storage.keys().filter((key) => key.includes(first.id))).toEqual([]);
    expect(storage.keys().filter((key) => key.includes(foreign.id))).toHaveLength(2);
  });

  it('capacity: 429 draft_capacity above DRAFT_MAX_OPEN unexpired drafts', async () => {
    config.maxOpen = await repo.countOpen(now);
    const res = await http().post(BASE);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ statusCode: 429, message: 'Too Many Requests', code: 'draft_capacity' });
  });

  it('database down: 503 without internals', async () => {
    const { token } = await start();
    repo.failNext = new Error('connect ECONNREFUSED postgres:5432 password=secret');
    const res = await http().get(`${BASE}/current`).set('X-Draft-Token', token);
    expect(res.status).toBe(503);
    expect(res.text).not.toMatch(/ECONNREFUSED|secret/);
    repo.failNext = new Error('connect ECONNREFUSED');
    expect((await http().post(BASE)).status).toBe(503);
  });

  it('/docs-json documents the routes with the draftToken API-key scheme', async () => {
    const doc = (await http().get('/docs-json')).body;
    expect(doc.components.securitySchemes.draftToken).toEqual(expect.objectContaining({ type: 'apiKey', in: 'header', name: 'X-Draft-Token' }));
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        BASE,
        `${BASE}/current`,
        `${BASE}/current/measurements`,
        `${BASE}/current/photos`,
        `${BASE}/current/photos/{photoId}/content`,
        `${BASE}/current/photos/{photoId}`,
      ]),
    );
    expect(doc.paths[`${BASE}/current`].get.security).toEqual([{ draftToken: [] }]);
    expect(doc.paths[BASE].post.security).toBeUndefined();
    expect(Object.keys(doc.paths[`${BASE}/current/photos`].post.requestBody.content)).toEqual(['multipart/form-data']);
    expect(doc.components.schemas.KitchenMeasurementsDto.properties.heightCm).toMatchObject({ minimum: 180, maximum: 600 });
  });
});
