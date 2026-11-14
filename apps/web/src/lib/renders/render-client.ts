import type { ApiClient } from '@bricomission/api-client';
import { TIMEOUT_MS } from '../kitchen-draft/draft-client';
import type { RenderListResponse, RenderView } from './render-state';

/** Shared failure outcomes of the Render calls (owner routes; 403/404/400 look the same). */
export type RenderCallFailure = { kind: 'signedOut' } | { kind: 'notFound' } | { kind: 'offline' } | { kind: 'error'; status: number };

export type RenderListResult = { kind: 'ok'; value: RenderListResponse } | RenderCallFailure;
export type RenderResult = { kind: 'ok'; value: RenderView } | RenderCallFailure;
export type CreateRenderResult =
  | { kind: 'ok'; value: RenderView }
  /** 409 render_in_progress or render_limit_reached: reload the list. */
  | { kind: 'conflict'; code: 'render_in_progress' | 'render_limit_reached' | 'project_incomplete' | 'other' }
  /** 429 gpu_queue_full: nothing was created. */
  | { kind: 'queueFull' }
  | RenderCallFailure;

function failure(status: number): RenderCallFailure {
  if (status === 401) return { kind: 'signedOut' };
  if (status === 403 || status === 404 || status === 400) return { kind: 'notFound' };
  if (status === 502) return { kind: 'offline' };
  return { kind: 'error', status };
}

/** The project's Renders, newest first. Never throws. */
export async function loadRenders(client: ApiClient, projectId: string): Promise<RenderListResult> {
  try {
    const { response, data } = await client.GET('/kitchen-projects/{projectId}/renders', {
      params: { path: { projectId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status === 200 && data ? { kind: 'ok', value: data } : failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

/** One Render (the 2 s poll). Never throws. */
export async function loadRender(client: ApiClient, projectId: string, renderId: string): Promise<RenderResult> {
  try {
    const { response, data } = await client.GET('/kitchen-projects/{projectId}/renders/{renderId}', {
      params: { path: { projectId, renderId } },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status === 200 && data ? { kind: 'ok', value: data } : failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}

/** Starts a Render of `photoId` (default: the API's photo 1). Never throws. */
export async function createRender(client: ApiClient, projectId: string, photoId?: string): Promise<CreateRenderResult> {
  try {
    const { response, data, error } = await client.POST('/kitchen-projects/{projectId}/renders', {
      params: { path: { projectId } },
      body: photoId ? { photoId } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 202 && data) return { kind: 'ok', value: data.render };
    if (response.status === 429) return { kind: 'queueFull' };
    if (response.status === 409) {
      const code = (error as { code?: unknown } | undefined)?.code;
      return { kind: 'conflict', code: code === 'render_in_progress' || code === 'render_limit_reached' || code === 'project_incomplete' ? code : 'other' };
    }
    return failure(response.status);
  } catch {
    return { kind: 'offline' };
  }
}
