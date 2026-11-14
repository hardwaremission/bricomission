import { createApiClient } from '@bricomission/api-client';
import { describe, expect, it } from 'vitest';
import { createRender, loadRender, loadRenders } from '../src/lib/renders/render-client';

function fakeFetch(status: number, body: unknown = null, calls: Request[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const BASE = 'http://localhost:3100/api';
const PID = '00000000-0000-4000-8000-000000000001';
const RID = '00000000-0000-4000-8000-0000000000aa';

describe('render-client', () => {
  it('creates a Render with POST /api/kitchen-projects/:id/renders and the optional photoId', async () => {
    const calls: Request[] = [];
    const render = { id: RID, status: 'queued' };
    expect(await createRender(createApiClient(BASE, fakeFetch(202, { render }, calls)), PID, 'ph-2')).toEqual({ kind: 'ok', value: render });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/renders`);
    expect(await calls[0]?.json()).toEqual({ photoId: 'ph-2' });
    await createRender(createApiClient(BASE, fakeFetch(202, { render }, calls)), PID);
    expect(await calls[1]?.json()).toEqual({});
  });

  it('maps POST failures: 409 codes, 429 queue full, 401, 404, 502 and network offline', async () => {
    const conflict = (code: string) => createRender(createApiClient(BASE, fakeFetch(409, { statusCode: 409, code })), PID);
    expect(await conflict('render_in_progress')).toEqual({ kind: 'conflict', code: 'render_in_progress' });
    expect(await conflict('render_limit_reached')).toEqual({ kind: 'conflict', code: 'render_limit_reached' });
    expect(await conflict('weird')).toEqual({ kind: 'conflict', code: 'other' });
    expect(await createRender(createApiClient(BASE, fakeFetch(429, { code: 'gpu_queue_full' })), PID)).toEqual({ kind: 'queueFull' });
    expect(await createRender(createApiClient(BASE, fakeFetch(401)), PID)).toEqual({ kind: 'signedOut' });
    expect(await createRender(createApiClient(BASE, fakeFetch(404)), PID)).toEqual({ kind: 'notFound' });
    expect(await createRender(createApiClient(BASE, fakeFetch(403)), PID)).toEqual({ kind: 'notFound' });
    expect(await createRender(createApiClient(BASE, fakeFetch(502)), PID)).toEqual({ kind: 'offline' });
    expect(await createRender(createApiClient(BASE, fakeFetch(503)), PID)).toEqual({ kind: 'error', status: 503 });
    const throwing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await createRender(createApiClient(BASE, throwing), PID)).toEqual({ kind: 'offline' });
  });

  it('loads the list and one Render from the owner routes', async () => {
    const calls: Request[] = [];
    const list = { renders: [], maxRenders: 10 };
    expect(await loadRenders(createApiClient(BASE, fakeFetch(200, list, calls)), PID)).toEqual({ kind: 'ok', value: list });
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/renders`);
    expect(await loadRender(createApiClient(BASE, fakeFetch(200, { id: RID }, calls)), PID, RID)).toEqual({ kind: 'ok', value: { id: RID } });
    expect(calls[1]?.url).toBe(`${BASE}/kitchen-projects/${PID}/renders/${RID}`);
    expect(await loadRenders(createApiClient(BASE, fakeFetch(401)), PID)).toEqual({ kind: 'signedOut' });
    expect(await loadRender(createApiClient(BASE, fakeFetch(404)), PID, RID)).toEqual({ kind: 'notFound' });
  });
});
