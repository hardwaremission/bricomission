import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { GpuJobEvent, GpuJobView } from '@bricomission/shared-types';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeImageAdapter } from '../src/ai/adapters/fake-image.adapter.js';
import { FakeLlmAdapter } from '../src/ai/adapters/fake-llm.adapter.js';
import { AiModule } from '../src/ai/ai.module.js';
import { IMAGE_ADAPTER, LLM_ADAPTER } from '../src/ai/ai.tokens.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { KEY_RESOLVER } from '../src/auth/token-verifier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { flush, GateQueue } from './gpu-test-helpers.js';
import { createTestKeys, signToken } from './support/tokens.js';

interface SseMessage {
  id: string;
  event: string;
  data: GpuJobEvent;
}

function parseSse(text: string): SseMessage[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const fields: Record<string, string> = {};
      for (const line of block.split('\n')) {
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        fields[line.slice(0, idx)] = line.slice(idx + 1).trimStart();
      }
      return { id: fields.id, event: fields.event, data: JSON.parse(fields.data) as GpuJobEvent };
    });
}

const UNKNOWN_ID = '3f1c2b0e-6a8d-4f3e-9b1a-2c4d5e6f7a8b';

describe('HTTP /ai/jobs (debug endpoints off, AppModule)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    // AppModule includes the global default-deny AuthGuard (keycloak-realm-roles), so job
    // routes need a Bearer token; a local JWKS stands in for Keycloak.
    const keys = await createTestKeys('kc-test-key');
    token = await signToken(keys, { roles: ['user'] });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn(), $disconnect: vi.fn() })
      .overrideProvider(KEY_RESOLVER)
      .useValue(keys.resolver)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authGet = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  it('debug POST /ai/jobs is 404 when the flag is off', async () => {
    const res = await request(app.getHttpServer()).post('/ai/jobs').send({ kind: 'image' });
    expect(res.status).toBe(404);
  });

  it('GET /ai/jobs/:id and /events require a token (401 without one)', async () => {
    expect((await request(app.getHttpServer()).get(`/ai/jobs/${UNKNOWN_ID}`)).status).toBe(401);
    expect((await request(app.getHttpServer()).get(`/ai/jobs/${UNKNOWN_ID}/events`)).status).toBe(401);
  });

  it('GET /ai/jobs/:id is 404 for an unknown id and 400 for a malformed one', async () => {
    expect((await authGet(`/ai/jobs/${UNKNOWN_ID}`)).status).toBe(404);
    expect((await authGet('/ai/jobs/not-a-uuid')).status).toBe(400);
  });

  it('GET /ai/jobs/:id/events is 404 for an unknown id', async () => {
    const res = await authGet(`/ai/jobs/${UNKNOWN_ID}/events`);
    expect(res.status).toBe(404);
  });

  it('/docs-json has /ai/jobs/{id} and /ai/jobs/{id}/events but no debug POST', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json');
    const paths = res.body.paths;
    expect(Object.keys(paths['/ai/jobs/{id}'].get.responses)).toEqual(expect.arrayContaining(['200', '404']));
    expect(Object.keys(paths['/ai/jobs/{id}/events'].get.responses)).toEqual(expect.arrayContaining(['200', '404']));
    expect(paths['/ai/jobs/{id}/events'].get.responses['200'].content).toHaveProperty('text/event-stream');
    expect(paths['/ai/jobs']).toBeUndefined();
  });
});

describe('HTTP /ai/jobs (debug endpoints on)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const imageGates = new GateQueue();
  const llmGates = new GateQueue();
  const image = new FakeImageAdapter({ gate: imageGates.next, echo: true });
  const llm = new FakeLlmAdapter({ gate: llmGates.next });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AiModule.register({ debugEndpoints: true })] })
      .overrideProvider(IMAGE_ADAPTER)
      .useValue(image)
      .overrideProvider(LLM_ADAPTER)
      .useValue(llm)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: object) => request(app.getHttpServer()).post('/ai/jobs').send(body);

  /** Opens the SSE stream; resolves once headers arrive so tests can drive jobs while it is live. */
  async function openStream(id: string, headers: Record<string, string> = {}) {
    const res = await fetch(`${baseUrl}/ai/jobs/${id}/events`, { headers });
    return { res, messages: res.text().then(parseSse) };
  }

  it('POST /ai/jobs returns 202 with the job view, GET returns it, invalid body is 400', async () => {
    const res = await post({ kind: 'llm', prompt: 'Say OK' });
    expect(res.status).toBe(202);
    const view = res.body as GpuJobView;
    expect(view).toMatchObject({ kind: 'llm', errorCode: null, finishedAt: null });
    expect(view.id).toMatch(/^[0-9a-f-]{36}$/);
    const got = await request(app.getHttpServer()).get(`/ai/jobs/${view.id}`);
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(view.id);

    await flush();
    llmGates.open(llmGates.gates.length - 1);
    await flush();
    const done = await request(app.getHttpServer()).get(`/ai/jobs/${view.id}`);
    expect(done.body).toMatchObject({ status: 'done', position: null, waitingFor: null, errorCode: null });

    expect((await post({ kind: 'gpu' })).status).toBe(400);
    expect((await post({ kind: 'llm', prompt: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('SSE streams queued..running..done with increasing ids and ends; replay and Last-Event-ID work', async () => {
    const img1 = (await post({ kind: 'image' })).body as GpuJobView;
    const img2 = (await post({ kind: 'image' })).body as GpuJobView;
    const chat = (await post({ kind: 'llm' })).body as GpuJobView;
    expect(chat).toMatchObject({ status: 'queued', position: 2, waitingFor: 'image' });

    const { res, messages } = await openStream(chat.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    await flush();
    const imageBase = imageGates.gates.length - 1; // img1's gate
    imageGates.open(imageBase);
    await flush();
    imageGates.open(imageBase + 1);
    await flush();
    llmGates.open(llmGates.gates.length - 1);
    const live = await messages; // resolves only when the server ends the stream

    expect(live.map((m) => m.event)).toEqual(['queued', 'queued', 'running', 'done']);
    expect(live[0].data).toMatchObject({ jobId: chat.id, status: 'queued', position: 2, waitingFor: 'image' });
    const ids = live.map((m) => Number(m.id));
    ids.forEach((id, i) => {
      if (i > 0) expect(id).toBeGreaterThan(ids[i - 1]);
    });
    live.forEach((m) => {
      expect(m.data.seq).toBe(Number(m.id));
      expect(m.data.status).toBe(m.event);
    });
    expect((await request(app.getHttpServer()).get(`/ai/jobs/${img1.id}`)).body.status).toBe('done');
    expect((await request(app.getHttpServer()).get(`/ai/jobs/${img2.id}`)).body.status).toBe('done');

    // A late subscriber receives the replayed history, then the stream closes.
    const replay = await (await openStream(chat.id)).messages;
    expect(replay).toEqual(live);

    // Last-Event-ID skips events already seen.
    const resumed = await (await openStream(chat.id, { 'Last-Event-ID': '2' })).messages;
    expect(resumed.map((m) => m.id)).toEqual(['3', '4']);
  });

  it('a failed job stream ends with failed and an error code only', async () => {
    const spy = vi.spyOn(image, 'render').mockRejectedValueOnce(new Error('ECONNREFUSED http://comfyui:8188 secret'));
    const job = (await post({ kind: 'image' })).body as GpuJobView;
    const messages = await (await openStream(job.id)).messages;
    spy.mockRestore();
    expect(messages.at(-1)?.event).toBe('failed');
    expect(messages.at(-1)?.data.errorCode).toBe('adapter_error');
    expect(messages.filter((m) => m.event === 'failed' || m.event === 'done')).toHaveLength(1);
    expect(JSON.stringify(messages)).not.toMatch(/comfyui|secret|ECONNREFUSED/);
  });

  it('/docs-json documents the debug POST with 202 and 429', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json');
    expect(Object.keys(res.body.paths['/ai/jobs'].post.responses)).toEqual(expect.arrayContaining(['202', '429']));
  });
});

describe('HTTP POST /ai/jobs queue full', () => {
  it('returns 429 when GPU_BROKER_MAX_QUEUED jobs are queued', async () => {
    vi.stubEnv('GPU_BROKER_MAX_QUEUED', '1');
    const gates = new GateQueue();
    const moduleRef = await Test.createTestingModule({ imports: [AiModule.register({ debugEndpoints: true })] })
      .overrideProvider(IMAGE_ADAPTER)
      .useValue(new FakeImageAdapter({ gate: gates.next, echo: true }))
      .compile();
    const app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    try {
      const server = app.getHttpServer();
      expect((await request(server).post('/ai/jobs').send({ kind: 'image' })).status).toBe(202); // running
      expect((await request(server).post('/ai/jobs').send({ kind: 'image' })).status).toBe(202); // queued
      const full = await request(server).post('/ai/jobs').send({ kind: 'image' });
      expect(full.status).toBe(429);
    } finally {
      vi.unstubAllEnvs();
      await flush();
      gates.gates.forEach((g) => g.open());
      await app.close();
    }
  });
});
