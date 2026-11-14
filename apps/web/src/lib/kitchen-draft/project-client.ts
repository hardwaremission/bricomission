import type { ApiClient } from '@bricomission/api-client';
import { type CallResult, TIMEOUT_MS } from './draft-client';
import { type ClaimOutcome, claimOutcome } from './generate-state';
import type { KitchenProjectView } from './types';

export const CLAIM_DRAFT_URL = '/api/kitchen-projects/drafts/current/claim';

/** Claims the browser's draft for the signed-in Account through the BFF route. Never throws. */
export async function claimDraft(fetchImpl: typeof fetch = fetch): Promise<ClaimOutcome> {
  try {
    const response = await fetchImpl(CLAIM_DRAFT_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status !== 200) return claimOutcome(response.status);
    const body = (await response.json().catch(() => null)) as { project?: { id?: unknown } } | null;
    return claimOutcome(200, body?.project?.id);
  } catch {
    return typeof navigator !== 'undefined' && navigator.onLine === false ? { kind: 'offline' } : { kind: 'failed' };
  }
}

/** Result of loading an owned project: 401 = signed out; 403/404 = not found (never probe-able). */
export type ProjectLoad = CallResult<KitchenProjectView> | { kind: 'signedOut' } | { kind: 'notFound' };

export async function loadProject(client: ApiClient, projectId: string): Promise<ProjectLoad> {
  try {
    const { response, data } = await client.GET('/kitchen-projects/{projectId}', {
      params: { path: { projectId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 200 && data) return { kind: 'ok', value: data };
    if (response.status === 401) return { kind: 'signedOut' };
    if (response.status === 403 || response.status === 404 || response.status === 400) return { kind: 'notFound' };
    if (response.status === 502) return { kind: 'offline' };
    return { kind: 'error', status: response.status };
  } catch {
    return { kind: 'offline' };
  }
}
