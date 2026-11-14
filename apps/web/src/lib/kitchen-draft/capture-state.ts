import { EMPTY_MEASUREMENTS, MEASUREMENT_FIELDS, type MeasurementField, type Measurements } from './measurements';
import type { KitchenDraftView, KitchenPhotoView } from './types';
import { MAX_PHOTOS, type UploadErrorCode } from './upload';

/**
 * Pure state of the Capture screen (feature kitchen-capture-draft): server photos, local
 * upload tiles, committed and saved measurements, connectivity, and the derived Continue
 * eligibility. The CaptureScreen component owns the side effects.
 */
export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'error';

export interface UploadTile {
  localId: string;
  status: UploadStatus;
  progress: number;
  error: UploadErrorCode | null;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'offline';

export interface CaptureState {
  /** `loading` until the first draft lookup answers (or fails). */
  phase: 'loading' | 'ready';
  online: boolean;
  /** A draft exists on the server for this browser (as far as we know). */
  hasDraft: boolean;
  photos: KitchenPhotoView[];
  uploads: UploadTile[];
  /** Photo ids with a delete in flight. */
  removing: string[];
  /** Values committed by the keypad (what the page shows). */
  measurements: Measurements;
  /** Values the server confirmed. */
  saved: Measurements;
  save: SaveStatus;
  expiredNotice: boolean;
}

export const INITIAL_CAPTURE_STATE: CaptureState = {
  phase: 'loading',
  online: true,
  hasDraft: false,
  photos: [],
  uploads: [],
  removing: [],
  measurements: EMPTY_MEASUREMENTS,
  saved: EMPTY_MEASUREMENTS,
  save: 'idle',
  expiredNotice: false,
};

export type CaptureAction =
  | { type: 'draftLoaded'; draft: KitchenDraftView }
  | { type: 'draftMissing'; expired: boolean }
  | { type: 'draftStarted'; draft: KitchenDraftView }
  | { type: 'draftLost' }
  | { type: 'connectivity'; online: boolean }
  | { type: 'uploadsQueued'; localIds: string[] }
  | { type: 'uploadsRejected'; tiles: Array<{ localId: string; error: UploadErrorCode }> }
  | { type: 'uploadStarted'; localId: string }
  | { type: 'uploadProgress'; localId: string; progress: number }
  | { type: 'uploadProcessing'; localId: string }
  | { type: 'uploadSucceeded'; localId: string; photo: KitchenPhotoView }
  | { type: 'uploadFailed'; localId: string; error: UploadErrorCode }
  | { type: 'uploadRetried'; localId: string }
  | { type: 'tileRemoved'; localId: string }
  | { type: 'photoRemoving'; photoId: string }
  | { type: 'photoRemoved'; photoId: string }
  | { type: 'photoRemoveFailed'; photoId: string }
  | { type: 'measurementCommitted'; field: MeasurementField; cm: number }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded'; measurements: Measurements }
  | { type: 'saveFailed'; offline: boolean }
  | { type: 'dismissExpired' };

function measurementsOf(draft: KitchenDraftView): Measurements {
  const { lengthCm, widthCm, heightCm } = draft.measurements;
  return { lengthCm: lengthCm ?? null, widthCm: widthCm ?? null, heightCm: heightCm ?? null };
}

function hasAny(measurements: Measurements): boolean {
  return MEASUREMENT_FIELDS.some((field) => measurements[field] !== null);
}

export function sameMeasurements(a: Measurements, b: Measurements): boolean {
  return MEASUREMENT_FIELDS.every((field) => a[field] === b[field]);
}

function updateTile(state: CaptureState, localId: string, patch: Partial<UploadTile>): CaptureState {
  return { ...state, uploads: state.uploads.map((tile) => (tile.localId === localId ? { ...tile, ...patch } : tile)) };
}

function sortedPhotos(photos: KitchenPhotoView[]): KitchenPhotoView[] {
  return [...photos].sort((a, b) => a.position - b.position);
}

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case 'draftLoaded': {
      const saved = measurementsOf(action.draft);
      // Keep local commits that are not saved yet (a reload after reconnecting).
      const pending = !sameMeasurements(state.measurements, state.saved);
      return {
        ...state,
        phase: 'ready',
        hasDraft: true,
        photos: sortedPhotos(action.draft.photos),
        saved,
        measurements: pending ? state.measurements : saved,
        save: pending ? state.save : hasAny(saved) ? 'saved' : 'idle',
        expiredNotice: false,
      };
    }
    case 'draftMissing':
      return {
        ...state,
        phase: 'ready',
        hasDraft: false,
        photos: [],
        saved: EMPTY_MEASUREMENTS,
        measurements: state.hasDraft || action.expired ? EMPTY_MEASUREMENTS : state.measurements,
        save: 'idle',
        expiredNotice: action.expired,
      };
    case 'draftStarted':
      return { ...state, hasDraft: true, expiredNotice: false, saved: measurementsOf(action.draft) };
    case 'draftLost':
      return { ...state, hasDraft: false };
    case 'connectivity':
      return { ...state, online: action.online };
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
      return updateTile(state, action.localId, { status: 'uploading', progress: 0, error: null });
    case 'uploadProgress':
      return updateTile(state, action.localId, { progress: action.progress });
    case 'uploadProcessing':
      return updateTile(state, action.localId, { status: 'processing', progress: 100 });
    case 'uploadSucceeded':
      return {
        ...state,
        uploads: state.uploads.filter((tile) => tile.localId !== action.localId),
        photos: sortedPhotos([...state.photos.filter((photo) => photo.id !== action.photo.id), action.photo]),
      };
    case 'uploadFailed':
      return updateTile(state, action.localId, { status: 'error', error: action.error });
    case 'uploadRetried':
      return updateTile(state, action.localId, { status: 'queued', progress: 0, error: null });
    case 'tileRemoved':
      return { ...state, uploads: state.uploads.filter((tile) => tile.localId !== action.localId) };
    case 'photoRemoving':
      return { ...state, removing: [...state.removing, action.photoId] };
    case 'photoRemoved':
      return {
        ...state,
        removing: state.removing.filter((id) => id !== action.photoId),
        photos: state.photos.filter((photo) => photo.id !== action.photoId).map((photo, index) => ({ ...photo, position: index })),
      };
    case 'photoRemoveFailed':
      return { ...state, removing: state.removing.filter((id) => id !== action.photoId) };
    case 'measurementCommitted':
      return { ...state, expiredNotice: false, measurements: { ...state.measurements, [action.field]: action.cm } };
    case 'saveStarted':
      return { ...state, save: 'saving' };
    case 'saveSucceeded':
      return { ...state, saved: action.measurements, save: 'saved' };
    case 'saveFailed':
      return { ...state, save: action.offline ? 'offline' : 'failed' };
    case 'dismissExpired':
      return { ...state, expiredNotice: false };
  }
}

/** Uploads waiting, sending or being converted. */
export function activeUploads(state: CaptureState): UploadTile[] {
  return state.uploads.filter((tile) => tile.status !== 'error');
}

/** Free photo slots, counting server photos and uploads in progress (not error tiles). */
export function remainingSlots(state: CaptureState, max = MAX_PHOTOS): number {
  return Math.max(0, max - state.photos.length - activeUploads(state).length);
}

/** Changes are possible: loaded and online. */
export function canEdit(state: CaptureState): boolean {
  return state.phase === 'ready' && state.online;
}

/**
 * Continue needs: at least 1 photo, no upload in progress, all three measurements committed
 * and confirmed by the server, nothing saving, and a connection.
 */
export function canContinue(state: CaptureState): boolean {
  return (
    canEdit(state) &&
    state.photos.length >= 1 &&
    activeUploads(state).length === 0 &&
    MEASUREMENT_FIELDS.every((field) => state.measurements[field] !== null) &&
    sameMeasurements(state.measurements, state.saved) &&
    state.save !== 'saving'
  );
}

/** Measurements committed locally but not confirmed by the server. */
export function needsSave(state: CaptureState): boolean {
  return !sameMeasurements(state.measurements, state.saved);
}
