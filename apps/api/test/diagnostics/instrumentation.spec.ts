import type { DiagnosticsEvent } from '@bricomission/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { FakeImageAdapter } from '../../src/ai/adapters/fake-image.adapter.js';
import { FakeLlmAdapter } from '../../src/ai/adapters/fake-llm.adapter.js';
import type { ImageAdapter, ImageRequest } from '../../src/ai/adapters/image-adapter.js';
import type { LlmAdapter } from '../../src/ai/adapters/llm-adapter.js';
import { GpuJobBrokerService } from '../../src/ai/jobs/gpu-job-broker.service.js';
import { GpuResidencyHook } from '../../src/ai/jobs/gpu-residency.hook.js';
import { NoopLlmUnloader } from '../../src/ai/jobs/llm-unloader.js';
import { runWithCorrelation } from '../../src/diagnostics/correlation.js';
import { DiagnosticsService } from '../../src/diagnostics/diagnostics.service.js';
import type { DiagnosticsOptions } from '../../src/diagnostics/diagnostics.types.js';
import { createHttpEntryMiddleware } from '../../src/diagnostics/http-entry.js';
import { InstrumentedEmbedder } from '../../src/diagnostics/instrument/embedder.js';
import { InstrumentedImageAdapter } from '../../src/diagnostics/instrument/image.js';
import { instrumentKeyResolver } from '../../src/diagnostics/instrument/keycloak.js';
import { InstrumentedLlmAdapter } from '../../src/diagnostics/instrument/llm.js';
import { describeSql, PrismaQueryReporter } from '../../src/diagnostics/instrument/prisma.js';
import { InstrumentedObjectStorage } from '../../src/diagnostics/instrument/storage.js';
import { isPollRoute, routeTemplate, subjectHash, targetForRoute } from '../../src/diagnostics/route-node-map.js';
import { makeThumb } from '../../src/diagnostics/thumbnail.js';
import { MemoryObjectStorage } from '../support/memory-object-storage.js';
import { makeImage } from '../support/images.js';
import { DEFAULT_RENDER_CONTROL } from '../../src/ai/adapters/image-adapter.js';
import { flush, testOptions } from '../gpu-test-helpers.js';

function bus(): { diag: DiagnosticsService; events: () => DiagnosticsEvent[] } {
  const options: DiagnosticsOptions = { token: 'x'.repeat(20), adapters: 'fake', bufferSize: 1000, bufferMaxBytes: 64 * 1024 * 1024, heartbeatMs: 15_000, env: {}, now: () => Date.now(), ingestPerSecond: 200 };
  const diag = new DiagnosticsService(options);
  return { diag, events: () => diag.replay(0).map((e) => e.value) };
}
const signal = new AbortController().signal;
const CID = 'a1b2c3d4e5f60718';

describe('thumbnail', () => {
  it('makes a small JPEG thumbnail that survives redaction, and nothing for non-images', async () => {
    const image = await makeImage(1200, 800, 'jpeg');
    const thumb = await makeThumb(image);
    expect(thumb).toBeDefined();
    expect(thumb?.bytes).toBeLessThanOrEqual(6 * 1024);
    expect(Math.max(thumb?.width ?? 0, thumb?.height ?? 0)).toBeLessThanOrEqual(96);
    expect(thumb?.originalBytes).toBe(image.length);
    expect(await makeThumb(Buffer.from('not an image'))).toBeUndefined();
  });
});

describe('LLM adapter instrumentation', () => {
  it('emits request span with full text and an image thumbnail, then the reply; simulated for fakes; result unchanged', async () => {
    const { diag, events } = bus();
    const inner = new FakeLlmAdapter({});
    const llm = new InstrumentedLlmAdapter(inner, diag, { simulated: true, model: 'qwen3-vl' });
    const image = await makeImage(400, 300, 'jpeg');
    const longPrompt = 'Catalog line BM-SYN-WTP-300 oak worktop 189.90 EUR. '.repeat(400);
    const req = { messages: [{ role: 'system' as const, content: longPrompt }, { role: 'user' as const, content: [{ type: 'text' as const, text: 'describe' }, { type: 'image' as const, data: image, mime: 'image/jpeg' }] }], task: 'style_traits' as const, maxTokens: 400 };
    const direct = await new FakeLlmAdapter({}).complete(req, signal);
    const result = await runWithCorrelation({ correlationId: CID }, () => llm.complete(req, signal));
    expect(result).toEqual(direct);
    const [start, end] = events();
    expect(start).toMatchObject({ from: 'ai-adapters', to: 'llama-server', kind: 'llm', simulated: true, correlationId: CID, span: { phase: 'start' } });
    const payload = start?.payload as { model: string; messages: Array<{ parts: Array<{ text?: string; type: string; thumbnail?: { dataUri: string } }> }> };
    expect(payload.model).toBe('fake:qwen3-vl');
    expect(payload.messages[0]?.parts[0]?.text).toBe(longPrompt);
    expect(payload.messages[1]?.parts[1]).toMatchObject({ type: 'image', thumbnail: { kind: 'thumbnail' } });
    expect(JSON.stringify(start)).not.toContain(image.toString('base64').slice(200, 260));
    expect(end).toMatchObject({ span: { phase: 'end' }, ok: true, simulated: true });
    expect(end?.payload).toMatchObject({ reply: result.text, promptTokens: result.promptTokens });
    expect(typeof end?.durationMs).toBe('number');
  });

  it('marks a failed call ok=false and rethrows', async () => {
    const { diag, events } = bus();
    const failing: LlmAdapter = { complete: () => Promise.reject(new TypeError('secret prompt echo')) };
    const llm = new InstrumentedLlmAdapter(failing, diag, { simulated: false, model: 'qwen3-vl' });
    await expect(llm.complete({ messages: [{ role: 'user', content: 'hi' }] }, signal)).rejects.toThrow(TypeError);
    const end = events().at(-1);
    expect(end).toMatchObject({ ok: false, summary: 'failed (TypeError)' });
    expect(JSON.stringify(end)).not.toContain('secret prompt echo');
    expect(events()[0]?.simulated).toBeUndefined();
  });
});

describe('image adapter instrumentation', () => {
  it('emits the ComfyUI request with prompts, ControlNet settings and thumbnails, never the seed or bytes', async () => {
    const { diag, events } = bus();
    const inner = new FakeImageAdapter({});
    const adapter = new InstrumentedImageAdapter(inner, diag, true);
    const photo = await makeImage(1216, 832, 'jpeg');
    const ref = await makeImage(300, 300, 'jpeg');
    const req: ImageRequest = { mode: 'canny', image: photo, width: 1216, height: 832, prompt: 'modern white kitchen, oak worktop', negativePrompt: 'clutter, people', seed: 424242, control: DEFAULT_RENDER_CONTROL, references: [{ image: ref, weight: 0.4 }, { image: ref, weight: 0.3 }] };
    const result = await adapter.render(req, signal);
    expect(result.image.length).toBeGreaterThan(0);
    const [start, end] = events();
    expect(start).toMatchObject({ from: 'ai-adapters', to: 'comfyui', kind: 'image', simulated: true });
    const p = start?.payload as Record<string, unknown>;
    expect(p.positivePrompt).toBe('modern white kitchen, oak worktop');
    expect(p.negativePrompt).toBe('clutter, people');
    expect(p.controlNet).toMatchObject({ mode: 'canny', strength: 0.8, endPercent: 0.5 });
    expect((p.references as unknown[]).length).toBe(2);
    const text = JSON.stringify(start);
    expect(text).not.toContain('424242');
    expect(text).not.toContain('"seed"');
    expect(end).toMatchObject({ ok: true, span: { phase: 'end' } });
    expect((end?.payload as { thumbnail: unknown }).thumbnail).toMatchObject({ kind: 'thumbnail' });
  });

  it('reports a failed render', async () => {
    const { diag, events } = bus();
    const failing: ImageAdapter = { render: () => Promise.reject(new Error('boom')) };
    const adapter = new InstrumentedImageAdapter(failing, diag, false);
    await expect(adapter.render({ mode: 'depth', image: await makeImage(64, 64), width: 64, height: 64, prompt: 'p', negativePrompt: 'n', seed: 1, control: DEFAULT_RENDER_CONTROL }, signal)).rejects.toThrow('boom');
    expect(events().at(-1)).toMatchObject({ ok: false, summary: 'failed (Error)' });
    expect(events()[0]?.simulated).toBeUndefined();
  });
});

describe('storage and embedder instrumentation', () => {
  it('reports put, get and deleteMany with key, bytes and ms but no body', async () => {
    const { diag, events } = bus();
    const storage = new InstrumentedObjectStorage(new MemoryObjectStorage(), diag);
    const body = Buffer.from('secret-image-bytes-0123456789');
    await storage.put('kitchen-projects/p/photos/1/full.jpg', body, 'image/jpeg');
    await storage.getStream('kitchen-projects/p/photos/1/full.jpg');
    await storage.deleteMany(['a', 'b']);
    const all = events();
    expect(all.filter((e) => e.from === 'storage-client' && e.to === 'minio' && e.span?.phase === 'start').map((e) => e.summary)).toEqual(['PUT kitchen-projects/p/photos/1/full.jpg', 'GET kitchen-projects/p/photos/1/full.jpg', 'deleteMany (2 keys)']);
    expect(all.find((e) => e.summary.startsWith('PUT'))?.payload).toMatchObject({ bytes: body.length, contentType: 'image/jpeg' });
    expect(JSON.stringify(all)).not.toContain('secret-image-bytes');
  });

  it('reports a storage failure as ok=false and rethrows', async () => {
    const { diag, events } = bus();
    const failing = new MemoryObjectStorage();
    vi.spyOn(failing, 'put').mockRejectedValue(new Error('down'));
    await expect(new InstrumentedObjectStorage(failing, diag).put('k', Buffer.from('x'), 'image/jpeg')).rejects.toThrow('down');
    expect(events().at(-1)).toMatchObject({ ok: false });
  });

  it('reports embedding queries (catalog-search > embedder, kind embed)', async () => {
    const { diag, events } = bus();
    const inner = { model: 'm', dimensions: 1024, embedDocuments: async () => [], embedQuery: async () => [1] };
    const embedder = new InstrumentedEmbedder(inner, diag);
    expect(embedder.model).toBe('m');
    await embedder.embedQuery('oak worktop 300 cm');
    const [start, end] = events();
    expect(start).toMatchObject({ from: 'catalog-search', to: 'embedder', kind: 'embed' });
    expect(start?.payload).toMatchObject({ query: 'oak worktop 300 cm', dimensions: 1024 });
    expect(end).toMatchObject({ ok: true });
  });
});

describe('Prisma query reporter', () => {
  it('parses operation and table, skips transaction noise, coalesces repeats inside the window', async () => {
    expect(describeSql('SELECT "public"."Simulation"."id" FROM "public"."Simulation" WHERE "id" = $1')).toMatchObject({ operation: 'SELECT', table: 'Simulation' });
    expect(describeSql('INSERT INTO "public"."KitchenRender" ("id") VALUES ($1)')).toMatchObject({ operation: 'INSERT', table: 'KitchenRender' });
    expect(describeSql('SELECT x FROM "CatalogChunk" ORDER BY embedding <=> $1::vector LIMIT 5')).toMatchObject({ vector: true });
    expect(describeSql('BEGIN')).toBeUndefined();
    const { diag, events } = bus();
    const reporter = new PrismaQueryReporter(diag, () => CID);
    const sql = 'SELECT * FROM "Simulation" WHERE "id" = $1';
    for (let i = 0; i < 5; i++) reporter.report({ query: sql, duration: 2 });
    reporter.report({ query: 'COMMIT', duration: 1 });
    expect(events()).toHaveLength(1);
    expect(JSON.stringify(events())).not.toContain('$1');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const all = events();
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ from: 'data-access', to: 'postgres', kind: 'sql', summary: 'SELECT "Simulation" x4 more' });
    expect(all[1]?.payload).toMatchObject({ count: 4 });
  });
});

describe('route map and HTTP entry', () => {
  it('maps routes to module nodes and normalizes ids', () => {
    const id = '0f6c6de1-50e7-4ede-95c3-278f77372e11';
    expect(routeTemplate(`/kitchen-projects/${id}/simulations/${id}`)).toBe('/kitchen-projects/:id/simulations/:id');
    expect(targetForRoute('/kitchen-projects/:id/simulations')).toBe('simulation-runner');
    expect(targetForRoute('/kitchen-projects/:id/renders/:id/content')).toBe('simulation-runner');
    expect(targetForRoute('/kitchen-projects/:id/budgets/:id')).toBe('budget-engine');
    expect(targetForRoute('/kitchen-projects/drafts/current/photos')).toBe('project-service');
    expect(targetForRoute('/catalog/search')).toBe('catalog-search');
    expect(targetForRoute('/style-gallery')).toBe('style-gallery');
    expect(targetForRoute('/health')).toBeUndefined();
    expect(targetForRoute('/diagnostics/stream')).toBeUndefined();
    expect(isPollRoute('GET', '/kitchen-projects/:id/simulations/:id')).toBe(true);
    expect(isPollRoute('POST', '/kitchen-projects/:id/simulations')).toBe(false);
    expect(subjectHash('b0e2a1c4-0000-4000-8000-000000000001')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('opens a span per product request and ends it with status and a hashed subject; skips unmapped routes', () => {
    const { diag, events } = bus();
    const middleware = createHttpEntryMiddleware(diag);
    const handlers: Record<string, () => void> = {};
    const make = (url: string, method = 'GET') => ({
      req: { method, originalUrl: url, path: url, user: { sub: 'sub-1', roles: ['user'] } } as never,
      res: { statusCode: 403, on: (name: string, fn: () => void) => (handlers[name] = fn) } as never,
    });
    const next = vi.fn();
    const a = make('/kitchen-projects/0f6c6de1-50e7-4ede-95c3-278f77372e11/budget?x=1', 'POST');
    middleware(a.req, a.res, next);
    handlers.finish?.();
    const b = make('/health');
    middleware(b.req, b.res, next);
    expect(next).toHaveBeenCalledTimes(2);
    const [start, end] = events();
    expect(events()).toHaveLength(2);
    expect(start).toMatchObject({ from: 'api-guards', to: 'budget-engine', kind: 'guard', span: { phase: 'start' } });
    expect(end).toMatchObject({ ok: false, payload: { status: 403, guard: 'denied 403', roles: ['user'], sub: subjectHash('sub-1') } });
    expect(JSON.stringify(end)).not.toContain('sub-1');
  });
});

describe('broker and residency events', () => {
  it('reports queued waiting, running span and done/failed with the submitter correlation id', async () => {
    const { diag, events } = bus();
    const options = testOptions({});
    const broker = new GpuJobBrokerService(options, new GpuResidencyHook(undefined, diag), diag);
    const release: Array<() => void> = [];
    const hold = () => new Promise<void>((resolve) => release.push(resolve));
    const a = runWithCorrelation({ correlationId: CID }, () => broker.submit('image', () => hold()));
    const b = runWithCorrelation({ correlationId: 'ffffffffffffffff' }, () => broker.submit('image', () => Promise.reject(new Error('x'))));
    b.result.catch(() => undefined);
    await flush();
    expect(events().some((e) => e.from === 'gpu-broker' && e.to === 'gpu-broker' && e.summary.includes('waiting for image') && e.correlationId === 'ffffffffffffffff')).toBe(true);
    release[0]?.();
    await a.result;
    await flush();
    await flush();
    const all = events();
    const aStart = all.find((e) => e.span?.phase === 'start' && e.correlationId === CID);
    const aEnd = all.find((e) => e.span?.phase === 'end' && e.correlationId === CID);
    expect(aStart).toMatchObject({ from: 'gpu-broker', to: 'ai-adapters', kind: 'queue' });
    expect(aEnd).toMatchObject({ ok: true });
    // job b started from a's finish() but keeps its own id
    expect(all.find((e) => e.span?.phase === 'end' && e.correlationId === 'ffffffffffffffff')).toMatchObject({ ok: false, summary: expect.stringContaining('failed') });
  });

  it('reports the unload and the cold reload of the LLM (simulated with the no-op unloader)', async () => {
    const { diag, events } = bus();
    const hook = new GpuResidencyHook(new NoopLlmUnloader(), diag);
    await hook.beforeImage();
    await hook.beforeLlm();
    await hook.beforeLlm();
    const summaries = events().map((e) => `${e.from}>${e.to} ${e.summary}`);
    expect(summaries).toEqual(
      expect.arrayContaining(['gpu-broker>residency-hook beforeImage: unload LLM', 'residency-hook>llama-server POST /models/unload', 'llama-server>llama-server LLM reload (cold), about 7 s', 'gpu-broker>residency-hook beforeLlm: nothing (ComfyUI stays warm)']),
    );
    expect(events().every((e) => e.simulated === true)).toBe(true);
  });

  it('a real unloader failure ends the span ok=false and does not throw', async () => {
    const { diag, events } = bus();
    const hook = new GpuResidencyHook({ unload: () => Promise.reject(new Error('down')) }, diag);
    await expect(hook.beforeImage()).resolves.toBeUndefined();
    expect(events().at(-1)).toMatchObject({ to: 'llama-server', ok: false });
    expect(events().at(-1)?.simulated).toBeUndefined();
  });
});

describe('key resolver instrumentation', () => {
  it('reports a JWKS fetch only on a cache miss and returns the same key', async () => {
    const { diag, events } = bus();
    let cached = false;
    const inner = Object.assign(
      async () => {
        cached = true;
        return { kty: 'RSA' } as never;
      },
      { jwks: () => (cached ? { keys: [] } : undefined) },
    );
    const resolver = instrumentKeyResolver(inner, diag);
    const header = { alg: 'RS256' } as never;
    const token = {} as never;
    await resolver(header, token);
    await resolver(header, token);
    expect(events().filter((e) => e.span?.phase === 'start')).toHaveLength(1);
    expect(events()[0]).toMatchObject({ from: 'api-guards', to: 'keycloak', kind: 'auth' });
    expect(events()[1]).toMatchObject({ ok: true });
  });
});

describe('poll flag', () => {
  it('flags every event of a polling request', () => {
    const { diag, events } = bus();
    const ctx = { correlationId: CID, poll: true };
    runWithCorrelation(ctx, () => diag.emit({ from: 'data-access', to: 'postgres', kind: 'sql', summary: 'x' }));
    diag.emit({ from: 'data-access', to: 'postgres', kind: 'sql', summary: 'y' });
    expect(events().map((e) => e.poll)).toEqual([true, undefined]);
  });
});
