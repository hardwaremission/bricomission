import type { ApiClient } from '@bricomission/api-client';
import { TIMEOUT_MS } from '../kitchen-draft/draft-client';
import type { BudgetListResponse, BudgetView } from './budget-state';

/** Shared failure outcomes of the Budget calls (owner routes; 403/404/400 look the same). */
export type BudgetCallFailure = { kind: 'signedOut' } | { kind: 'notFound' } | { kind: 'offline' } | { kind: 'error'; status: number };

export type BudgetListResult = { kind: 'ok'; value: BudgetListResponse } | BudgetCallFailure;
export type BudgetResult = { kind: 'ok'; value: BudgetView } | BudgetCallFailure;
export type CreateBudgetResult =
  | { kind: 'ok'; value: BudgetView }
  /** 409: a Budget is already active (reload the list), no Simulation is selected or it is not ready, or a rule of the page alerts. */
  | { kind: 'conflict'; code: 'budget_in_progress' | 'no_simulation_selected' | 'simulation_not_ready' | 'project_incomplete' | 'catalog_empty' | 'other' }
  /** 429 gpu_queue_full: nothing was created. */
  | { kind: 'queueFull' }
  /** 503 embedding_unavailable: the price search is down, nothing was created. */
  | { kind: 'searchDown' }
  | BudgetCallFailure;

function failure(status: number): BudgetCallFailure {
  if (status === 401) return { kind: 'signedOut' };
  if (status === 403 || status === 404 || status === 400) return { kind: 'notFound' };
  if (status === 502) return { kind: 'offline' };
  return { kind: 'error', status };
}

/** The project's Budgets, newest first. Never throws. */
export async function loadBudgets(client: ApiClient, projectId: string): Promise<BudgetListResult> {
  try {
    const { response, data } = await client.GET('/kitchen-projects/{projectId}/budgets', {
      params: { path: { projectId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status === 200 && data ? { kind: 'ok', value: data } : failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

/** One Budget (the 2 s poll). Never throws. */
export async function loadBudget(client: ApiClient, projectId: string, budgetId: string): Promise<BudgetResult> {
  try {
    const { response, data } = await client.GET('/kitchen-projects/{projectId}/budgets/{budgetId}', {
      params: { path: { projectId, budgetId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status === 200 && data ? { kind: 'ok', value: data } : failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

const CONFLICTS = ['budget_in_progress', 'no_simulation_selected', 'simulation_not_ready', 'project_incomplete', 'catalog_empty'] as const;

/** Starts a Budget. Never throws. */
export async function createBudget(client: ApiClient, projectId: string): Promise<CreateBudgetResult> {
  try {
    const { response, data, error } = await client.POST('/kitchen-projects/{projectId}/budget', {
      params: { path: { projectId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 202 && data) return { kind: 'ok', value: data.budget };
    if (response.status === 429) return { kind: 'queueFull' };
    const code = (error as { code?: unknown } | undefined)?.code;
    if (response.status === 503 && code === 'embedding_unavailable') return { kind: 'searchDown' };
    if (response.status === 409) return { kind: 'conflict', code: CONFLICTS.find((known) => known === code) ?? 'other' };
    return failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}
