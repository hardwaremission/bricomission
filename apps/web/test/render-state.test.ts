import { describe, expect, it } from 'vitest';
import type { KitchenProjectView } from '../src/lib/kitchen-draft/types';
import {
  canStart,
  consumeStartParam,
  historyRenders,
  INITIAL_RESULTS_STATE,
  jobsAhead,
  keptCount,
  limitReached,
  nextPhotoId,
  photoNumber,
  type PollTimer,
  type RenderView,
  resultsPhase,
  resultsReducer,
  type ResultsState,
  shownRender,
  startPolling,
} from '../src/lib/renders/render-state';

const project = {
  id: 'p1',
  status: 'claimed',
  measurements: { lengthCm: 420, widthCm: 310, heightCm: 260 },
  photos: [
    { id: 'ph1', position: 0, width: 800, height: 600, thumbUrl: '/t1', fullUrl: '/f1' },
    { id: 'ph2', position: 1, width: 600, height: 900, thumbUrl: '/t2', fullUrl: '/f2' },
  ],
  moodboard: [],
  claimedAt: '2026-11-15T10:00:00.000Z',
} as unknown as KitchenProjectView;

function render(id: string, status: RenderView['status'], overrides: Partial<RenderView> = {}): RenderView {
  return {
    id,
    status,
    photoId: 'ph1',
    styleId: 'modern',
    mode: 'canny',
    width: 1216,
    height: 832,
    position: null,
    waitingFor: null,
    errorCode: status === 'failed' ? 'adapter_error' : null,
    createdAt: `2026-11-16T10:00:0${id.slice(-1)}.000Z`,
    startedAt: null,
    finishedAt: null,
    beforeUrl: `/b/${id}`,
    fullUrl: status === 'succeeded' ? `/f/${id}` : null,
    thumbUrl: status === 'succeeded' ? `/t/${id}` : null,
    ...overrides,
  };
}

const loaded = (renders: RenderView[], maxRenders = 10): ResultsState =>
  resultsReducer(INITIAL_RESULTS_STATE, { type: 'loaded', project, renders, maxRenders });

describe('results state (controlnet-render)', () => {
  it('no Renders: empty phase, photo 1 selected, start allowed', () => {
    const state = loaded([]);
    expect(resultsPhase(state)).toBe('empty');
    expect(state.photoId).toBe('ph1');
    expect(canStart(state)).toBe(true);
    expect(resultsPhase(INITIAL_RESULTS_STATE)).toBe('loading');
  });

  it('an active Render is shown and blocks starting; it stays shown after it succeeds', () => {
    let state = loaded([render('r1', 'succeeded')]);
    state = resultsReducer(state, { type: 'startRequested' });
    expect(resultsPhase(state)).toBe('active');
    expect(canStart(state)).toBe(false);
    state = resultsReducer(state, { type: 'startFinished', render: render('r2', 'queued', { position: 2 }) });
    expect(state.shownId).toBe('r2');
    expect(resultsPhase(state)).toBe('active');
    expect(jobsAhead(shownRender(state))).toBe(2);
    state = resultsReducer(state, { type: 'renderUpdated', render: render('r2', 'running') });
    expect(jobsAhead(shownRender(state))).toBeNull();
    state = resultsReducer(state, { type: 'renderUpdated', render: render('r2', 'succeeded') });
    expect(resultsPhase(state)).toBe('succeeded');
    expect(state.shownId).toBe('r2');
    expect(historyRenders(state).map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(keptCount(state)).toBe(2);
  });

  it('a failed newest Render gives the failed phase; Try again keeps its photo; history ignores it', () => {
    let state = loaded([render('r2', 'failed', { photoId: 'ph2' }), render('r1', 'succeeded')]);
    expect(resultsPhase(state)).toBe('failed');
    state = resultsReducer(state, { type: 'photoSelected', photoId: 'ph1' });
    expect(nextPhotoId(state)).toBe('ph2');
    expect(historyRenders(state).map((r) => r.id)).toEqual(['r1']);
    expect(keptCount(state)).toBe(1);
    state = resultsReducer(state, { type: 'renderShown', renderId: 'r1' });
    expect(resultsPhase(state)).toBe('succeeded');
    expect(nextPhotoId(state)).toBe('ph1');
  });

  it('the limit counts non-failed Renders; offline and starting disable the CTA', () => {
    const full = loaded([render('r2', 'succeeded'), render('r1', 'succeeded'), render('r3', 'failed')], 2);
    expect(limitReached(full)).toBe(true);
    expect(canStart(full)).toBe(false);
    const one = loaded([render('r1', 'succeeded')], 2);
    expect(canStart(one)).toBe(true);
    expect(canStart(resultsReducer(one, { type: 'connectivity', online: false }))).toBe(false);
    const failedStart = resultsReducer(resultsReducer(one, { type: 'startRequested' }), { type: 'startFinished', render: null, alert: 'queueFull' });
    expect(failedStart).toMatchObject({ starting: false, alert: 'queueFull' });
    expect(canStart(failedStart)).toBe(true);
  });

  it('photo numbers, the default photo of the shown Render, and history taps are ignored while busy', () => {
    const state = loaded([render('r1', 'succeeded', { photoId: 'ph2' })]);
    expect(state.photoId).toBe('ph2');
    expect(photoNumber(state, 'ph2')).toBe(2);
    expect(photoNumber(state, null)).toBe(1);
    const busy = resultsReducer(state, { type: 'startFinished', render: render('r2', 'running') });
    expect(resultsReducer(busy, { type: 'renderShown', renderId: 'r1' }).shownId).toBe('r2');
  });

  it('consumeStartParam reads start=1 and asks to strip start/claimed', () => {
    expect(consumeStartParam('?claimed=1&start=1')).toEqual({ start: true, changed: true });
    expect(consumeStartParam('?claimed=1')).toEqual({ start: false, changed: true });
    expect(consumeStartParam('')).toEqual({ start: false, changed: false });
  });
});

describe('startPolling', () => {
  function manualTimer() {
    const pending: Array<{ run: () => void; ms: number; cleared: boolean }> = [];
    const timer: PollTimer = {
      set: (run, ms) => {
        const entry = { run, ms, cleared: false };
        pending.push(entry);
        return entry;
      },
      clear: (handle) => {
        (handle as { cleared: boolean }).cleared = true;
      },
    };
    const fire = async () => {
      const next = pending.find((entry) => !entry.cleared);
      if (!next) return false;
      next.cleared = true;
      next.run();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      return true;
    };
    return { timer, pending, fire };
  }

  it('polls after 0.5 s, then every 2 s, one request at a time, until a terminal Render', async () => {
    const { timer, pending, fire } = manualTimer();
    const answers = [render('r1', 'queued'), null, render('r1', 'running'), render('r1', 'succeeded')];
    const seen: string[] = [];
    let calls = 0;
    startPolling({ fetchOnce: async () => answers[calls++] ?? null, onRender: (r) => seen.push(r.status), timer });
    expect(pending[0].ms).toBe(500);
    while (await fire());
    expect(pending.slice(1).map((entry) => entry.ms)).toEqual([2000, 2000, 2000]);
    expect(calls).toBe(4);
    expect(seen).toEqual(['queued', 'running', 'succeeded']);
  });

  it('stop() cancels the next poll (offline, unmount)', async () => {
    const { timer, fire } = manualTimer();
    let calls = 0;
    const poller = startPolling({ fetchOnce: async () => (calls++, render('r1', 'running')), onRender: () => undefined, timer });
    await fire();
    poller.stop();
    expect(await fire()).toBe(false);
    expect(calls).toBe(1);
  });
});
