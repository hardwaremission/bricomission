import type { DiagnosticsEvent, DiagnosticsKind } from '@bricomission/shared-types';
import { beforeEach, describe, expect, it } from 'vitest';
import { KINDS } from '../src/graph/tokens.ts';
import { EMPTY_LOG, MAX_ROWS, appendEvent, appendMarker, clearLog, formatDuration, formatTime, groupDurationMs, groupSummary, isFiltered, toggleKind, visibleRows, type EventRow, type LogState, type PollRow } from '../src/lib/state/log-state.ts';
import { ev, resetSeq } from './support.ts';

const feed = (events: DiagnosticsEvent[], state: LogState = EMPTY_LOG): LogState => events.reduce(appendEvent, state);
const all = { kinds: new Set(KINDS), node: null, allKinds: KINDS.length };

describe('log rows', () => {
  beforeEach(() => resetSeq());

  it('starts a correlation thread header when the correlation id changes and none for system events', () => {
    const state = feed([
      ev({ from: 'browser', to: 'web', kind: 'http', summary: 'POST /api/kitchen-projects/:id/simulations', correlationId: '7f3a000000000000' }),
      ev({ from: 'web', to: 'api-guards', kind: 'http', correlationId: '7f3a000000000000' }),
      ev({ from: 'browser', to: 'web', kind: 'http', summary: 'GET /api/health', correlationId: 'bbbb000000000000' }),
      ev({ from: 'project-service', to: 'storage-client', kind: 'step', summary: 'sweeper deleted 3 expired drafts', correlationId: 'system' }),
    ]);
    expect(state.rows.map((r) => r.type)).toEqual(['thread', 'event', 'event', 'thread', 'event', 'event']);
    expect(state.rows[0]).toMatchObject({ correlationId: '7f3a000000000000', title: 'POST /api/kitchen-projects/:id/simulations' });
    expect(state.total).toBe(4);
    expect(state.lastSeq).toBe(4);
  });

  it('coalesces identical SQL inside 250 ms into one group row with a counter', () => {
    const base = 1_700_000_100_000;
    const sql = (ts: number, summary: string): DiagnosticsEvent => ev({ from: 'data-access', to: 'postgres', kind: 'sql', ts, summary, durationMs: 5 });
    const state = feed([sql(base, 'INSERT "Simulation"'), sql(base + 40, 'INSERT "Render"'), sql(base + 80, 'INSERT "Render"'), sql(base + 300, 'SELECT "PlatformSetting"'), sql(base + 900, 'SELECT "Render"')]);
    const rows = state.rows.filter((r): r is EventRow => r.type === 'event');
    expect(rows).toHaveLength(2);
    expect(rows[0].children).toHaveLength(4);
    expect(groupSummary(rows[0].children)).toBe('INSERT "Simulation", INSERT "Render" x2, SELECT "PlatformSetting"');
    expect(groupDurationMs(rows[0].children)).toBe(20);
    expect(rows[1].children).toHaveLength(1);
  });

  it('groups the 8 parallel catalog queries (starts and replies separately) inside 150 ms', () => {
    const base = 1_700_000_200_000;
    const starts = Array.from({ length: 8 }, (_, i) => ev({ from: 'catalog-search', to: 'embedder', kind: 'embed', ts: base + i * 3, span: { id: `e${i}`, phase: 'start' }, summary: 'POST /v1/embeddings' }));
    const ends = Array.from({ length: 8 }, (_, i) => ev({ from: 'catalog-search', to: 'embedder', kind: 'embed', ts: base + 60 + i * 3, span: { id: `e${i}`, phase: 'end' }, summary: 'POST /v1/embeddings: 1024 dimensions' }));
    const rows = feed([...starts, ...ends]).rows.filter((r): r is EventRow => r.type === 'event');
    expect(rows.map((r) => r.children.length)).toEqual([8, 8]);
    expect(rows[0].event.span?.phase).toBe('start');
    expect(rows[1].event.span?.phase).toBe('end');
  });

  it('never groups a failed event or events of different correlations', () => {
    const base = 1_700_000_300_000;
    const rows = feed([
      ev({ from: 'storage-client', to: 'minio', kind: 'object', ts: base }),
      ev({ from: 'storage-client', to: 'minio', kind: 'object', ts: base + 5, ok: false }),
      ev({ from: 'storage-client', to: 'minio', kind: 'object', ts: base + 10, correlationId: 'cccccccccccccccc' }),
    ]).rows.filter((r) => r.type === 'event');
    expect(rows).toHaveLength(3);
  });

  it('collapses polling into one counter row and starts a new one after a pause', () => {
    const base = 1_700_000_400_000;
    const poll = (ts: number): DiagnosticsEvent => ev({ from: 'web', to: 'api-guards', kind: 'http', ts, poll: true, summary: 'GET /api/kitchen-projects/:id/simulations/:id' });
    let state = feed([poll(base), poll(base + 20), ev({ from: 'simulation-runner', to: 'simulation-runner', kind: 'step', ts: base + 30 }), poll(base + 2000), poll(base + 4000)]);
    const polls = state.rows.filter((r): r is PollRow => r.type === 'poll');
    expect(polls).toHaveLength(1);
    expect(polls[0]).toMatchObject({ count: 4, summaries: ['GET /api/kitchen-projects/:id/simulations/:id'] });
    state = appendEvent(state, poll(base + 20_000));
    expect(state.rows.filter((r) => r.type === 'poll')).toHaveLength(2);
    expect(state.total).toBe(6);
  });

  it('drops duplicates after a resume and marks a gap in the sequence', () => {
    const first = ev({ from: 'browser', to: 'web', kind: 'http' });
    let state = feed([first]);
    expect(appendEvent(state, first)).toBe(state);
    resetSeq(40);
    state = appendEvent(state, ev({ from: 'browser', to: 'web', kind: 'http' }));
    const marker = state.rows.find((r) => r.type === 'marker');
    expect(marker).toMatchObject({ tone: 'gap', text: '39 events missed (evicted from the API buffer before they were read)' });
    expect(state.lastSeq).toBe(41);
  });

  it('accepts inferred events without a numeric id once', () => {
    const mail = ev({ from: 'keycloak', to: 'mailpit', kind: 'mail', id: 'mail-abc', inferred: true, correlationId: 'system' });
    const state = appendEvent(EMPTY_LOG, mail);
    expect(appendEvent(state, mail)).toBe(state);
    expect(state.lastSeq).toBeNull();
    expect(state.rows).toHaveLength(1);
  });

  it('keeps at most MAX_ROWS rows and Clear keeps the sequence', () => {
    let state = EMPTY_LOG;
    for (let i = 0; i < MAX_ROWS + 50; i += 1) state = appendEvent(state, ev({ from: 'browser', to: 'web', kind: 'http', correlationId: 'system', ts: 1_700_000_000_000 + i * 1000 }));
    expect(state.rows).toHaveLength(MAX_ROWS);
    const cleared = clearLog(state);
    expect(cleared.rows).toEqual([]);
    expect(cleared.total).toBe(0);
    expect(appendEvent(cleared, ev({ from: 'browser', to: 'web', kind: 'http', correlationId: 'system' })).rows.map((r) => r.type)).toEqual(['event']);
  });

  it('adds marker rows and restarts the thread after them', () => {
    let state = feed([ev({ from: 'browser', to: 'web', kind: 'http' })]);
    state = appendMarker(state, 'reconnect', 'Stream reconnected', 1);
    state = appendEvent(state, ev({ from: 'browser', to: 'web', kind: 'http' }));
    expect(state.rows.map((r) => r.type)).toEqual(['thread', 'event', 'marker', 'thread', 'event']);
  });
});

describe('log filters', () => {
  beforeEach(() => resetSeq());
  const state = (): LogState =>
    feed([
      ev({ from: 'ai-adapters', to: 'llama-server', kind: 'llm' }),
      ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image' }),
      ev({ from: 'data-access', to: 'postgres', kind: 'sql', ts: 1_800_000_000_000 }),
      ev({ from: 'web', to: 'api-guards', kind: 'http', poll: true, ts: 1_800_000_000_100 }),
    ]);

  it('shows everything without a filter', () => {
    expect(isFiltered(all)).toBe(false);
    expect(visibleRows(state().rows, all)).toHaveLength(state().rows.length);
  });

  it('filters by kind and hides headers and poll counters while filtered', () => {
    const rows = visibleRows(state().rows, { ...all, kinds: new Set<DiagnosticsKind>(['llm', 'image']) });
    expect(rows.map((r) => (r as EventRow).event.kind)).toEqual(['llm', 'image']);
  });

  it('filters by the selected node on either side, combined with kinds', () => {
    expect(visibleRows(state().rows, { ...all, node: 'ai-adapters' })).toHaveLength(2);
    expect(visibleRows(state().rows, { ...all, node: 'comfyui' }).map((r) => (r as EventRow).event.to)).toEqual(['comfyui']);
    expect(visibleRows(state().rows, { ...all, node: 'ai-adapters', kinds: new Set<DiagnosticsKind>(['sql']) })).toEqual([]);
  });

  it('chips isolate a kind from All, then toggle, and removing the last restores All', () => {
    const one = toggleKind(new Set(KINDS), 'llm', KINDS);
    expect([...one]).toEqual(['llm']);
    const two = toggleKind(one, 'image', KINDS);
    expect([...two]).toEqual(['llm', 'image']);
    expect([...toggleKind(two, 'llm', KINDS)]).toEqual(['image']);
    expect(toggleKind(new Set<DiagnosticsKind>(['image']), 'image', KINDS).size).toBe(KINDS.length);
    expect(KINDS).toHaveLength(14);
  });

  it('formats time and durations as the design', () => {
    expect(formatTime(new Date(2026, 10, 15, 14, 2, 31, 505).getTime())).toBe('14:02:31.505');
    expect(formatDuration(41)).toBe('41 ms');
    expect(formatDuration(6100)).toBe('6.1 s');
    expect(formatDuration(120_000)).toBe('120 s');
  });
});
