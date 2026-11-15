import { describe, expect, it } from 'vitest';
import { INITIAL_CONNECTION, backoffMs, bufferCount, reduceConnection, statusChip, streamUrl, type ConnectionAction, type ConnectionState } from '../src/lib/state/connection-state.ts';

const run = (state: ConnectionState, action: ConnectionAction, now = 0): ConnectionState => reduceConnection(state, action, now).state;
const live = (): ConnectionState => run(run(run(INITIAL_CONNECTION, { type: 'open' }), { type: 'status', api: 'connected', agent: 'connected', source: 'live' }), { type: 'hello', bootId: 'boot-1', oldestSeq: 1 });

describe('reconnect machine', () => {
  it('backs off 0.5, 1, 2, 4 then 5 s and resets after a successful open', () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffMs)).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
    let state = live();
    const delays: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      state = run(state, { type: 'error' }, 10_000);
      delays.push((state.retryAt ?? 0) - 10_000);
      expect(state.phase).toBe('waiting');
      state = run(state, { type: 'retry' });
      expect(state.phase).toBe('connecting');
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
    state = run(state, { type: 'open' });
    expect(state).toMatchObject({ phase: 'open', attempt: 0, retryAt: null });
  });

  it('ignores a second error while it is already waiting', () => {
    const waiting = run(live(), { type: 'error' }, 100);
    expect(run(waiting, { type: 'error' }, 200)).toBe(waiting);
  });

  it('resumes from the last event id of the same API boot', () => {
    let state = live();
    state = run(state, { type: 'event', seq: 41 });
    state = run(state, { type: 'event', seq: 40 });
    state = run(state, { type: 'event', seq: null });
    expect(state.lastEventId).toBe(41);
    expect(streamUrl(state, '')).toBe('/stream?lastEventId=41&bootId=boot-1');
    expect(streamUrl(INITIAL_CONNECTION, '')).toBe('/stream');
    expect(streamUrl(state, '?source=replay&speed=4&token=x')).toBe('/stream?source=replay&speed=4&lastEventId=41&bootId=boot-1');
  });

  it('asks every reducer to reset when the API boot id changes, and forgets the resume point', () => {
    const state = run(live(), { type: 'event', seq: 900 });
    const same = reduceConnection(state, { type: 'hello', bootId: 'boot-1', oldestSeq: 1 }, 0);
    expect(same.reset).toBe(false);
    expect(same.state.lastEventId).toBe(900);
    const changed = reduceConnection(state, { type: 'hello', bootId: 'boot-2', oldestSeq: 1 }, 0);
    expect(changed.reset).toBe(true);
    expect(changed.state).toMatchObject({ bootId: 'boot-2', lastEventId: null, api: 'connected' });
    expect(reduceConnection(INITIAL_CONNECTION, { type: 'hello', bootId: 'boot-1', oldestSeq: 1 }, 0).reset).toBe(false);
  });

  it('counts the API buffer for the footer, capped at its size', () => {
    let state = live();
    expect(bufferCount(state)).toBe(0);
    state = run(state, { type: 'event', seq: 41 });
    expect(bufferCount(state)).toBe(41);
    state = run(run(state, { type: 'hello', bootId: 'boot-1', oldestSeq: 501 }), { type: 'event', seq: 1500 });
    expect(bufferCount(state)).toBe(1000);
    expect(bufferCount(run(state, { type: 'status', bufferSize: 200 }))).toBe(200);
  });
});

describe('status chip', () => {
  it('is LIVE only with the stream, the API and the agent connected', () => {
    expect(statusChip(live(), true)).toBe('LIVE');
    expect(statusChip(INITIAL_CONNECTION, false)).toBe('RECONNECTING');
  });

  it('shows NO AGENT when metrics stop or the agent link is down', () => {
    expect(statusChip(live(), false)).toBe('NO AGENT');
    expect(statusChip(run(live(), { type: 'status', agent: 'down' }), true)).toBe('NO AGENT');
  });

  it('puts setup problems before the agent state', () => {
    expect(statusChip(run(live(), { type: 'status', api: 'disabled', agent: 'down' }), false)).toBe('API DISABLED');
    expect(statusChip(run(live(), { type: 'status', api: 'token_mismatch' }), true)).toBe('TOKEN MISMATCH');
  });

  it('is RECONNECTING while the browser stream or the API link is down', () => {
    expect(statusChip(run(live(), { type: 'error' }), true)).toBe('RECONNECTING');
    expect(statusChip(run(live(), { type: 'status', api: 'reconnecting' }), true)).toBe('RECONNECTING');
  });

  it('never shows a replay as live', () => {
    const replay = run(live(), { type: 'status', source: 'replay' });
    expect(statusChip(replay, true)).toBe('REPLAY');
    expect(statusChip(replay, false)).toBe('REPLAY');
    expect(statusChip(run(replay, { type: 'error' }), true)).toBe('RECONNECTING');
  });
});
