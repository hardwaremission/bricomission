'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RefreshCw, Sparkles } from 'lucide-react';
import { createApiClient, type ApiClient } from '@bricomission/api-client';
import { loadProject } from '../../lib/kitchen-draft/project-client';
import { consumeStartParam, startPolling } from '../../lib/renders/render-state';
import { createSimulation, loadSimulation, loadSimulations, retryRender, type StartSimulationResult } from '../../lib/simulations/simulation-client';
import {
  activeSimulation,
  activeStage,
  canRetry,
  canStart,
  failedRenders,
  INITIAL_RESULTS_STATE,
  isInterrupted,
  jobsAhead,
  photoNumber,
  progressNumbers,
  resultsPhase,
  resultsReducer,
  shownRender,
  shownSimulation,
  styleSources,
} from '../../lib/simulations/simulation-state';
import { GenerateAlert } from '../generate/GenerateAlert';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { PhotoPicker } from './PhotoPicker';
import { SimulationHistory } from './SimulationHistory';
import { SimulationStatusCard } from './SimulationStatusCard';
import { SimulationTiles } from './SimulationTiles';

const MAIN_CLASS = 'flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg';
const PRIMARY = 'bg-primary text-white hover:bg-primary-hover';
const DISABLED = 'cursor-not-allowed border border-border bg-surface-muted text-text-muted';

/**
 * AI Results (docs/design/simulations-ux-overhaul.md, S3 to S6): one Simulation = one Render per
 * photo from one calculated style. Describing and rendering show "n of N" with per-photo tiles
 * (2 s poll of the Simulation); a finished Simulation shows the before/after slider (its position
 * is page state and survives switching Render or Simulation), the photo grid with Retry on failed
 * Renders, and the grouped history. `?start=1` (after the Generate claim or from the owned page)
 * starts one Simulation on load; the server's one-active rule prevents a double start. The HTML is
 * the same for everyone: the project and its Simulations load on the client via /api.
 */
export function ResultsScreen({ projectId }: { projectId: string }) {
  const t = useTranslations('results');
  const tProject = useTranslations('project');
  const tStyles = useTranslations('moodboard.styles');
  const [state, dispatch] = useReducer(resultsReducer, INITIAL_RESULTS_STATE);
  const clientRef = useRef<ApiClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createApiClient(`${window.location.origin}/api`)), []);
  const autoStart = useRef(false);
  /** `?simulation=<id>` (Open on the project page): the Simulation to show first. */
  const wantedSimulation = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    const list = await loadSimulations(client(), projectId);
    if (list.kind === 'ok') dispatch({ type: 'simulationsLoaded', simulations: list.value });
  }, [client, projectId]);

  /** Shared outcome of Generate and Retry. */
  const settle = useCallback(
    async (result: StartSimulationResult) => {
      switch (result.kind) {
        case 'ok':
          dispatch({ type: 'startFinished', simulation: result.value });
          return;
        case 'queueFull':
          dispatch({ type: 'startFinished', simulation: null, alert: 'queueFull' });
          return;
        case 'conflict':
          // Another tab started one: show the server's view.
          dispatch({ type: 'startFinished', simulation: null, alert: result.code === 'simulation_in_progress' ? 'none' : 'startFailed' });
          await refresh();
          return;
        case 'signedOut':
          dispatch({ type: 'loadFailed', kind: 'signedOut' });
          return;
        case 'notFound':
          dispatch({ type: 'loadFailed', kind: 'notFound' });
          return;
        case 'offline':
          dispatch({ type: 'startFinished', simulation: null });
          dispatch({ type: 'connectivity', online: false });
          return;
        default:
          dispatch({ type: 'startFinished', simulation: null, alert: 'startFailed' });
      }
    },
    [refresh],
  );

  const start = useCallback(async () => {
    dispatch({ type: 'startRequested' });
    await settle(await createSimulation(client(), projectId));
  }, [client, projectId, settle]);

  const retry = useCallback(
    async (renderId: string, rest: string[] = []) => {
      dispatch({ type: 'startRequested' });
      dispatch({ type: 'retryQueued', renderIds: rest });
      await settle(await retryRender(client(), projectId, renderId));
    },
    [client, projectId, settle],
  );

  const load = useCallback(async () => {
    if (!navigator.onLine) {
      dispatch({ type: 'connectivity', online: false });
      return;
    }
    const [project, simulations] = await Promise.all([loadProject(client(), projectId), loadSimulations(client(), projectId)]);
    if (project.kind === 'signedOut' || simulations.kind === 'signedOut') return dispatch({ type: 'loadFailed', kind: 'signedOut' });
    if (project.kind === 'notFound' || project.kind === 'missing' || simulations.kind === 'notFound') return dispatch({ type: 'loadFailed', kind: 'notFound' });
    if (project.kind !== 'ok' || simulations.kind !== 'ok') return dispatch({ type: 'connectivity', online: false });
    dispatch({ type: 'connectivity', online: true });
    dispatch({ type: 'loaded', project: project.value, simulations: simulations.value });
    if (wantedSimulation.current) {
      const wanted = simulations.value.find((simulation) => simulation.id === wantedSimulation.current);
      wantedSimulation.current = null;
      if (wanted && wanted.status !== 'active') dispatch({ type: 'simulationShown', simulationId: wanted.id });
    }
    if (autoStart.current) {
      autoStart.current = false;
      if (!simulations.value.some((simulation) => simulation.status === 'active')) void start();
    }
  }, [client, projectId, start]);

  // Initial load, `?start=1`, and connectivity.
  useEffect(() => {
    const { start: wantsStart, changed } = consumeStartParam(window.location.search);
    autoStart.current = wantsStart;
    wantedSimulation.current ??= new URLSearchParams(window.location.search).get('simulation');
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

  // Poll the active Simulation every 2 s while online; it pauses offline and resumes on reconnect.
  const activeId = activeSimulation(state)?.id ?? null;
  useEffect(() => {
    if (!activeId || !state.online) return;
    const poller = startPolling({
      fetchOnce: async () => {
        const result = await loadSimulation(client(), projectId, activeId);
        if (result.kind === 'ok') return result.value;
        if (result.kind === 'signedOut' || result.kind === 'notFound') dispatch({ type: 'loadFailed', kind: result.kind });
        return null;
      },
      onRender: (simulation) => dispatch({ type: 'simulationUpdated', simulation }),
    });
    return () => poller.stop();
  }, [activeId, state.online, client, projectId]);

  // "Try again" retries every failed Render, one after the other (the API runs one at a time).
  useEffect(() => {
    if (state.load !== 'ready' || !state.online || activeId || state.starting || state.retryQueue.length === 0) return;
    const [next, ...rest] = state.retryQueue;
    const stillFailed = state.simulations.flatMap((simulation) => simulation.renders).some((render) => render.id === next && render.status === 'failed');
    if (!stillFailed) {
      dispatch({ type: 'retryShifted' });
      return;
    }
    void retry(next ?? '', rest);
  }, [state.load, state.online, state.starting, state.retryQueue, state.simulations, activeId, retry]);

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
  const active = activeSimulation(state);
  const shown = shownSimulation(state);
  const current = active ?? shown;
  const render = shownRender(state);
  const photoCount = project?.photos.length ?? 0;
  const busy = phase === 'active';
  const enabled = canStart(state);
  const retryEnabled = canRetry(state);
  const failed = failedRenders(shown);
  const stage = activeStage(active);
  const progress = active ? progressNumbers(active) : { n: 1, count: photoCount, percent: 0 };
  const count = current?.renders.length || photoCount;

  const sourcesText = (simulation: NonNullable<typeof current>, mode: 'count' | 'names') => {
    const { styles, uploads } = styleSources(simulation);
    const parts: string[] = [];
    if (styles.length > 0) parts.push(mode === 'names' ? styles.map((id) => tStyles(id)).join(', ') : t('sources.gallery', { count: styles.length }));
    if (uploads > 0) parts.push(t('sources.own', { count: uploads }));
    return parts.length === 2 ? t('sources.join', { first: parts[0] ?? '', second: parts[1] ?? '' }) : (parts[0] ?? '');
  };
  const helper = (() => {
    if (phase === 'loading' || phase === 'empty' || !current) return null;
    const sources = sourcesText(current, busy ? 'count' : 'names');
    if (busy) return sources ? t('helperActive', { sources, count }) : t('helperActiveBare', { count });
    if (!render) return null;
    const values = { sources, i: photoNumber(render), count };
    return sources ? t('helperDone', values) : t('helperDoneBare', values);
  })();

  let hint: string | null = null;
  if (busy) hint = t('hints.oneAtATime');
  else if (!state.online) hint = t('hints.offline');
  const ctaPhase = phase === 'failed' ? 'retry' : phase === 'empty' ? 'start' : 'again';
  const ctaLabel = ctaPhase === 'retry' ? t('cta.retry') : ctaPhase === 'start' ? t('cta.generate') : t('cta.again');
  const CtaIcon = ctaPhase === 'start' ? Sparkles : RefreshCw;
  const onCta = () => {
    if (ctaPhase === 'retry') {
      const ids = failedRenders(shownSimulation(stateRef.current)).map((candidate) => candidate.id);
      if (ids[0]) void retry(ids[0], ids.slice(1));
      return;
    }
    void start();
  };
  const ctaEnabled = ctaPhase === 'retry' ? retryEnabled && failed.length > 0 : enabled;
  const hintId = 'results-hint';

  return (
    <>
      <main className={MAIN_CLASS} data-testid="results-screen" data-phase={phase} data-simulation={current?.ordinal}>
        {!state.online ? <GenerateAlert tone="warning" message={t('alerts.offline')} testId="results-offline" /> : null}
        {state.online && state.alert === 'queueFull' ? <GenerateAlert tone="warning" message={t('alerts.queueFull')} testId="results-queue-full" /> : null}
        {state.online && state.alert === 'startFailed' ? <GenerateAlert tone="danger" message={t('alerts.failed')} testId="results-failed" /> : null}
        {phase === 'failed' && state.alert === 'none' ? (
          <GenerateAlert tone="danger" message={t(isInterrupted(shown) ? 'alerts.interrupted' : 'alerts.failed')} testId="results-failed" />
        ) : null}
        {phase === 'partial' && shown ? <GenerateAlert tone="info" message={t('alerts.partial', { failed: failed.length, count })} testId="results-partial" /> : null}

        <section className="flex flex-col gap-sm">
          <h1 className="text-h1 font-bold text-text">{busy || phase === 'loading' || phase === 'empty' ? t('titleActive') : t('titleDone', { n: shown?.ordinal ?? 1 })}</h1>
          {helper ? (
            <p className="text-body text-text-muted" data-testid="results-helper">
              {helper}
            </p>
          ) : null}
          {current?.styleDegraded && !busy && phase !== 'empty' ? (
            <p className="text-small leading-5 text-text-muted" data-testid="results-degraded">
              {t('alerts.degraded')}
            </p>
          ) : null}
        </section>

        {(phase === 'succeeded' || phase === 'partial') && render?.fullUrl ? (
          <BeforeAfterSlider
            beforeSrc={`/api${render.beforeUrl}`}
            afterSrc={`/api${render.fullUrl}`}
            width={render.width}
            height={render.height}
            value={state.sliderValue}
            onChange={(value) => dispatch({ type: 'sliderMoved', value })}
            labels={{ slider: t('slider.label'), before: t('slider.before'), after: t('slider.after'), beforeAlt: t('slider.beforeAlt'), afterAlt: t('slider.afterAlt') }}
          />
        ) : null}
        {busy ? (
          <SimulationStatusCard
            stage={stage}
            label={stage === 'describing' ? t('status.describing') : stage === 'queued' ? t('status.queued') : t('status.rendering', { n: progress.n, count: progress.count })}
            percent={progress.percent}
            percentLabel={t('status.percent', { percent: progress.percent })}
            aheadLabel={jobsAhead(active) !== null ? t('status.ahead', { count: jobsAhead(active) ?? 0 }) : null}
          />
        ) : null}
        {busy && active ? <SimulationTiles renders={active.renders} label={(n) => t('tile.photo', { n })} failedLabel={(n) => t('tile.failed', { n })} /> : null}
        {phase === 'failed' && shown?.renders[0] ? (
          <div className="relative w-full overflow-hidden rounded-lg bg-surface-muted" style={{ aspectRatio: `${shown.renders[0].width} / ${shown.renders[0].height}` }}>
            <img src={`/api${shown.renders[0].beforeUrl}`} alt={t('slider.beforeAlt')} data-testid="results-before-only" className="absolute inset-0 size-full object-cover" />
          </div>
        ) : null}
        {phase === 'empty' && project?.photos[0] ? (
          <div className="relative w-full overflow-hidden rounded-lg bg-surface-muted" style={{ aspectRatio: '4 / 3' }}>
            <img src={`/api${project.photos[0].fullUrl}`} alt={t('slider.beforeAlt')} className="absolute inset-0 size-full object-cover" />
          </div>
        ) : null}
        {busy ? <p className="text-small leading-5 text-text-muted">{t('note')}</p> : null}

        {shown && !busy && (phase === 'succeeded' || phase === 'partial' || phase === 'failed') ? (
          <PhotoPicker
            renders={shown.renders}
            shownId={state.shownRenderId}
            retryDisabled={!retryEnabled}
            onShow={(renderId) => dispatch({ type: 'renderShown', renderId })}
            onRetry={(renderId) => void retry(renderId)}
            title={t('photos.title')}
            helper={t('photos.helper')}
            optionLabel={(n) => t('photos.option', { n })}
            failedLabel={(n) => t('tile.failed', { n })}
            retryText={t('tile.retry')}
            retryLabel={(n) => t('tile.retryPhoto', { n })}
          />
        ) : null}
        {state.simulations.length > 0 && phase !== 'loading' ? (
          <SimulationHistory
            simulations={state.simulations}
            shownId={state.shownSimulationId}
            disabled={busy}
            onShow={(simulationId) => dispatch({ type: 'simulationShown', simulationId })}
            title={t('history.title')}
            counter={t('history.counter', { count: state.simulations.length })}
            itemTitle={(n) => t('history.item', { n })}
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
          data-testid={`results-${ctaPhase === 'retry' ? 'retry' : ctaPhase === 'start' ? 'start' : 'again'}`}
          aria-disabled={!ctaEnabled}
          aria-describedby={hint ? hintId : undefined}
          onClick={() => ctaEnabled && onCta()}
          className={`flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill px-md py-[13px] text-center text-body font-semibold ${ctaEnabled ? PRIMARY : DISABLED}`}
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
