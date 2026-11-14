import { describe, expect, it } from 'vitest';
import type { SimulationView } from '../src/lib/simulations/simulation-state';
import {
  activeBudget,
  budgetPhase,
  computeStage,
  currentBudget,
  failedBudget,
  selectionIssue,
  budgetReducer,
  type BudgetState,
  type BudgetView,
  canStart,
  failureAlertKey,
  formatMoney,
  formatQuantity,
  INITIAL_BUDGET_STATE,
  jobsAhead,
  orderedTiers,
  type PollTimer,
  startPolling,
} from '../src/lib/budget/budget-state';

function budget(id: string, status: BudgetView['status'], overrides: Partial<BudgetView> = {}): BudgetView {
  return {
    id,
    simulationId: 's1',
    status,
    stage: 'pricing',
    progress: { total: 1, done: 1 },
    relabeled: false,
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

const simulation = (overrides: Partial<SimulationView> = {}): SimulationView =>
  ({ id: 's1', ordinal: 2, status: 'succeeded', selected: true, renders: [], budget: null, ...overrides }) as unknown as SimulationView;

const loaded = (budgets: BudgetView[], sim: SimulationView | null = simulation()): BudgetState => budgetReducer(INITIAL_BUDGET_STATE, { type: 'loaded', simulation: sim, budgets });

describe('budget state (simulations-ux-overhaul: one Budget per Simulation)', () => {
  it('loading, then empty for a selected succeeded Simulation without a Budget; start allowed', () => {
    expect(budgetPhase(INITIAL_BUDGET_STATE)).toBe('loading');
    const state = loaded([]);
    expect(budgetPhase(state)).toBe('empty');
    expect(canStart(state)).toBe(true);
  });

  it('no selected Simulation: noSelection phase, nothing can start; a partial one is notReady', () => {
    const none = loaded([], null);
    expect(budgetPhase(none)).toBe('noSelection');
    expect(selectionIssue(none)).toBe('noSelection');
    expect(canStart(none)).toBe(false);
    const partial = loaded([], simulation({ status: 'partial' }));
    expect(budgetPhase(partial)).toBe('notReady');
    expect(canStart(partial)).toBe(false);
  });

  it('a 409 on start flips to the matching alert phase', () => {
    const state = loaded([]);
    const noSel = budgetReducer(state, { type: 'startFinished', budget: null, alert: 'noSelection' });
    expect(budgetPhase(noSel)).toBe('noSelection');
    const notReady = budgetReducer(state, { type: 'startFinished', budget: null, alert: 'notReady' });
    expect(budgetPhase(notReady)).toBe('notReady');
    expect(budgetPhase(budgetReducer(notReady, { type: 'startRequested' }))).toBe('computing');
  });

  it('first Budget: computing while active, then succeeded', () => {
    let state = budgetReducer(loaded([]), { type: 'startFinished', budget: budget('b1', 'queued') });
    expect(budgetPhase(state)).toBe('computing');
    expect(activeBudget(state)?.id).toBe('b1');
    expect(canStart(state)).toBe(false);
    state = budgetReducer(state, { type: 'budgetUpdated', budget: budget('b1', 'succeeded') });
    expect(budgetPhase(state)).toBe('succeeded');
    expect(currentBudget(state)?.id).toBe('b1');
    expect(canStart(state)).toBe(true);
  });

  it('recalculating keeps the previous Budget until the new one succeeds, then only one remains', () => {
    let state = budgetReducer(loaded([budget('b1', 'succeeded')]), { type: 'startFinished', budget: budget('b2', 'running') });
    expect(budgetPhase(state)).toBe('recalculating');
    expect(currentBudget(state)?.id).toBe('b1');
    expect(activeBudget(state)?.id).toBe('b2');
    expect(canStart(state)).toBe(false);
    state = budgetReducer(state, { type: 'budgetUpdated', budget: budget('b2', 'succeeded') });
    expect(state.budgets.map((b) => b.id)).toEqual(['b2']);
    expect(budgetPhase(state)).toBe('succeeded');
  });

  it('a failed recalculation keeps the old Budget visible under the failed phase; the next start drops the failed row', () => {
    let state = loaded([budget('b2', 'failed'), budget('b1', 'succeeded')]);
    expect(budgetPhase(state)).toBe('failed');
    expect(currentBudget(state)?.id).toBe('b1');
    expect(failedBudget(state)?.id).toBe('b2');
    state = budgetReducer(state, { type: 'startFinished', budget: budget('b3', 'queued') });
    expect(state.budgets.map((b) => b.id)).toEqual(['b3', 'b1']);
    expect(failedBudget(state)).toBeNull();
    expect(budgetPhase(loaded([budget('b1', 'failed')]))).toBe('failed');
  });

  it('offline and in-flight POST disable the action; start clears the alert', () => {
    const state = loaded([]);
    expect(canStart(budgetReducer(state, { type: 'connectivity', online: false }))).toBe(false);
    const starting = budgetReducer({ ...state, alert: 'queueFull' }, { type: 'startRequested' });
    expect(starting.alert).toBe('none');
    expect(canStart(starting)).toBe(false);
    expect(budgetPhase(starting)).toBe('computing');
    expect(budgetReducer(starting, { type: 'startFinished', budget: null, alert: 'searchDown' })).toMatchObject({ starting: false, alert: 'searchDown' });
  });

  it('stage line: waiting, reading image n of N (n = done + 1), then matching products', () => {
    expect(computeStage(null).stage).toBe('queued');
    expect(computeStage(budget('b1', 'queued')).stage).toBe('queued');
    expect(computeStage(budget('b1', 'running', { stage: 'inventory', progress: { total: 6, done: 1 } }))).toEqual({ stage: 'inventory', n: 2, count: 6, percent: 33 });
    expect(computeStage(budget('b1', 'running', { stage: 'inventory', progress: { total: 3, done: 3 } })).n).toBe(3);
    expect(computeStage(budget('b1', 'running', { stage: 'pricing', progress: { total: 6, done: 6 } })).stage).toBe('pricing');
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
