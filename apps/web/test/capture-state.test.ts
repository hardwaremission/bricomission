import { describe, expect, it } from 'vitest';
import {
  canContinue,
  captureReducer,
  type CaptureAction,
  type CaptureState,
  INITIAL_CAPTURE_STATE,
  needsSave,
  remainingSlots,
} from '../src/lib/kitchen-draft/capture-state';
import type { KitchenDraftView, KitchenPhotoView } from '../src/lib/kitchen-draft/types';

const photo = (id: string, position: number): KitchenPhotoView => ({ id, position, width: 800, height: 600, thumbUrl: `/t/${id}`, fullUrl: `/f/${id}` });
const draft = (overrides: Partial<KitchenDraftView> = {}): KitchenDraftView => ({
  id: 'd1',
  status: 'draft',
  measurements: { lengthCm: null, widthCm: null, heightCm: null },
  photos: [],
  moodboard: [],
  limits: { maxPhotos: 8, maxPhotoBytes: 15728640, maxMoodboardItems: 12 },
  expiresAt: '2026-11-21T00:00:00.000Z',
  ...overrides,
});
const run = (...actions: CaptureAction[]) => actions.reduce(captureReducer, INITIAL_CAPTURE_STATE);

const complete = (): CaptureState =>
  run(
    { type: 'draftLoaded', draft: draft({ photos: [photo('a', 0)], measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 } }) },
  );

describe('captureReducer', () => {
  it('a loaded complete draft can continue and shows Saved', () => {
    const state = complete();
    expect(state.save).toBe('saved');
    expect(canContinue(state)).toBe(true);
  });

  it('Continue needs a photo, all three saved measurements, no upload in progress and a connection', () => {
    expect(canContinue(run({ type: 'draftLoaded', draft: draft({ measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 } }) }))).toBe(false);
    expect(canContinue(run({ type: 'draftLoaded', draft: draft({ photos: [photo('a', 0)], measurements: { lengthCm: 420, widthCm: 310, heightCm: null } }) }))).toBe(false);
    expect(canContinue(captureReducer(complete(), { type: 'uploadsQueued', localIds: ['u1'] }))).toBe(false);
    expect(canContinue(captureReducer(complete(), { type: 'connectivity', online: false }))).toBe(false);
    const committed = captureReducer(complete(), { type: 'measurementCommitted', field: 'heightCm', cm: 270 });
    expect(needsSave(committed)).toBe(true);
    expect(canContinue(committed)).toBe(false);
    const saved = captureReducer(captureReducer(committed, { type: 'saveStarted' }), { type: 'saveSucceeded', measurements: { lengthCm: 420, widthCm: 310, heightCm: 270 } });
    expect(canContinue(saved)).toBe(true);
    // An error tile does not block Continue.
    expect(canContinue(captureReducer(saved, { type: 'uploadsRejected', tiles: [{ localId: 'x', error: 'photo_too_large' }] }))).toBe(true);
  });

  it('upload tile lifecycle: queued, uploading with progress, processing, then a server photo', () => {
    let state = run({ type: 'draftMissing', expired: false }, { type: 'uploadsQueued', localIds: ['u1'] });
    expect(state.uploads).toEqual([{ localId: 'u1', status: 'queued', progress: 0, error: null }]);
    state = captureReducer(state, { type: 'uploadStarted', localId: 'u1' });
    state = captureReducer(state, { type: 'uploadProgress', localId: 'u1', progress: 62 });
    expect(state.uploads[0]).toMatchObject({ status: 'uploading', progress: 62 });
    state = captureReducer(state, { type: 'uploadProcessing', localId: 'u1' });
    expect(state.uploads[0]).toMatchObject({ status: 'processing', progress: 100 });
    state = captureReducer(state, { type: 'uploadSucceeded', localId: 'u1', photo: photo('p1', 0) });
    expect(state.uploads).toEqual([]);
    expect(state.photos.map((p) => p.id)).toEqual(['p1']);
  });

  it('failed uploads can be retried or removed', () => {
    let state = run({ type: 'uploadsQueued', localIds: ['u1'] }, { type: 'uploadFailed', localId: 'u1', error: 'storage_unavailable' });
    expect(state.uploads[0]).toMatchObject({ status: 'error', error: 'storage_unavailable' });
    state = captureReducer(state, { type: 'uploadRetried', localId: 'u1' });
    expect(state.uploads[0]).toMatchObject({ status: 'queued', error: null });
    state = captureReducer(state, { type: 'tileRemoved', localId: 'u1' });
    expect(state.uploads).toEqual([]);
  });

  it('removing a photo renumbers the rest', () => {
    let state = run({ type: 'draftLoaded', draft: draft({ photos: [photo('b', 1), photo('a', 0)] }) });
    expect(state.photos.map((p) => p.id)).toEqual(['a', 'b']);
    state = captureReducer(state, { type: 'photoRemoving', photoId: 'a' });
    expect(state.removing).toEqual(['a']);
    state = captureReducer(state, { type: 'photoRemoved', photoId: 'a' });
    expect(state.photos).toEqual([{ ...photo('b', 0) }]);
    expect(state.removing).toEqual([]);
  });

  it('remaining slots count server photos and uploads in progress, not error tiles', () => {
    const state = run(
      { type: 'draftLoaded', draft: draft({ photos: [0, 1, 2, 3, 4, 5].map((i) => photo(`p${i}`, i)) }) },
      { type: 'uploadsQueued', localIds: ['u1'] },
      { type: 'uploadsRejected', tiles: [{ localId: 'x', error: 'photo_unsupported_type' }] },
    );
    expect(remainingSlots(state)).toBe(1);
    expect(remainingSlots(captureReducer(state, { type: 'uploadsQueued', localIds: ['u2'] }))).toBe(0);
  });

  it('an expired draft shows the notice and clears the screen; a new commit hides it', () => {
    let state = run({ type: 'draftMissing', expired: true });
    expect(state.expiredNotice).toBe(true);
    expect(state.photos).toEqual([]);
    state = captureReducer(state, { type: 'measurementCommitted', field: 'lengthCm', cm: 400 });
    expect(state.expiredNotice).toBe(false);
  });

  it('save failures map to the offline and failed statuses', () => {
    expect(captureReducer(complete(), { type: 'saveFailed', offline: true }).save).toBe('offline');
    expect(captureReducer(complete(), { type: 'saveFailed', offline: false }).save).toBe('failed');
  });
});
