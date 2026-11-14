'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, CircleAlert, CloudOff, Lightbulb, Loader } from 'lucide-react';
import { createApiClient, type ApiClient } from '@bricomission/api-client';
import {
  canContinue,
  canEdit,
  captureReducer,
  INITIAL_CAPTURE_STATE,
  needsSave,
  remainingSlots,
} from '../../lib/kitchen-draft/capture-state';
import { deletePhoto, loadDraft, saveMeasurements, startDraft } from '../../lib/kitchen-draft/draft-client';
import { draftMarker } from '../../lib/kitchen-draft/draft-marker';
import type { MeasurementField, MeasurementUnit } from '../../lib/kitchen-draft/measurements';
import { MAX_PHOTOS, precheckPhoto, uploadPhoto } from '../../lib/kitchen-draft/upload';
import { CaptureAlert } from './CaptureAlert';
import { MeasurementKeypad } from './MeasurementKeypad';
import { MeasurementsSection } from './MeasurementsSection';
import { PhotoGrid } from './PhotoGrid';

export const MOODBOARD_PATH = '/kitchen-projects/new/moodboard';

let localSeq = 0;
const newLocalId = () => `upload-${Date.now()}-${++localSeq}`;

/**
 * Capture screen body and sticky bottom bar (design: docs/design/kitchen-capture-draft.md).
 * The draft is created lazily by the first photo or measurement save (BFF start route), and
 * reloaded from /api on mount and when the browser comes back online. Photos upload one at a
 * time with progress; measurements save on every keypad commit. Offline, every control is
 * disabled and nothing is queued for later.
 */
export function CaptureScreen() {
  const t = useTranslations('capture');
  const router = useRouter();
  const [state, dispatch] = useReducer(captureReducer, INITIAL_CAPTURE_STATE);
  const [unit, setUnit] = useState<MeasurementUnit>('m');
  const [keypadField, setKeypadField] = useState<MeasurementField | null>(null);
  const [activeField, setActiveField] = useState<MeasurementField | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const clientRef = useRef<ApiClient | null>(null);
  const client = () => (clientRef.current ??= createApiClient(`${window.location.origin}/api`));
  const files = useRef(new Map<string, File>());
  const hasDraft = useRef(false);
  const starting = useRef<Promise<boolean> | null>(null);
  const pumping = useRef(false);
  const savingRef = useRef(false);
  const lastFailedSave = useRef<string | null>(null);

  const load = useCallback(async () => {
    const result = await loadDraft(clientRef.current ?? (clientRef.current = createApiClient(`${window.location.origin}/api`)));
    if (result.kind === 'ok') {
      hasDraft.current = true;
      draftMarker('set');
      dispatch({ type: 'connectivity', online: true });
      dispatch({ type: 'draftLoaded', draft: result.value });
    } else if (result.kind === 'missing') {
      const expired = draftMarker('get');
      draftMarker('clear');
      hasDraft.current = false;
      dispatch({ type: 'connectivity', online: navigator.onLine });
      dispatch({ type: 'draftMissing', expired });
    } else {
      dispatch({ type: 'draftMissing', expired: false });
      dispatch({ type: 'connectivity', online: false });
    }
  }, []);

  /** Starts the draft once (a double tap or parallel saves share one call). */
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
    const online = () => {
      lastFailedSave.current = null;
      void load();
    };
    const offline = () => dispatch({ type: 'connectivity', online: false });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [load]);

  // Upload pump: one photo at a time.
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
        uploadPhoto(file, {
          onProgress: (progress) => dispatch({ type: 'uploadProgress', localId, progress }),
          onUploaded: () => dispatch({ type: 'uploadProcessing', localId }),
        });
      let result = (await ensureDraft()) ? await send() : ({ ok: false, code: 'network' } as const);
      if (!result.ok && result.code === 'draft_missing') {
        draftLost();
        if (await ensureDraft()) result = await send();
      }
      // Released before the dispatch, whose re-render runs the pump for the next queued tile.
      pumping.current = false;
      if (result.ok) {
        files.current.delete(localId);
        dispatch({ type: 'uploadSucceeded', localId, photo: result.photo });
      } else {
        dispatch({ type: 'uploadFailed', localId, error: result.code });
        if (result.code === 'network') void load();
      }
    })();
  }, [state, ensureDraft, draftLost, load]);

  // Measurement saves: every keypad commit sends all three values.
  useEffect(() => {
    if (savingRef.current || !canEdit(state) || !needsSave(state)) return;
    const snapshot = state.measurements;
    const key = JSON.stringify(snapshot);
    if (lastFailedSave.current === key) return;
    savingRef.current = true;
    void (async () => {
      dispatch({ type: 'saveStarted' });
      let result = (await ensureDraft()) ? await saveMeasurements(client(), snapshot) : ({ kind: 'offline' } as const);
      if (result.kind === 'missing') {
        draftLost();
        result = (await ensureDraft()) ? await saveMeasurements(client(), snapshot) : ({ kind: 'offline' } as const);
      }
      savingRef.current = false;
      if (result.kind === 'ok') {
        lastFailedSave.current = null;
        const { lengthCm, widthCm, heightCm } = result.value.measurements;
        dispatch({ type: 'saveSucceeded', measurements: { lengthCm: lengthCm ?? null, widthCm: widthCm ?? null, heightCm: heightCm ?? null } });
      } else {
        lastFailedSave.current = key;
        dispatch({ type: 'saveFailed', offline: result.kind === 'offline' });
        if (result.kind === 'offline') void load();
      }
    })();
    // client() is a stable lazy getter.
  }, [state, ensureDraft, draftLost, load]);

  const addFiles = (selected: File[]) => {
    const slots = remainingSlots(stateRef.current);
    const accepted: string[] = [];
    const rejected: Array<{ localId: string; error: ReturnType<typeof precheckPhoto> & string }> = [];
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

  const removePhoto = async (photoId: string) => {
    dispatch({ type: 'photoRemoving', photoId });
    const result = await deletePhoto(client(), photoId);
    if (result.kind === 'ok') {
      dispatch({ type: 'photoRemoved', photoId });
    } else {
      dispatch({ type: 'photoRemoveFailed', photoId });
      dispatch({ type: 'saveFailed', offline: result.kind === 'offline' });
      void load();
    }
  };

  const removeUpload = (localId: string) => {
    files.current.delete(localId);
    dispatch({ type: 'tileRemoved', localId });
  };

  const editable = canEdit(state);
  const ready = canContinue(state);
  const limitReached = remainingSlots(state) === 0;
  const statusVisible = state.save === 'saving' || state.save === 'failed' || state.save === 'offline' || (state.save === 'saved' && ready);

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-md pt-sm pb-lg" data-testid="capture-screen" data-phase={state.phase}>
        {!state.online ? <CaptureAlert kind="offline" message={t('alerts.offline')} /> : null}
        {state.online && state.expiredNotice ? (
          <CaptureAlert kind="expired" message={t('alerts.expired')} dismissLabel={t('alerts.dismiss')} onDismiss={() => dispatch({ type: 'dismissExpired' })} />
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-small leading-5 font-semibold text-text-muted">{t('step', { current: 1, total: 2 })}</p>
            <div className="flex h-1 gap-1" aria-hidden="true">
              <span className="grow rounded-pill bg-primary" />
              <span className="grow rounded-pill bg-border" />
            </div>
          </div>
          <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
          <p className="text-body text-text-muted">{t('helper')}</p>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="capture-photos-title">
          <div className="flex flex-col gap-1">
            <h2 id="capture-photos-title" className="text-[18px] leading-6 font-semibold text-text">
              {t('photos.title')}
            </h2>
            <p className="text-small leading-5 text-text-muted">{t('photos.rules')}</p>
          </div>
          <PhotoGrid
            photos={state.photos}
            uploads={state.uploads}
            removing={state.removing}
            canEdit={editable}
            limitReached={limitReached}
            maxPhotos={MAX_PHOTOS}
            onFiles={addFiles}
            onRemovePhoto={(photoId) => void removePhoto(photoId)}
            onRetryUpload={(localId) => dispatch({ type: 'uploadRetried', localId })}
            onRemoveUpload={removeUpload}
          />
          <p className="flex gap-2 text-small leading-5 text-text-muted">
            <Lightbulb size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="min-w-0 grow">{t('photos.tip')}</span>
          </p>
        </section>

        <MeasurementsSection
          values={state.measurements}
          unit={unit}
          onUnitChange={setUnit}
          onOpen={(field) => {
            setKeypadField(field);
            setActiveField(field);
          }}
          activeField={keypadField ? activeField : null}
          disabled={!editable}
        />
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        {statusVisible ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-small leading-5 text-text-muted" aria-live="polite" data-testid="capture-save-status" data-state={state.save}>
            {state.save === 'saving' ? <Loader size={16} aria-hidden="true" className="shrink-0 animate-spin" /> : null}
            {state.save === 'saved' ? <Check size={16} aria-hidden="true" className="shrink-0 text-success" /> : null}
            {state.save === 'offline' ? <CloudOff size={16} aria-hidden="true" className="shrink-0 text-warning" /> : null}
            {state.save === 'failed' ? <CircleAlert size={16} aria-hidden="true" className="shrink-0 text-danger" /> : null}
            <span>{t(`save.${state.save as 'saving' | 'saved' | 'offline' | 'failed'}`)}</span>
          </p>
        ) : (
          <p id="capture-continue-hint" className="text-center text-small leading-5 text-text-muted" aria-live="polite" data-testid="capture-continue-hint">
            {ready ? '' : t('continueHint')}
          </p>
        )}
        <button
          type="button"
          data-testid="capture-continue"
          aria-disabled={!ready}
          aria-describedby={!ready && !statusVisible ? 'capture-continue-hint' : undefined}
          onClick={() => {
            if (canContinue(stateRef.current)) router.push(MOODBOARD_PATH);
          }}
          className={`flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill px-md py-[14px] text-center text-body font-semibold ${
            ready ? 'bg-primary text-white hover:bg-primary-hover' : 'cursor-not-allowed border border-border bg-surface-muted text-text-muted'
          }`}
        >
          <span>{t('continue')}</span>
          {ready ? <ArrowRight size={20} aria-hidden="true" className="shrink-0" /> : null}
        </button>
      </footer>

      <MeasurementKeypad
        openField={keypadField}
        unit={unit}
        values={state.measurements}
        onCommit={(field, cm) => {
          lastFailedSave.current = null;
          dispatch({ type: 'measurementCommitted', field, cm });
        }}
        onActiveFieldChange={setActiveField}
        onClose={() => setKeypadField(null)}
      />
    </>
  );
}
