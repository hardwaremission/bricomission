import { describe, expect, it } from 'vitest';
import {
  activeBudget,
  budgetPhase,
  budgetReducer,
  type BudgetState,
  type BudgetView,
  canStart,
  failureAlertKey,
  formatMoney,
  formatQuantity,
  historyBudgets,
  INITIAL_BUDGET_STATE,
  jobsAhead,
  keptCount,
  limitReached,
  orderedTiers,
  type PollTimer,
  shownBudget,
  startPolling,
} from '../src/lib/budget/budget-state';

function budget(id: string, status: BudgetView['status'], overrides: Partial<BudgetView> = {}): BudgetView {
  return {
    id,
    status,
    position: null,
    waitingFor: null,
    currency: 'EUR',
    vatPercent: 21,
    errorCode: status === 'failed' ? 'adapter_error' : null,
    createdAt: `2026-11-17T10:00:0${id.slice(-1)}.000Z`,
    startedAt: null,
    finishedAt: null,
    lineItemsCount: 0,
    tiers: [],
    ...overrides,
  };
}

const loaded = (budgets: BudgetView[], maxBudgets = 5): BudgetState => budgetReducer(INITIAL_BUDGET_STATE, { type: 'loaded', budgets, maxBudgets });

describe('budget state (budget-tier-computation)', () => {
  it('no Budgets: empty phase, start allowed; loading until loaded', () => {
    expect(budgetPhase(INITIAL_BUDGET_STATE)).toBe('loading');
    const state = loaded([]);
    expect(budgetPhase(state)).toBe('empty');
    expect(canStart(state)).toBe(true);
  });

  it('an active Budget is shown and blocks starting; the poll update finishes it', () => {
    let state = loaded([budget('b2', 'succeeded'), budget('b1', 'succeeded')].reverse());
    state = budgetReducer(state, { type: 'startFinished', budget: budget('b3', 'queued') });
    expect(budgetPhase(state)).toBe('active');
    expect(activeBudget(state)?.id).toBe('b3');
    expect(canStart(state)).toBe(false);
    expect(state.shownId).toBe('b3');
    state = budgetReducer(state, { type: 'budgetUpdated', budget: budget('b3', 'succeeded') });
    expect(budgetPhase(state)).toBe('succeeded');
    expect(shownBudget(state)?.id).toBe('b3');
    expect(canStart(state)).toBe(true);
  });

  it('shows the newest Budget by default; a failed newest one is the failed phase; history lists succeeded ones', () => {
    const state = loaded([budget('b3', 'failed'), budget('b2', 'succeeded'), budget('b1', 'succeeded')]);
    expect(budgetPhase(state)).toBe('failed');
    expect(historyBudgets(state).map((b) => b.id)).toEqual(['b2', 'b1']);
    const picked = budgetReducer(state, { type: 'budgetShown', budgetId: 'b1' });
    expect(budgetPhase(picked)).toBe('succeeded');
    expect(picked.shownId).toBe('b1');
  });

  it('counts non-failed Budgets for the limit and keeps failed ones out of it', () => {
    const state = loaded([budget('b5', 'failed'), budget('b4', 'succeeded'), budget('b3', 'succeeded'), budget('b2', 'succeeded'), budget('b1', 'succeeded')], 4);
    expect(keptCount(state)).toBe(4);
    expect(limitReached(state)).toBe(true);
    expect(canStart(state)).toBe(false);
    expect(canStart({ ...state, maxBudgets: 5 })).toBe(true);
  });

  it('offline and in-flight POST disable the CTA; start clears the alert', () => {
    const state = loaded([]);
    expect(canStart(budgetReducer(state, { type: 'connectivity', online: false }))).toBe(false);
    const starting = budgetReducer({ ...state, alert: 'queueFull' }, { type: 'startRequested' });
    expect(starting.alert).toBe('none');
    expect(canStart(starting)).toBe(false);
    expect(budgetPhase(starting)).toBe('active');
    expect(budgetReducer(starting, { type: 'startFinished', budget: null, alert: 'searchDown' })).toMatchObject({ starting: false, alert: 'searchDown' });
  });

  it('load failures and ordering/format helpers', () => {
    expect(budgetReducer(INITIAL_BUDGET_STATE, { type: 'loadFailed', kind: 'notFound' }).load).toBe('notFound');
    expect(jobsAhead(budget('b1', 'queued', { position: 2 }))).toBe(2);
    expect(jobsAhead(budget('b1', 'queued', { position: 0 }))).toBeNull();
    expect(jobsAhead(budget('b1', 'running', { position: 2 }))).toBeNull();
    expect(failureAlertKey(budget('b1', 'failed', { errorCode: 'interrupted' }))).toBe('interrupted');
    expect(failureAlertKey(budget('b1', 'failed'))).toBe('failed');
    const tier = (name: 'luxury' | 'high' | 'medium' | 'low') => ({ tier: name, subtotalCents: 0, vatCents: 0, totalCents: 0, items: [] });
    expect(orderedTiers(budget('b1', 'succeeded', { tiers: [tier('low'), tier('luxury'), tier('medium'), tier('high')] })).map((t) => t.tier)).toEqual(['luxury', 'high', 'medium', 'low']);
    expect(formatMoney(1845000, 'de').replace(/\s/g, ' ')).toBe('18.450,00 €');
    expect(formatMoney(1845000, 'en')).toBe('€18,450.00');
    expect(formatQuantity('2.5', 'de')).toBe('2,5');
    expect(formatQuantity('3', 'en')).toBe('3');
  });

  it('polls an active Budget with the injected timer until it is terminal', async () => {
    const timers: Array<{ run: () => void; ms: number }> = [];
    const timer: PollTimer = { set: (run, ms) => timers.push({ run, ms }) - 1, clear: () => undefined };
    const seen: string[] = [];
    const answers = [budget('b1', 'queued'), budget('b1', 'running'), budget('b1', 'succeeded')];
    startPolling<BudgetView>({ fetchOnce: async () => answers.shift() ?? null, onRender: (b) => seen.push(b.status), timer });
    expect(timers[0]?.ms).toBe(500);
    for (let i = 0; i < 3; i++) {
      timers[i]?.run();
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(seen).toEqual(['queued', 'running', 'succeeded']);
    expect(timers.map((t) => t.ms)).toEqual([500, 2000, 2000]);
  });
});
