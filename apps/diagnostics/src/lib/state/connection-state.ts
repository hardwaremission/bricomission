/** Reconnect machine of the browser stream and the header status chip. Pure: the clock is passed in. */

export const BACKOFF_MS = [500, 1000, 2000, 4000, 5000];

export function backoffMs(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)];
}

export type ApiLink = 'unknown' | 'connected' | 'reconnecting' | 'disabled' | 'token_mismatch';
export type AgentLink = 'unknown' | 'connected' | 'down';
export type Source = 'live' | 'replay';
export type StatusChip = 'LIVE' | 'RECONNECTING' | 'API DISABLED' | 'NO AGENT' | 'REPLAY' | 'TOKEN MISMATCH';

export interface ConnectionState {
  /** `open`: the browser stream is up. `waiting`: back-off before the next attempt. */
  phase: 'connecting' | 'open' | 'waiting';
  attempt: number;
  retryAt: number | null;
  /** Sequence of the last API event, sent back on reconnect so the stream resumes after it. */
  lastEventId: number | null;
  bootId: string | null;
  source: Source;
  api: ApiLink;
  agent: AgentLink;
  /** Capacity of the API ring buffer (footer `buffer n / N`). */
  bufferSize: number;
  oldestSeq: number | null;
}

export const INITIAL_CONNECTION: ConnectionState = {
  phase: 'connecting',
  attempt: 0,
  retryAt: null,
  lastEventId: null,
  bootId: null,
  source: 'live',
  api: 'unknown',
  agent: 'unknown',
  bufferSize: 1000,
  oldestSeq: null,
};

export type ConnectionAction =
  | { type: 'open' }
  | { type: 'error' }
  | { type: 'retry' }
  | { type: 'status'; api?: ApiLink; agent?: AgentLink; source?: Source; bufferSize?: number }
  | { type: 'hello'; bootId: string; oldestSeq: number }
  | { type: 'event'; seq: number | null };

export interface ConnectionResult {
  state: ConnectionState;
  /** The API restarted (new boot id): every reducer must drop its state. */
  reset: boolean;
}

export function reduceConnection(state: ConnectionState, action: ConnectionAction, now: number): ConnectionResult {
  switch (action.type) {
    case 'open':
      return { state: { ...state, phase: 'open', attempt: 0, retryAt: null }, reset: false };
    case 'error': {
      if (state.phase === 'waiting') return { state, reset: false };
      return { state: { ...state, phase: 'waiting', retryAt: now + backoffMs(state.attempt), attempt: state.attempt + 1 }, reset: false };
    }
    case 'retry':
      return { state: { ...state, phase: 'connecting', retryAt: null }, reset: false };
    case 'status':
      return {
        state: {
          ...state,
          api: action.api ?? state.api,
          agent: action.agent ?? state.agent,
          source: action.source ?? state.source,
          bufferSize: action.bufferSize ?? state.bufferSize,
        },
        reset: false,
      };
    case 'hello': {
      const reset = state.bootId !== null && state.bootId !== action.bootId;
      return {
        state: { ...state, bootId: action.bootId, api: 'connected', oldestSeq: action.oldestSeq, lastEventId: reset ? null : state.lastEventId },
        reset,
      };
    }
    case 'event':
      return { state: action.seq === null ? state : { ...state, lastEventId: Math.max(state.lastEventId ?? 0, action.seq) }, reset: false };
  }
}

/** One chip, most important first: a replay is never mistaken for live; setup problems beat transient ones. */
export function statusChip(state: ConnectionState, agentUp: boolean): StatusChip {
  if (state.source === 'replay') return state.phase === 'open' ? 'REPLAY' : 'RECONNECTING';
  if (state.phase !== 'open') return 'RECONNECTING';
  if (state.api === 'token_mismatch') return 'TOKEN MISMATCH';
  if (state.api === 'disabled') return 'API DISABLED';
  if (state.api === 'reconnecting' || state.api === 'unknown') return 'RECONNECTING';
  if (!agentUp || state.agent === 'down') return 'NO AGENT';
  return 'LIVE';
}

/** Stream URL of the next attempt: resumes after the last event of the same API boot. */
export function streamUrl(state: ConnectionState, search: string): string {
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  const source = params.get('source');
  if (source === 'replay' || source === 'live') out.set('source', source);
  const speed = params.get('speed');
  if (speed && /^\d+(\.\d+)?$/.test(speed)) out.set('speed', speed);
  if (state.lastEventId !== null && state.bootId !== null) {
    out.set('lastEventId', String(state.lastEventId));
    out.set('bootId', state.bootId);
  }
  const query = out.toString();
  return query ? `/stream?${query}` : '/stream';
}

/** Events held by the API ring buffer as far as the dashboard can tell (footer). */
export function bufferCount(state: ConnectionState): number {
  if (state.lastEventId === null || state.oldestSeq === null) return 0;
  return Math.min(state.bufferSize, Math.max(0, state.lastEventId - Math.max(state.oldestSeq, 1) + 1));
}
