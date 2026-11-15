import type { DiagnosticsEvent, DiagnosticsHello } from '@bricomission/shared-types';
import { serverConfig } from '../../server/config.ts';
import { mailpitProbe } from '../../server/mailpit.ts';
import { loadReplay, playReplay } from '../../server/replay.ts';
import { frame } from '../../server/sse.ts';
import { runUpstream, type UpstreamState } from '../../server/upstream.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PING_MS = 15_000;

const digits = (raw: string | null): number | null => (raw !== null && /^\d{1,12}$/.test(raw) ? Number(raw) : null);

/**
 * The one stream the browser reads (same origin, no token, no header). Per connection it holds an upstream
 * connection to the API event stream and to the metrics agent (both with `X-Diagnostics-Token`, which stays
 * in this process), adds the Mailpit probe's inferred events, and serves frames `hello`, `event`, `metrics`
 * and `status`. `?source=replay` plays the recorded session instead and never touches the live sources.
 */
export async function GET(request: Request): Promise<Response> {
  const config = serverConfig();
  const url = new URL(request.url);
  const wanted = url.searchParams.get('source');
  const source = wanted === 'replay' || wanted === 'live' ? wanted : config.source;
  const resume = {
    lastId: digits(request.headers.get('last-event-id')) ?? digits(url.searchParams.get('lastEventId')),
    bootId: url.searchParams.get('bootId'),
  };
  const speedRaw = Number(url.searchParams.get('speed'));
  const speed = Number.isFinite(speedRaw) && speedRaw >= 0.1 && speedRaw <= 50 ? speedRaw : 1;

  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string): void => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          abort.abort();
        }
      };
      const status: { api: UpstreamState | 'unknown'; agent: 'unknown' | 'connected' | 'down'; source: string; bufferSize: number } = {
        api: 'unknown',
        agent: 'unknown',
        source,
        bufferSize: config.bufferSize,
      };
      const sendStatus = (): void => write(frame('status', status));
      const ping = setInterval(() => write(': ping\n\n'), PING_MS);
      abort.signal.addEventListener('abort', () => {
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }, { once: true });

      write('retry: 500\n\n');

      if (source === 'replay') {
        status.api = 'connected';
        status.agent = 'connected';
        sendStatus();
        void (async () => {
          const lines = await loadReplay(config.replayFile);
          write(frame('hello', { source, bootId: `replay-${Date.now()}`, oldestSeq: 1, newestSeq: 0, bufferCount: lines.length, adapters: 'fake' }));
          await playReplay(lines, speed, abort.signal, (kind, data, id) => write(frame(kind, data, id)));
        })();
        return;
      }

      sendStatus();
      const setApi = (state: UpstreamState): void => {
        if (status.api === state) return;
        status.api = state;
        sendStatus();
      };
      const setAgent = (state: 'connected' | 'down'): void => {
        if (status.agent === state) return;
        status.agent = state;
        sendStatus();
      };

      void runUpstream({
        url: `${config.apiUrl}/diagnostics/stream`,
        token: config.token,
        signal: abort.signal,
        lastEventId: () => (resume.lastId === null ? null : String(resume.lastId)),
        onState: setApi,
        onMessage: (message) => {
          if (message.event === 'hello') {
            const hello = JSON.parse(message.data) as DiagnosticsHello;
            // The resume point belongs to another API boot: its sequence restarted, so read the whole buffer.
            if (resume.lastId !== null && resume.bootId !== hello.bootId) {
              resume.lastId = null;
              resume.bootId = hello.bootId;
              return 'restart';
            }
            resume.bootId = hello.bootId;
            write(frame('hello', { source, ...hello }));
          } else if (message.event === 'diagnostics') {
            const seq = digits(message.id ?? null);
            if (seq !== null) resume.lastId = seq;
            write(`${message.id === undefined ? '' : `id: ${message.id}\n`}event: event\ndata: ${message.data}\n\n`);
          }
          return undefined;
        },
      });

      void runUpstream({
        url: `${config.agentUrl}/metrics/stream`,
        token: config.token,
        signal: abort.signal,
        lastEventId: () => null,
        onState: (state) => setAgent(state === 'connected' ? 'connected' : 'down'),
        onMessage: (message) => {
          if (message.event === 'metrics') write(`event: metrics\ndata: ${message.data}\n\n`);
          return undefined;
        },
      });

      const unsubscribe = mailpitProbe(config.mailpitUrl).subscribe((event: DiagnosticsEvent) => write(frame('event', event)));
      abort.signal.addEventListener('abort', unsubscribe, { once: true });
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
