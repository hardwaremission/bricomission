import type { ApiClient } from '@bricomission/api-client';
import { TIMEOUT_MS } from '../kitchen-draft/draft-client';
import type { SimulationView } from './simulation-state';

/** Shared failure outcomes of the Simulation calls (owner routes; 403/404/400 look the same). */
export type SimulationCallFailure = { kind: 'signedOut' } | { kind: 'notFound' } | { kind: 'offline' } | { kind: 'error'; status: number };

export type SimulationListResult = { kind: 'ok'; value: SimulationView[] } | SimulationCallFailure;
export type SimulationResult = { kind: 'ok'; value: SimulationView } | SimulationCallFailure;
export type StartSimulationResult =
  | { kind: 'ok'; value: SimulationView }
  /** 409: `simulation_in_progress` (reload the list), `render_not_failed` (retry only), project incomplete, anything else. */
  | { kind: 'conflict'; code: 'simulation_in_progress' | 'project_incomplete' | 'render_not_failed' | 'other' }
  /** 429 gpu_queue_full: nothing was created. */
  | { kind: 'queueFull' }
  | SimulationCallFailure;

export function failure(status: number): SimulationCallFailure {
  if (status === 401) return { kind: 'signedOut' };
  if (status === 403 || status === 404 || status === 400) return { kind: 'notFound' };
  if (status === 502) return { kind: 'offline' };
  return { kind: 'error', status };
}

const CONFLICT_CODES = ['simulation_in_progress', 'project_incomplete', 'render_not_failed'] as const;

function conflict(error: unknown): StartSimulationResult {
  const code = (error as { code?: unknown } | undefined)?.code;
  return { kind: 'conflict', code: CONFLICT_CODES.find((known) => known === code) ?? 'other' };
}

/** The project's Simulations, newest first. Never throws. */
export async function loadSimulations(client: ApiClient, projectId: string): Promise<SimulationListResult> {
  try {
    const { response, data } = await client.GET('/kitchen-projects/{projectId}/simulations', {
      params: { path: { projectId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status === 200 && data ? { kind: 'ok', value: data.simulations } : failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

/** One Simulation (the 2 s poll). Never throws. */
export async function loadSimulation(client: ApiClient, projectId: string, simulationId: string): Promise<SimulationResult> {
  try {
    const { response, data } = await client.GET('/kitchen-projects/{projectId}/simulations/{simulationId}', {
      params: { path: { projectId, simulationId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status === 200 && data ? { kind: 'ok', value: data } : failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

/** Starts a Simulation (Generate / Generate again): one Render per photo, a new calculated style. */
export async function createSimulation(client: ApiClient, projectId: string): Promise<StartSimulationResult> {
  try {
    const { response, data, error } = await client.POST('/kitchen-projects/{projectId}/simulations', {
      params: { path: { projectId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 202 && data) return { kind: 'ok', value: data.simulation };
    if (response.status === 429) return { kind: 'queueFull' };
    if (response.status === 409) return conflict(error);
    return failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

/** Retries one failed Render (same style and seed); answers its Simulation, active again. */
export async function retryRender(client: ApiClient, projectId: string, renderId: string): Promise<StartSimulationResult> {
  try {
    const { response, data, error } = await client.POST('/kitchen-projects/{projectId}/renders/{renderId}/retry', {
      params: { path: { projectId, renderId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 202 && data) return { kind: 'ok', value: data.simulation };
    if (response.status === 429) return { kind: 'queueFull' };
    if (response.status === 409) return conflict(error);
    return failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

export type SelectSimulationResult =
  | { kind: 'ok'; selectedSimulationId: string | null }
  /** 409 `simulation_not_ready`: a Render failed or it is still running (reload the list). */
  | { kind: 'notReady' }
  | SimulationCallFailure;

/** Selects the Simulation a Budget is computed for; `null` clears the selection. */
export async function selectSimulation(client: ApiClient, projectId: string, simulationId: string | null): Promise<SelectSimulationResult> {
  try {
    const { response, data } = await client.PUT('/kitchen-projects/{projectId}/selected-simulation', {
      params: { path: { projectId } },
      body: { simulationId },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 200 && data) return { kind: 'ok', selectedSimulationId: data.selectedSimulationId ?? null };
    if (response.status === 409) return { kind: 'notReady' };
    return failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

export type DeleteSimulationResult =
  | { kind: 'ok' }
  /** 409 `simulation_in_progress`: it is still queued or running. */
  | { kind: 'inProgress' }
  | SimulationCallFailure;

/** Deletes a Simulation with its Renders, objects and Budget (204). */
export async function deleteSimulation(client: ApiClient, projectId: string, simulationId: string): Promise<DeleteSimulationResult> {
  try {
    const { response } = await client.DELETE('/kitchen-projects/{projectId}/simulations/{simulationId}', {
      params: { path: { projectId, simulationId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 204) return { kind: 'ok' };
    if (response.status === 409) return { kind: 'inProgress' };
    return failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}
