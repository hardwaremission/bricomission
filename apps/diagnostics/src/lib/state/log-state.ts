import type { DiagnosticsEvent, DiagnosticsKind, DiagnosticsNodeId } from '@bricomission/shared-types';

/** Identical SQL inside this window (same correlation, same hop) becomes one group row. */
export const SQL_GROUP_MS = 250;
/** Parallel identical-shape events (the 8 catalog queries) inside this window become one group row. */
export const PARALLEL_GROUP_MS = 150;
/** A poll event joins the latest poll row when that row was updated at most this long ago. */
export const POLL_GROUP_MS = 5000;
/** Rows kept in the browser; older rows are dropped from the page, never from the API buffer. */
export const MAX_ROWS = 5000;

export interface EventRow {
  type: 'event';
  key: string;
  /** First event of the row; `children` holds every coalesced event including the first. */
  event: DiagnosticsEvent;
  children: DiagnosticsEvent[];
  lastTs: number;
}
export interface ThreadRow {
  type: 'thread';
  key: string;
  correlationId: string;
  title: string;
  ts: number;
}
export interface PollRow {
  type: 'poll';
  key: string;
  count: number;
  /** Distinct polled summaries (for example `GET /api/kitchen-projects/:id/simulations/:id`). */
  summaries: string[];
  firstTs: number;
  lastTs: number;
}
export interface MarkerRow {
  type: 'marker';
  key: string;
  tone: 'gap' | 'boot' | 'reconnect';
  text: string;
  ts: number;
}
export type LogRow = EventRow | ThreadRow | PollRow | MarkerRow;

export interface LogState {
  rows: LogRow[];
  /** Events received (every event, also coalesced and polling ones). */
  total: number;
  lastSeq: number | null;
  /** Correlation id of the last non-poll event (a change starts a new thread header). */
  lastCorrelation: string | null;
  /** Ids of events without a numeric sequence (inferred by the dashboard server). */
  extraIds: string[];
  nextKey: number;
}

export const EMPTY_LOG: LogState = { rows: [], total: 0, lastSeq: null, lastCorrelation: null, extraIds: [], nextKey: 1 };

const numericSeq = (id: string): number | null => (/^\d+$/.test(id) ? Number(id) : null);

function trim(rows: LogRow[]): LogRow[] {
  return rows.length > MAX_ROWS ? rows.slice(rows.length - MAX_ROWS) : rows;
}

function sameShape(a: DiagnosticsEvent, b: DiagnosticsEvent): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.kind === b.kind &&
    a.correlationId === b.correlationId &&
    a.span?.phase === b.span?.phase &&
    a.ok !== false &&
    b.ok !== false &&
    a.inferred === b.inferred
  );
}

/** Index of the row the event coalesces into, looking back over at most three rows (poll rows in between do not break a group). */
function groupTarget(rows: LogRow[], event: DiagnosticsEvent): number {
  const window = event.kind === 'sql' ? SQL_GROUP_MS : PARALLEL_GROUP_MS;
  for (let i = rows.length - 1, seen = 0; i >= 0 && seen < 3; i -= 1) {
    const row = rows[i];
    if (row.type === 'poll') continue;
    seen += 1;
    if (row.type !== 'event') return -1;
    if (sameShape(row.event, event) && Math.abs(event.ts - row.lastTs) <= window) return i;
  }
  return -1;
}

function threadTitle(event: DiagnosticsEvent): string {
  const text = event.summary.length > 56 ? `${event.summary.slice(0, 55)}…` : event.summary;
  return text;
}

/**
 * Appends one event. Returns the same state for a duplicate (reconnect overlap). A jump in the sequence
 * adds an "events missed" marker; polling collapses into a counter row; identical-shape bursts into a group.
 */
export function appendEvent(state: LogState, event: DiagnosticsEvent): LogState {
  const seq = numericSeq(event.id);
  if (seq !== null && state.lastSeq !== null && seq <= state.lastSeq) return state;
  if (seq === null && state.extraIds.includes(event.id)) return state;

  let rows = state.rows;
  let nextKey = state.nextKey;
  const key = (): string => `r${nextKey++}`;
  if (seq !== null && state.lastSeq !== null && seq > state.lastSeq + 1) {
    const missed = seq - state.lastSeq - 1;
    rows = [...rows, { type: 'marker', key: key(), tone: 'gap', text: `${missed} event${missed === 1 ? '' : 's'} missed (evicted from the API buffer before they were read)`, ts: event.ts }];
  }
  const base = {
    total: state.total + 1,
    lastSeq: seq ?? state.lastSeq,
    extraIds: seq === null ? [...state.extraIds.slice(-200), event.id] : state.extraIds,
  };

  if (event.poll) {
    let index = -1;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 40; i -= 1) {
      if (rows[i].type === 'poll') {
        index = i;
        break;
      }
    }
    const last = index >= 0 ? (rows[index] as PollRow) : null;
    if (last && event.ts - last.lastTs <= POLL_GROUP_MS) {
      const summaries = last.summaries.includes(event.summary) || last.summaries.length >= 4 ? last.summaries : [...last.summaries, event.summary];
      const copy = rows === state.rows ? [...rows] : rows;
      copy[index] = { ...last, count: last.count + 1, summaries, lastTs: Math.max(last.lastTs, event.ts) };
      return { ...state, ...base, rows: copy, nextKey };
    }
    const row: PollRow = { type: 'poll', key: key(), count: 1, summaries: [event.summary], firstTs: event.ts, lastTs: event.ts };
    return { ...state, ...base, rows: trim([...rows, row]), nextKey };
  }

  const target = groupTarget(rows, event);
  if (target >= 0) {
    const row = rows[target] as EventRow;
    const copy = rows === state.rows ? [...rows] : rows;
    copy[target] = { ...row, children: [...row.children, event], lastTs: Math.max(row.lastTs, event.ts) };
    return { ...state, ...base, rows: copy, nextKey };
  }

  const out = rows === state.rows ? [...rows] : rows;
  let lastCorrelation = state.lastCorrelation;
  if (event.correlationId !== 'system' && event.correlationId !== lastCorrelation) {
    out.push({ type: 'thread', key: key(), correlationId: event.correlationId, title: threadTitle(event), ts: event.ts });
    lastCorrelation = event.correlationId;
  }
  out.push({ type: 'event', key: key(), event, children: [event], lastTs: event.ts });
  return { ...state, ...base, rows: trim(out), lastCorrelation, nextKey };
}

export function appendMarker(state: LogState, tone: MarkerRow['tone'], text: string, ts: number): LogState {
  const row: MarkerRow = { type: 'marker', key: `r${state.nextKey}`, tone, text, ts };
  return { ...state, rows: trim([...state.rows, row]), nextKey: state.nextKey + 1, lastCorrelation: null };
}

/** Clear empties the page but keeps the sequence, so later events are not reported as missed. */
export function clearLog(state: LogState): LogState {
  return { ...state, rows: [], total: 0, lastCorrelation: null };
}

export interface LogFilter {
  /** Kinds shown; an empty set shows nothing. */
  kinds: ReadonlySet<DiagnosticsKind>;
  /** Selected graph node: only events that involve it. */
  node: DiagnosticsNodeId | null;
  allKinds: number;
}

export function isFiltered(filter: LogFilter): boolean {
  return filter.node !== null || filter.kinds.size < filter.allKinds;
}

/** Rows visible under the filter. Thread headers, poll counters and markers are hidden while a filter is on (they describe the unfiltered stream). */
export function visibleRows(rows: LogRow[], filter: LogFilter): LogRow[] {
  if (!isFiltered(filter)) return rows;
  return rows.filter((row) => {
    if (row.type !== 'event') return false;
    if (!filter.kinds.has(row.event.kind)) return false;
    return filter.node === null || row.event.from === filter.node || row.event.to === filter.node;
  });
}

/** Clicking a kind chip: from "all" it isolates the kind; otherwise it toggles it; removing the last one restores all. */
export function toggleKind(current: ReadonlySet<DiagnosticsKind>, kind: DiagnosticsKind, all: DiagnosticsKind[]): Set<DiagnosticsKind> {
  if (current.size === all.length) return new Set([kind]);
  const next = new Set(current);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  return next.size === 0 ? new Set(all) : next;
}

/** Summary of a group row: distinct summaries in order with their counts, at most three, then the rest as a number. */
export function groupSummary(children: DiagnosticsEvent[]): string {
  const counts = new Map<string, number>();
  for (const child of children) counts.set(child.summary, (counts.get(child.summary) ?? 0) + 1);
  const parts = [...counts.entries()].map(([text, n]) => (n > 1 ? `${text} x${n}` : text));
  const shown = parts.slice(0, 3).join(', ');
  return parts.length > 3 ? `${shown}, +${parts.length - 3} more` : shown;
}

export function groupDurationMs(children: DiagnosticsEvent[]): number | null {
  const values = children.map((c) => c.durationMs).filter((v): v is number => typeof v === 'number');
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 1000)} s`;
}
