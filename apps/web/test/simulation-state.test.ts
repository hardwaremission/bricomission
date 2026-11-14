import { describe, expect, it } from 'vitest';
import type { KitchenProjectView } from '../src/lib/kitchen-draft/types';
import {
  activeStage,
  canRetry,
  canStart,
  failedRenders,
  INITIAL_RESULTS_STATE,
  isInterrupted,
  jobsAhead,
  progressNumbers,
  type RenderView,
  resultsPhase,
  resultsReducer,
  type ResultsState,
  shownRender,
  shownSimulation,
  SLIDER_START,
  type SimulationView,
  styleSources,
} from '../src/lib/simulations/simulation-state';

const project = {
  id: 'p1',
  status: 'claimed',
  measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 },
  photos: [
    { id: 'ph1', position: 0, width: 800, height: 600, thumbUrl: '/t1', fullUrl: '/f1' },
    { id: 'ph2', position: 1, width: 600, height: 900, thumbUrl: '/t2', fullUrl: '/f2' },
    { id: 'ph3', position: 2, width: 600, height: 900, thumbUrl: '/t3', fullUrl: '/f3' },
  ],
  moodboard: [],
  claimedAt: '2026-11-15T10:00:00.000Z',
} as unknown as KitchenProjectView;

function render(simulation: number, position: number, status: RenderView['status'], overrides: Partial<RenderView> = {}): RenderView {
  const id = `r${simulation}-${position}`;
  return {
    id,
    simulationId: `s${simulation}`,
    status,
    photoId: `ph${position + 1}`,
    photoPosition: position,
    attempts: 1,
    mode: 'canny',
    width: 1216,
    height: 832,
    position: null,
    waitingFor: null,
    errorCode: status === 'failed' ? 'adapter_error' : null,
    createdAt: '2026-11-16T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    beforeUrl: `/b/${id}`,
    fullUrl: status === 'succeeded' ? `/f/${id}` : null,
    thumbUrl: status === 'succeeded' ? `/t/${id}` : null,
    ...overrides,
  };
}

function simulation(ordinal: number, statuses: RenderView['status'][], overrides: Partial<SimulationView> = {}): SimulationView {
  const renders = statuses.map((status, position) => render(ordinal, position, status));
  const succeeded = statuses.filter((status) => status === 'succeeded').length;
  const failed = statuses.filter((status) => status === 'failed').length;
  const active = statuses.some((status) => status === 'queued' || status === 'running');
  return {
    id: `s${ordinal}`,
    ordinal,
    createdAt: `2026-11-16T10:00:0${ordinal}.000Z`,
    status: active ? 'active' : failed === 0 ? 'succeeded' : succeeded === 0 ? 'failed' : 'partial',
    stage: active ? 'rendering' : 'finished',
    progress: { total: statuses.length, succeeded, failed, current: active ? succeeded + failed + 1 : 0 },
    selected: false,
    blendMode: 'both',
    styleDegraded: false,
    style: { keywords: [], references: [] },
    renders,
    budget: null,
    ...overrides,
  };
}

const loaded = (simulations: SimulationView[]): ResultsState => resultsReducer(INITIAL_RESULTS_STATE, { type: 'loaded', project, simulations });

describe('results state (simulations)', () => {
  it('no Simulations: empty phase, start allowed', () => {
    const state = loaded([]);
    expect(resultsPhase(state)).toBe('empty');
    expect(canStart(state)).toBe(true);
    expect(shownSimulation(state)).toBeNull();
    expect(resultsPhase(INITIAL_RESULTS_STATE)).toBe('loading');
  });

  it('shows the newest Simulation and its first succeeded Render; the list is newest first', () => {
    const state = loaded([simulation(1, ['succeeded', 'succeeded']), simulation(2, ['failed', 'succeeded'])]);
    expect(state.simulations.map((s) => s.ordinal)).toEqual([2, 1]);
    expect(shownSimulation(state)?.ordinal).toBe(2);
    expect(shownRender(state)?.id).toBe('r2-1');
    expect(resultsPhase(state)).toBe('partial');
  });

  it('an active Simulation is shown and blocks starting, retrying and switching; it stays shown when it finishes', () => {
    let state = loaded([simulation(1, ['succeeded', 'succeeded', 'succeeded'])]);
    state = resultsReducer(state, { type: 'startFinished', simulation: simulation(2, ['queued', 'queued', 'queued']) });
    expect(resultsPhase(state)).toBe('active');
    expect(state.shownSimulationId).toBe('s2');
    expect(canStart(state)).toBe(false);
    expect(canRetry(state)).toBe(false);
    expect(resultsReducer(state, { type: 'simulationShown', simulationId: 's1' }).shownSimulationId).toBe('s2');
    state = resultsReducer(state, { type: 'simulationUpdated', simulation: simulation(2, ['succeeded', 'succeeded', 'succeeded']) });
    expect(resultsPhase(state)).toBe('succeeded');
    expect(state.shownSimulationId).toBe('s2');
    expect(canStart(state)).toBe(true);
  });

  it('the slider position is page state: it starts at 50 and survives switching Render and Simulation', () => {
    let state = loaded([simulation(1, ['succeeded', 'succeeded', 'succeeded']), simulation(2, ['succeeded', 'succeeded', 'succeeded'])]);
    expect(state.sliderValue).toBe(SLIDER_START);
    expect(SLIDER_START).toBe(50);
    state = resultsReducer(state, { type: 'sliderMoved', value: 0 });
    state = resultsReducer(state, { type: 'renderShown', renderId: 'r2-2' });
    expect(state.shownRenderId).toBe('r2-2');
    expect(state.sliderValue).toBe(0);
    state = resultsReducer(state, { type: 'sliderMoved', value: 73.4 });
    state = resultsReducer(state, { type: 'simulationShown', simulationId: 's1' });
    expect(state.shownSimulationId).toBe('s1');
    expect(state.sliderValue).toBe(73);
    // The same photo stays shown in the other Simulation.
    expect(state.shownRenderId).toBe('r1-2');
    expect(resultsReducer(state, { type: 'sliderMoved', value: 140 }).sliderValue).toBe(100);
    expect(resultsReducer(state, { type: 'sliderMoved', value: -4 }).sliderValue).toBe(0);
  });

  it('the photo shown is kept across a new, still running Simulation', () => {
    let state = loaded([simulation(1, ['succeeded', 'succeeded', 'succeeded'])]);
    state = resultsReducer(state, { type: 'renderShown', renderId: 'r1-2' });
    state = resultsReducer(state, { type: 'startFinished', simulation: simulation(2, ['queued', 'queued', 'queued']) });
    expect(state.shownRenderId).toBeNull();
    state = resultsReducer(state, { type: 'simulationUpdated', simulation: simulation(2, ['succeeded', 'succeeded', 'succeeded']) });
    expect(state.shownRenderId).toBe('r2-2');
  });

  it('switching to a Simulation without that photo succeeded falls back to its first succeeded Render', () => {
    let state = loaded([simulation(1, ['succeeded', 'failed', 'succeeded']), simulation(2, ['succeeded', 'succeeded', 'succeeded'])]);
    state = resultsReducer(state, { type: 'renderShown', renderId: 'r2-1' });
    state = resultsReducer(state, { type: 'simulationShown', simulationId: 's1' });
    expect(state.shownRenderId).toBe('r1-0');
  });

  it('partial: failed Renders are listed in photo order; retry works only when idle and online', () => {
    const state = loaded([simulation(1, ['succeeded', 'failed', 'failed'])]);
    expect(resultsPhase(state)).toBe('partial');
    expect(failedRenders(shownSimulation(state)).map((r) => r.id)).toEqual(['r1-1', 'r1-2']);
    expect(canRetry(state)).toBe(true);
    expect(canRetry(resultsReducer(state, { type: 'connectivity', online: false }))).toBe(false);
    expect(canStart(resultsReducer(state, { type: 'connectivity', online: false }))).toBe(false);
  });

  it('all failed gives the failed phase; interrupted is told apart', () => {
    const failed = simulation(1, ['failed', 'failed']);
    expect(resultsPhase(loaded([failed]))).toBe('failed');
    expect(isInterrupted(failed)).toBe(false);
    const interrupted = simulation(1, ['failed', 'failed']);
    interrupted.renders.forEach((r) => (r.errorCode = 'interrupted'));
    expect(isInterrupted(interrupted)).toBe(true);
  });

  it('retry queue: queued ids are consumed one at a time', () => {
    let state = loaded([simulation(1, ['failed', 'failed'])]);
    state = resultsReducer(state, { type: 'retryQueued', renderIds: ['r1-1'] });
    expect(state.retryQueue).toEqual(['r1-1']);
    state = resultsReducer(state, { type: 'retryShifted' });
    expect(state.retryQueue).toEqual([]);
  });

  it('start outcomes: queue full keeps the list and sets the alert; a start clears it', () => {
    let state = loaded([]);
    state = resultsReducer(state, { type: 'startRequested' });
    expect(resultsPhase(state)).toBe('active');
    expect(canStart(state)).toBe(false);
    state = resultsReducer(state, { type: 'startFinished', simulation: null, alert: 'queueFull' });
    expect(state.alert).toBe('queueFull');
    expect(resultsPhase(state)).toBe('empty');
    state = resultsReducer(state, { type: 'startRequested' });
    expect(state.alert).toBe('none');
  });

  it('progress "n of N" and stage', () => {
    const rendering = simulation(1, ['succeeded', 'running', 'queued', 'queued']);
    expect(progressNumbers(rendering)).toEqual({ n: 2, count: 4, percent: 50 });
    expect(activeStage(rendering)).toBe('rendering');
    const waiting = simulation(1, ['queued', 'queued', 'queued'], { progress: { total: 3, succeeded: 0, failed: 0, current: 0 } });
    expect(progressNumbers(waiting)).toEqual({ n: 1, count: 3, percent: 33 });
    expect(activeStage(waiting)).toBe('queued');
    expect(activeStage(simulation(1, ['queued'], { stage: 'describing' }))).toBe('describing');
    expect(activeStage(null)).toBe('queued');
  });

  it('jobs ahead comes from the first queued Render with a position', () => {
    expect(jobsAhead(simulation(1, ['queued']))).toBeNull();
    const queued = simulation(1, ['queued', 'queued']);
    queued.renders[1]!.position = 2;
    expect(jobsAhead(queued)).toBe(2);
    expect(jobsAhead(null)).toBeNull();
  });

  it('style sources count distinct gallery styles and uploads', () => {
    const style = {
      keywords: [],
      references: [
        { kind: 'gallery' as const, refId: 'scandinavian-01', weightPercent: 30 },
        { kind: 'gallery' as const, refId: 'scandinavian-03', weightPercent: 20 },
        { kind: 'gallery' as const, refId: 'mediterranean-02', weightPercent: 20 },
        { kind: 'upload' as const, refId: 'u1', weightPercent: 30 },
      ],
    };
    expect(styleSources(simulation(1, ['succeeded'], { style }))).toEqual({ styles: ['scandinavian', 'mediterranean'], uploads: 1 });
  });
});
