import { describe, expect, it } from 'vitest';
import { consumeStartParam, isActive, type PollTimer, startPolling } from '../src/lib/renders/render-state';

const render = (id: string, status: string) => ({ id, status });

describe('render-state helpers', () => {
  it('isActive covers queued/running Renders and Budgets and active Simulations', () => {
    for (const status of ['queued', 'running', 'active']) expect(isActive({ status })).toBe(true);
    for (const status of ['succeeded', 'failed', 'partial']) expect(isActive({ status })).toBe(false);
    expect(isActive(null)).toBe(false);
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

  it('polls after 0.5 s, then every 2 s, one request at a time, until a terminal item', async () => {
    const { timer, pending, fire } = manualTimer();
    const answers = [render('r1', 'queued'), null, render('r1', 'active'), render('r1', 'succeeded')];
    const seen: string[] = [];
    let calls = 0;
    startPolling({ fetchOnce: async () => answers[calls++] ?? null, onRender: (r) => seen.push(r.status), timer });
    expect(pending[0].ms).toBe(500);
    while (await fire());
    expect(pending.slice(1).map((entry) => entry.ms)).toEqual([2000, 2000, 2000]);
    expect(calls).toBe(4);
    expect(seen).toEqual(['queued', 'active', 'succeeded']);
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
