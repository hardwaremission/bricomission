import type { DiagnosticsEvent } from '@bricomission/shared-types';
import { EDGE_BY_ID } from '../../graph/layout.ts';

/** A 20 ms hop stays lit this long so it can be seen. */
export const MIN_VISIBLE_MS = 600;
/** The green response line fades out over this time. */
export const RESPONSE_FADE_MS = 1000;
/** After its last event an edge (and a node) stays "recently active" this long. */
export const RECENT_MS = 3000;
export const ERROR_MS = 3000;
/** An open span older than this is treated as lost (its end event never arrived). */
export const STALE_SPAN_MS = 5 * 60 * 1000;

export type Direction = 'forward' | 'reverse';
export type EdgePhase = 'idle' | 'active' | 'response' | 'recent' | 'error';

export interface OpenSpan {
  startedAt: number;
  direction: Direction;
  simulated: boolean;
}

export interface EdgeRuntime {
  open: Record<string, OpenSpan>;
  /** Numeric sequence of the last event seen on the edge. */
  lastSeq: number | null;
  /** Client clock of the last request-direction event, response and failure (live events only). */
  pulseAt: number | null;
  pulseDirection: Direction;
  responseAt: number | null;
  responseDirection: Direction;
  errorAt: number | null;
  lastAt: number | null;
  simulated: boolean;
  /** Summary of the latest non-polling event (pin tooltip). */
  lastSummary: string | null;
}

export type EdgesState = Record<string, EdgeRuntime>;

export const EMPTY_EDGE: EdgeRuntime = {
  open: {},
  lastSeq: null,
  pulseAt: null,
  pulseDirection: 'forward',
  responseAt: null,
  responseDirection: 'reverse',
  errorAt: null,
  lastAt: null,
  simulated: false,
  lastSummary: null,
};

/** The structural edge an event travels on. An event that runs against the edge (`to > from`) uses it in reverse. */
export function resolveEdge(from: string, to: string): { id: string; direction: Direction } | null {
  if (from === to) return null;
  if (EDGE_BY_ID[`${from}-${to}`]) return { id: `${from}-${to}`, direction: 'forward' };
  if (EDGE_BY_ID[`${to}-${from}`]) return { id: `${to}-${from}`, direction: 'reverse' };
  return null;
}

const flip = (d: Direction): Direction => (d === 'forward' ? 'reverse' : 'forward');

export interface ReduceOptions {
  /** Buffer replay on connect: spans and sequence are tracked, nothing lights up. */
  replayed?: boolean;
}

/**
 * Span to edge state. `start` opens the span (edge active until its `end`); `end` repeats `from`/`to` of the
 * start event, so the response travels in the opposite direction; an event without a span is one pulse.
 * Polling never opens a span: it only marks the edge as recently active (low intensity).
 */
export function reduceEdges(state: EdgesState, event: DiagnosticsEvent, now: number, options: ReduceOptions = {}): EdgesState {
  const hit = resolveEdge(event.from, event.to);
  if (!hit) return state;
  const prev = state[hit.id] ?? EMPTY_EDGE;
  const seq = /^\d+$/.test(event.id) ? Number(event.id) : prev.lastSeq;
  const next: EdgeRuntime = { ...prev, lastSeq: seq };
  const live = !options.replayed;
  const failed = event.ok === false;

  if (event.poll) {
    if (live) next.lastAt = now;
    if (live && failed) next.errorAt = now;
    return { ...state, [hit.id]: next };
  }

  next.lastSummary = event.summary;
  if (event.span?.phase === 'start') {
    next.open = { ...prev.open, [event.span.id]: { startedAt: now, direction: hit.direction, simulated: event.simulated === true } };
    next.simulated = event.simulated === true;
    if (live) {
      next.pulseAt = now;
      next.pulseDirection = hit.direction;
      next.lastAt = now;
    }
  } else if (event.span?.phase === 'end') {
    const started = prev.open[event.span.id];
    if (started) {
      const rest = { ...prev.open };
      delete rest[event.span.id];
      next.open = rest;
    }
    next.simulated = event.simulated === true || started?.simulated === true;
    if (live) {
      next.lastAt = now;
      if (failed) next.errorAt = now;
      else {
        next.responseAt = now;
        next.responseDirection = flip(started?.direction ?? hit.direction);
      }
    }
  } else {
    next.simulated = event.simulated === true;
    if (live) {
      next.lastAt = now;
      if (failed) next.errorAt = now;
      else {
        next.pulseAt = now;
        next.pulseDirection = hit.direction;
      }
    }
  }
  return { ...state, [hit.id]: next };
}

export interface EdgeView {
  phase: EdgePhase;
  direction: Direction;
  simulated: boolean;
  /** 1 to 0 while the response line fades; 1 otherwise. */
  opacity: number;
  /** `data-active`: a communication is in flight or its response is on the way back. */
  active: boolean;
}

export function edgeView(edge: EdgeRuntime | undefined, now: number): EdgeView {
  const idle: EdgeView = { phase: 'idle', direction: 'forward', simulated: false, opacity: 1, active: false };
  if (!edge) return idle;
  if (edge.errorAt !== null && now - edge.errorAt < ERROR_MS) {
    return { phase: 'error', direction: 'forward', simulated: edge.simulated, opacity: 1, active: false };
  }
  const open = Object.values(edge.open).filter((span) => now - span.startedAt < STALE_SPAN_MS);
  if (open.length > 0) {
    const newest = open.reduce((a, b) => (b.startedAt >= a.startedAt ? b : a));
    return { phase: 'active', direction: newest.direction, simulated: open.some((s) => s.simulated), opacity: 1, active: true };
  }
  if (edge.pulseAt !== null && now - edge.pulseAt < MIN_VISIBLE_MS) {
    return { phase: 'active', direction: edge.pulseDirection, simulated: edge.simulated, opacity: 1, active: true };
  }
  if (edge.responseAt !== null && now - edge.responseAt < RESPONSE_FADE_MS) {
    const opacity = 1 - (now - edge.responseAt) / RESPONSE_FADE_MS;
    return { phase: 'response', direction: edge.responseDirection, simulated: edge.simulated, opacity: Math.max(0.15, opacity), active: true };
  }
  if (edge.lastAt !== null && now - edge.lastAt < RECENT_MS) {
    return { phase: 'recent', direction: 'forward', simulated: edge.simulated, opacity: 1, active: false };
  }
  return { ...idle, simulated: false };
}

/** True while some edge still has a time-based phase to leave (drives the repaint timer). */
export function hasTransientEdges(state: EdgesState, now: number): boolean {
  return Object.values(state).some((edge) => edgeView(edge, now).phase !== 'idle');
}
