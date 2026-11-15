import type { DiagnosticsContainerState, DiagnosticsEvent, DiagnosticsNodeId } from '@bricomission/shared-types';
import { ERROR_MS, MIN_VISIBLE_MS, RECENT_MS, STALE_SPAN_MS, type ReduceOptions } from './edge-state.ts';

export type NodePhase = 'idle' | 'working' | 'recent' | 'error' | 'offline';

export interface NodeRuntime {
  /** Open spans the node takes part in (span id to client start time). */
  open: Record<string, number>;
  lastAt: number | null;
  errorAt: number | null;
  /** Event time (server clock) of the last event, for "last seen". */
  lastTs: number | null;
  lastSummary: string | null;
  lastOk: boolean;
  /** Communications the node took part in since the buffer start (span starts and single events; polling and responses excluded). */
  count: number;
  /** Latest progress text narrated by the node itself (for example "rendering 3 of 6"). */
  progress: string | null;
}

export type NodesState = Partial<Record<DiagnosticsNodeId, NodeRuntime>>;

export const EMPTY_NODE: NodeRuntime = { open: {}, lastAt: null, errorAt: null, lastTs: null, lastSummary: null, lastOk: true, count: 0, progress: null };

function touch(prev: NodeRuntime, event: DiagnosticsEvent, now: number, live: boolean): NodeRuntime {
  const next: NodeRuntime = { ...prev, lastTs: event.ts };
  if (event.poll) {
    if (live) next.lastAt = now;
    return next;
  }
  next.lastSummary = event.summary;
  next.lastOk = event.ok !== false;
  if (event.span?.phase === 'start') {
    next.open = { ...prev.open, [event.span.id]: now };
    next.count = prev.count + 1;
  } else if (event.span?.phase === 'end') {
    if (event.span.id in prev.open) {
      const rest = { ...prev.open };
      delete rest[event.span.id];
      next.open = rest;
    }
  } else {
    next.count = prev.count + 1;
  }
  if (live) {
    next.lastAt = now;
    if (event.ok === false) next.errorAt = now;
    else if (prev.errorAt !== null) next.errorAt = null; // The next ok event clears the error.
  }
  return next;
}

/** Node state from event traffic. The failing side of a communication is its target (the design turns the target node red). */
export function reduceNodes(state: NodesState, event: DiagnosticsEvent, now: number, options: ReduceOptions = {}): NodesState {
  const live = !options.replayed;
  const next: NodesState = { ...state };
  const ids = event.from === event.to ? [event.from] : [event.from, event.to];
  for (const id of ids) {
    let node = touch(state[id] ?? EMPTY_NODE, event, now, live);
    // Only the target of a failed call turns red; the caller just records the activity.
    if (event.ok === false && ids.length === 2 && id === event.from && live) node = { ...node, errorAt: state[id]?.errorAt ?? null };
    if (id === event.from && event.from === event.to && event.kind === 'step') node = { ...node, progress: event.summary };
    next[id] = node;
  }
  return next;
}

export interface NodeView {
  phase: NodePhase;
  working: boolean;
}

/** `offline` comes from the metrics agent (container exited or absent); events alone never make a node offline. */
export function nodeView(node: NodeRuntime | undefined, now: number, container?: DiagnosticsContainerState | null): NodeView {
  if (container === 'exited' || container === 'absent') return { phase: 'offline', working: false };
  if (!node) return { phase: container === 'unhealthy' ? 'error' : 'idle', working: false };
  const open = Object.values(node.open).some((startedAt) => now - startedAt < STALE_SPAN_MS);
  const working = open || (node.lastAt !== null && now - node.lastAt < MIN_VISIBLE_MS);
  if (node.errorAt !== null && now - node.errorAt < ERROR_MS) return { phase: 'error', working };
  if (container === 'unhealthy') return { phase: 'error', working };
  if (working) return { phase: 'working', working };
  if (node.lastAt !== null && now - node.lastAt < RECENT_MS) return { phase: 'recent', working };
  return { phase: 'idle', working };
}

const COUNTER_LABEL: Partial<Record<DiagnosticsNodeId, string>> = {
  'api-guards': 'req',
  'project-service': 'ops',
  'style-gallery': 'reads',
  'simulation-runner': 'steps',
  'budget-engine': 'steps',
  'image-pipeline': 'img',
  'style-engine': 'calcs',
  'gpu-broker': 'jobs',
  'budget-math': 'checks',
  'catalog-search': 'queries',
  'residency-hook': 'hooks',
  'ai-adapters': 'calls',
  'storage-client': 'objects',
  'data-access': 'queries',
};

/**
 * The module's own counter line: a real count of the communications it took part in, or the progress it
 * narrated while it works. Never a CPU or RAM share (modules share the API process).
 */
export function counterLine(id: DiagnosticsNodeId, node: NodeRuntime | undefined, working: boolean): string {
  const count = node?.count ?? 0;
  if (id === 'web') return `proxied ${count} req`;
  if (id === 'browser') return 'portrait app';
  if (working && node) {
    const render = /rendering (\d+) of (\d+)/i.exec(node.progress ?? '');
    if (id === 'simulation-runner' && render) return `render ${render[1]} of ${render[2]}`;
    const job = /^run (\w+) job/.exec(node.lastSummary ?? '');
    if (id === 'gpu-broker' && job) return `running ${job[1]} job`;
  }
  if (id === 'residency-hook' && node?.lastSummary) {
    if (/reload/i.test(node.lastSummary)) return 'LLM reloading';
    if (/unload/i.test(node.lastSummary)) return 'LLM unloaded';
  }
  return `${COUNTER_LABEL[id] ?? 'events'} ${count}`;
}

export function hasTransientNodes(state: NodesState, now: number): boolean {
  return Object.values(state).some((node) => {
    const phase = nodeView(node, now).phase;
    return phase !== 'idle';
  });
}
