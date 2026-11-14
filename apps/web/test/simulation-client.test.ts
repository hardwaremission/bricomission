import { createApiClient } from '@bricomission/api-client';
import { describe, expect, it } from 'vitest';
import { createSimulation, deleteSimulation, loadSimulation, loadSimulations, retryRender, selectSimulation } from '../src/lib/simulations/simulation-client';

function fakeFetch(status: number, body: unknown = null, calls: Request[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const BASE = 'http://localhost:3100/api';
const PID = '00000000-0000-4000-8000-000000000001';
const SID = '00000000-0000-4000-8000-0000000000bb';
const RID = '00000000-0000-4000-8000-0000000000aa';
const throwing = (async () => {
  throw new TypeError('Failed to fetch');
}) as typeof fetch;

describe('simulation-client', () => {
  it('creates a Simulation with POST .../simulations (no body) and returns it', async () => {
    const calls: Request[] = [];
    const simulation = { id: SID, ordinal: 1 };
    expect(await createSimulation(createApiClient(BASE, fakeFetch(202, { simulation }, calls)), PID)).toEqual({ kind: 'ok', value: simulation });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/simulations`);
    expect(await calls[0]?.text()).toBe('');
  });

  it('maps the start outcomes: 409 codes, 429 queue full, 401, 403/404/400, 502, 5xx and network offline', async () => {
    const conflict = (code: string) => createSimulation(createApiClient(BASE, fakeFetch(409, { statusCode: 409, code })), PID);
    expect(await conflict('simulation_in_progress')).toEqual({ kind: 'conflict', code: 'simulation_in_progress' });
    expect(await conflict('project_incomplete')).toEqual({ kind: 'conflict', code: 'project_incomplete' });
    expect(await conflict('weird')).toEqual({ kind: 'conflict', code: 'other' });
    expect(await createSimulation(createApiClient(BASE, fakeFetch(429, { code: 'gpu_queue_full' })), PID)).toEqual({ kind: 'queueFull' });
    expect(await createSimulation(createApiClient(BASE, fakeFetch(401)), PID)).toEqual({ kind: 'signedOut' });
    for (const status of [400, 403, 404]) expect(await createSimulation(createApiClient(BASE, fakeFetch(status)), PID)).toEqual({ kind: 'notFound' });
    expect(await createSimulation(createApiClient(BASE, fakeFetch(502)), PID)).toEqual({ kind: 'offline' });
    expect(await createSimulation(createApiClient(BASE, fakeFetch(503)), PID)).toEqual({ kind: 'error', status: 503 });
    expect(await createSimulation(createApiClient(BASE, throwing), PID)).toEqual({ kind: 'offline' });
  });

  it('lists Simulations with GET .../simulations', async () => {
    const calls: Request[] = [];
    const simulations = [{ id: 'b', ordinal: 2 }, { id: 'a', ordinal: 1 }];
    expect(await loadSimulations(createApiClient(BASE, fakeFetch(200, { simulations }, calls)), PID)).toEqual({ kind: 'ok', value: simulations });
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/simulations`);
    expect(await loadSimulations(createApiClient(BASE, fakeFetch(401)), PID)).toEqual({ kind: 'signedOut' });
    expect(await loadSimulations(createApiClient(BASE, fakeFetch(404)), PID)).toEqual({ kind: 'notFound' });
    expect(await loadSimulations(createApiClient(BASE, throwing), PID)).toEqual({ kind: 'offline' });
  });

  it('reads one Simulation (the 2 s poll) on its owner route', async () => {
    const calls: Request[] = [];
    const simulation = { id: SID, ordinal: 3 };
    expect(await loadSimulation(createApiClient(BASE, fakeFetch(200, simulation, calls)), PID, SID)).toEqual({ kind: 'ok', value: simulation });
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/simulations/${SID}`);
    expect(await loadSimulation(createApiClient(BASE, fakeFetch(404)), PID, SID)).toEqual({ kind: 'notFound' });
    expect(await loadSimulation(createApiClient(BASE, throwing), PID, SID)).toEqual({ kind: 'offline' });
  });

  it('retries one failed Render with POST .../renders/:id/retry and maps its conflicts', async () => {
    const calls: Request[] = [];
    const simulation = { id: SID, ordinal: 1 };
    expect(await retryRender(createApiClient(BASE, fakeFetch(202, { simulation }, calls)), PID, RID)).toEqual({ kind: 'ok', value: simulation });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/renders/${RID}/retry`);
    const conflict = (code: string) => retryRender(createApiClient(BASE, fakeFetch(409, { statusCode: 409, code })), PID, RID);
    expect(await conflict('render_not_failed')).toEqual({ kind: 'conflict', code: 'render_not_failed' });
    expect(await conflict('simulation_in_progress')).toEqual({ kind: 'conflict', code: 'simulation_in_progress' });
    expect(await retryRender(createApiClient(BASE, fakeFetch(429, {})), PID, RID)).toEqual({ kind: 'queueFull' });
    expect(await retryRender(createApiClient(BASE, throwing), PID, RID)).toEqual({ kind: 'offline' });
  });
  it('selects with PUT .../selected-simulation (null clears) and maps 409 to notReady', async () => {
    const calls: Request[] = [];
    expect(await selectSimulation(createApiClient(BASE, fakeFetch(200, { selectedSimulationId: SID }, calls)), PID, SID)).toEqual({ kind: 'ok', selectedSimulationId: SID });
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/selected-simulation`);
    expect(await calls[0]?.json()).toEqual({ simulationId: SID });
    expect(await selectSimulation(createApiClient(BASE, fakeFetch(200, { selectedSimulationId: null }, calls)), PID, null)).toEqual({ kind: 'ok', selectedSimulationId: null });
    expect(await calls[1]?.json()).toEqual({ simulationId: null });
    expect(await selectSimulation(createApiClient(BASE, fakeFetch(409, { code: 'simulation_not_ready' })), PID, SID)).toEqual({ kind: 'notReady' });
    expect(await selectSimulation(createApiClient(BASE, fakeFetch(404)), PID, SID)).toEqual({ kind: 'notFound' });
    expect(await selectSimulation(createApiClient(BASE, fakeFetch(401)), PID, SID)).toEqual({ kind: 'signedOut' });
    expect(await selectSimulation(createApiClient(BASE, throwing), PID, SID)).toEqual({ kind: 'offline' });
  });

  it('deletes with DELETE .../simulations/:id (204) and maps 409 to inProgress', async () => {
    const calls: Request[] = [];
    expect(await deleteSimulation(createApiClient(BASE, fakeFetch(204, null, calls)), PID, SID)).toEqual({ kind: 'ok' });
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url).toBe(`${BASE}/kitchen-projects/${PID}/simulations/${SID}`);
    expect(await deleteSimulation(createApiClient(BASE, fakeFetch(409, { code: 'simulation_in_progress' })), PID, SID)).toEqual({ kind: 'inProgress' });
    expect(await deleteSimulation(createApiClient(BASE, fakeFetch(503)), PID, SID)).toEqual({ kind: 'error', status: 503 });
    expect(await deleteSimulation(createApiClient(BASE, throwing), PID, SID)).toEqual({ kind: 'offline' });
  });
});
