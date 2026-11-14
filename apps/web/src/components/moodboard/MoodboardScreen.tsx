'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, CircleAlert, CloudOff, Loader } from 'lucide-react';
import { createApiClient, type ApiClient } from '@bricomission/api-client';
import { loadDraft, startDraft } from '../../lib/kitchen-draft/draft-client';
import { draftMarker } from '../../lib/kitchen-draft/draft-marker';
import { addGalleryItem, loadStyleGallery, removeMoodboardItem } from '../../lib/kitchen-draft/moodboard-client';
import {
  canContinue,
  canEdit,
  continueHint,
  galleryImageNumber,
  galleryTapAction,
  INITIAL_MOODBOARD_STATE,
  isPicked,
  moodboardReducer,
  remainingSlots,
  usedSlots,
  visibleGalleryImages,
} from '../../lib/kitchen-draft/moodboard-state';
import type { MoodboardItemView } from '../../lib/kitchen-draft/types';
import { MOODBOARD_UPLOAD_URL, precheckPhoto, uploadPhoto } from '../../lib/kitchen-draft/upload';
import { CaptureAlert } from '../capture/CaptureAlert';
import { MoodboardGrid, type MoodboardGridItem } from './MoodboardGrid';
import { StyleGallery } from './StyleGallery';

export const CAPTURE_PATH = '/kitchen-projects/new';
export const GENERATE_PATH = '/kitchen-projects/new/generate';

let localSeq = 0;
const newLocalId = () => `reference-${Date.now()}-${++localSeq}`;

/**
 * Moodboard screen body and sticky bottom bar (design: docs/design/moodboard-selection.md).
 * Works on the browser's anonymous draft: loaded from /api on mount and when the browser comes
 * back online, started lazily by the first change (BFF start route, like Capture). Gallery
 * picks and removals save at once; reference photos upload one at a time with progress.
 * Offline, every control except the style filter is disabled and nothing is queued.
 */
export function MoodboardScreen() {
  const t = useTranslations('moodboard');
  const tCapture = useTranslations('capture');
  const router = useRouter();
  const [state, dispatch] = useReducer(moodboardReducer, INITIAL_MOODBOARD_STATE);

  const stateRef = useRef(state);
  stateRef.current = state;
  const clientRef = useRef<ApiClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createApiClient(`${window.location.origin}/api`)), []);
  const files = useRef(new Map<string, File>());
  const hasDraft = useRef(false);
  const starting = useRef<Promise<boolean> | null>(null);
  const pumping = useRef(false);

  const load = useCallback(async () => {
    const [draft, gallery] = await Promise.all([loadDraft(client()), loadStyleGallery(client())]);
    if (gallery.kind === 'ok') dispatch({ type: 'galleryLoaded', styles: gallery.value.styles });
    else dispatch({ type: 'galleryFailed' });
    if (draft.kind === 'ok') {
      hasDraft.current = true;
      draftMarker('set');
      dispatch({ type: 'connectivity', online: true });
      dispatch({ type: 'draftLoaded', draft: draft.value });
    } else if (draft.kind === 'missing') {
      const expired = draftMarker('get');
      draftMarker('clear');
      hasDraft.current = false;
      dispatch({ type: 'connectivity', online: navigator.onLine });
      dispatch({ type: 'draftMissing', expired });
    } else {
      dispatch({ type: 'draftMissing', expired: false });
      dispatch({ type: 'connectivity', online: false });
    }
  }, [client]);

  /** Starts the draft once (parallel changes share one call). */
  const ensureDraft = useCallback(async (): Promise<boolean> => {
    if (hasDraft.current) return true;
    starting.current ??= startDraft().then((result) => {
      starting.current = null;
      if (result.kind !== 'ok') {
        if (result.kind === 'offline') dispatch({ type: 'connectivity', online: false });
        return false;
      }
      hasDraft.current = true;
      draftMarker('set');
      dispatch({ type: 'draftStarted', draft: result.value });
      return true;
    });
    return starting.current;
  }, []);

  const draftLost = useCallback(() => {
    hasDraft.current = false;
    dispatch({ type: 'draftLost' });
  }, []);

  // Initial load and connectivity.
  useEffect(() => {
    if (!navigator.onLine) dispatch({ type: 'connectivity', online: false });
    void load();
    const online = () => void load();
    const offline = () => dispatch({ type: 'connectivity', online: false });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [load]);

  // Reference upload pump: one photo at a time.
  useEffect(() => {
    if (pumping.current || !canEdit(state)) return;
    if (state.uploads.some((tile) => tile.status === 'uploading' || tile.status === 'processing')) return;
    const tile = state.uploads.find((candidate) => candidate.status === 'queued');
    const file = tile ? files.current.get(tile.localId) : undefined;
    if (!tile || !file) return;
    pumping.current = true;
    const { localId } = tile;
    void (async () => {
      dispatch({ type: 'uploadStarted', localId });
      const send = () =>
        uploadPhoto<MoodboardItemView>(file, {
          url: MOODBOARD_UPLOAD_URL,
          onProgress: (progress) => dispatch({ type: 'uploadProgress', localId, progress }),
          onUploaded: () => dispatch({ type: 'uploadProcessing', localId }),
        });
      let result = (await ensureDraft()) ? await send() : ({ ok: false, code: 'network' } as const);
      if (!result.ok && result.code === 'draft_missing') {
        draftLost();
        if (await ensureDraft()) result = await send();
      }
      pumping.current = false;
      if (result.ok) {
        files.current.delete(localId);
        dispatch({ type: 'uploadSucceeded', localId, item: result.photo });
      } else {
        dispatch({ type: 'uploadFailed', localId, error: result.code });
        if (result.code === 'network' || result.code === 'moodboard_limit_reached') void load();
      }
    })();
  }, [state, ensureDraft, draftLost, load]);

  const pick = async (galleryImageId: string) => {
    dispatch({ type: 'pickStarted', galleryImageId });
    let result = (await ensureDraft()) ? await addGalleryItem(client(), galleryImageId) : ({ kind: 'offline' } as const);
    if (result.kind === 'missing') {
      draftLost();
      result = (await ensureDraft()) ? await addGalleryItem(client(), galleryImageId) : ({ kind: 'offline' } as const);
    }
    if (result.kind === 'ok') {
      dispatch({ type: 'pickSucceeded', galleryImageId, item: result.value });
    } else {
      dispatch({ type: 'pickFailed', galleryImageId, offline: result.kind === 'offline' });
      void load();
    }
  };

  const removeItem = async (itemId: string) => {
    dispatch({ type: 'itemRemoving', itemId });
    const result = await removeMoodboardItem(client(), itemId);
    if (result.kind === 'ok') {
      dispatch({ type: 'itemRemoved', itemId });
    } else {
      dispatch({ type: 'itemRemoveFailed', itemId, offline: result.kind === 'offline' });
      void load();
    }
  };

  const toggleGallery = (galleryImageId: string) => {
    const action = galleryTapAction(stateRef.current, galleryImageId);
    if (action.kind === 'add') void pick(galleryImageId);
    if (action.kind === 'remove') void removeItem(action.itemId);
  };

  const addFiles = (selected: File[]) => {
    const slots = remainingSlots(stateRef.current);
    const accepted: string[] = [];
    const rejected: Array<{ localId: string; error: NonNullable<ReturnType<typeof precheckPhoto>> }> = [];
    for (const file of selected.slice(0, slots)) {
      const localId = newLocalId();
      const error = precheckPhoto(file);
      if (error) {
        rejected.push({ localId, error });
      } else {
        files.current.set(localId, file);
        accepted.push(localId);
      }
    }
    if (rejected.length > 0) dispatch({ type: 'uploadsRejected', tiles: rejected });
    if (accepted.length > 0) dispatch({ type: 'uploadsQueued', localIds: accepted });
  };

  const removeUpload = (localId: string) => {
    files.current.delete(localId);
    dispatch({ type: 'tileRemoved', localId });
  };

  const styleName = (styleId: string) => (t.has(`styles.${styleId}`) ? t(`styles.${styleId}`) : styleId);
  const editable = canEdit(state);
  const ready = canContinue(state);
  const limitReached = remainingSlots(state) === 0;
  const hint = ready ? null : continueHint(state);
  const statusVisible = state.save === 'saving' || state.save === 'failed' || state.save === 'offline' || (state.save === 'saved' && ready);

  let uploadNumber = 0;
  const entries: MoodboardGridItem[] = state.items.map((item) => {
    if (item.source === 'upload') {
      uploadNumber += 1;
      return { item, label: t('board.yourPhoto'), alt: t('board.uploadAlt', { n: uploadNumber }), removeLabel: t('board.removeUpload', { n: uploadNumber }) };
    }
    const style = styleName(item.styleId ?? '');
    const n = galleryImageNumber(state, item.galleryImageId ?? '');
    return { item, label: style, alt: t('gallery.alt', { style, n }), removeLabel: t('board.removeGallery', { style, n }) };
  });

  const tiles = visibleGalleryImages(state).map(({ styleId, index, image }) => {
    const selected = isPicked(state, image.id);
    return {
      id: image.id,
      styleId,
      number: index,
      thumbUrl: image.thumbUrl,
      selected,
      disabled: !editable || (!selected && limitReached),
    };
  });

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-md pt-sm pb-lg" data-testid="moodboard-screen" data-phase={state.phase}>
        {!state.online ? <CaptureAlert kind="offline" message={t('alerts.offline')} testIdPrefix="moodboard" /> : null}
        {state.online && state.expiredNotice ? (
          <CaptureAlert
            kind="expired"
            message={t('alerts.expired')}
            dismissLabel={t('alerts.dismiss')}
            onDismiss={() => dispatch({ type: 'dismissExpired' })}
            testIdPrefix="moodboard"
          />
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-small leading-5 font-semibold text-text-muted">{t('step', { current: 2, total: 3 })}</p>
            <div className="flex h-1 gap-1" aria-hidden="true">
              <span className="grow rounded-pill bg-primary" />
              <span className="grow rounded-pill bg-primary" />
              <span className="grow rounded-pill bg-border" />
            </div>
          </div>
          <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
          <p className="text-body text-text-muted">{t('helper')}</p>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="moodboard-board-title">
          <div className="flex items-center justify-between gap-2">
            <h2 id="moodboard-board-title" className="text-[18px] leading-6 font-semibold text-text">
              {t('board.title')}
            </h2>
            <p className="shrink-0 text-small leading-5 font-semibold text-text-muted" aria-live="polite" data-testid="moodboard-counter">
              {t('board.counter', { count: usedSlots(state), max: state.maxItems })}
            </p>
          </div>
          <p className="text-small leading-5 text-text-muted">{t('board.rules')}</p>
          <MoodboardGrid
            entries={entries}
            uploads={state.uploads}
            removing={state.removing}
            canEdit={editable}
            limitReached={limitReached}
            onFiles={addFiles}
            onRemoveItem={(itemId) => void removeItem(itemId)}
            onRetryUpload={(localId) => dispatch({ type: 'uploadRetried', localId })}
            onRemoveUpload={removeUpload}
          />
          {entries.length === 0 && state.uploads.length === 0 ? (
            <p className="text-small leading-5 text-text-muted" data-testid="moodboard-empty">
              {t('board.empty')}
            </p>
          ) : null}
          {limitReached ? (
            <p className="text-small leading-5 text-text-muted" data-testid="moodboard-limit">
              {t('board.limitReached', { max: state.maxItems })}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="moodboard-gallery-title">
          <div className="flex flex-col gap-1">
            <h2 id="moodboard-gallery-title" className="text-[18px] leading-6 font-semibold text-text">
              {t('gallery.title')}
            </h2>
            <p className="text-small leading-5 text-text-muted">{t('gallery.helper')}</p>
            {limitReached ? <p className="text-small leading-5 text-text-muted">{t('board.limitReached', { max: state.maxItems })}</p> : null}
          </div>
          <StyleGallery
            styles={state.gallery.styles}
            filter={state.filter}
            tiles={tiles}
            styleName={styleName}
            onFilter={(filter) => dispatch({ type: 'filterChanged', filter })}
            onToggle={toggleGallery}
          />
        </section>
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        {statusVisible ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-small leading-5 text-text-muted" aria-live="polite" data-testid="moodboard-save-status" data-state={state.save}>
            {state.save === 'saving' ? <Loader size={16} aria-hidden="true" className="shrink-0 animate-spin" /> : null}
            {state.save === 'saved' ? <Check size={16} aria-hidden="true" className="shrink-0 text-success" /> : null}
            {state.save === 'offline' ? <CloudOff size={16} aria-hidden="true" className="shrink-0 text-warning" /> : null}
            {state.save === 'failed' ? <CircleAlert size={16} aria-hidden="true" className="shrink-0 text-danger" /> : null}
            <span>{tCapture(`save.${state.save as 'saving' | 'saved' | 'offline' | 'failed'}`)}</span>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p id="moodboard-continue-hint" className="text-center text-small leading-5 text-text-muted" aria-live="polite" data-testid="moodboard-continue-hint" data-hint={hint ?? ''}>
              {hint === 'capture' ? t('continueHints.capture') : hint === 'items' ? t('continueHints.items') : ''}
            </p>
            {hint === 'capture' ? (
              <Link
                href={CAPTURE_PATH}
                prefetch={false}
                data-testid="moodboard-capture-link"
                className="flex h-11 items-center justify-center gap-1 text-small leading-5 font-semibold text-primary underline"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>{t('continueHints.goToCapture')}</span>
              </Link>
            ) : null}
          </div>
        )}
        <button
          type="button"
          data-testid="moodboard-continue"
          aria-disabled={!ready}
          aria-describedby={!ready && !statusVisible ? 'moodboard-continue-hint' : undefined}
          onClick={() => {
            if (canContinue(stateRef.current)) router.push(GENERATE_PATH);
          }}
          className={`flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill px-md py-[14px] text-center text-body font-semibold ${
            ready ? 'bg-primary text-white hover:bg-primary-hover' : 'cursor-not-allowed border border-border bg-surface-muted text-text-muted'
          }`}
        >
          <span>{t('continue')}</span>
          {ready ? <ArrowRight size={20} aria-hidden="true" className="shrink-0" /> : null}
        </button>
      </footer>
    </>
  );
}
