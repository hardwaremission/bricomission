import type { DiagnosticsEvent, DiagnosticsHello, DiagnosticsTopology } from '@bricomission/shared-types';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runWithCorrelation } from '../../src/diagnostics/correlation.js';
import { createDiagnosticsApp, type DiagnosticsTestApp, type OpenStream, openStream, TOKEN } from './support.js';

const H = { 'X-Diagnostics-Token': TOKEN };
const CID = '0123456789abcdef';
const events = (frames: Array<{ event?: string; data?: unknown }>): DiagnosticsEvent[] => frames.filter((f) => f.event === 'diagnostics').map((f) => f.data as DiagnosticsEvent);

describe('GET /diagnostics/stream', () => {
  let t: DiagnosticsTestApp;
  const open: OpenStream[] = [];
  beforeAll(async () => {
    t = await createDiagnosticsApp({ enabled: true, heartbeatMs: 40, adapters: 'fake', bufferSize: 5 });
  });
  afterEach(() => {
    for (const s of open.splice(0)) s.close();
  });
  afterAll(async () => {
    await t.app.close();
  });
  const stream = async (headers: Record<string, string> = H, path?: string) => {
    const s = await openStream(t.port, headers, path);
    open.push(s);
    return s;
  };
  const emit = (n: number, cid = CID) => {
    for (let i = 0; i < n; i += 1) t.service?.emit({ correlationId: cid, from: 'web', to: 'api-guards', kind: 'http', summary: `event ${i}` });
  };

  it('sends SSE headers, then hello first (retry 500, no id) with the buffer state', async () => {
    const s = await stream();
    await s.waitFor((f) => f.length >= 1);
    expect(s.status).toBe(200);
    expect(s.headers['content-type']).toContain('text/event-stream');
    expect(s.headers['cache-control']).toContain('no-cache');
    expect(s.headers['x-accel-buffering']).toBe('no');
    const hello = s.frames[0];
    expect(hello.event).toBe('hello');
    expect(hello.id).toBeUndefined();
    expect(hello.retry).toBe('500');
    expect(hello.data).toMatchObject({ enabled: true, adapters: 'fake', oldestSeq: 0, newestSeq: 0, bufferCount: 0 });
    expect((hello.data as DiagnosticsHello).bootId).toMatch(/^[0-9a-f]{12}$/);
  });

  it('delivers live events in sequence order with ids, correlation ids and the redacted payload', async () => {
    const s = await stream();
    await s.waitFor((f) => f.length >= 1);
    runWithCorrelation({ correlationId: 'aaaaaaaaaaaaaaaa' }, () =>
      t.service?.emit({ from: 'browser', to: 'web', kind: 'http', summary: 'GET /x', payload: { status: 200, authorization: 'Bearer abcdef0123456789' } }),
    );
    emit(2, 'bbbbbbbbbbbbbbbb');
    const frames = await s.waitFor((f) => events(f).length >= 3);
    const got = events(frames);
    const seqs = got.map((e) => Number(e.id));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(3);
    expect(frames.filter((f) => f.event === 'diagnostics').map((f) => f.id)).toEqual(got.map((e) => e.id));
    expect(got.map((e) => e.correlationId)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb']);
    expect(got[0].payload).toEqual({ status: 200, authorization: '[redacted]' });
  });

  it('replays the buffer on connect (evicting by count), a second client gets the same, Last-Event-ID resumes', async () => {
    emit(8); // buffer keeps 5
    const a = await stream();
    const b = await stream();
    const [fa, fb] = await Promise.all([a.waitFor((f) => events(f).length >= 5), b.waitFor((f) => events(f).length >= 5)]);
    const idsA = events(fa).map((e) => e.id);
    expect(idsA).toEqual(events(fb).map((e) => e.id));
    const hello = fa[0].data as DiagnosticsHello;
    expect(hello.bufferCount).toBe(5);
    expect(idsA[0]).toBe(String(hello.oldestSeq));
    expect(idsA.at(-1)).toBe(String(hello.newestSeq));
    const resumeFrom = Number(idsA[2]);
    const c = await stream({ ...H, 'Last-Event-ID': String(resumeFrom) });
    const fc = await c.waitFor((f) => events(f).length >= 2);
    expect(events(fc).map((e) => Number(e.id))).toEqual([resumeFrom + 1, resumeFrom + 2]);
    // Nothing duplicated or skipped once live events continue.
    emit(1);
    const more = await c.waitFor((f) => events(f).length >= 3);
    expect(events(more).map((e) => Number(e.id))).toEqual([resumeFrom + 1, resumeFrom + 2, resumeFrom + 3]);
  });

  it('replay=N limits the replay to the last N events', async () => {
    emit(5);
    const s = await stream(H, '/diagnostics/stream?replay=2');
    await s.waitFor((f) => events(f).length >= 2);
    await new Promise((r) => setTimeout(r, 30));
    expect(events(s.frames)).toHaveLength(2);
  });

  it('sends a `: ping` comment on the heartbeat and none of it carries an id', async () => {
    const s = await stream();
    await s.waitFor((f) => f.filter((x) => x.comment === 'ping').length >= 2);
    expect(s.frames.filter((f) => f.comment === 'ping').every((f) => f.id === undefined && f.event === undefined)).toBe(true);
  });

  it('stops delivering after the client disconnects without breaking emit', async () => {
    const s = await stream();
    await s.waitFor((f) => f.length >= 1);
    s.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(() => emit(3)).not.toThrow();
  });

  it('a 20 KB prompt arrives whole and a 200 KB field is truncated with its marker', async () => {
    const s = await stream();
    await s.waitFor((f) => f.length >= 1);
    const prompt = 'warm oak island '.repeat(1366).slice(0, 20 * 1024);
    t.service?.emit({ correlationId: CID, from: 'ai-adapters', to: 'llama-server', kind: 'llm', summary: 'chat', payload: { prompt, huge: 'warm oak island '.repeat(14000).slice(0, 200 * 1024) } });
    const event = events(await s.waitFor((f) => events(f).some((e) => e.summary === 'chat'))).find((e) => e.summary === 'chat')!;
    expect(event.payload.prompt).toBe(prompt);
    expect(event.payload.huge).toMatchObject({ truncated: true, expandable: true, originalBytes: 200 * 1024 });
  });

  it('a started and ended span pairs by id and carries durationMs', async () => {
    const s = await stream();
    await s.waitFor((f) => f.length >= 1);
    const span = t.service!.span({ correlationId: CID, from: 'web', to: 'api-guards', kind: 'http', summary: 'POST /x' });
    await new Promise((r) => setTimeout(r, 15));
    span.end({ ok: true, payload: { status: 201 } });
    span.end({ ok: false }); // second end is ignored
    const mine = (f: Array<{ event?: string; data?: unknown }>) => events(f).filter((e) => e.summary === 'POST /x');
    const got = mine(await s.waitFor((f) => mine(f).length >= 2));
    expect(got.map((e) => e.span?.phase)).toEqual(['start', 'end']);
    expect(got[0].span?.id).toBe(got[1].span?.id);
    expect(got[1].durationMs).toBeGreaterThanOrEqual(10);
    expect(got[1].ok).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(mine(s.frames)).toHaveLength(2);
  });
});

describe('GET /diagnostics/topology', () => {
  it('serves the topology with the boot id of the stream', async () => {
    const t = await createDiagnosticsApp({ enabled: true, adapters: 'local', env: { LLM_MODEL: 'qwen3-vl', EMBEDDING_MODEL: 'emb-x', LLAMA_MODELS_INI: '/nonexistent/x.ini' } });
    try {
      const res = await request(t.app.getHttpServer()).get('/diagnostics/topology').set(H);
      const body = res.body as DiagnosticsTopology;
      expect(res.status).toBe(200);
      expect(body.nodes).toHaveLength(23);
      expect(body.edges).toHaveLength(24);
      expect(body.bootId).toBe(t.service!.bootId);
      expect(body.nodes.find((n) => n.id === 'ai-adapters')!.models[0].name).toBe('local');
      expect(body.nodes.find((n) => n.id === 'embedder')!.models[0].name).toBe('emb-x');
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /diagnostics/ingest', () => {
  let t: DiagnosticsTestApp;
  beforeAll(async () => {
    t = await createDiagnosticsApp({ enabled: true, ingestPerSecond: 5 });
  });
  afterAll(async () => {
    await t.app.close();
  });
  const valid = (summary = 'GET /') => ({ ts: Date.now(), correlationId: CID, from: 'browser', to: 'web', kind: 'http', summary, payload: { status: 200, cookie: 'bm_session=secretvalue123' } });
  const post = (body: unknown) => request(t.app.getHttpServer()).post('/diagnostics/ingest').set(H).send(body as object);

  it('204 for a valid batch; events are re-redacted and stored in order', async () => {
    const s = await openStream(t.port, H);
    try {
      await s.waitFor((f) => f.length >= 1);
      const res = await post([valid('a'), valid('b')]);
      expect(res.status).toBe(204);
      const got = events(await s.waitFor((f) => events(f).length >= 2));
      expect(got.map((e) => e.summary)).toEqual(['a', 'b']);
      expect(got[0].payload).toEqual({ status: 200, cookie: '[redacted]' });
      expect(JSON.stringify(got)).not.toContain('secretvalue123');
    } finally {
      s.close();
    }
  });

  it('400 for invalid input: not an array, empty, over 100, unknown node, bad kind', async () => {
    await new Promise((r) => setTimeout(r, 1100)); // new rate-limit window
    for (const body of [{}, [], Array.from({ length: 101 }, () => valid()), [{ ...valid(), from: 'nope' }], [{ ...valid(), kind: 'dns' }], [valid(), 'x']]) {
      expect((await post(body)).status).toBe(400);
    }
  });

  it('413 for a body over the limit and 429 over the rate limit', async () => {
    const big = [{ ...valid(), payload: { text: 'warm oak island '.repeat(20000) } }];
    expect((await post(big)).status).toBe(413);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await post([valid(), valid(), valid(), valid(), valid()])).status).toBe(204);
    expect((await post([valid()])).status).toBe(429);
  });
});
