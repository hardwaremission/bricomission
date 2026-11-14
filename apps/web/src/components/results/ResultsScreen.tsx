'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RefreshCw, Sparkles } from 'lucide-react';
import { createApiClient, type ApiClient } from '@bricomission/api-client';
import { loadProject } from '../../lib/kitchen-draft/project-client';
import { createRender, loadRender, loadRenders } from '../../lib/renders/render-client';
import {
  activeRender,
  canStart,
  consumeStartParam,
  historyRenders,
  INITIAL_RESULTS_STATE,
  jobsAhead,
  keptCount,
  limitReached,
  nextPhotoId,
  photoNumber,
  resultsPhase,
  resultsReducer,
  shownRender,
  startPolling,
} from '../../lib/renders/render-state';
import { GenerateAlert } from '../generate/GenerateAlert';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { PhotoPicker } from './PhotoPicker';
import { RenderHistory } from './RenderHistory';
import { RenderStatusCard } from './RenderStatusCard';

const MAIN_CLASS = 'flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg';
const PRIMARY = 'bg-primary text-white hover:bg-primary-hover';
const DISABLED = 'cursor-not-allowed border border-border bg-surface-muted text-text-muted';

/**
 * AI Results, render section (docs/design/controlnet-render.md): queued/running placeholder with
 * the 2 s poll, the before/after slider, the photo picker, the history strip and the
 * "Generate again" / "Try again" CTA. `?start=1` (after the Generate claim or from the owned
 * page) starts one Render on load; the server's one-active rule prevents a double start. The
 * HTML is the same for everyone: the project and its Renders load on the client via /api.
 */
export function ResultsScreen({ projectId }: { projectId: string }) {
  const t = useTranslations('results');
  const tProject = useTranslations('project');
  const tStyles = useTranslations('moodboard.styles');
  const [state, dispatch] = useReducer(resultsReducer, INITIAL_RESULTS_STATE);
  const clientRef = useRef<ApiClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createApiClient(`${window.location.origin}/api`)), []);
  const autoStart = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshRenders = useCallback(async () => {
    const list = await loadRenders(client(), projectId);
    if (list.kind === 'ok') dispatch({ type: 'rendersLoaded', renders: list.value.renders, maxRenders: list.value.maxRenders });
  }, [client, projectId]);

  const start = useCallback(
    async (photoId: string | null) => {
      dispatch({ type: 'startRequested' });
      const result = await createRender(client(), projectId, photoId ?? undefined);
      switch (result.kind) {
        case 'ok':
          dispatch({ type: 'startFinished', render: result.value });
          return;
        case 'queueFull':
          dispatch({ type: 'startFinished', render: null, alert: 'queueFull' });
          return;
        case 'conflict':
          // Another tab started one, or the limit was reached: show the server's view.
          dispatch({ type: 'startFinished', render: null, alert: result.code === 'render_in_progress' || result.code === 'render_limit_reached' ? 'none' : 'startFailed' });
          await refreshRenders();
          return;
        case 'signedOut':
          dispatch({ type: 'loadFailed', kind: 'signedOut' });
          return;
        case 'notFound':
          dispatch({ type: 'loadFailed', kind: 'notFound' });
          return;
        case 'offline':
          dispatch({ type: 'startFinished', render: null });
          dispatch({ type: 'connectivity', online: false });
          return;
        default:
          dispatch({ type: 'startFinished', render: null, alert: 'startFailed' });
      }
    },
    [client, projectId, refreshRenders],
  );

  const load = useCallback(async () => {
    if (!navigator.onLine) {
      dispatch({ type: 'connectivity', online: false });
      return;
    }
    const [project, renders] = await Promise.all([loadProject(client(), projectId), loadRenders(client(), projectId)]);
    if (project.kind === 'signedOut' || renders.kind === 'signedOut') return dispatch({ type: 'loadFailed', kind: 'signedOut' });
    if (project.kind === 'notFound' || project.kind === 'missing' || renders.kind === 'notFound') return dispatch({ type: 'loadFailed', kind: 'notFound' });
    if (project.kind !== 'ok' || renders.kind !== 'ok') return dispatch({ type: 'connectivity', online: false });
    dispatch({ type: 'connectivity', online: true });
    dispatch({ type: 'loaded', project: project.value, renders: renders.value.renders, maxRenders: renders.value.maxRenders });
    if (autoStart.current) {
      autoStart.current = false;
      if (!renders.value.renders.some((render) => render.status === 'queued' || render.status === 'running')) void start(null);
    }
  }, [client, projectId, start]);

  // Initial load, `?start=1`, and connectivity.
  useEffect(() => {
    const { start: wantsStart, changed } = consumeStartParam(window.location.search);
    autoStart.current = wantsStart;
    if (changed) window.history.replaceState(window.history.state, '', window.location.pathname);
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

  // Poll the active Render every 2 s while online.
  const activeId = activeRender(state)?.id ?? null;
  useEffect(() => {
    if (!activeId || !state.online) return;
    const poller = startPolling({
      fetchOnce: async () => {
        const result = await loadRender(client(), projectId, activeId);
        if (result.kind === 'ok') return result.value;
        if (result.kind === 'signedOut' || result.kind === 'notFound') dispatch({ type: 'loadFailed', kind: result.kind });
        return null;
      },
      onRender: (render) => dispatch({ type: 'renderUpdated', render }),
    });
    return () => poller.stop();
  }, [activeId, state.online, client, projectId]);

  if (state.load === 'signedOut') {
    const href = `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${projectId}/results`)}`;
    return (
      <main className={MAIN_CLASS} data-testid="results-signed-out">
        <h1 className="text-h1 font-bold text-text">{tProject('signedOut.title')}</h1>
        <a
          href={href}
          data-testid="results-sign-in"
          className="flex min-h-[52px] w-full items-center justify-center rounded-pill bg-primary px-md py-[14px] text-center text-body font-semibold text-white hover:bg-primary-hover"
        >
          {tProject('signedOut.signIn')}
        </a>
      </main>
    );
  }

  if (state.load === 'notFound') {
    return (
      <main className={MAIN_CLASS} data-testid="results-not-found">
        <h1 className="text-h1 font-bold text-text">{tProject('notFound.title')}</h1>
        <Link href="/" prefetch={false} data-testid="results-home" className="flex h-11 shrink-0 items-center text-small leading-5 font-semibold text-primary underline">
          {tProject('notFound.home')}
        </Link>
      </main>
    );
  }

  const phase = resultsPhase(state);
  const project = state.project;
  const active = activeRender(state);
  const shown = shownRender(state);
  const current = active ?? shown;
  const photos = project?.photos ?? [];
  const photoOf = (photoId: string | null | undefined) => photos.find((photo) => photo.id === photoId) ?? photos[0] ?? null;
  const helperValues = {
    style: tStyles(current?.styleId ?? 'modern'),
    n: photoNumber(state, current?.photoId ?? (phase === 'active' ? nextPhotoId(state) : state.photoId)),
  };
  const busy = phase === 'active';
  const pickerDisabled = busy || !state.online;
  const limit = limitReached(state) && !busy;
  const enabled = canStart(state);
  const history = historyRenders(state);
  const chronological = [...state.renders].reverse();
  const ctaLabel = phase === 'failed' ? t('cta.retry') : phase === 'empty' ? t('cta.generate') : t('cta.again');
  const CtaIcon = phase === 'empty' ? Sparkles : RefreshCw;
  const hintId = 'results-hint';
  const hint = busy ? t('hints.oneAtATime') : limit ? t('hints.limit', { max: state.maxRenders }) : null;

  return (
    <>
      <main className={MAIN_CLASS} data-testid="results-screen" data-phase={phase}>
        {!state.online ? <GenerateAlert tone="warning" message={t('alerts.offline')} testId="results-offline" /> : null}
        {state.online && state.alert === 'queueFull' ? <GenerateAlert tone="warning" message={t('alerts.queueFull')} testId="results-queue-full" /> : null}
        {state.online && state.alert === 'startFailed' ? <GenerateAlert tone="danger" message={t('alerts.failed')} testId="results-failed" /> : null}
        {phase === 'failed' && state.alert === 'none' ? (
          <GenerateAlert tone="danger" message={t(shown?.errorCode === 'interrupted' ? 'alerts.interrupted' : 'alerts.failed')} testId="results-failed" />
        ) : null}
        {current && current.styleId === null && phase !== 'loading' ? <GenerateAlert tone="info" message={t('alerts.uploadsOnly')} testId="results-uploads-only" /> : null}

        <section className="flex flex-col gap-sm">
          <h1 className="text-h1 font-bold text-text">{phase === 'succeeded' ? t('titleDone') : t('titleActive')}</h1>
          {phase === 'loading' ? null : (
            <p className="text-body text-text-muted" data-testid="results-helper">
              {phase === 'succeeded' ? t('helperDone', helperValues) : busy ? t('helperActive', helperValues) : t('helperIdle', helperValues)}
            </p>
          )}
        </section>

        {phase === 'succeeded' && shown?.fullUrl ? (
          <BeforeAfterSlider
            key={shown.id}
            beforeSrc={`/api${shown.beforeUrl}`}
            afterSrc={`/api${shown.fullUrl}`}
            width={shown.width}
            height={shown.height}
            labels={{ slider: t('slider.label'), before: t('slider.before'), after: t('slider.after'), beforeAlt: t('slider.beforeAlt'), afterAlt: t('slider.afterAlt') }}
          />
        ) : null}
        {phase === 'active' ? (
          <RenderStatusCard
            photoSrc={active ? `/api${active.beforeUrl}` : photoOf(nextPhotoId(state)) ? `/api${photoOf(nextPhotoId(state))?.thumbUrl}` : null}
            width={active?.width ?? 1216}
            height={active?.height ?? 832}
            status={active?.status === 'queued' ? 'queued' : 'running'}
            label={active?.status === 'queued' ? t('status.queued') : t('status.running')}
            aheadLabel={jobsAhead(active) !== null ? t('status.ahead', { count: jobsAhead(active) ?? 0 }) : null}
          />
        ) : null}
        {phase === 'failed' && shown ? (
          <div className="relative w-full overflow-hidden rounded-lg bg-surface-muted" style={{ aspectRatio: `${shown.width} / ${shown.height}` }}>
            <img src={`/api${shown.beforeUrl}`} alt={t('slider.beforeAlt')} data-testid="results-before-only" className="absolute inset-0 size-full object-cover" />
          </div>
        ) : null}
        {phase === 'empty' && photoOf(state.photoId) ? (
          <div className="relative w-full overflow-hidden rounded-lg bg-surface-muted" style={{ aspectRatio: '4 / 3' }}>
            <img src={`/api${photoOf(state.photoId)?.fullUrl}`} alt={t('slider.beforeAlt')} className="absolute inset-0 size-full object-cover" />
          </div>
        ) : null}
        {busy ? <p className="text-small leading-5 text-text-muted">{t('note')}</p> : null}

        {photos.length >= 2 && phase !== 'loading' ? (
          <PhotoPicker
            photos={photos}
            selectedId={state.photoId}
            disabled={pickerDisabled}
            onSelect={(photoId) => dispatch({ type: 'photoSelected', photoId })}
            title={t('photos.title')}
            helper={t('photos.helper')}
            optionLabel={(n) => t('photos.option', { n })}
          />
        ) : null}
        {history.length > 0 ? (
          <RenderHistory
            renders={history.map((render) => ({ id: render.id, thumbUrl: render.thumbUrl, number: chronological.findIndex((r) => r.id === render.id) + 1 }))}
            shownId={phase === 'succeeded' ? state.shownId : null}
            disabled={busy}
            onShow={(renderId) => dispatch({ type: 'renderShown', renderId })}
            title={t('history.title')}
            counter={t('history.counter', { count: keptCount(state), max: state.maxRenders })}
            itemLabel={(n) => t('history.item', { n })}
          />
        ) : null}
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        {hint ? (
          <p id={hintId} data-testid="results-hint" className="text-center text-small leading-5 text-text-muted">
            {hint}
          </p>
        ) : null}
        <button
          type="button"
          data-testid={phase === 'failed' ? 'results-retry' : phase === 'empty' ? 'results-start' : 'results-again'}
          aria-disabled={!enabled}
          aria-describedby={hint ? hintId : undefined}
          onClick={() => enabled && void start(nextPhotoId(stateRef.current))}
          className={`flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill px-md py-[13px] text-center text-body font-semibold ${enabled ? PRIMARY : DISABLED}`}
        >
          <CtaIcon size={20} aria-hidden="true" className="shrink-0" />
          <span>{ctaLabel}</span>
        </button>
        {busy ? null : (
          <Link
            href={`/kitchen-projects/${projectId}`}
            prefetch={false}
            data-testid="results-back-project"
            className="flex min-h-[52px] w-full items-center justify-center rounded-pill border border-border bg-surface px-md py-[13px] text-center text-body font-semibold text-primary"
          >
            {t('cta.back')}
          </Link>
        )}
      </footer>
    </>
  );
}
