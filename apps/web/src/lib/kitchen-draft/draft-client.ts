import type { ApiClient } from '@bricomission/api-client';
import type { Measurements } from './measurements';
import type { KitchenDraftView } from './types';

/**
 * Browser calls of the Capture screen. JSON calls go through `@bricomission/api-client` and
 * the same-origin /api proxy (which turns the HttpOnly `bm_draft` cookie into X-Draft-Token).
 * Starting a draft uses the web BFF route. Results never throw.
 */
export type CallResult<T> =
  | { kind: 'ok'; value: T }
  /** 404: no live draft for this browser. */
  | { kind: 'missing' }
  /** Network error or proxy 502: offline or the API is unreachable. */
  | { kind: 'offline' }
  | { kind: 'error'; status: number };

export const START_DRAFT_URL = '/api/kitchen-projects/drafts';
export const TIMEOUT_MS = 10_000;

function failure(status: number): CallResult<never> {
  if (status === 404) return { kind: 'missing' };
  if (status === 502) return { kind: 'offline' };
  return { kind: 'error', status };
}

export async function call<T>(run: () => Promise<{ response: Response; data?: T }>, okStatus: number | number[] = 200): Promise<CallResult<T>> {
  try {
    const { response, data } = await run();
    if ((Array.isArray(okStatus) ? okStatus : [okStatus]).includes(response.status)) return { kind: 'ok', value: data as T };
    return failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

export function loadDraft(client: ApiClient): Promise<CallResult<KitchenDraftView>> {
  return call(() => client.GET('/kitchen-projects/drafts/current', { signal: AbortSignal.timeout(TIMEOUT_MS) }));
}

export function saveMeasurements(client: ApiClient, measurements: Measurements): Promise<CallResult<KitchenDraftView>> {
  return call(() => client.PUT('/kitchen-projects/drafts/current/measurements', { body: measurements, signal: AbortSignal.timeout(TIMEOUT_MS) }));
}

export function deletePhoto(client: ApiClient, photoId: string): Promise<CallResult<null>> {
  return call(
    async () => {
      const { response } = await client.DELETE('/kitchen-projects/drafts/current/photos/{photoId}', {
        params: { path: { photoId } },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { response, data: null };
    },
    204,
  );
}

/** Starts (or resumes) the browser's draft through the BFF route (201 created, 200 resumed). */
export async function startDraft(fetchImpl: typeof fetch = fetch): Promise<CallResult<KitchenDraftView>> {
  try {
    const response = await fetchImpl(START_DRAFT_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 200 || response.status === 201) {
      const body = (await response.json()) as { draft: KitchenDraftView };
      return { kind: 'ok', value: body.draft };
    }
    return failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}
