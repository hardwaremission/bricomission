import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// DB-free HTTP tests: PrismaService is replaced by a stub whose ping we control.
const queryRaw = vi.fn<() => Promise<unknown>>();

describe('HTTP /health and /docs', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw, $disconnect: vi.fn() })
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with database up', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('GET /health returns 503 with database down and no error details', async () => {
    queryRaw.mockRejectedValueOnce(new Error('password authentication failed for postgresql://secret'));
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', database: 'down' });
    expect(res.text).not.toContain('secret');
  });

  it('GET /docs-json documents /health with 200 and 503', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('BricoMission API');
    const responses = res.body.paths['/health'].get.responses;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['200', '503']));
  });

  it('GET /docs serves Swagger UI without CDN assets', async () => {
    const res = await request(app.getHttpServer()).get('/docs');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
    expect(res.text).not.toMatch(/cdn|unpkg|jsdelivr/i);
  });
});
