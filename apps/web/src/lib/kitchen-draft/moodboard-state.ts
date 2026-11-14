import type { SaveStatus, UploadTile } from './capture-state';
import type { KitchenDraftView, MoodboardItemView, StyleGalleryStyleView } from './types';
import type { UploadErrorCode } from './upload';

/**
 * Pure state of the Moodboard screen (feature moodboard-selection): the draft's Moodboard
 * Items, gallery picks in flight, reference upload tiles, the Style Gallery and its filter,
 * connectivity, and the derived limit and Continue rules. MoodboardScreen owns the effects.
 */
export const MAX_MOODBOARD_ITEMS = 12;

export type GalleryFilter = 'all' | string;

export interface MoodboardState {
  /** `loading` until the first draft lookup answers (or fails). */
  phase: 'loading' | 'ready';
  online: boolean;
  hasDraft: boolean;
  /** Server items ordered by position. */
  items: MoodboardItemView[];
  /** Gallery image ids with an add in flight (shown as selected). */
  pendingPicks: string[];
  /** Item ids with a delete in flight. */
  removing: string[];
  uploads: UploadTile[];
  /** At least 1 photo and all three measurements on the draft. */
  captureComplete: boolean;
  maxItems: number;
  gallery: { status: 'loading' | 'ready' | 'error'; styles: StyleGalleryStyleView[] };
  filter: GalleryFilter;
  save: SaveStatus;
  expiredNotice: boolean;
}

export const INITIAL_MOODBOARD_STATE: MoodboardState = {
  phase: 'loading',
  online: true,
  hasDraft: false,
  items: [],
  pendingPicks: [],
  removing: [],
  uploads: [],
  captureComplete: false,
  maxItems: MAX_MOODBOARD_ITEMS,
  gallery: { status: 'loading', styles: [] },
  filter: 'all',
  save: 'idle',
  expiredNotice: false,
};

export type MoodboardAction =
  | { type: 'draftLoaded'; draft: KitchenDraftView }
  | { type: 'draftMissing'; expired: boolean }
  | { type: 'draftStarted'; draft: KitchenDraftView }
  | { type: 'draftLost' }
  | { type: 'connectivity'; online: boolean }
  | { type: 'galleryLoaded'; styles: StyleGalleryStyleView[] }
  | { type: 'galleryFailed' }
  | { type: 'filterChanged'; filter: GalleryFilter }
  | { type: 'pickStarted'; galleryImageId: string }
  | { type: 'pickSucceeded'; galleryImageId: string; item: MoodboardItemView }
  | { type: 'pickFailed'; galleryImageId: string; offline: boolean }
  | { type: 'itemRemoving'; itemId: string }
  | { type: 'itemRemoved'; itemId: string }
  | { type: 'itemRemoveFailed'; itemId: string; offline: boolean }
  | { type: 'uploadsQueued'; localIds: string[] }
  | { type: 'uploadsRejected'; tiles: Array<{ localId: string; error: UploadErrorCode }> }
  | { type: 'uploadStarted'; localId: string }
  | { type: 'uploadProgress'; localId: string; progress: number }
  | { type: 'uploadProcessing'; localId: string }
  | { type: 'uploadSucceeded'; localId: string; item: MoodboardItemView }
  | { type: 'uploadFailed'; localId: string; error: UploadErrorCode }
  | { type: 'uploadRetried'; localId: string }
  | { type: 'tileRemoved'; localId: string }
  | { type: 'dismissExpired' };

/** Capture is complete when the draft has a photo and all three measurements. */
export function isCaptureComplete(draft: KitchenDraftView): boolean {
  const { lengthCm, widthCm, heightCm } = draft.measurements;
  return draft.photos.length >= 1 && [lengthCm, widthCm, heightCm].every((value) => value !== null && value !== undefined);
}

function sortedItems(items: MoodboardItemView[]): MoodboardItemView[] {
  return [...items].sort((a, b) => a.position - b.position);
}

function withItem(items: MoodboardItemView[], item: MoodboardItemView): MoodboardItemView[] {
  return sortedItems([...items.filter((candidate) => candidate.id !== item.id), item]);
}

function updateTile(state: MoodboardState, localId: string, patch: Partial<UploadTile>): MoodboardState {
  return { ...state, uploads: state.uploads.map((tile) => (tile.localId === localId ? { ...tile, ...patch } : tile)) };
}

function fromDraft(state: MoodboardState, draft: KitchenDraftView): MoodboardState {
  return {
    ...state,
    hasDraft: true,
    items: sortedItems(draft.moodboard),
    captureComplete: isCaptureComplete(draft),
    maxItems: draft.limits.maxMoodboardItems,
  };
}

export function moodboardReducer(state: MoodboardState, action: MoodboardAction): MoodboardState {
  switch (action.type) {
    case 'draftLoaded': {
      const next = fromDraft(state, action.draft);
      return { ...next, phase: 'ready', expiredNotice: false, save: next.items.length > 0 ? 'saved' : 'idle' };
    }
    case 'draftMissing':
      return {
        ...state,
        phase: 'ready',
        hasDraft: false,
        items: [],
        captureComplete: false,
        save: 'idle',
        expiredNotice: action.expired,
      };
    case 'draftStarted':
      return { ...fromDraft(state, action.draft), expiredNotice: false };
    case 'draftLost':
      return { ...state, hasDraft: false };
    case 'connectivity':
      return { ...state, online: action.online };
    case 'galleryLoaded':
      return { ...state, gallery: { status: 'ready', styles: action.styles } };
    case 'galleryFailed':
      return { ...state, gallery: { status: state.gallery.styles.length > 0 ? 'ready' : 'error', styles: state.gallery.styles } };
    case 'filterChanged':
      return { ...state, filter: action.filter };
    case 'pickStarted':
      return { ...state, expiredNotice: false, save: 'saving', pendingPicks: [...state.pendingPicks, action.galleryImageId] };
    case 'pickSucceeded':
      return {
        ...state,
        save: 'saved',
        pendingPicks: state.pendingPicks.filter((id) => id !== action.galleryImageId),
        items: withItem(state.items, action.item),
      };
    case 'pickFailed':
      return {
        ...state,
        save: action.offline ? 'offline' : 'failed',
        pendingPicks: state.pendingPicks.filter((id) => id !== action.galleryImageId),
      };
    case 'itemRemoving':
      return { ...state, save: 'saving', removing: [...state.removing, action.itemId] };
    case 'itemRemoved':
      return {
        ...state,
        save: 'saved',
        removing: state.removing.filter((id) => id !== action.itemId),
        items: state.items.filter((item) => item.id !== action.itemId).map((item, index) => ({ ...item, position: index })),
      };
    case 'itemRemoveFailed':
      return { ...state, save: action.offline ? 'offline' : 'failed', removing: state.removing.filter((id) => id !== action.itemId) };
    case 'uploadsQueued':
      return {
        ...state,
        expiredNotice: false,
        uploads: [...state.uploads, ...action.localIds.map((localId) => ({ localId, status: 'queued' as const, progress: 0, error: null }))],
      };
    case 'uploadsRejected':
      return {
        ...state,
        uploads: [...state.uploads, ...action.tiles.map(({ localId, error }) => ({ localId, status: 'error' as const, progress: 0, error }))],
      };
    case 'uploadStarted':
      return updateTile({ ...state, save: 'saving' }, action.localId, { status: 'uploading', progress: 0, error: null });
    case 'uploadProgress':
      return updateTile(state, action.localId, { progress: action.progress });
    case 'uploadProcessing':
      return updateTile(state, action.localId, { status: 'processing', progress: 100 });
    case 'uploadSucceeded':
      return {
        ...state,
        save: 'saved',
        uploads: state.uploads.filter((tile) => tile.localId !== action.localId),
        items: withItem(state.items, action.item),
      };
    case 'uploadFailed':
      return updateTile({ ...state, save: action.error === 'network' ? 'offline' : 'failed' }, action.localId, { status: 'error', error: action.error });
    case 'uploadRetried':
      return updateTile(state, action.localId, { status: 'queued', progress: 0, error: null });
    case 'tileRemoved':
      return { ...state, uploads: state.uploads.filter((tile) => tile.localId !== action.localId) };
    case 'dismissExpired':
      return { ...state, expiredNotice: false };
  }
}

/** Uploads waiting, sending or being converted (error tiles do not count). */
export function activeUploads(state: MoodboardState): UploadTile[] {
  return state.uploads.filter((tile) => tile.status !== 'error');
}

/** Items in the Moodboard plus the ones on their way (picks and uploads in flight). */
export function usedSlots(state: MoodboardState): number {
  return state.items.length + state.pendingPicks.length + activeUploads(state).length;
}

export function remainingSlots(state: MoodboardState): number {
  return Math.max(0, state.maxItems - usedSlots(state));
}

/** Changes are possible: loaded and online. */
export function canEdit(state: MoodboardState): boolean {
  return state.phase === 'ready' && state.online;
}

/** The item for a gallery image, if it is in the Moodboard. */
export function galleryItem(state: MoodboardState, galleryImageId: string): MoodboardItemView | undefined {
  return state.items.find((item) => item.source === 'gallery' && item.galleryImageId === galleryImageId);
}

/** Shown as selected: in the Moodboard or being added. */
export function isPicked(state: MoodboardState, galleryImageId: string): boolean {
  return galleryItem(state, galleryImageId) !== undefined || state.pendingPicks.includes(galleryImageId);
}

/**
 * What a tap on a gallery tile does: add it, remove its item, or nothing (offline, add or
 * remove in flight, or the Moodboard is full and the image is not in it).
 */
export function galleryTapAction(state: MoodboardState, galleryImageId: string): { kind: 'add' } | { kind: 'remove'; itemId: string } | { kind: 'none' } {
  if (!canEdit(state) || state.pendingPicks.includes(galleryImageId)) return { kind: 'none' };
  const item = galleryItem(state, galleryImageId);
  if (item) return state.removing.includes(item.id) ? { kind: 'none' } : { kind: 'remove', itemId: item.id };
  return remainingSlots(state) > 0 ? { kind: 'add' } : { kind: 'none' };
}

/** Continue needs: online, at least 1 item, nothing in flight, and a complete Capture. */
export function canContinue(state: MoodboardState): boolean {
  return (
    canEdit(state) &&
    state.items.length >= 1 &&
    state.pendingPicks.length === 0 &&
    state.removing.length === 0 &&
    activeUploads(state).length === 0 &&
    state.captureComplete
  );
}

/** Hint under a disabled Continue. The Capture hint wins when both are missing. */
export function continueHint(state: MoodboardState): 'capture' | 'items' | null {
  if (!state.captureComplete && state.phase === 'ready') return 'capture';
  if (state.items.length === 0) return 'items';
  return null;
}

/** Gallery images shown for the current filter, in manifest order. */
export function visibleGalleryImages(state: MoodboardState): Array<{ styleId: string; index: number; image: StyleGalleryStyleView['images'][number] }> {
  return state.gallery.styles
    .filter((style) => state.filter === 'all' || style.id === state.filter)
    .flatMap((style) => style.images.map((image, index) => ({ styleId: style.id, index: index + 1, image })));
}

/** 1-based number of a gallery image within its style (for "{Style} kitchen {n}"). */
export function galleryImageNumber(state: MoodboardState, galleryImageId: string): number {
  for (const style of state.gallery.styles) {
    const index = style.images.findIndex((image) => image.id === galleryImageId);
    if (index >= 0) return index + 1;
  }
  const suffix = /-(\d+)$/.exec(galleryImageId);
  return suffix ? Number(suffix[1]) : 1;
}
