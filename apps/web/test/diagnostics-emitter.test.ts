import { describe, expect, it, vi } from 'vitest';
import { createApiProxy } from '../src/lib/api-proxy';
import type { AccessResult } from '../src/lib/auth/session';
import type { OidcClient } from '../src/lib/auth/oidc';
import { isValidCorrelationId, mintCorrelationId, resolveCorrelationId } from '../src/lib/diagnostics/correlation';
import { createDiagnosticsEmitter, diagnosticsFromEnv, isPollRoute, NULL_EMITTER, routeTemplate, type WebDiagnosticsEvent } from '../src/lib/diagnostics/emitter';
import { instrumentOidc } from '../src/lib/diagnostics/oidc';

const ID = '0f6c6de1-50e7-4ede-95c3-278f77372e11';
const TOKEN = 'a-diagnostics-token-123';

function collector() {
  const events: WebDiagnosticsEvent[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    events.push(...(JSON.parse(String((init as RequestInit).body)) as WebDiagnosticsEvent[]));
    return new Response(null, { status: 204 });
  });
  const emitter = createDiagnosticsEmitter({ url: 'http://api/diagnostics/ingest', token: TOKEN, fetchImpl });
  return { events, fetchImpl, emitter };
}

describe('correlation ids', () => {
  it('mints 16 lowercase hex characters, keeps a valid sent id and replaces anything else', () => {
    expect(mintCorrelationId()).toMatch(/^[0-9a-f]{16}$/);
    expect(resolveCorrelationId('0123456789abcdef')).toBe('0123456789abcdef');
    for (const bad of ['', 'system', '0123456789ABCDEF', '0123456789abcde', 'g123456789abcdef', null, undefined]) {
      expect(isValidCorrelationId(resolveCorrelationId(bad as string | null))).toBe(true);
      expect(resolveCorrelationId(bad as string | null)).not.toBe(bad);
    }
  });
});

describe('emitter', () => {
  it('is the shared null emitter unless enabled with a token of 16+ characters and an ingest URL', () => {
    expect(diagnosticsFromEnv({})).toBe(NULL_EMITTER);
    expect(diagnosticsFromEnv({ DIAGNOSTICS_ENABLED: 'true', DIAGNOSTICS_TOKEN: 'short', DIAGNOSTICS_INGEST_URL: 'http://x' })).toBe(NULL_EMITTER);
    expect(diagnosticsFromEnv({ DIAGNOSTICS_ENABLED: 'true', DIAGNOSTICS_TOKEN: TOKEN })).toBe(NULL_EMITTER);
    expect(diagnosticsFromEnv({ DIAGNOSTICS_ENABLED: 'true', DIAGNOSTICS_TOKEN: TOKEN, DIAGNOSTICS_INGEST_URL: 'http://x' }).enabled).toBe(true);
    expect(NULL_EMITTER.enabled).toBe(false);
    expect(NULL_EMITTER.span({ correlationId: 'x', from: 'web', to: 'web', kind: 'http', summary: 's', payload: {} })).toBeTypeOf('function');
  });

  it('batches events, sends the token header and pairs span start and end', async () => {
    const { events, fetchImpl, emitter } = collector();
    const end = emitter.span({ correlationId: '0123456789abcdef', from: 'browser', to: 'web', kind: 'http', summary: 'GET /x', payload: { method: 'GET' } });
    end({ payload: { status: 200 }, ok: true });
    await emitter.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-diagnostics-token']).toBe(TOKEN);
    expect(events.map((e) => e.span?.phase)).toEqual(['start', 'end']);
    expect(events[0]?.span?.id).toBe(events[1]?.span?.id);
    expect(events[1]).toMatchObject({ ok: true, durationMs: expect.any(Number), from: 'browser', to: 'web' });
  });

  it('drops and counts on failure and never throws or blocks', async () => {
    const emitter = createDiagnosticsEmitter({ url: 'http://api/x', token: TOKEN, fetchImpl: async () => Promise.reject(new Error('down')) });
    emitter.emit({ correlationId: '0123456789abcdef', from: 'web', to: 'web', kind: 'http', summary: 's', payload: {} });
    await expect(emitter.flush()).resolves.toBeUndefined();
    expect(emitter.dropped).toBe(1);
    const rejected = createDiagnosticsEmitter({ url: 'http://api/x', token: TOKEN, fetchImpl: async () => new Response(null, { status: 429 }) });
    rejected.emit({ correlationId: '0123456789abcdef', from: 'web', to: 'web', kind: 'http', summary: 's', payload: {} });
    await rejected.flush();
    expect(rejected.dropped).toBe(1);
  });

  it('caps the queue', () => {
    const emitter = createDiagnosticsEmitter({ url: 'http://api/x', token: TOKEN, fetchImpl: async () => new Response(null, { status: 204 }), maxQueue: 3, batchSize: 1000, flushMs: 60_000 });
    for (let i = 0; i < 5; i++) emitter.emit({ correlationId: '0123456789abcdef', from: 'web', to: 'web', kind: 'http', summary: `s${i}`, payload: {} });
    expect(emitter.dropped).toBe(2);
  });

  it('templates routes and flags status polling', () => {
    expect(routeTemplate(`/api/kitchen-projects/${ID}/budgets/${ID}`)).toBe('/api/kitchen-projects/:id/budgets/:id');
    expect(isPollRoute('GET', '/api/kitchen-projects/:id/simulations/:id')).toBe(true);
    expect(isPollRoute('GET', '/api/health')).toBe(true);
    expect(isPollRoute('POST', '/api/kitchen-projects/:id/simulations')).toBe(false);
  });
});

function proxySetup(access: AccessResult, diagnostics = collector()) {
  const upstream = vi.fn<typeof fetch>(async () => Response.json({ ok: true }, { status: 202 }));
  const proxy = createApiProxy({ baseUrl: () => 'http://api.internal:3000', fetchImpl: upstream, resolveAccessToken: async () => access, logError: () => undefined, diagnostics: diagnostics.emitter });
  return { proxy, upstream, ...diagnostics };
}

describe('api proxy diagnostics', () => {
  const SECRET_TOKEN = 'secret-access-token-value';
  const request = (headers: Record<string, string> = {}) =>
    new Request(`http://localhost:3100/api/kitchen-projects/${ID}/simulations?apikey=hidden`, { method: 'POST', headers: { host: 'localhost:3100', origin: 'http://localhost:3100', cookie: 'bm_session=opaque-session; bm_draft=draft-secret', 'accept-language': 'es-ES,es', ...headers } });

  it('mints a correlation id, forwards it upstream and reports browser>web and web>api-guards spans', async () => {
    const { proxy, upstream, events, emitter } = proxySetup({ kind: 'token', token: SECRET_TOKEN } as AccessResult);
    const res = await proxy(request());
    expect(res.status).toBe(202);
    await emitter.flush();
    const forwarded = new Headers((upstream.mock.calls[0]?.[1] as RequestInit).headers).get('x-correlation-id') as string;
    expect(forwarded).toMatch(/^[0-9a-f]{16}$/);
    const hops = events.map((e) => `${e.from}>${e.to}:${e.span?.phase ?? '-'}`);
    expect(hops).toEqual(expect.arrayContaining(['browser>web:start', 'web>api-guards:start', 'web>api-guards:end', 'browser>web:end', 'web>postgres:-']));
    expect(new Set(events.map((e) => e.correlationId))).toEqual(new Set([forwarded]));
    const apiHop = events.find((e) => e.from === 'web' && e.to === 'api-guards' && e.span?.phase === 'end');
    expect(apiHop?.payload).toMatchObject({ method: 'POST', route: '/api/kitchen-projects/:id/simulations', status: 202, hasSession: true, hasDraftToken: true });
    expect(events.find((e) => e.from === 'browser' && e.span?.phase === 'end')?.payload).toMatchObject({ locale: 'es-ES', status: 202 });
    const json = JSON.stringify(events);
    for (const secret of [SECRET_TOKEN, 'opaque-session', 'draft-secret', 'hidden', ID]) expect(json).not.toContain(secret);
  });

  it('keeps a valid browser-sent correlation id and replaces an invalid one', async () => {
    const a = proxySetup({ kind: 'anonymous', clearCookie: false });
    await a.proxy(request({ 'x-correlation-id': 'abcdef0123456789' }));
    expect(new Headers((a.upstream.mock.calls[0]?.[1] as RequestInit).headers).get('x-correlation-id')).toBe('abcdef0123456789');
    const b = proxySetup({ kind: 'anonymous', clearCookie: false });
    await b.proxy(request({ 'x-correlation-id': 'not-valid' }));
    expect(new Headers((b.upstream.mock.calls[0]?.[1] as RequestInit).headers).get('x-correlation-id')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ends the spans with ok=false when the upstream is unreachable or the session store is down', async () => {
    const c = collector();
    const proxy = createApiProxy({ baseUrl: () => 'http://api', fetchImpl: async () => Promise.reject(new TypeError('x')), logError: () => undefined, diagnostics: c.emitter });
    expect((await proxy(new Request('http://localhost:3100/api/health'))).status).toBe(502);
    await c.emitter.flush();
    expect(c.events.filter((e) => e.span?.phase === 'end').map((e) => [e.from, e.ok, e.poll])).toEqual([['web', false, true], ['browser', false, true]]);
  });

  it('with diagnostics off nothing is forwarded or emitted and responses are identical', async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({ ok: true }, { status: 202 }));
    const off = createApiProxy({ baseUrl: () => 'http://api', fetchImpl: upstream, logError: () => undefined });
    const res = await off(new Request('http://localhost:3100/api/health', { headers: { 'x-correlation-id': 'abcdef0123456789' } }));
    expect(res.status).toBe(202);
    expect(new Headers((upstream.mock.calls[0]?.[1] as RequestInit).headers).has('x-correlation-id')).toBe(false);
  });
});

describe('oidc instrumentation', () => {
  const inner: OidcClient = {
    authorizationUrl: () => 'http://kc/auth',
    exchangeCode: async () => ({ sub: 's', username: 'u', displayName: 'U', accessToken: 'AT-secret', accessExpiresAt: new Date(), refreshToken: 'RT-secret', refreshExpiresAt: new Date() }),
    refresh: async () => Promise.reject(new Error('invalid_grant')),
    logout: async () => undefined,
  };

  it('reports code exchange, refresh and logout without tokens, with correlation id system', async () => {
    const c = collector();
    const client = instrumentOidc(inner, c.emitter);
    await client.exchangeCode(new URLSearchParams('code=abc&state=xyz'), { state: 'xyz', nonce: 'n', codeVerifier: 'v' });
    await expect(client.refresh('RT-secret')).rejects.toThrow('invalid_grant');
    await client.logout('RT-secret');
    await c.emitter.flush();
    const ends = c.events.filter((e) => e.span?.phase === 'end');
    expect(ends.map((e) => [e.summary.split(':')[0], e.ok])).toEqual([['code exchange', true], ['refresh token', false], ['logout backchannel', true]]);
    expect(c.events.every((e) => e.from === 'web' && e.to === 'keycloak' && e.kind === 'auth' && e.correlationId === 'system')).toBe(true);
    const json = JSON.stringify(c.events);
    for (const secret of ['AT-secret', 'RT-secret', 'abc', 'xyz']) expect(json).not.toContain(secret);
  });

  it('returns the client itself when diagnostics are off', () => {
    expect(instrumentOidc(inner, NULL_EMITTER)).toBe(inner);
  });
});
