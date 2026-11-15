import { describe, expect, it } from 'vitest';
import { serverConfig } from '../src/server/config.ts';
import { mailEvent, maskEmail, newMailEvents, safeSubject } from '../src/server/mailpit.ts';
import { parseReplay, playReplay } from '../src/server/replay.ts';
import { SseParser, frame, type SseMessage } from '../src/server/sse.ts';
import { classifyStatus, runUpstream, type UpstreamState } from '../src/server/upstream.ts';

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(status === 200 ? body : null, { status });
}

describe('SSE codec', () => {
  it('parses frames split across chunks, ignores pings and retry lines, keeps ids', () => {
    const parser = new SseParser();
    expect(parser.push('retry: 500\nevent: hello\ndata: {"bootId"')).toEqual([]);
    expect(parser.push(':"b1"}\n\n: ping\n\nid: 7\nevent: diagnostics\ndata: {"id":"7"}\n\n')).toEqual([
      { event: 'hello', data: '{"bootId":"b1"}', id: undefined },
      { event: 'diagnostics', data: '{"id":"7"}', id: '7' },
    ]);
    expect(parser.push('data: a\r\ndata: b\r\n\r\n')).toEqual([{ event: 'message', data: 'a\nb', id: undefined }]);
  });

  it('writes frames the parser reads back', () => {
    const parser = new SseParser();
    expect(parser.push(frame('event', { id: '3', summary: 'two\nlines' }, 3))).toEqual([{ event: 'event', data: '{"id":"3","summary":"two\\nlines"}', id: '3' }]);
    expect(frame('status', { api: 'connected' })).toBe('event: status\ndata: {"api":"connected"}\n\n');
  });
});

describe('upstream connection', () => {
  it('classifies 404 as diagnostics off, 401 as a rejected token and the rest as a retry', () => {
    expect(classifyStatus(404)).toBe('disabled');
    expect(classifyStatus(401)).toBe('token_mismatch');
    expect(classifyStatus(403)).toBe('token_mismatch');
    expect(classifyStatus(502)).toBe('reconnecting');
  });

  it('sends the token only as a header, resumes with Last-Event-ID, backs off between attempts and restarts on request', async () => {
    const abort = new AbortController();
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const states: UpstreamState[] = [];
    const messages: SseMessage[] = [];
    const sleeps: number[] = [];
    let lastId: string | null = null;
    const responses = [
      () => sseResponse([], 404),
      () => { throw new Error('ECONNREFUSED'); },
      () => sseResponse(['event: hello\ndata: {"bootId":"b1"}\n\n', 'id: 5\nevent: diagnostics\ndata: {"id":"5"}\n\n']),
      () => sseResponse(['event: hello\ndata: {"bootId":"b2"}\n\n']),
      () => sseResponse(['event: hello\ndata: {"bootId":"b2"}\n\n', 'id: 1\nevent: diagnostics\ndata: {"id":"1"}\n\n']),
    ];
    await runUpstream({
      url: 'http://api:3000/diagnostics/stream',
      token: 'secret-token-0123456789',
      signal: abort.signal,
      lastEventId: () => lastId,
      onState: (state) => states.push(state),
      onMessage: (message) => {
        messages.push(message);
        if (message.id) lastId = message.id;
        if (message.event === 'hello' && message.data.includes('b2') && lastId === '5') {
          lastId = null;
          return 'restart';
        }
        return undefined;
      },
      fetchImpl: (async (url: string, init: { headers: Record<string, string> }) => {
        calls.push({ url, headers: init.headers });
        const next = responses.shift();
        if (!next) {
          abort.abort();
          throw new Error('aborted');
        }
        return next();
      }) as unknown as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(calls.every((c) => c.url === 'http://api:3000/diagnostics/stream' && c.headers['x-diagnostics-token'] === 'secret-token-0123456789')).toBe(true);
    expect(calls.map((c) => c.headers['last-event-id'])).toEqual([undefined, undefined, undefined, '5', undefined, '1']);
    expect(states).toEqual(['disabled', 'reconnecting', 'connected', 'reconnecting', 'connected', 'connected', 'reconnecting']);
    // 404, then a network error (growing back-off), then two clean ends after a connected stream (back-off reset), no sleep before the restart.
    expect(sleeps).toEqual([500, 1000, 500, 500]);
    expect(messages.filter((m) => m.event === 'diagnostics').map((m) => m.id)).toEqual(['5', '1']);
  });
});

describe('Mailpit probe (inferred keycloak > mailpit)', () => {
  const list = {
    messages: [
      { ID: 'abc123', Created: '2026-11-15T13:01:12.33Z', Subject: 'Your BricoMission code', To: [{ Name: 'Bea', Address: 'bea@example.com' }], Snippet: 'Your code is 482913' },
      { ID: 'old001', Created: '2026-11-15T12:00:00Z', Subject: 'Your BricoMission code', To: [{ Address: 'x@example.com' }], Snippet: '111222' },
    ],
  };

  it('masks the address and never carries the snippet, the body or a code', () => {
    const event = mailEvent(list.messages[0]);
    expect(event).toMatchObject({ id: 'mail-abc123', from: 'keycloak', to: 'mailpit', kind: 'mail', inferred: true, correlationId: 'system' });
    expect(event?.summary).toBe('email code sent to b***@example.com (subject only, never the code)');
    expect(event?.payload).toEqual({ subject: 'Your BricoMission code', to: 'b***@example.com', recipients: 1, source: 'inferred from the Mailpit inbox list' });
    const text = JSON.stringify(event);
    expect(text).not.toContain('482913');
    expect(text).not.toContain('bea@');
    expect(text).not.toContain('Snippet');
    expect(maskEmail('nobody')).toBe('***');
    expect(safeSubject('Code 482913 inside')).toBe('Code *** inside');
  });

  it('records the inbox on the first poll and emits only new messages afterwards, oldest first, once', () => {
    const seen = new Set<string>();
    expect(newMailEvents(list, seen, true)).toEqual([]);
    const later = { messages: [{ ID: 'new2', Created: '2026-11-15T13:05:00Z', Subject: 's', To: [] }, { ID: 'new1', Created: '2026-11-15T13:04:00Z', Subject: 's', To: [] }, ...list.messages] };
    expect(newMailEvents(later, seen, false).map((e) => e.id)).toEqual(['mail-new1', 'mail-new2']);
    expect(newMailEvents(later, seen, false)).toEqual([]);
    expect(newMailEvents({ nope: true }, seen, false)).toEqual([]);
    expect(mailEvent({ ID: '../etc', Created: 'x' })).toBeNull();
  });
});

describe('replay source', () => {
  it('parses NDJSON, skips malformed lines and orders by time', () => {
    const lines = parseReplay(['{"at":50,"frame":"event","data":{"id":"9","ts":2000}}', 'garbage', '{"at":0,"frame":"metrics","data":{"host":{}}}', '{"at":-1,"frame":"event","data":{}}', '{"at":5,"frame":"other","data":{}}', ''].join('\n'));
    expect(lines.map((l) => [l.at, l.frame])).toEqual([[0, 'metrics'], [50, 'event']]);
  });

  it('plays with rewritten ids and current times, honouring the speed', async () => {
    const lines = parseReplay(['{"at":0,"frame":"event","data":{"id":"900","ts":1000,"summary":"a"}}', '{"at":40,"frame":"event","data":{"id":"901","ts":1040,"summary":"b"}}', '{"at":40,"frame":"metrics","data":{"ts":1,"host":{}}}'].join('\n'));
    const out: { kind: string; data: Record<string, unknown>; id?: number }[] = [];
    const started = Date.now();
    await playReplay(lines, 4, new AbortController().signal, (kind, data, id) => out.push({ kind, data, id }));
    expect(Date.now() - started).toBeLessThan(200);
    expect(out.map((o) => [o.kind, o.id, o.data.id])).toEqual([['event', 1, '1'], ['event', 2, '2'], ['metrics', undefined, undefined]]);
    expect((out[1].data.ts as number) - (out[0].data.ts as number)).toBe(10);
    expect(out[0].data.ts as number).toBeGreaterThanOrEqual(started);
  });
});

describe('server configuration', () => {
  it('uses the compose service names by default and reads the token from the environment only', () => {
    expect(serverConfig({} as NodeJS.ProcessEnv)).toEqual({
      apiUrl: 'http://api:3000',
      agentUrl: 'http://diagnostics-agent:3300',
      mailpitUrl: 'http://mailpit:8025',
      token: '',
      source: 'live',
      bufferSize: 1000,
      replayFile: 'replay/demo-simulation-budget.ndjson',
    });
    const custom = serverConfig({ API_INTERNAL_URL: 'http://x:1/', DIAGNOSTICS_SOURCE: 'replay', DIAGNOSTICS_BUFFER_SIZE: '200', DIAGNOSTICS_TOKEN: 't' } as unknown as NodeJS.ProcessEnv);
    expect(custom).toMatchObject({ apiUrl: 'http://x:1', source: 'replay', bufferSize: 200, token: 't' });
  });
});
