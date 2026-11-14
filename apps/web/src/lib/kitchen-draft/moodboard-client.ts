import type { ApiClient } from '@bricomission/api-client';
import { call, type CallResult, TIMEOUT_MS } from './draft-client';
import type { MoodboardItemView, StyleGalleryView } from './types';

/**
 * Browser calls of the Moodboard screen (feature moodboard-selection), through
 * `@bricomission/api-client` and the same-origin /api proxy. Reference uploads use
 * `uploadPhoto` with MOODBOARD_UPLOAD_URL (XHR, for progress). Results never throw.
 */
export function loadStyleGallery(client: ApiClient): Promise<CallResult<StyleGalleryView>> {
  return call(() => client.GET('/style-gallery', { signal: AbortSignal.timeout(TIMEOUT_MS) }));
}

/** 201 added or 200 already in the Moodboard: both give the item. */
export function addGalleryItem(client: ApiClient, galleryImageId: string): Promise<CallResult<MoodboardItemView>> {
  return call(
    () =>
      client.POST('/kitchen-projects/drafts/current/moodboard/gallery-items', {
        body: { galleryImageId },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    [200, 201],
  );
}

export function removeMoodboardItem(client: ApiClient, itemId: string): Promise<CallResult<null>> {
  return call(
    async () => {
      const { response } = await client.DELETE('/kitchen-projects/drafts/current/moodboard/items/{itemId}', {
        params: { path: { itemId } },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { response, data: null };
    },
    204,
  );
}
