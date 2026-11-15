'use client';

import type { DiagnosticsEvent, DiagnosticsKind, DiagnosticsMetricsSample, DiagnosticsNodeId, DiagnosticsTopology } from '@bricomission/shared-types';
import { useSyncExternalStore } from 'react';
import { checkTopology } from '../graph/layout.ts';
import { KINDS } from '../graph/tokens.ts';
import { INITIAL_CONNECTION, reduceConnection, type ConnectionAction, type ConnectionState } from './state/connection-state.ts';
import { hasTransientEdges, reduceEdges, type EdgesState } from './state/edge-state.ts';
import { EMPTY_LOG, appendEvent, appendMarker, clearLog, toggleKind, type LogState, type MarkerRow } from './state/log-state.ts';
import { EMPTY_METRICS, type MetricsState } from './state/metrics-state.ts';
import { hasTransientNodes, reduceNodes, type NodesState } from './state/node-state.ts';

export interface DashboardState {
  edges: EdgesState;
  nodes: NodesState;
  log: LogState;
  metrics: MetricsState;
  conn: ConnectionState;
  topology: DiagnosticsTopology | null;
  topologyProblems: string[];
  /** Client clock of the last repaint tick: every time-based view (fade, recent, stale agent) derives from it. */
  now: number;
  /** Highest sequence that was already in the API buffer at connect: events up to it never animate. */
  replayedUpTo: number;
  paused: boolean;
  /** Events held back while the log is paused (applied on resume). */
  held: DiagnosticsEvent[];
  collapsed: boolean;
  /** Events that arrived while the log was collapsed. */
  unread: number;
  kinds: ReadonlySet<DiagnosticsKind>;
  selected: DiagnosticsNodeId | null;
  legendOpen: boolean;
}

const MAX_HELD = 5000;
const FLUSH_MS = 50;

let state: DashboardState = {
  edges: {},
  nodes: {},
  log: EMPTY_LOG,
  metrics: EMPTY_METRICS,
  conn: INITIAL_CONNECTION,
  topology: null,
  topologyProblems: [],
  now: 0,
  replayedUpTo: 0,
  paused: false,
  held: [],
  collapsed: false,
  unread: 0,
  kinds: new Set(KINDS),
  selected: null,
  legendOpen: true,
};

const listeners = new Set<() => void>();
let pending: DiagnosticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<DashboardState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function getState(): DashboardState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribes to a slice. The selector must return a primitive or a reference that is stable while nothing relevant changed. */
export function useDashboard<T>(selector: (s: DashboardState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

function flush(): void {
  flushTimer = null;
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  const now = Date.now();
  let { edges, nodes, log, held, unread, conn } = state;
  for (const event of batch) {
    const seq = /^\d+$/.test(event.id) ? Number(event.id) : null;
    if (seq !== null && conn.lastEventId !== null && seq <= conn.lastEventId) continue; // duplicate after a resume
    const replayed = seq !== null && seq <= state.replayedUpTo;
    edges = reduceEdges(edges, event, now, { replayed });
    nodes = reduceNodes(nodes, event, now, { replayed });
    conn = reduceConnection(conn, { type: 'event', seq }, now).state;
    if (state.paused) held = held.length >= MAX_HELD ? held : [...held, event];
    else log = appendEvent(log, event);
    if (state.collapsed && !event.poll) unread += 1;
  }
  set({ edges, nodes, log, held, unread, conn, now });
}

export const actions = {
  event(event: DiagnosticsEvent): void {
    pending.push(event);
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  },
  metrics(sample: DiagnosticsMetricsSample): void {
    set({ metrics: { sample, receivedAt: Date.now() } });
  },
  connection(action: ConnectionAction): void {
    const now = Date.now();
    const result = reduceConnection(state.conn, action, now);
    set({ conn: result.state, now });
  },
  /** `hello` of the API stream: a changed boot id clears every reducer and leaves a marker in the log. */
  hello(hello: { bootId: string; oldestSeq: number; newestSeq: number }): void {
    flush();
    const now = Date.now();
    const result = reduceConnection(state.conn, { type: 'hello', bootId: hello.bootId, oldestSeq: hello.oldestSeq }, now);
    if (result.reset) {
      set({
        conn: result.state,
        edges: {},
        nodes: {},
        held: [],
        replayedUpTo: hello.newestSeq,
        log: appendMarker({ ...state.log, lastSeq: null }, 'boot', 'The API restarted: graph state cleared, its event buffer starts again', now),
        now,
      });
    } else {
      set({ conn: result.state, replayedUpTo: Math.max(hello.newestSeq, 0), now });
    }
  },
  marker(tone: MarkerRow['tone'], text: string): void {
    flush();
    set({ log: appendMarker(state.log, tone, text, Date.now()) });
  },
  topology(topology: DiagnosticsTopology | null): void {
    const problems = topology ? checkTopology(topology) : [];
    if (problems.length > 0) console.warn('diagnostics: the API topology differs from the dashboard layout', problems);
    set({ topology, topologyProblems: problems });
  },
  tick(): void {
    const now = Date.now();
    // Repaint only while something time-based is on screen, plus once a second for the agent staleness and the retry countdown.
    if (hasTransientEdges(state.edges, state.now) || hasTransientNodes(state.nodes, state.now) || now - state.now >= 1000) set({ now });
  },
  setPaused(paused: boolean): void {
    if (paused === state.paused) return;
    if (paused) return set({ paused: true });
    let log = state.log;
    for (const event of state.held) log = appendEvent(log, event);
    set({ paused: false, held: [], log });
  },
  clear(): void {
    set({ log: clearLog(state.log), held: [], unread: 0 });
  },
  setCollapsed(collapsed: boolean): void {
    set({ collapsed, unread: 0 });
  },
  toggleKind(kind: DiagnosticsKind): void {
    set({ kinds: toggleKind(state.kinds, kind, KINDS) });
  },
  setKind(kind: DiagnosticsKind, on: boolean): void {
    const next = new Set(state.kinds);
    if (on) next.add(kind);
    else next.delete(kind);
    set({ kinds: next });
  },
  allKinds(): void {
    set({ kinds: new Set(KINDS) });
  },
  select(node: DiagnosticsNodeId | null): void {
    set({ selected: node === state.selected ? null : node });
  },
  setLegend(open: boolean): void {
    set({ legendOpen: open });
  },
};
