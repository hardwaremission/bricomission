import type { components } from '@bricomission/api-client';
import { isActive } from '../renders/render-state';

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
  /** Newest first. */
  budgets: BudgetView[];
  maxBudgets: number;
  /** Budget shown (default: the active one, else the newest). */
  shownId: string | null;
  online: boolean;
  /** A POST is in flight. */
  starting: boolean;
  /** Page alert from the last start attempt. */
  alert: 'none' | 'queueFull' | 'searchDown' | 'catalogEmpty' | 'incomplete' | 'startFailed';
}

export const INITIAL_BUDGET_STATE: BudgetState = { load: 'loading', budgets: [], maxBudgets: 5, shownId: null, online: true, starting: false, alert: 'none' };

export type BudgetAction =
  | { type: 'loaded'; budgets: BudgetView[]; maxBudgets: number }
  | { type: 'loadFailed'; kind: 'signedOut' | 'notFound' }
  | { type: 'budgetsLoaded'; budgets: BudgetView[]; maxBudgets: number }
  | { type: 'budgetUpdated'; budget: BudgetView }
  | { type: 'startRequested' }
  | { type: 'startFinished'; budget: BudgetView | null; alert?: BudgetState['alert'] }
  | { type: 'budgetShown'; budgetId: string }
  | { type: 'connectivity'; online: boolean };

function upsert(budgets: BudgetView[], budget: BudgetView): BudgetView[] {
  const rest = budgets.filter((candidate) => candidate.id !== budget.id);
  return [budget, ...rest].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

function withDefaults(state: BudgetState): BudgetState {
  const shown = state.budgets.find(isActive) ?? state.budgets.find((budget) => budget.id === state.shownId) ?? state.budgets[0] ?? null;
  return { ...state, shownId: shown?.id ?? null };
}

export function budgetReducer(state: BudgetState, action: BudgetAction): BudgetState {
  switch (action.type) {
    case 'loaded':
      return withDefaults({ ...state, load: 'ready', budgets: action.budgets, maxBudgets: action.maxBudgets, shownId: null });
    case 'loadFailed':
      return { ...state, load: action.kind };
    case 'budgetsLoaded':
      return withDefaults({ ...state, budgets: action.budgets, maxBudgets: action.maxBudgets });
    case 'budgetUpdated':
      return withDefaults({ ...state, budgets: upsert(state.budgets, action.budget) });
    case 'startRequested':
      return { ...state, starting: true, alert: 'none' };
    case 'startFinished':
      if (!action.budget) return { ...state, starting: false, alert: action.alert ?? 'none' };
      return withDefaults({ ...state, starting: false, alert: 'none', budgets: upsert(state.budgets, action.budget), shownId: action.budget.id });
    case 'budgetShown':
      return activeBudget(state) ? state : withDefaults({ ...state, shownId: action.budgetId });
    case 'connectivity':
      return { ...state, online: action.online };
  }
}

export function activeBudget(state: BudgetState): BudgetView | null {
  return state.budgets.find(isActive) ?? null;
}

export function shownBudget(state: BudgetState): BudgetView | null {
  return state.budgets.find((budget) => budget.id === state.shownId) ?? null;
}

/** Non-failed Budgets: the history counter and the limit. */
export function keptCount(state: BudgetState): number {
  return state.budgets.filter((budget) => budget.status !== 'failed').length;
}

/** Succeeded Budgets, newest first (the history strip, shown with two or more). */
export function historyBudgets(state: BudgetState): BudgetView[] {
  return state.budgets.filter((budget) => budget.status === 'succeeded');
}

export type BudgetPhase = 'loading' | 'empty' | 'active' | 'failed' | 'succeeded';

export function budgetPhase(state: BudgetState): BudgetPhase {
  if (state.load !== 'ready') return 'loading';
  if (activeBudget(state) || state.starting) return 'active';
  const shown = shownBudget(state);
  if (!shown) return 'empty';
  return shown.status === 'failed' ? 'failed' : 'succeeded';
}

export function limitReached(state: BudgetState): boolean {
  return keptCount(state) >= state.maxBudgets;
}

/** The primary CTA can start a Budget. */
export function canStart(state: BudgetState): boolean {
  return state.load === 'ready' && state.online && !state.starting && !activeBudget(state) && !limitReached(state);
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
