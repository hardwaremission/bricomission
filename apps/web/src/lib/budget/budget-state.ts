import type { components } from '@bricomission/api-client';
import { isActive } from '../renders/render-state';
import type { SimulationView } from '../simulations/simulation-state';

export { browserTimer, consumeStartParam, FIRST_POLL_MS, isActive, POLL_MS, startPolling, type PollTimer } from '../renders/render-state';

/** API contract types (generated from openapi.json). */
export type BudgetView = components['schemas']['BudgetViewDto'];
export type BudgetTierView = components['schemas']['BudgetTierViewDto'];
export type BudgetLineItemView = components['schemas']['BudgetLineItemViewDto'];
export type BudgetListResponse = components['schemas']['BudgetListResponseDto'];

export type BudgetTier = BudgetTierView['tier'];
/** The four tiers in display order. */
export const TIER_ORDER: readonly BudgetTier[] = ['luxury', 'high', 'medium', 'low'];
/** Line Items shown before "+ N more items". */
export const ITEMS_COLLAPSED = 3;

export interface BudgetState {
  load: 'loading' | 'ready' | 'signedOut' | 'notFound';
  /** The project's selected Simulation (the one this Budget prices); null = none selected. */
  simulation: SimulationView | null;
  /** Budgets of the selected Simulation, newest first: the current one plus an active or failed recompute (at most 2). */
  budgets: BudgetView[];
  online: boolean;
  /** A POST is in flight. */
  starting: boolean;
  /** Page alert from the last start attempt. */
  alert: 'none' | 'queueFull' | 'searchDown' | 'catalogEmpty' | 'incomplete' | 'noSelection' | 'notReady' | 'startFailed';
}

export const INITIAL_BUDGET_STATE: BudgetState = { load: 'loading', simulation: null, budgets: [], online: true, starting: false, alert: 'none' };

export type BudgetAction =
  | { type: 'loaded'; simulation: SimulationView | null; budgets: BudgetView[] }
  | { type: 'loadFailed'; kind: 'signedOut' | 'notFound' }
  | { type: 'budgetsLoaded'; budgets: BudgetView[] }
  | { type: 'budgetUpdated'; budget: BudgetView }
  | { type: 'startRequested' }
  | { type: 'startFinished'; budget: BudgetView | null; alert?: BudgetState['alert'] }
  | { type: 'connectivity'; online: boolean };

function upsert(budgets: BudgetView[], budget: BudgetView): BudgetView[] {
  const rest = budgets.filter((candidate) => candidate.id !== budget.id);
  // A new Budget replaces the previous failed ones; the succeeded one stays until the new one succeeds.
  const kept = budget.status === 'queued' || budget.status === 'running' ? rest.filter((candidate) => candidate.status !== 'failed') : rest;
  // The API keeps one succeeded Budget per Simulation: a newer success replaces the older.
  const pruned = budget.status === 'succeeded' ? kept.filter((candidate) => candidate.status !== 'succeeded') : kept;
  return [budget, ...pruned].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function budgetReducer(state: BudgetState, action: BudgetAction): BudgetState {
  switch (action.type) {
    case 'loaded':
      return { ...state, load: 'ready', simulation: action.simulation, budgets: action.budgets };
    case 'loadFailed':
      return { ...state, load: action.kind };
    case 'budgetsLoaded':
      return { ...state, budgets: action.budgets };
    case 'budgetUpdated':
      return { ...state, budgets: upsert(state.budgets, action.budget) };
    case 'startRequested':
      return { ...state, starting: true, alert: 'none' };
    case 'startFinished':
      if (!action.budget) return { ...state, starting: false, alert: action.alert ?? 'none' };
      return { ...state, starting: false, alert: 'none', budgets: upsert(state.budgets, action.budget) };
    case 'connectivity':
      return { ...state, online: action.online };
  }
}

export function activeBudget(state: BudgetState): BudgetView | null {
  return state.budgets.find(isActive) ?? null;
}

/** The current (succeeded) Budget: shown, also while a recompute runs or after a failed one. */
export function currentBudget(state: BudgetState): BudgetView | null {
  return state.budgets.find((budget) => budget.status === 'succeeded') ?? null;
}

/** The newest failed recompute (never while a Budget is active). */
export function failedBudget(state: BudgetState): BudgetView | null {
  return activeBudget(state) ? null : (state.budgets.find((budget) => budget.status === 'failed') ?? null);
}

/** Why no Budget can be computed: nothing selected, or the selected Simulation is not fully rendered. */
export function selectionIssue(state: BudgetState): 'noSelection' | 'notReady' | null {
  if (state.load !== 'ready') return null;
  if (state.alert === 'noSelection' || !state.simulation) return 'noSelection';
  if (state.alert === 'notReady' || state.simulation.status !== 'succeeded') return 'notReady';
  return null;
}

export type BudgetPhase = 'loading' | 'noSelection' | 'notReady' | 'empty' | 'computing' | 'recalculating' | 'failed' | 'succeeded';

export function budgetPhase(state: BudgetState): BudgetPhase {
  if (state.load !== 'ready') return 'loading';
  const issue = selectionIssue(state);
  if (issue) return issue;
  const current = currentBudget(state);
  if (activeBudget(state) || state.starting) return current ? 'recalculating' : 'computing';
  if (failedBudget(state)) return 'failed';
  return current ? 'succeeded' : 'empty';
}

/** The primary action can start (or restart) a Budget for the selected, fully rendered Simulation. */
export function canStart(state: BudgetState): boolean {
  return state.load === 'ready' && state.online && !state.starting && !activeBudget(state) && selectionIssue(state) === null;
}

/** Stage line of a computing Budget: reading image n of N, matching products, or waiting for the GPU. */
export function computeStage(budget: BudgetView | null): { stage: 'queued' | 'inventory' | 'pricing'; n: number; count: number; percent: number } {
  if (!budget || budget.status === 'queued') return { stage: 'queued', n: 0, count: budget?.progress.total ?? 0, percent: 0 };
  const count = Math.max(budget.progress.total, 1);
  if (budget.stage === 'pricing') return { stage: 'pricing', n: count, count, percent: 100 };
  const n = Math.min(count, Math.max(1, budget.progress.done + 1));
  return { stage: 'inventory', n, count, percent: Math.round((n / count) * 100) };
}

/** Jobs ahead in the GPU queue for the queued status line; null hides it (unknown or 0). */
export function jobsAhead(budget: BudgetView | null): number | null {
  return budget?.status === 'queued' && typeof budget.position === 'number' && budget.position > 0 ? budget.position : null;
}

/** The tiers in display order (the API already sends them so; this guards the page). */
export function orderedTiers(budget: BudgetView): BudgetTierView[] {
  return TIER_ORDER.flatMap((tier) => budget.tiers.filter((candidate) => candidate.tier === tier));
}

/** Money in the locale's currency style from integer cents; the page never sums or multiplies. */
export function formatMoney(cents: number, locale: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/** Quantity decimal string in the locale (`2.5` -> `2,5` in German). */
export function formatQuantity(quantity: string, locale: string): string {
  const value = Number(quantity);
  return Number.isFinite(value) ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value) : quantity;
}

/** The alert for a failed Budget: interrupted has its own copy. */
export function failureAlertKey(budget: BudgetView | null): 'interrupted' | 'failed' {
  return budget?.errorCode === 'interrupted' ? 'interrupted' : 'failed';
}
