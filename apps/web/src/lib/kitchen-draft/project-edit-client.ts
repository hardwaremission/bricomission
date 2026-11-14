import type { ApiClient } from '@bricomission/api-client';
import { type CallResult, TIMEOUT_MS } from './draft-client';
import type { Measurements } from './measurements';
import { loadProject } from './project-client';
import type { KitchenProjectView, MoodboardItemView } from './types';
import { loadSimulations } from '../simulations/simulation-client';
import { editBlock } from '../simulations/project-simulations';

/**
 * Browser calls of the edit pages of a claimed project (simulations-ux-overhaul, phase D routes):
 * the owner mirror of the draft calls, through `@bricomission/api-client` and the same-origin
 * /api proxy. 404 (also 403 and 400) = not found, 401 = signed out, 409 = blocked while a
 * Simulation or Budget is active. Results never throw.
 */
export type EditBlockReason = 'simulation' | 'budget';
export type EditResult<T> = CallResult<T> | { kind: 'signedOut' } | { kind: 'blocked'; reason: EditBlockReason };

/** The stable pieces both edit screens read from a project or a draft. */
export type EditableProject = Pick<KitchenProjectView, 'photos' | 'moodboard' | 'measurements'>;

export const projectPhotoUploadUrl = (projectId: string) => `/api/kitchen-projects/${projectId}/photos`;
export const projectMoodboardUploadUrl = (projectId: string) => `/api/kitchen-projects/${projectId}/moodboard/uploads`;

/** Maps a status (and the 409 error code) of an owner edit route. */
export function editFailure(status: number, code?: unknown): EditResult<never> {
  if (status === 401) return { kind: 'signedOut' };
  if (status === 403 || status === 404 || status === 400) return { kind: 'missing' };
  if (status === 409) return { kind: 'blocked', reason: code === 'budget_in_progress' ? 'budget' : 'simulation' };
  if (status === 502) return { kind: 'offline' };
  return { kind: 'error', status };
}

async function editCall<T>(run: () => Promise<{ response: Response; data?: T; error?: unknown }>, okStatus: number | number[] = 200): Promise<EditResult<T>> {
  try {
    const { response, data, error } = await run();
    if ((Array.isArray(okStatus) ? okStatus : [okStatus]).includes(response.status)) return { kind: 'ok', value: data as T };
    return editFailure(response.status, (error as { code?: unknown } | undefined)?.code);
  } catch {
    return { kind: 'offline' };
  }
}

/** The project as the Capture and Moodboard screens read a draft. */
export async function loadProjectForEdit(client: ApiClient, projectId: string): Promise<EditResult<EditableProject>> {
  const result = await loadProject(client, projectId);
  if (result.kind === 'notFound') return { kind: 'missing' };
  return result;
}

/** What blocks edits right now (an active Simulation or Budget); `undefined` when it could not be read. */
export async function loadEditBlock(client: ApiClient, projectId: string): Promise<EditBlockReason | null | undefined> {
  const result = await loadSimulations(client, projectId);
  return result.kind === 'ok' ? editBlock(result.value) : undefined;
}

export function saveProjectMeasurements(client: ApiClient, projectId: string, measurements: Measurements): Promise<EditResult<EditableProject>> {
  return editCall(() =>
    client.PUT('/kitchen-projects/{projectId}/measurements', { params: { path: { projectId } }, body: measurements, signal: AbortSignal.timeout(TIMEOUT_MS) }),
  );
}

export function deleteProjectPhoto(client: ApiClient, projectId: string, photoId: string): Promise<EditResult<null>> {
  return editCall(
    async () => {
      const { response, error } = await client.DELETE('/kitchen-projects/{projectId}/photos/{photoId}', {
        params: { path: { projectId, photoId } },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { response, data: null, error };
    },
    204,
  );
}

export function addProjectGalleryItem(client: ApiClient, projectId: string, galleryImageId: string): Promise<EditResult<MoodboardItemView>> {
  return editCall(
    () =>
      client.POST('/kitchen-projects/{projectId}/moodboard/gallery-items', {
        params: { path: { projectId } },
        body: { galleryImageId },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    [200, 201],
  );
}

export function removeProjectMoodboardItem(client: ApiClient, projectId: string, itemId: string): Promise<EditResult<null>> {
  return editCall(
    async () => {
      const { response, error } = await client.DELETE('/kitchen-projects/{projectId}/moodboard/items/{itemId}', {
        params: { path: { projectId, itemId } },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { response, data: null, error };
    },
    204,
  );
}
