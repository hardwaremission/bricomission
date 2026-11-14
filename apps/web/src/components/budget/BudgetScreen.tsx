'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ReceiptText, RefreshCw } from 'lucide-react';
import { createApiClient, type ApiClient } from '@bricomission/api-client';
import { createBudget, loadBudget, loadBudgets } from '../../lib/budget/budget-client';
import {
  activeBudget,
  budgetPhase,
  budgetReducer,
  canStart,
  computeStage,
  consumeStartParam,
  currentBudget,
  failedBudget,
  failureAlertKey,
  INITIAL_BUDGET_STATE,
  jobsAhead,
  orderedTiers,
  selectionIssue,
  startPolling,
  type BudgetView,
} from '../../lib/budget/budget-state';
import { loadSimulations } from '../../lib/simulations/simulation-client';
import { selectedSimulation } from '../../lib/simulations/project-simulations';
import { GenerateAlert } from '../generate/GenerateAlert';
import { BudgetStatusCard } from './BudgetStatusCard';
import { TierCard } from './TierCard';

const MAIN_CLASS = 'flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg';
const PRIMARY = 'bg-primary text-white hover:bg-primary-hover';
const DISABLED = 'cursor-not-allowed border border-border bg-surface-muted text-text-muted';

/** The four tier cards of one Budget; which tiers are open and expanded item lists are local, and reset per Budget (keyed). */
function TierList({ budget, locale }: { budget: BudgetView; locale: string }) {
  const t = useTranslations('budget');
  const [open, setOpen] = useState<string[]>([]);
  const [all, setAll] = useState<string[]>([]);
  const toggle = (list: string[], tier: string) => (list.includes(tier) ? list.filter((candidate) => candidate !== tier) : [...list, tier]);
  return (
    <ul className="flex flex-col gap-3" data-testid="budget-tiers">
      {orderedTiers(budget).map((tier) => (
        <TierCard
          key={tier.tier}
          tier={tier}
          locale={locale}
          expanded={open.includes(tier.tier)}
          showAll={all.includes(tier.tier)}
          onToggle={() => setOpen((list) => toggle(list, tier.tier))}
          onShowAll={() => setAll((list) => [...list, tier.tier])}
          labels={{
            tier: t(`tiers.${tier.tier}`),
            meta: t('meta', { count: tier.items.length }),
            unit: (unit) => unit,
            detail: (values) => t('detail', values),
            citation: (values) => t('citation', values),
            more: (count) => t('more', { count }),
            subtotal: t('totals.subtotal'),
            vat: t('totals.vat', { percent: budget.vatPercent }),
            total: t('totals.total'),
          }}
        />
      ))}
    </ul>
  );
}

/**
 * Budget Tier Overview for the selected Simulation (docs/design/simulations-ux-overhaul.md, S9
 * and S10, extending docs/design/budget-tier-computation.md): the "Based on Simulation n" card,
 * the four tier cards with expandable verified Line Items and citations, the computing card
 * (reading image n of N, matching products, waiting for the GPU) with the 2 s poll, a recalculation
 * that keeps the previous Budget visible until the new one succeeds, and the no-selection and
 * not-ready alerts. `?start=1` (from `Get my budget` on the project page) starts one Budget on
 * load; the server's one-active rule prevents a double start. The HTML is the same for everyone:
 * the Simulations and Budgets load on the client via /api.
 */
export function BudgetScreen({ projectId }: { projectId: string }) {
  const t = useTranslations('budget');
  const tProject = useTranslations('project');
  const locale = useLocale();
  const [state, dispatch] = useReducer(budgetReducer, INITIAL_BUDGET_STATE);
  const clientRef = useRef<ApiClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createApiClient(`${window.location.origin}/api`)), []);
  const autoStart = useRef(false);

  /** Reads the selected Simulation and its Budgets; false when the screen cannot be shown. */
  const fetchState = useCallback(async () => {
    const [simulations, budgets] = await Promise.all([loadSimulations(client(), projectId), loadBudgets(client(), projectId)]);
    if (simulations.kind === 'signedOut' || budgets.kind === 'signedOut') return dispatch({ type: 'loadFailed', kind: 'signedOut' });
    if (simulations.kind === 'notFound' || budgets.kind === 'notFound') return dispatch({ type: 'loadFailed', kind: 'notFound' });
    if (simulations.kind !== 'ok' || budgets.kind !== 'ok') return dispatch({ type: 'connectivity', online: false });
    dispatch({ type: 'connectivity', online: true });
    const simulation = selectedSimulation(simulations.value);
    dispatch({ type: 'loaded', simulation, budgets: budgets.value.budgets });
    return { simulation, budgets: budgets.value.budgets };
  }, [client, projectId]);

  const start = useCallback(async () => {
    dispatch({ type: 'startRequested' });
    const result = await createBudget(client(), projectId);
    switch (result.kind) {
      case 'ok':
        return dispatch({ type: 'startFinished', budget: result.value });
      case 'queueFull':
        return dispatch({ type: 'startFinished', budget: null, alert: 'queueFull' });
      case 'searchDown':
        return dispatch({ type: 'startFinished', budget: null, alert: 'searchDown' });
      case 'conflict': {
        const alert =
          result.code === 'catalog_empty'
            ? 'catalogEmpty'
            : result.code === 'project_incomplete'
              ? 'incomplete'
              : result.code === 'no_simulation_selected'
                ? 'noSelection'
                : result.code === 'simulation_not_ready'
                  ? 'notReady'
                  : result.code === 'other'
                    ? 'startFailed'
                    : 'none';
        dispatch({ type: 'startFinished', budget: null, alert });
        // Show what the server says (another tab may have started one, or the selection changed).
        const list = await loadBudgets(client(), projectId);
        if (list.kind === 'ok') dispatch({ type: 'budgetsLoaded', budgets: list.value.budgets });
        return;
      }
      case 'signedOut':
        return dispatch({ type: 'loadFailed', kind: 'signedOut' });
      case 'notFound':
        return dispatch({ type: 'loadFailed', kind: 'notFound' });
      case 'offline':
        dispatch({ type: 'startFinished', budget: null });
        return dispatch({ type: 'connectivity', online: false });
      default:
        return dispatch({ type: 'startFinished', budget: null, alert: 'startFailed' });
    }
  }, [client, projectId]);

  const load = useCallback(async () => {
    if (!navigator.onLine) return dispatch({ type: 'connectivity', online: false });
    const loaded = await fetchState();
    if (loaded && autoStart.current) {
      autoStart.current = false;
      const { simulation, budgets } = loaded;
      const busy = budgets.some((budget) => budget.status === 'queued' || budget.status === 'running' || budget.status === 'succeeded');
      if (simulation?.status === 'succeeded' && !busy) void start();
    }
  }, [fetchState, start]);

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

  // Poll the active Budget every 2 s while online.
  const activeId = activeBudget(state)?.id ?? null;
  useEffect(() => {
    if (!activeId || !state.online) return;
    const poller = startPolling<BudgetView>({
      fetchOnce: async () => {
        const result = await loadBudget(client(), projectId, activeId);
        if (result.kind === 'ok') return result.value;
        if (result.kind === 'signedOut' || result.kind === 'notFound') dispatch({ type: 'loadFailed', kind: result.kind });
        return null;
      },
      onRender: (budget) => dispatch({ type: 'budgetUpdated', budget }),
    });
    return () => poller.stop();
  }, [activeId, state.online, client, projectId]);

  if (state.load === 'signedOut') {
    const href = `/auth/login?returnTo=${encodeURIComponent(`/kitchen-projects/${projectId}/budget`)}`;
    return (
      <main className={MAIN_CLASS} data-testid="budget-signed-out">
        <h1 className="text-h1 font-bold text-text">{tProject('signedOut.title')}</h1>
        <a
          href={href}
          data-testid="budget-sign-in"
          className="flex min-h-[52px] w-full items-center justify-center rounded-pill bg-primary px-md py-[14px] text-center text-body font-semibold text-white hover:bg-primary-hover"
        >
          {tProject('signedOut.signIn')}
        </a>
      </main>
    );
  }

  if (state.load === 'notFound') {
    return (
      <main className={MAIN_CLASS} data-testid="budget-not-found">
        <h1 className="text-h1 font-bold text-text">{tProject('notFound.title')}</h1>
        <Link href="/" prefetch={false} data-testid="budget-home" className="flex h-11 shrink-0 items-center text-small leading-5 font-semibold text-primary underline">
          {tProject('notFound.home')}
        </Link>
      </main>
    );
  }

  const phase = budgetPhase(state);
  const active = activeBudget(state);
  const current = currentBudget(state);
  const failed = failedBudget(state);
  const issue = selectionIssue(state);
  const busy = phase === 'computing' || phase === 'recalculating';
  const enabled = canStart(state);
  const stage = computeStage(active);
  const ahead = jobsAhead(active);
  const simulation = state.simulation;
  const hint = busy ? t('hints.oneAtATime') : null;
  const ctaLabel = phase === 'failed' ? t('cta.retry') : phase === 'empty' ? t('cta.start') : t('cta.again');
  const CtaIcon = phase === 'empty' ? ReceiptText : RefreshCw;
  const ctaTestId = phase === 'failed' ? 'budget-retry' : phase === 'empty' ? 'budget-start' : 'budget-again';
  const stageLabel = stage.stage === 'queued' ? t('status.queued') : stage.stage === 'inventory' ? t('status.reading', { n: stage.n, count: stage.count }) : t('status.matching');
  const projectLink = (
    <Link
      href={`/kitchen-projects/${projectId}`}
      prefetch={false}
      data-testid="budget-go-simulations"
      className="flex h-11 items-center text-small leading-5 font-semibold text-primary underline"
    >
      {t('goToSimulations')}
    </Link>
  );
  const alertTone: Record<'queueFull' | 'searchDown' | 'catalogEmpty' | 'incomplete' | 'startFailed', 'warning' | 'danger' | 'info'> = {
    queueFull: 'warning',
    searchDown: 'warning',
    catalogEmpty: 'warning',
    incomplete: 'info',
    startFailed: 'danger',
  };
  const alertMessage: Record<keyof typeof alertTone, string> = {
    queueFull: t('alerts.queueFull'),
    searchDown: t('alerts.searchDown'),
    catalogEmpty: t('alerts.catalogEmpty'),
    incomplete: t('alerts.incomplete'),
    startFailed: t('alerts.failed'),
  };
  const pageAlert = state.alert in alertTone ? (state.alert as keyof typeof alertTone) : null;
  const thumbs = (simulation?.renders ?? []).filter((render) => render.status === 'succeeded' && render.thumbUrl);

  return (
    <>
      <main className={MAIN_CLASS} data-testid="budget-screen" data-phase={phase} data-simulation={simulation?.ordinal}>
        {!state.online ? <GenerateAlert tone="warning" message={t('alerts.offline')} testId="budget-offline" /> : null}
        {state.online && pageAlert ? <GenerateAlert tone={alertTone[pageAlert]} message={alertMessage[pageAlert]} testId={`budget-alert-${pageAlert}`} /> : null}
        {state.online && issue === 'noSelection' ? <GenerateAlert tone="info" message={t('alerts.noSelection')} action={projectLink} testId="budget-alert-noSelection" /> : null}
        {state.online && issue === 'notReady' ? <GenerateAlert tone="warning" message={t('alerts.notReady')} action={projectLink} testId="budget-alert-notReady" /> : null}
        {phase === 'failed' && state.alert === 'none' ? <GenerateAlert tone="danger" message={t(`alerts.${failureAlertKey(failed)}`)} testId="budget-failed" /> : null}

        <section className="flex flex-col gap-sm">
          <h1 className="text-h1 font-bold text-text">{phase === 'computing' ? t('titleActive') : t('title')}</h1>
          {phase === 'loading' || phase === 'empty' || issue ? null : (
            <p className="text-body text-text-muted" data-testid="budget-helper">
              {phase === 'computing' ? t('helperActive') : t('helper')}
            </p>
          )}
        </section>

        {simulation && phase !== 'loading' ? (
          <section data-testid="budget-simulation" className="flex flex-col gap-3 rounded-[16px] bg-surface p-3 shadow-card">
            <div className="flex items-center justify-between gap-sm">
              <p className="min-w-0 text-small leading-5 font-semibold text-text">{t('basedOn', { n: simulation.ordinal })}</p>
              <Link
                href={`/kitchen-projects/${projectId}`}
                prefetch={false}
                data-testid="budget-change-simulation"
                className="flex h-11 shrink-0 items-center text-small leading-5 font-semibold text-primary underline"
              >
                {t('change')}
              </Link>
            </div>
            {thumbs.length > 0 ? (
              <div className="-mt-2 flex flex-wrap gap-2" data-testid="budget-simulation-thumbs">
                {thumbs.map((render) => (
                  <span key={render.id} className="h-9 w-12 overflow-hidden rounded-sm bg-surface-muted">
                    <img src={`/api${render.thumbUrl}`} alt="" className="size-full object-cover" />
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {phase === 'recalculating' ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="budget-recalculating"
            data-stage={stage.stage}
            className="flex flex-col gap-1 rounded-[16px] border border-primary bg-surface p-md"
          >
            <p className="text-body font-semibold text-text">{t('recalculating')}</p>
            <p className="text-small leading-5 text-text-muted">{stageLabel}</p>
          </div>
        ) : null}
        {current?.relabeled && (phase === 'succeeded' || phase === 'recalculating' || phase === 'failed') ? (
          <p className="text-small leading-5 text-text-muted" data-testid="budget-relabeled">
            {t('relabeled')}
          </p>
        ) : null}
        {current && (phase === 'succeeded' || phase === 'recalculating' || phase === 'failed') ? <TierList key={current.id} budget={current} locale={locale} /> : null}
        {phase === 'computing' ? (
          <BudgetStatusCard
            status={stage.stage === 'queued' ? 'queued' : 'running'}
            stage={stage.stage}
            label={stageLabel}
            percent={stage.stage === 'inventory' ? stage.percent : null}
            detail={ahead !== null ? t('status.ahead', { count: ahead }) : null}
          />
        ) : null}
        {phase === 'empty' ? <BudgetStatusCard status="empty" label={t('empty.title')} detail={t('empty.helper')} /> : null}
        {busy ? <p className="text-small leading-5 text-text-muted">{t('note')}</p> : null}
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        {hint ? (
          <p id="budget-hint" data-testid="budget-hint" className="text-center text-small leading-5 text-text-muted">
            {hint}
          </p>
        ) : null}
        <Link
          href={`/kitchen-projects/${projectId}`}
          prefetch={false}
          data-testid="budget-back-project"
          className={`flex min-h-[52px] w-full items-center justify-center rounded-pill px-md py-[13px] text-center text-body font-semibold ${PRIMARY}`}
        >
          {t('cta.back')}
        </Link>
        {issue || phase === 'loading' ? null : (
          <button
            type="button"
            data-testid={ctaTestId}
            aria-disabled={!enabled}
            aria-describedby={hint ? 'budget-hint' : undefined}
            onClick={() => enabled && void start()}
            className={`flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill px-md py-[13px] text-center text-body font-semibold ${enabled ? 'border border-border bg-surface text-primary' : DISABLED}`}
          >
            <CtaIcon size={20} aria-hidden="true" className="shrink-0" />
            <span>{ctaLabel}</span>
          </button>
        )}
      </footer>
    </>
  );
}
