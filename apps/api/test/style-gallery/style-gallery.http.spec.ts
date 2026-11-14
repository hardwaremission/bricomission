import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { OBJECT_STORAGE } from '../../src/storage/object-storage.js';
import { MemoryObjectStorage } from '../support/memory-object-storage.js';

// The gallery needs no database, storage, GPU or network: Prisma is a stub and storage is down.
describe('HTTP /style-gallery', () => {
  let app: INestApplication;
  const storage = new MemoryObjectStorage();
  storage.down = true;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn().mockRejectedValue(new Error('down')), $disconnect: vi.fn() })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /style-gallery is public, cached, grouped by style and hides prompt and seed', async () => {
    const res = await http().get('/style-gallery');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.body.styles).toHaveLength(8);
    const images = res.body.styles.flatMap((style: { images: unknown[] }) => style.images);
    expect(images).toHaveLength(24);
    expect(res.body.styles[1]).toMatchObject({ id: 'scandinavian' });
    expect(res.body.styles[1].images[0]).toEqual({
      id: 'scandinavian-01',
      width: 1216,
      height: 832,
      thumbUrl: '/style-gallery/images/scandinavian-01/content?variant=thumb',
      fullUrl: '/style-gallery/images/scandinavian-01/content?variant=full',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/prompt|seed/);
  });

  it('serves thumb and full JPEGs with a long public cache', async () => {
    for (const [variant, edge] of [['thumb', 512], ['full', 1216]] as const) {
      const res = await http().get(`/style-gallery/images/modern-02/content?variant=${variant}`).buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('public, max-age=86400');
      const meta = await sharp(res.body as Buffer).metadata();
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(edge);
    }
  });

  it('400 for a bad variant, 404 for unknown or path-like ids', async () => {
    expect((await http().get('/style-gallery/images/modern-02/content?variant=original')).status).toBe(400);
    expect((await http().get('/style-gallery/images/modern-02/content')).status).toBe(400);
    for (const id of ['modern-99', 'MODERN-01', '..%2Fmanifest.json', 'manifest.json']) {
      const res = await http().get(`/style-gallery/images/${id}/content?variant=thumb`);
      expect(res.status, id).toBe(404);
    }
  });

  it('a Bearer token is irrelevant: the gallery is public', async () => {
    const res = await http().get('/style-gallery').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(200);
  });
});
