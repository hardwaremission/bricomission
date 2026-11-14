import { describe, expect, it } from 'vitest';
import {
  canContinue,
  continueHint,
  galleryImageNumber,
  galleryTapAction,
  INITIAL_MOODBOARD_STATE,
  isCaptureComplete,
  isPicked,
  moodboardReducer,
  type MoodboardAction,
  type MoodboardState,
  remainingSlots,
  usedSlots,
  toggleFilter,
  visibleGalleryImages,
} from '../src/lib/kitchen-draft/moodboard-state';
import type { KitchenDraftView, MoodboardItemView, StyleGalleryStyleView } from '../src/lib/kitchen-draft/types';

const galleryItem = (galleryImageId: string, position: number, id = `item-${galleryImageId}`): MoodboardItemView => ({
  id,
  source: 'gallery',
  galleryImageId,
  styleId: galleryImageId.replace(/-\d+$/, ''),
  position,
  width: 1216,
  height: 832,
  thumbUrl: `/style-gallery/images/${galleryImageId}/content?variant=thumb`,
  fullUrl: `/style-gallery/images/${galleryImageId}/content?variant=full`,
});
const uploadItem = (id: string, position: number): MoodboardItemView => ({
  id,
  source: 'upload',
  galleryImageId: null,
  styleId: null,
  position,
  width: 800,
  height: 600,
  thumbUrl: `/t/${id}`,
  fullUrl: `/f/${id}`,
});
const completeCapture = {
  measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 },
  photos: [{ id: 'p1', position: 0, width: 800, height: 600, thumbUrl: '/t', fullUrl: '/f' }],
};
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
const styles: StyleGalleryStyleView[] = ['modern', 'japandi'].map((style) => ({
  id: style,
  images: [1, 2, 3].map((n) => ({ id: `${style}-0${n}`, width: 1216, height: 832, thumbUrl: `/style-gallery/images/${style}-0${n}/content?variant=thumb`, fullUrl: '' })),
}));
const run = (...actions: MoodboardAction[]) => actions.reduce(moodboardReducer, INITIAL_MOODBOARD_STATE);
const loaded = (overrides: Partial<KitchenDraftView> = {}) =>
  run({ type: 'galleryLoaded', styles }, { type: 'draftLoaded', draft: draft({ ...completeCapture, ...overrides }) });

describe('moodboardReducer', () => {
  it('a loaded draft with items and a complete Capture can continue and shows Saved', () => {
    const state = loaded({ moodboard: [galleryItem('modern-01', 0)] });
    expect(state.save).toBe('saved');
    expect(canContinue(state)).toBe(true);
    expect(continueHint(state)).toBeNull();
  });

  it('select, then deselect a gallery image (Scenario 2 shape)', () => {
    let state = loaded();
    expect(galleryTapAction(state, 'modern-01')).toEqual({ kind: 'add' });
    state = moodboardReducer(state, { type: 'pickStarted', galleryImageId: 'modern-01' });
    expect(isPicked(state, 'modern-01')).toBe(true);
    expect(state.save).toBe('saving');
    expect(galleryTapAction(state, 'modern-01')).toEqual({ kind: 'none' });
    expect(canContinue(state)).toBe(false);
    state = moodboardReducer(state, { type: 'pickSucceeded', galleryImageId: 'modern-01', item: galleryItem('modern-01', 0) });
    expect(state.items.map((item) => item.galleryImageId)).toEqual(['modern-01']);
    expect(canContinue(state)).toBe(true);
    expect(galleryTapAction(state, 'modern-01')).toEqual({ kind: 'remove', itemId: 'item-modern-01' });
    state = moodboardReducer(state, { type: 'itemRemoving', itemId: 'item-modern-01' });
    expect(galleryTapAction(state, 'modern-01')).toEqual({ kind: 'none' });
    state = moodboardReducer(state, { type: 'itemRemoved', itemId: 'item-modern-01' });
    expect(isPicked(state, 'modern-01')).toBe(false);
    expect(state.items).toEqual([]);
  });

  it('a failed pick unselects the image and records the save state', () => {
    let state = moodboardReducer(loaded(), { type: 'pickStarted', galleryImageId: 'japandi-02' });
    state = moodboardReducer(state, { type: 'pickFailed', galleryImageId: 'japandi-02', offline: true });
    expect(isPicked(state, 'japandi-02')).toBe(false);
    expect(state.save).toBe('offline');
  });

  it('removal compacts positions', () => {
    let state = loaded({ moodboard: [uploadItem('u1', 0), galleryItem('modern-01', 1), galleryItem('modern-02', 2)] });
    state = moodboardReducer(state, { type: 'itemRemoved', itemId: 'u1' });
    expect(state.items.map((item) => [item.galleryImageId, item.position])).toEqual([
      ['modern-01', 0],
      ['modern-02', 1],
    ]);
  });

  it('limit: 12 used slots across items, picks in flight and active uploads; full Moodboard only allows removals', () => {
    const items = Array.from({ length: 10 }, (_, i) => uploadItem(`u${i}`, i));
    let state = loaded({ moodboard: items });
    state = moodboardReducer(state, { type: 'pickStarted', galleryImageId: 'modern-01' });
    state = moodboardReducer(state, { type: 'uploadsQueued', localIds: ['l1'] });
    expect(usedSlots(state)).toBe(12);
    expect(remainingSlots(state)).toBe(0);
    expect(galleryTapAction(state, 'modern-02')).toEqual({ kind: 'none' });
    // Error tiles do not count.
    state = moodboardReducer(state, { type: 'uploadFailed', localId: 'l1', error: 'storage_unavailable' });
    expect(remainingSlots(state)).toBe(1);
    state = moodboardReducer(state, { type: 'pickSucceeded', galleryImageId: 'modern-01', item: galleryItem('modern-01', 10) });
    state = moodboardReducer(state, { type: 'pickStarted', galleryImageId: 'modern-02' });
    state = moodboardReducer(state, { type: 'pickSucceeded', galleryImageId: 'modern-02', item: galleryItem('modern-02', 11) });
    expect(remainingSlots(state)).toBe(0);
    expect(galleryTapAction(state, 'modern-03')).toEqual({ kind: 'none' });
    expect(galleryTapAction(state, 'modern-02')).toEqual({ kind: 'remove', itemId: 'item-modern-02' });
  });

  it('Continue rules: items and a complete Capture; the Capture hint wins', () => {
    const empty = loaded();
    expect(canContinue(empty)).toBe(false);
    expect(continueHint(empty)).toBe('items');
    const noCapture = run({ type: 'draftLoaded', draft: draft({ moodboard: [galleryItem('modern-01', 0)] }) });
    expect(canContinue(noCapture)).toBe(false);
    expect(continueHint(noCapture)).toBe('capture');
    const nothing = run({ type: 'draftMissing', expired: false });
    expect(continueHint(nothing)).toBe('capture');
    expect(isCaptureComplete(draft({ ...completeCapture, measurements: { lengthCm: 420, widthCm: null, heightCm: 260 } }))).toBe(false);
    expect(isCaptureComplete(draft(completeCapture))).toBe(true);
    // An upload in progress or offline blocks Continue.
    const withItem = loaded({ moodboard: [galleryItem('modern-01', 0)] });
    expect(canContinue(moodboardReducer(withItem, { type: 'uploadsQueued', localIds: ['l1'] }))).toBe(false);
    expect(canContinue(moodboardReducer(withItem, { type: 'connectivity', online: false }))).toBe(false);
  });

  it('offline: no gallery action at all; the filter still works', () => {
    let state = moodboardReducer(loaded({ moodboard: [galleryItem('modern-01', 0)] }), { type: 'connectivity', online: false });
    expect(galleryTapAction(state, 'modern-01')).toEqual({ kind: 'none' });
    expect(galleryTapAction(state, 'modern-02')).toEqual({ kind: 'none' });
    state = moodboardReducer(state, { type: 'filterToggled', filter: 'japandi' });
    expect(visibleGalleryImages(state).map(({ image }) => image.id)).toEqual(['japandi-01', 'japandi-02', 'japandi-03']);
  });

  it('the filter is multi-select: styles add and remove, All clears (simulations-ux-overhaul S2)', () => {
    expect(toggleFilter([], 'japandi')).toEqual(['japandi']);
    expect(toggleFilter(['japandi'], 'modern')).toEqual(['japandi', 'modern']);
    expect(toggleFilter(['japandi', 'modern'], 'japandi')).toEqual(['modern']);
    expect(toggleFilter(['japandi', 'modern'], 'all')).toEqual([]);
    let state = moodboardReducer(loaded(), { type: 'filterToggled', filter: 'japandi' });
    state = moodboardReducer(state, { type: 'filterToggled', filter: 'modern' });
    expect(state.filters).toEqual(['japandi', 'modern']);
    expect(new Set(visibleGalleryImages(state).map(({ styleId }) => styleId))).toEqual(new Set(['japandi', 'modern']));
    state = moodboardReducer(state, { type: 'filterToggled', filter: 'all' });
    expect(state.filters).toEqual([]);
    expect(visibleGalleryImages(state).length).toBeGreaterThan(3);
  });

  it('upload tiles: queued, progress, success adds the item; failures keep a retryable tile', () => {
    let state = moodboardReducer(loaded(), { type: 'uploadsQueued', localIds: ['l1'] });
    state = moodboardReducer(state, { type: 'uploadStarted', localId: 'l1' });
    state = moodboardReducer(state, { type: 'uploadProgress', localId: 'l1', progress: 40 });
    expect(state.uploads[0]).toMatchObject({ status: 'uploading', progress: 40 });
    state = moodboardReducer(state, { type: 'uploadProcessing', localId: 'l1' });
    state = moodboardReducer(state, { type: 'uploadSucceeded', localId: 'l1', item: uploadItem('u1', 0) });
    expect(state.uploads).toEqual([]);
    expect(state.items.map((item) => item.id)).toEqual(['u1']);
    state = moodboardReducer(state, { type: 'uploadsRejected', tiles: [{ localId: 'l2', error: 'photo_too_large' }] });
    expect(state.uploads[0]).toMatchObject({ status: 'error', error: 'photo_too_large' });
    state = moodboardReducer(state, { type: 'tileRemoved', localId: 'l2' });
    expect(state.uploads).toEqual([]);
  });

  it('draft missing after a reload: the expired notice and an empty Moodboard', () => {
    const state = moodboardReducer(loaded({ moodboard: [galleryItem('modern-01', 0)] }), { type: 'draftMissing', expired: true });
    expect(state.items).toEqual([]);
    expect(state.expiredNotice).toBe(true);
    expect(moodboardReducer(state, { type: 'dismissExpired' }).expiredNotice).toBe(false);
  });

  it('gallery: all images in manifest order, numbers within the style, failures keep a loaded list', () => {
    const state = loaded();
    expect(visibleGalleryImages(state)).toHaveLength(6);
    expect(galleryImageNumber(state, 'japandi-02')).toBe(2);
    expect(galleryImageNumber(INITIAL_MOODBOARD_STATE, 'classic-03')).toBe(3);
    expect(moodboardReducer(state, { type: 'galleryFailed' }).gallery.styles).toHaveLength(2);
    expect(run({ type: 'galleryFailed' }).gallery.status).toBe('error');
  });

  it('keeps the server limit', () => {
    const state: MoodboardState = loaded({ limits: { maxPhotos: 8, maxPhotoBytes: 1, maxMoodboardItems: 3 } });
    expect(remainingSlots(state)).toBe(3);
  });
});
