'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader, Plus, ReceiptText, Sparkles } from 'lucide-react';
import { createApiClient, type ApiClient } from '@bricomission/api-client';
import { loadProject, type ProjectLoad } from '../../lib/kitchen-draft/project-client';
import { startPolling } from '../../lib/renders/render-state';
import { activeSimulation, budgetButton, editBlock, hasActiveBudget, projectReady, selectedSimulation, withoutSimulation, withSelection } from '../../lib/simulations/project-simulations';
import { deleteSimulation, loadSimulations, selectSimulation } from '../../lib/simulations/simulation-client';
import type { SimulationView } from '../../lib/simulations/simulation-state';
import { MySimulations } from '../simulations/MySimulations';
import { GenerateAlert } from './GenerateAlert';
import { OwnedProjectSummary } from './OwnedProjectSummary';

const MAIN_CLASS = 'flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg';
const PRIMARY = 'flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill bg-primary px-md py-[13px] text-center text-body font-semibold text-white hover:bg-primary-hover';
const SECONDARY = 'flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill border border-border bg-surface px-md py-[13px] text-center text-body font-semibold text-primary';
const DISABLED =
  'flex min-h-[52px] w-full cursor-not-allowed items-center justify-center gap-sm rounded-pill border border-border bg-surface-muted px-md py-[13px] text-center text-body font-semibold text-text-muted';

/**
 * Owned Kitchen Project (docs/design/simulations-ux-overhaul.md, S7 and S8, extending
 * docs/design/login-gate-claim.md frame 5): the summary card with the three edit entries, "My
 * simulations" (open, select, delete through the API; polled every 2 s while a Simulation or Budget
 * is active) and the bottom bar: `Get my budget` / `See my budget` (needs a selected, fully
 * succeeded Simulation) and `Generate more simulations` / `Generate my kitchen`. Signed out: a
 * sign-in prompt that returns here. Unknown or another Account's project: not found.
 */
export function OwnedProjectScreen({ projectId }: { projectId: string }) {
  const t = useTranslations('project');
  const tGen = useTranslations('generate');
  const tResults = useTranslations('results');
  const [result, setResult] = useState<ProjectLoad | null>(null);
  const [simulations, setSimulations] = useState<SimulationView[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [alert, setAlert] = useState<'none' | 'failed'>('none');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const clientRef = useRef<ApiClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createApiClient(`${window.location.origin}/api`)), []);

  const load = useCallback(async () => {
    if (!navigator.onLine) return setResult({ kind: 'offline' });
    const [project, list] = await Promise.all([loadProject(client(), projectId), loadSimulations(client(), projectId)]);
    if (list.kind === 'signedOut') return setResult({ kind: 'signedOut' });
    if (list.kind === 'notFound' && project.kind === 'ok') return setResult({ kind: 'notFound' });
    setResult(project);
    if (list.kind === 'ok') {
      setSimulations(list.value);
      setListLoaded(true);
    }
  }, [client, projectId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('claimed') === '1') {
      setClaimed(true);
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    setOnline(navigator.onLine);
    void load();
    const goOnline = () => {
      setOnline(true);
      void load();
    };
    const goOffline = () => {
      setOnline(false);
      setResult((current) => (current?.kind === 'ok' ? current : { kind: 'offline' }));
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [load]);

  // Poll the list every 2 s while a Simulation or a Budget is active; it pauses offline.
  const polling = online && (activeSimulation(simulations) !== null || hasActiveBudget(simulations));
  useEffect(() => {
    if (!polling) return;
    const poller = startPolling<{ status: string; list: SimulationView[] }>({
      fetchOnce: async () => {
        const list = await loadSimulations(client(), projectId);
        if (list.kind === 'signedOut' || list.kind === 'notFound') {
          setResult({ kind: list.kind });
          return null;
        }
        if (list.kind !== 'ok') return null;
        return { status: activeSimulation(list.value) || hasActiveBudget(list.value) ? 'active' : 'done', list: list.value };
      },
      onRender: ({ list }) => setSimulations(list),
    });
    return () => poller.stop();
  }, [polling, client, projectId]);

  /** Shared outcome of a refused or failed select/delete call: reload what the server says. */
  const settleFailure = useCallback(
    async (kind: string) => {
      if (kind === 'signedOut' || kind === 'notFound') return setResult({ kind } as ProjectLoad);
      if (kind === 'notReady' || kind === 'inProgress') {
        await load();
        return;
      }
      setAlert('failed');
    },
    [load],
  );

  const onSelect = useCallback(
    async (simulation: SimulationView) => {
      setAlert('none');
      setPendingId(simulation.id);
      const outcome = await selectSimulation(client(), projectId, simulation.id);
      if (outcome.kind === 'ok') setSimulations((current) => withSelection(current, outcome.selectedSimulationId));
      else await settleFailure(outcome.kind);
      setPendingId(null);
    },
    [client, projectId, settleFailure],
  );

  const onDelete = useCallback(
    async (simulation: SimulationView) => {
      setAlert('none');
      setPendingId(simulation.id);
      const outcome = await deleteSimulation(client(), projectId, simulation.id);
      if (outcome.kind === 'ok') setSimulations((current) => withoutSimulation(current, simulation.id));
      else await settleFailure(outcome.kind);
      setPendingId(null);
    },
    [client, projectId, settleFailure],
  );

  const kind = result?.kind ?? 'loading';

  if (kind === 'signedOut') {
    const href = `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${projectId}`)}`;
    return (
      <main className={MAIN_CLASS} data-testid="project-signed-out">
        <h1 className="text-h1 font-bold text-text">{t('signedOut.title')}</h1>
        <a
          href={href}
          data-testid="project-sign-in"
          className="flex min-h-[52px] w-full items-center justify-center rounded-pill bg-primary px-md py-[14px] text-center text-body font-semibold text-white hover:bg-primary-hover"
        >
          {t('signedOut.signIn')}
        </a>
      </main>
    );
  }

  if (kind === 'notFound' || kind === 'missing') {
    return (
      <main className={MAIN_CLASS} data-testid="project-not-found">
        <h1 className="text-h1 font-bold text-text">{t('notFound.title')}</h1>
        <Link href="/" prefetch={false} data-testid="project-home" className="flex h-11 shrink-0 items-center text-small leading-5 font-semibold text-primary underline">
          {t('notFound.home')}
        </Link>
      </main>
    );
  }

  const project = result?.kind === 'ok' ? result.value : null;
  const offline = kind === 'offline' || kind === 'error';
  const ready = project !== null && listLoaded;
  const block = editBlock(simulations);
  const active = activeSimulation(simulations);
  const button = budgetButton(simulations);
  const selected = selectedSimulation(simulations);
  const hasSimulations = simulations.length > 0;
  const canGenerate = ready && online && !active && projectReady(project);
  const budgetHref = `/kitchen-projects/${projectId}/budget`;
  const generateHref = `/kitchen-projects/${projectId}/results?start=1`;
  const generateReason = !ready ? null : active ? tResults('hints.oneAtATime') : !online ? tResults('hints.offline') : !projectReady(project) ? tGen('hints.capture') : null;
  const budgetLabel = button.kind === 'see' || button.kind === 'computing' ? t('seeBudget') : tGen('cta.budget');
  const budgetIcon =
    button.kind === 'computing' ? <Loader size={20} aria-hidden="true" className="shrink-0 animate-spin" /> : <ReceiptText size={20} aria-hidden="true" className="shrink-0" />;

  const generateButton = (primary: boolean) => {
    const label = hasSimulations ? t('generateMore') : tGen('cta.render');
    const content = (
      <>
        <Sparkles size={20} aria-hidden="true" className="shrink-0" />
        <span>{label}</span>
      </>
    );
    return canGenerate ? (
      <Link href={generateHref} prefetch={false} data-testid="project-render" className={primary ? PRIMARY : SECONDARY}>
        {content}
      </Link>
    ) : (
      <button type="button" data-testid="project-render" aria-disabled="true" aria-describedby={generateReason ? 'project-generate-reason' : undefined} className={DISABLED}>
        {content}
      </button>
    );
  };

  return (
    <>
      <main className={MAIN_CLASS} data-testid="project-screen" data-state={kind} data-selected={selected?.ordinal}>
        {offline ? <GenerateAlert tone="danger" message={t('offline')} testId="project-offline" /> : null}
        {claimed && project ? <GenerateAlert tone="success" message={t('claimed')} testId="project-claimed" onDismiss={() => setClaimed(false)} dismissLabel={t('dismiss')} /> : null}
        {alert === 'failed' ? (
          <GenerateAlert tone="danger" message={t('actionFailed')} testId="project-action-failed" onDismiss={() => setAlert('none')} dismissLabel={t('dismiss')} />
        ) : null}
        <section className="flex flex-col gap-sm">
          <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
          <p className="text-body text-text-muted">{t('helper')}</p>
        </section>
        {project ? (
          <div className="flex flex-col gap-2">
            <OwnedProjectSummary project={project} projectId={projectId} editable={block === null && online} />
            {block ? (
              <p data-testid="project-edit-hint" className="text-small leading-5 text-text-muted">
                {t(block === 'budget' ? 'edit.blockedBudget' : 'edit.blockedSimulation')}
              </p>
            ) : null}
          </div>
        ) : null}
        {ready ? <MySimulations simulations={simulations} projectId={projectId} pendingId={pendingId} onSelect={(simulation) => void onSelect(simulation)} onDelete={onDelete} /> : null}
        <Link
          href="/kitchen-projects/new"
          prefetch={false}
          data-testid="project-new"
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 text-small leading-5 font-semibold text-primary underline"
        >
          <Plus size={16} aria-hidden="true" />
          <span>{t('newProject')}</span>
        </Link>
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        {hasSimulations || !ready ? (
          <>
            {button.kind === 'disabled' ? (
              <p id="project-budget-reason" data-testid="project-budget-reason" className="text-center text-small leading-5 text-text-muted">
                {t('budgetReason')}
              </p>
            ) : null}
            {button.kind === 'disabled' ? (
              <button type="button" data-testid="project-budget" aria-disabled="true" aria-describedby="project-budget-reason" className={DISABLED}>
                {budgetIcon}
                <span>{budgetLabel}</span>
              </button>
            ) : (
              <Link href={button.kind === 'get' ? `${budgetHref}?start=1` : budgetHref} prefetch={false} data-testid="project-budget" data-state={button.kind} className={PRIMARY}>
                {budgetIcon}
                <span>{budgetLabel}</span>
              </Link>
            )}
            {generateReason && hasSimulations ? (
              <p id="project-generate-reason" data-testid="project-generate-reason" className="text-center text-small leading-5 text-text-muted">
                {generateReason}
              </p>
            ) : null}
            {generateButton(false)}
          </>
        ) : (
          <>
            {generateReason ? (
              <p id="project-generate-reason" data-testid="project-generate-reason" className="text-center text-small leading-5 text-text-muted">
                {generateReason}
              </p>
            ) : null}
            {generateButton(true)}
            <p id="project-budget-reason" data-testid="project-budget-reason" className="text-center text-small leading-5 text-text-muted">
              {t('budgetReason')}
            </p>
            <button type="button" data-testid="project-budget" aria-disabled="true" aria-describedby="project-budget-reason" className={DISABLED}>
              {budgetIcon}
              <span>{budgetLabel}</span>
            </button>
          </>
        )}
      </footer>
    </>
  );
}
