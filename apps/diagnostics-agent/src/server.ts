// HTTP surface of the agent (internal port 3300, no published port). Read-only: GET only.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { DiagnosticsAgentTopology, DiagnosticsMetricsSample } from '@bricomission/shared-types';

export const TOKEN_HEADER = 'x-diagnostics-token';
export const MIN_TOKEN_LENGTH = 16;

export interface AgentSource {
  /** Last sample, or `null` before the first tick. */
  last(): DiagnosticsMetricsSample | null;
  topology(): DiagnosticsAgentTopology;
  /** Calls `listener` for every new sample; returns the unsubscribe function. */
  subscribe(listener: (sample: DiagnosticsMetricsSample) => void): () => void;
}

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Constant-time check of the `X-Diagnostics-Token` header (header only, never a query string). */
export function tokenMatches(header: string | string[] | undefined, token: string): boolean {
  if (typeof header !== 'string' || header.length === 0) return false;
  return timingSafeEqual(sha256(header), sha256(token));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

/**
 * Routes: `GET /healthz` (no token; liveness only, no data), and behind the token `GET /metrics`,
 * `GET /metrics/stream` (SSE: `hello`, then one `metrics` frame per sample), `GET /topology`.
 */
export function createAgentServer(source: AgentSource, token: string, options: { staleMs?: number; now?: () => number } = {}): Server {
  if (token.length < MIN_TOKEN_LENGTH) throw new Error(`DIAGNOSTICS_TOKEN must have at least ${MIN_TOKEN_LENGTH} characters`);
  const staleMs = options.staleMs ?? 5000;
  const now = options.now ?? Date.now;

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET' }).end();
      return;
    }
    if (path === '/healthz') {
      const last = source.last();
      const ok = last != null && now() - last.ts <= staleMs;
      json(res, ok ? 200 : 503, { status: ok ? 'ok' : 'stale' });
      return;
    }
    if (path !== '/metrics' && path !== '/metrics/stream' && path !== '/topology') {
      json(res, 404, { statusCode: 404, message: 'Not Found' });
      return;
    }
    if (!tokenMatches(req.headers[TOKEN_HEADER], token)) {
      json(res, 401, { statusCode: 401, message: 'Unauthorized' });
      return;
    }
    if (path === '/topology') {
      json(res, 200, source.topology());
      return;
    }
    if (path === '/metrics') {
      const last = source.last();
      if (last) json(res, 200, last);
      else json(res, 503, { statusCode: 503, message: 'no sample yet' });
      return;
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.flushHeaders();
    const frame = (event: string, data: unknown): void => {
      // A reader that stopped reading is dropped instead of buffered without bound; it reconnects.
      if (res.writableLength > 1024 * 1024) {
        res.destroy();
        return;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    res.write('retry: 500\n\n');
    frame('hello', source.topology());
    const last = source.last();
    if (last) frame('metrics', last);
    const unsubscribe = source.subscribe((sample) => frame('metrics', sample));
    // Samples flow every second; the comment only keeps a stalled sampler's stream from idling out.
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    res.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
}
