import { mintCorrelationId } from './correlation';

/**
 * Metadata-only diagnostics events of the web BFF (feature diagnostics-dashboard). They are posted to
 * the API ingest route, which validates and re-redacts every one. Nothing here ever carries a
 * cookie, a token, a header value, a body or a query string: callers pass booleans and route templates.
 */
export type WebNode = 'browser' | 'web' | 'api-guards' | 'keycloak' | 'postgres';
export type WebKind = 'http' | 'auth' | 'session';

export interface WebDiagnosticsEvent {
  ts: number;
  correlationId: string;
  from: WebNode;
  to: WebNode;
  kind: WebKind;
  summary: string;
  payload: Record<string, unknown>;
  span?: { id: string; phase: 'start' | 'end' };
  durationMs?: number;
  ok?: boolean;
  poll?: boolean;
}

export type WebEventDraft = Omit<WebDiagnosticsEvent, 'ts'>;

export interface DiagnosticsEmitter {
  readonly enabled: boolean;
  emit(event: WebEventDraft): void;
  /** Starts a span and returns its `end` function. */
  span(start: WebEventDraft): (end: Partial<Pick<WebEventDraft, 'summary' | 'payload' | 'ok'>>) => void;
  /** Sends what is queued now (tests, shutdown). */
  flush(): Promise<void>;
  /** Events dropped because the ingest call failed or the queue was full. */
  readonly dropped: number;
}

const NOOP_END = (): void => undefined;

/** Installed when diagnostics are off: no timers, no allocation per call. */
export const NULL_EMITTER: DiagnosticsEmitter = Object.freeze({
  enabled: false,
  emit: (): void => undefined,
  span: () => NOOP_END,
  flush: async (): Promise<void> => undefined,
  dropped: 0,
});

export interface EmitterOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Events per POST (default 20) and the longest wait before a partial batch is sent (default 250 ms). */
  batchSize?: number;
  flushMs?: number;
  /** Queue cap; the oldest event is dropped beyond it (default 500). */
  maxQueue?: number;
}

/** Fire-and-forget batching emitter: one attempt per batch, drops and counts on failure, never blocks a request. */
export function createDiagnosticsEmitter({ url, token, fetchImpl = fetch, now = Date.now, batchSize = 20, flushMs = 250, maxQueue = 500 }: EmitterOptions): DiagnosticsEmitter {
  let queue: WebDiagnosticsEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dropped = 0;
  let spanCounter = 0;
  const salt = mintCorrelationId();

  const send = async (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    while (queue.length > 0) {
      const batch = queue.slice(0, 100);
      queue = queue.slice(batch.length);
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-diagnostics-token': token },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(2000),
        });
        await res.body?.cancel().catch(() => undefined);
        if (!res.ok) dropped += batch.length;
      } catch {
        dropped += batch.length;
      }
    }
  };

  const schedule = (): void => {
    if (queue.length >= batchSize) {
      void send();
      return;
    }
    if (!timer) {
      timer = setTimeout(() => void send(), flushMs);
      (timer as { unref?: () => void }).unref?.();
    }
  };

  const emit = (event: WebEventDraft): void => {
    if (queue.length >= maxQueue) {
      queue.shift();
      dropped += 1;
    }
    queue.push({ ...event, ts: now() });
    schedule();
  };

  return {
    enabled: true,
    emit,
    span(start) {
      const id = `w${salt}${(spanCounter += 1).toString(36)}`;
      const startedAt = now();
      emit({ ...start, span: { id, phase: 'start' } });
      let ended = false;
      return (end) => {
        if (ended) return;
        ended = true;
        emit({ ...start, ...end, span: { id, phase: 'end' }, durationMs: now() - startedAt });
      };
    },
    flush: send,
    get dropped() {
      return dropped;
    },
  };
}

/** The emitter of this process: real only with `DIAGNOSTICS_ENABLED=true`, a token of 16+ characters and an ingest URL. */
export function diagnosticsFromEnv(env: Record<string, string | undefined> = process.env): DiagnosticsEmitter {
  const token = env.DIAGNOSTICS_TOKEN ?? '';
  const url = env.DIAGNOSTICS_INGEST_URL ?? '';
  if (env.DIAGNOSTICS_ENABLED !== 'true' || token.length < 16 || url === '') return NULL_EMITTER;
  return createDiagnosticsEmitter({ url, token });
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** `/api/kitchen-projects/<uuid>/budgets/<uuid>` becomes `/api/kitchen-projects/:id/budgets/:id` (no query string). */
export function routeTemplate(pathname: string): string {
  return pathname.replace(UUID, ':id').replace(/\/+$/, '') || '/';
}

/** Status polling (every 2 s) and the health probe: coalesced by the dashboard. */
export function isPollRoute(method: string, template: string): boolean {
  if (method !== 'GET') return false;
  return /^\/api\/kitchen-projects\/:id\/(simulations|budgets)\/:id$/.test(template) || template === '/api/health';
}

let processEmitter: DiagnosticsEmitter | undefined;

/** One emitter per server process (route bundles share it through this module's state). */
export function sharedDiagnostics(): DiagnosticsEmitter {
  return (processEmitter ??= diagnosticsFromEnv());
}
