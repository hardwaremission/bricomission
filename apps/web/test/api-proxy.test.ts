import { describe, expect, it, vi } from 'vitest';
import { createApiProxy, upstreamPath } from '../src/lib/api-proxy';
import type { AccessResult } from '../src/lib/auth/session';

const BASE = 'http://api.internal:3000';

function setup(response: Response | Error = Response.json({ status: 'ok', database: 'up' }), access: AccessResult = { kind: 'anonymous', clearCookie: false }) {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const logError = vi.fn<(message: string) => void>();
  const resolveAccessToken = vi.fn<(cookie: string | null) => Promise<AccessResult>>(async () => access);
  const proxy = createApiProxy({ baseUrl: () => BASE, fetchImpl, logError, resolveAccessToken, clearSessionCookie: () => 'bm_session=; Max-Age=0' });
  return { proxy, fetchImpl, logError, resolveAccessToken };
}

describe('upstreamPath', () => {
  it.each([
    ['/api/health', '/health'],
    ['/api/ai/jobs/abc/events', '/ai/jobs/abc/events'],
    ['/api/catalog/search', '/catalog/search'],
    ['/api/a%20b', '/a%20b'],
  ])('%s -> %s', (input, output) => {
    expect(upstreamPath(input)).toBe(output);
  });

  it.each(['/api/..%2Fadmin', '/api/%2e%2e/admin', '/api/./health', '/api/a/../b', '/api/a%2Fb', '/api/a%5Cb', '/api/%E0%A4%A', '/api/', '/other'])(
    '%s is rejected',
    (input) => {
      expect(upstreamPath(input)).toBeNull();
    },
  );
});

describe('createApiProxy', () => {
  it('forwards GET /api/health with the query to the fixed base', async () => {
    const { proxy, fetchImpl } = setup();
    const res = await proxy(new Request('http://localhost:3100/api/health?x=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', database: 'up' });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE}/health?x=1`);
  });

  it('forwards only allowlisted request headers, never cookies or the client Authorization', async () => {
    const { proxy, fetchImpl } = setup();
    await proxy(
      new Request('http://localhost:3100/api/me', {
        headers: {
          accept: 'application/json',
          'accept-language': 'de',
          authorization: 'Bearer t',
          'last-event-id': '3',
          cookie: 'NEXT_LOCALE=de; session=secret',
          'x-forwarded-for': '1.2.3.4',
          host: 'evil.example',
        },
      }),
    );
    const sent = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect([...sent.keys()].sort()).toEqual(['accept', 'accept-language', 'last-event-id']);
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('authorization')).toBeNull();
  });

  it('attaches the session access token instead of the browser header', async () => {
    const { proxy, fetchImpl, resolveAccessToken } = setup(undefined, { kind: 'token', token: 'session-token' });
    await proxy(new Request('http://localhost:3100/api/me', { headers: { authorization: 'Bearer forged', cookie: 'bm_session=abc' } }));
    expect(resolveAccessToken).toHaveBeenCalledWith('bm_session=abc');
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer session-token');
  });

  it('answers 503 when the session cannot be resolved (Keycloak or database down)', async () => {
    const { proxy, fetchImpl } = setup(undefined, { kind: 'unavailable' });
    const res = await proxy(new Request('http://localhost:3100/api/me', { headers: { cookie: 'bm_session=abc' } }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forwards anonymously and clears the cookie after invalid_grant or a stale session', async () => {
    const { proxy, fetchImpl } = setup(new Response('{}', { status: 401 }), { kind: 'anonymous', clearCookie: true });
    const res = await proxy(new Request('http://localhost:3100/api/me', { headers: { cookie: 'bm_session=abc' } }));
    expect(res.status).toBe(401);
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('authorization')).toBeNull();
    expect(res.headers.get('set-cookie')).toBe('bm_session=; Max-Age=0');
  });

  describe('CSRF: unsafe methods with a session cookie need a same-origin Origin', () => {
    const host = { host: 'localhost:3100', cookie: 'bm_session=abc' };
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s with a missing or foreign Origin -> 403 before any lookup', async (method) => {
      for (const headers of [host, { ...host, origin: 'http://evil.example' }, { ...host, origin: 'null' }]) {
        const { proxy, fetchImpl, resolveAccessToken } = setup();
        const res = await proxy(new Request('http://localhost:3100/api/ai/jobs', { method, headers, body: '{}' }));
        expect(res.status).toBe(403);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(resolveAccessToken).not.toHaveBeenCalled();
      }
    });

    it('same-origin POST passes; GET and cookie-less POST are not checked', async () => {
      for (const [method, headers] of [
        ['POST', { ...host, origin: 'http://localhost:3100' }],
        ['GET', host],
        ['POST', { host: 'localhost:3100' }],
      ] as const) {
        const { proxy, fetchImpl } = setup();
        const res = await proxy(new Request('http://localhost:3100/api/ai/jobs', { method, headers, body: method === 'GET' ? undefined : '{}' }));
        expect(res.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('anonymous kitchen draft cookie (kitchen-capture-draft)', () => {
    const TOKEN = 'A'.repeat(43);

    it('sends bm_draft upstream as X-Draft-Token and never forwards cookies', async () => {
      const { proxy, fetchImpl } = setup();
      await proxy(new Request('http://localhost:3100/api/kitchen-projects/drafts/current', { headers: { cookie: `NEXT_LOCALE=es; bm_draft=${TOKEN}` } }));
      const sent = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
      expect(sent.get('x-draft-token')).toBe(TOKEN);
      expect(sent.get('cookie')).toBeNull();
    });

    it('drops a client-sent X-Draft-Token', async () => {
      const { proxy, fetchImpl } = setup();
      await proxy(new Request('http://localhost:3100/api/kitchen-projects/drafts/current', { headers: { 'x-draft-token': TOKEN } }));
      expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('x-draft-token')).toBeNull();
    });

    it('the cookie wins over a forged header', async () => {
      const { proxy, fetchImpl } = setup();
      await proxy(new Request('http://localhost:3100/api/kitchen-projects/drafts/current', { headers: { 'x-draft-token': 'B'.repeat(43), cookie: `bm_draft=${TOKEN}` } }));
      expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('x-draft-token')).toBe(TOKEN);
    });

    it.each(['POST', 'PUT', 'DELETE'])('%s with bm_draft needs a same-origin Origin (403 before upstream)', async (method) => {
      const { proxy, fetchImpl } = setup();
      for (const origin of [undefined, 'http://evil.example', 'null']) {
        const headers: Record<string, string> = { host: 'localhost:3100', cookie: `bm_draft=${TOKEN}` };
        if (origin) headers.origin = origin;
        const res = await proxy(new Request('http://localhost:3100/api/kitchen-projects/drafts/current/measurements', { method, headers }));
        expect(res.status).toBe(403);
      }
      expect(fetchImpl).not.toHaveBeenCalled();
      const ok = await proxy(
        new Request('http://localhost:3100/api/kitchen-projects/drafts/current/measurements', {
          method,
          headers: { host: 'localhost:3100', origin: 'http://localhost:3100', cookie: `bm_draft=${TOKEN}` },
        }),
      );
      expect(ok.status).toBe(200);
    });

    it('GET with bm_draft needs no Origin', async () => {
      const { proxy } = setup();
      const res = await proxy(new Request('http://localhost:3100/api/kitchen-projects/drafts/current', { headers: { host: 'localhost:3100', cookie: `bm_draft=${TOKEN}` } }));
      expect(res.status).toBe(200);
    });
  });

  it('streams a POST body with method and content-type', async () => {
    const { proxy, fetchImpl } = setup(Response.json({ id: 1 }, { status: 202 }));
    const res = await proxy(
      new Request('http://localhost:3100/api/ai/jobs', { method: 'POST', body: '{"kind":"llm"}', headers: { 'content-type': 'application/json' } }),
    );
    expect(res.status).toBe(202);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit & { duplex?: string };
    expect(init.method).toBe('POST');
    expect(init.duplex).toBe('half');
    expect(await new Response(init.body).text()).toBe('{"kind":"llm"}');
  });

  it('rejects path traversal with 400 and never calls upstream', async () => {
    const { proxy, fetchImpl } = setup();
    const res = await proxy(new Request('http://localhost:3100/api/..%2Fadmin'));
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes 503 through with its body and content-type', async () => {
    const { proxy } = setup(Response.json({ status: 'error', database: 'down' }, { status: 503 }));
    const res = await proxy(new Request('http://localhost:3100/api/health'));
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ status: 'error', database: 'down' });
  });

  it('returns only allowlisted response headers, default cache-control no-store', async () => {
    const upstream = new Response('x', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer realm="BricoMission"', 'set-cookie': 'a=b', 'x-powered-by': 'Express', 'content-type': 'text/plain' },
    });
    const { proxy } = setup(upstream);
    const res = await proxy(new Request('http://localhost:3100/api/me'));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer realm="BricoMission"');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 502 {"status":"error"} when upstream is unreachable and logs the class name only', async () => {
    const { proxy, logError } = setup(new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.5:3000'));
    const res = await proxy(new Request('http://localhost:3100/api/health'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ status: 'error' });
    expect(logError).toHaveBeenCalledWith('api proxy: upstream unreachable (TypeError)');
  });
});
