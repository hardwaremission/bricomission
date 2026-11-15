import { backoffMs } from '../lib/state/connection-state.ts';
import { readSse, type SseMessage } from './sse.ts';

export type UpstreamState = 'connected' | 'reconnecting' | 'disabled' | 'token_mismatch';

export interface UpstreamOptions {
  url: string;
  token: string;
  signal: AbortSignal;
  /** Header value for the next attempt (`Last-Event-ID`), or null for a full replay. */
  lastEventId: () => string | null;
  onState: (state: UpstreamState) => void;
  /** Return `'restart'` to drop the connection and connect again at once (used when the API boot id changed). */
  onMessage: (message: SseMessage) => void | 'restart';
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export function classifyStatus(status: number): UpstreamState {
  if (status === 401 || status === 403) return 'token_mismatch';
  if (status === 404) return 'disabled';
  return 'reconnecting';
}

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });

/**
 * Keeps one upstream SSE connection alive until the signal aborts: back-off 0.5 to 5 s, resume with
 * `Last-Event-ID`, 404 = diagnostics off in the API, 401 = token rejected (both keep retrying, so the
 * dashboard recovers by itself when the API is restarted with the right environment).
 */
export async function runUpstream(options: UpstreamOptions): Promise<void> {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 0;
  while (!options.signal.aborted) {
    let restart = false;
    try {
      const headers: Record<string, string> = { accept: 'text/event-stream', 'x-diagnostics-token': options.token };
      const last = options.lastEventId();
      if (last !== null) headers['last-event-id'] = last;
      const response = await doFetch(options.url, { headers, signal: options.signal, cache: 'no-store' });
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => undefined);
        options.onState(classifyStatus(response.status));
      } else {
        options.onState('connected');
        attempt = 0;
        for await (const message of readSse(response.body)) {
          if (options.onMessage(message) === 'restart') {
            restart = true;
            break;
          }
        }
        if (!restart && !options.signal.aborted) options.onState('reconnecting');
      }
    } catch {
      if (options.signal.aborted) return;
      options.onState('reconnecting');
    }
    if (options.signal.aborted) return;
    if (restart) continue;
    await sleep(backoffMs(attempt), options.signal);
    attempt += 1;
  }
}
