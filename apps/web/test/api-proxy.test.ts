import { describe, expect, it, vi } from 'vitest';
import { createApiProxy, upstreamPath } from '../src/lib/api-proxy';

const BASE = 'http://api.internal:3000';

function setup(response: Response | Error = Response.json({ status: 'ok', database: 'up' })) {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const logError = vi.fn<(message: string) => void>();
  const proxy = createApiProxy({ baseUrl: () => BASE, fetchImpl, logError });
  return { proxy, fetchImpl, logError };
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

  it('forwards only allowlisted request headers, never cookies', async () => {
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
    expect([...sent.keys()].sort()).toEqual(['accept', 'accept-language', 'authorization', 'last-event-id']);
    expect(sent.get('cookie')).toBeNull();
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
