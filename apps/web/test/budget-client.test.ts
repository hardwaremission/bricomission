import { createApiClient } from '@bricomission/api-client';
import { describe, expect, it } from 'vitest';
import { createBudget, loadBudget, loadBudgets } from '../src/lib/budget/budget-client';

function fakeFetch(status: number, body: unknown = null, calls: Request[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const BASE = 'http://localhost:3100/api';
const PID = '00000000-0000-4000-8000-000000000001';
const BID = '00000000-0000-4000-8000-0000000000bb';

describe('budget-client', () => {
  it('creates a Budget with POST /api/kitchen-projects/:id/budget (empty body)', async () => {
    const calls: Request[] = [];
    const budget = { id: BID, status: 'queued' };
    expect(await createBudget(createApiClient(BASE, fakeFetch(202, { budget }, calls)), PID)).toEqual({ kind: 'ok', value: budget });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/budget`);
  });

  it('maps POST failures: 409 codes, 429, 503 embedding_unavailable, 401, 404, 502, 500 and offline', async () => {
    const conflict = (code: string) => createBudget(createApiClient(BASE, fakeFetch(409, { statusCode: 409, code })), PID);
    for (const code of ['budget_in_progress', 'no_simulation_selected', 'simulation_not_ready', 'project_incomplete', 'catalog_empty'] as const) expect(await conflict(code)).toEqual({ kind: 'conflict', code });
    expect(await conflict('weird')).toEqual({ kind: 'conflict', code: 'other' });
    expect(await createBudget(createApiClient(BASE, fakeFetch(429, { code: 'gpu_queue_full' })), PID)).toEqual({ kind: 'queueFull' });
    expect(await createBudget(createApiClient(BASE, fakeFetch(503, { code: 'embedding_unavailable' })), PID)).toEqual({ kind: 'searchDown' });
    expect(await createBudget(createApiClient(BASE, fakeFetch(503)), PID)).toEqual({ kind: 'error', status: 503 });
    expect(await createBudget(createApiClient(BASE, fakeFetch(401)), PID)).toEqual({ kind: 'signedOut' });
    expect(await createBudget(createApiClient(BASE, fakeFetch(404)), PID)).toEqual({ kind: 'notFound' });
    expect(await createBudget(createApiClient(BASE, fakeFetch(403)), PID)).toEqual({ kind: 'notFound' });
    expect(await createBudget(createApiClient(BASE, fakeFetch(502)), PID)).toEqual({ kind: 'offline' });
    expect(await createBudget(createApiClient(BASE, fakeFetch(500)), PID)).toEqual({ kind: 'error', status: 500 });
    const throwing = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect(await createBudget(createApiClient(BASE, throwing), PID)).toEqual({ kind: 'offline' });
  });

  it('loads the list and one Budget from the owner routes', async () => {
    const calls: Request[] = [];
    const list = { budgets: [] };
    expect(await loadBudgets(createApiClient(BASE, fakeFetch(200, list, calls)), PID)).toEqual({ kind: 'ok', value: list });
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/budgets`);
    const one = { id: BID, status: 'running' };
    expect(await loadBudget(createApiClient(BASE, fakeFetch(200, one, calls)), PID, BID)).toEqual({ kind: 'ok', value: one });
    expect(calls[1]?.url).toBe(`${BASE}/kitchen-projects/${PID}/budgets/${BID}`);
    expect(await loadBudget(createApiClient(BASE, fakeFetch(404)), PID, BID)).toEqual({ kind: 'notFound' });
    expect(await loadBudgets(createApiClient(BASE, fakeFetch(401)), PID)).toEqual({ kind: 'signedOut' });
  });
});
