'use client';

import type { DiagnosticsEvent, DiagnosticsMetricsSample, DiagnosticsTopology } from '@bricomission/shared-types';
import { streamUrl, type AgentLink, type ApiLink, type Source } from './state/connection-state.ts';
import { formatTime } from './state/log-state.ts';
import { actions, getState } from './store.ts';

let source: EventSource | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let outage = false;

async function loadTopology(): Promise<void> {
  try {
    const response = await fetch('/api/topology', { cache: 'no-store' });
    if (response.ok) actions.topology((await response.json()) as DiagnosticsTopology);
  } catch {
    // The graph still draws from its layout; model names stay unknown until the API answers.
  }
}

function open(): void {
  source?.close();
  const es = new EventSource(streamUrl(getState().conn, window.location.search));
  source = es;
  es.onopen = () => {
    actions.connection({ type: 'open' });
    if (outage) {
      outage = false;
      const last = getState().conn.lastEventId;
      actions.marker('reconnect', last === null ? 'Stream reconnected' : `Stream reconnected, resuming after event ${last}`);
    }
  };
  es.addEventListener('hello', (message) => {
    const hello = JSON.parse((message as MessageEvent<string>).data) as { bootId: string; oldestSeq: number; newestSeq: number };
    const before = getState().conn.bootId;
    actions.hello(hello);
    if (before !== hello.bootId || getState().topology === null) void loadTopology();
  });
  es.addEventListener('event', (message) => actions.event(JSON.parse((message as MessageEvent<string>).data) as DiagnosticsEvent));
  es.addEventListener('metrics', (message) => actions.metrics(JSON.parse((message as MessageEvent<string>).data) as DiagnosticsMetricsSample));
  es.addEventListener('status', (message) => {
    const status = JSON.parse((message as MessageEvent<string>).data) as { api?: ApiLink; agent?: AgentLink; source?: Source; bufferSize?: number };
    const before = getState().conn.api;
    actions.connection({ type: 'status', ...status });
    if (status.api === 'connected' && before !== 'connected' && getState().topology === null) void loadTopology();
  });
  es.onerror = () => {
    // No native auto-reconnect: the back-off and the resume point are ours (connection-state.ts).
    es.close();
    if (source !== es) return;
    source = null;
    if (!outage) {
      outage = true;
      actions.marker('reconnect', `Stream lost at ${formatTime(Date.now()).slice(0, 8)}, retrying with back-off`);
    }
    actions.connection({ type: 'error' });
    const retryAt = getState().conn.retryAt ?? Date.now();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(retryNow, Math.max(0, retryAt - Date.now()));
  };
}

export function retryNow(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  actions.connection({ type: 'retry' });
  open();
}

export function startStream(): () => void {
  void loadTopology();
  open();
  tickTimer = setInterval(() => actions.tick(), 100);
  return () => {
    source?.close();
    source = null;
    if (retryTimer) clearTimeout(retryTimer);
    if (tickTimer) clearInterval(tickTimer);
  };
}
