import type { MoodboardItemView } from '@bricomission/shared-types';
import { galleryImageUrls, type StyleGalleryImage } from '../../style-gallery/style-gallery.service.js';
import type { MoodboardItemRecord } from '../kitchen-drafts.repository.js';

/** Moodboard rules (feature moodboard-selection, spec Decision 4). */
export const MOODBOARD_LIMITS = {
  /** Moodboard Items per draft, uploads and gallery picks together. */
  maxItems: 12,
} as const;

const ITEMS_PATH = '/kitchen-projects/drafts/current/moodboard/items';

/** Resolves a Style Gallery image id (the moodboard view needs its style). */
export interface GalleryLookup {
  find(id: string): StyleGalleryImage | null;
}

export function moodboardKeys(projectId: string, itemId: string): { fullKey: string; thumbKey: string } {
  const base = `kitchen-projects/${projectId}/moodboard/${itemId}`;
  return { fullKey: `${base}/full.jpg`, thumbKey: `${base}/thumb.jpg` };
}

/** Gallery items point at the public gallery content route; uploads at the draft item content route. */
export function moodboardItemView(item: MoodboardItemRecord, gallery: GalleryLookup): MoodboardItemView {
  const base = { id: item.id, position: item.position, width: item.width, height: item.height };
  if (item.source === 'gallery' && item.galleryImageId !== null) {
    return {
      ...base,
      source: 'gallery',
      galleryImageId: item.galleryImageId,
      // A committed id is never removed, so the lookup only misses with a broken asset set.
      styleId: gallery.find(item.galleryImageId)?.styleId ?? null,
      ...galleryImageUrls(item.galleryImageId),
    };
  }
  return {
    ...base,
    source: 'upload',
    galleryImageId: null,
    styleId: null,
    thumbUrl: `${ITEMS_PATH}/${item.id}/content?variant=thumb`,
    fullUrl: `${ITEMS_PATH}/${item.id}/content?variant=full`,
  };
}
