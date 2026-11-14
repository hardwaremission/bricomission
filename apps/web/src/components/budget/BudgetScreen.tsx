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
  consumeStartParam,
  failureAlertKey,
  historyBudgets,
  INITIAL_BUDGET_STATE,
  jobsAhead,
  keptCount,
  limitReached,
  orderedTiers,
  shownBudget,
  startPolling,
  type BudgetView,
} from '../../lib/budget/budget-state';
import { GenerateAlert } from '../generate/GenerateAlert';
import { BudgetHistory } from './BudgetHistory';
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
 * Budget Tier Overview (docs/design/budget-tier-computation.md): the four tier cards with
 * expandable verified Line Items and citations, the queued/running placeholder with the 2 s poll,
 * the history strip and the "Calculate again" / "Try again" / "Get my budget" CTA. `?start=1`
 * (after the Generate claim with intent budget) starts one Budget on load; the server's one-active
 * rule prevents a double start. The HTML is the same for everyone: Budgets load on the client via /api.
 */
export function BudgetScreen({ projectId }: { projectId: string }) {
  const t = useTranslations('budget');
  const tProject = useTranslations('project');
  const locale = useLocale();
  const [state, dispatch] = useReducer(budgetReducer, INITIAL_BUDGET_STATE);
  const clientRef = useRef<ApiClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createApiClient(`${window.location.origin}/api`)), []);
  const autoStart = useRef(false);

  const refresh = useCallback(async () => {
    const list = await loadBudgets(client(), projectId);
    if (list.kind === 'ok') dispatch({ type: 'budgetsLoaded', budgets: list.value.budgets, maxBudgets: list.value.maxBudgets });
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
      case 'conflict':
        dispatch({
          type: 'startFinished',
          budget: null,
          alert: result.code === 'catalog_empty' ? 'catalogEmpty' : result.code === 'project_incomplete' ? 'incomplete' : result.code === 'other' ? 'startFailed' : 'none',
        });
        return refresh();
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
  }, [client, projectId, refresh]);

  const load = useCallback(async () => {
    if (!navigator.onLine) return dispatch({ type: 'connectivity', online: false });
    const budgets = await loadBudgets(client(), projectId);
    if (budgets.kind === 'signedOut') return dispatch({ type: 'loadFailed', kind: 'signedOut' });
    if (budgets.kind === 'notFound') return dispatch({ type: 'loadFailed', kind: 'notFound' });
    if (budgets.kind !== 'ok') return dispatch({ type: 'connectivity', online: false });
    dispatch({ type: 'connectivity', online: true });
    dispatch({ type: 'loaded', budgets: budgets.value.budgets, maxBudgets: budgets.value.maxBudgets });
    if (autoStart.current) {
      autoStart.current = false;
      if (!budgets.value.budgets.some((budget) => budget.status === 'queued' || budget.status === 'running')) void start();
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
  const shown = shownBudget(state);
  const busy = phase === 'active';
  const limit = limitReached(state) && !busy;
  const enabled = canStart(state);
  const history = historyBudgets(state);
  const chronological = [...state.budgets].reverse();
  const ahead = jobsAhead(active);
  const hint = busy ? t('hints.oneAtATime') : limit ? t('hints.limit', { max: state.maxBudgets }) : null;
  const ctaLabel = phase === 'failed' ? t('cta.retry') : phase === 'empty' ? t('cta.start') : t('cta.again');
  const CtaIcon = phase === 'empty' ? ReceiptText : RefreshCw;
  const ctaTestId = phase === 'failed' ? 'budget-retry' : phase === 'empty' ? 'budget-start' : 'budget-again';
  const alertTone: Record<Exclude<typeof state.alert, 'none'>, 'warning' | 'danger' | 'info'> = {
    queueFull: 'warning',
    searchDown: 'warning',
    catalogEmpty: 'warning',
    incomplete: 'info',
    startFailed: 'danger',
  };
  const alertMessage: Record<Exclude<typeof state.alert, 'none'>, string> = {
    queueFull: t('alerts.queueFull'),
    searchDown: t('alerts.searchDown'),
    catalogEmpty: t('alerts.catalogEmpty'),
    incomplete: t('alerts.incomplete'),
    startFailed: t('alerts.failed'),
  };

  return (
    <>
      <main className={MAIN_CLASS} data-testid="budget-screen" data-phase={phase}>
        {!state.online ? <GenerateAlert tone="warning" message={t('alerts.offline')} testId="budget-offline" /> : null}
        {state.online && state.alert !== 'none' ? <GenerateAlert tone={alertTone[state.alert]} message={alertMessage[state.alert]} testId={`budget-alert-${state.alert}`} /> : null}
        {phase === 'failed' && state.alert === 'none' ? (
          <GenerateAlert tone="danger" message={t(`alerts.${failureAlertKey(shown)}`)} testId="budget-failed" />
        ) : null}

        <section className="flex flex-col gap-sm">
          <h1 className="text-h1 font-bold text-text">{phase === 'active' ? t('titleActive') : t('title')}</h1>
          {phase === 'loading' || phase === 'empty' ? null : (
            <p className="text-body text-text-muted" data-testid="budget-helper">
              {busy ? t('helperActive') : t('helper')}
            </p>
          )}
        </section>

        {phase === 'succeeded' && shown ? <TierList key={shown.id} budget={shown} locale={locale} /> : null}
        {phase === 'active' ? (
          <BudgetStatusCard
            status={active?.status === 'queued' ? 'queued' : 'running'}
            label={active?.status === 'queued' ? t('status.queued') : t('status.running')}
            detail={ahead !== null ? t('status.ahead', { count: ahead }) : null}
          />
        ) : null}
        {phase === 'empty' ? <BudgetStatusCard status="empty" label={t('empty.title')} detail={t('empty.helper')} /> : null}
        {busy ? <p className="text-small leading-5 text-text-muted">{t('note')}</p> : null}

        {history.length >= 2 ? (
          <BudgetHistory
            budgets={history.map((budget) => ({ id: budget.id, number: chronological.findIndex((candidate) => candidate.id === budget.id) + 1 }))}
            shownId={phase === 'succeeded' ? state.shownId : null}
            disabled={busy}
            onShow={(budgetId) => dispatch({ type: 'budgetShown', budgetId })}
            title={t('history.title')}
            counter={t('history.counter', { count: keptCount(state), max: state.maxBudgets })}
            itemLabel={(n) => t('history.item', { n })}
          />
        ) : null}
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        {hint ? (
          <p id="budget-hint" data-testid="budget-hint" className="text-center text-small leading-5 text-text-muted">
            {hint}
          </p>
        ) : null}
        <button
          type="button"
          data-testid={ctaTestId}
          aria-disabled={!enabled}
          aria-describedby={hint ? 'budget-hint' : undefined}
          onClick={() => enabled && void start()}
          className={`flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill px-md py-[13px] text-center text-body font-semibold ${enabled ? PRIMARY : DISABLED}`}
        >
          <CtaIcon size={20} aria-hidden="true" className="shrink-0" />
          <span>{ctaLabel}</span>
        </button>
        {busy ? null : (
          <Link
            href={`/kitchen-projects/${projectId}`}
            prefetch={false}
            data-testid="budget-back-project"
            className="flex min-h-[52px] w-full items-center justify-center rounded-pill border border-border bg-surface px-md py-[13px] text-center text-body font-semibold text-primary"
          >
            {t('cta.back')}
          </Link>
        )}
      </footer>
    </>
  );
}
