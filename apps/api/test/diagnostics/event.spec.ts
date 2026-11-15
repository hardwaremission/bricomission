import { describe, expect, it } from 'vitest';
import { buildEvent, DIAGNOSTICS_KINDS, DIAGNOSTICS_NODE_IDS, jsonBytes, MAX_PAYLOAD_BYTES, MAX_SUMMARY_CHARS, validateIngestEvent } from '../../src/diagnostics/event.js';

const NOW = Date.UTC(2026, 11, 1, 10, 0, 0);
const CID = '0123456789abcdef';

describe('buildEvent', () => {
  it('builds the model: id from the sequence, correlation fallback, flags only when set', () => {
    const event = buildEvent({ from: 'web', to: 'api-guards', kind: 'http', summary: 'POST /api/x', payload: { status: 200 } }, 7, NOW, CID);
    expect(event).toEqual({ id: '7', ts: NOW, correlationId: CID, from: 'web', to: 'api-guards', kind: 'http', summary: 'POST /api/x', payload: { status: 200 } });
    const full = buildEvent({ correlationId: 'system', from: 'comfyui', to: 'comfyui', kind: 'step', summary: 's', span: { id: 'a', phase: 'end' }, durationMs: 12.6, ok: false, simulated: true, inferred: true, poll: true, ts: NOW - 5 }, 8, NOW, CID);
    expect(full).toMatchObject({ correlationId: 'system', ts: NOW - 5, span: { id: 'a', phase: 'end' }, durationMs: 13, ok: false, simulated: true, inferred: true, poll: true });
  });

  it('ignores an invalid draft correlation id and clamps the summary', () => {
    const event = buildEvent({ correlationId: 'not-valid', from: 'web', to: 'web', kind: 'step', summary: 'y '.repeat(500) }, 1, NOW, CID);
    expect(event.correlationId).toBe(CID);
    expect(event.summary.length).toBe(MAX_SUMMARY_CHARS);
  });

  it('redacts summary and payload', () => {
    const event = buildEvent({ from: 'web', to: 'keycloak', kind: 'auth', summary: 'exchange password=hunter2hunter2', payload: { client_secret: 'abc', grant: 'authorization_code' } }, 1, NOW, CID);
    expect(JSON.stringify(event)).not.toContain('hunter2hunter2');
    expect(event.payload).toEqual({ client_secret: '[redacted]', grant: 'authorization_code' });
  });

  it('passes a 20 KB prompt whole and truncates a 200 KB field with its marker', () => {
    const prompt = 'warm oak island '.repeat(1366).slice(0, 20 * 1024);
    const whole = buildEvent({ from: 'ai-adapters', to: 'llama-server', kind: 'llm', summary: 'chat', payload: { prompt } }, 1, NOW, CID);
    expect(whole.payload).toEqual({ prompt });
    const cut = buildEvent({ from: 'ai-adapters', to: 'llama-server', kind: 'llm', summary: 'chat', payload: { prompt: 'warm oak island '.repeat(14000).slice(0, 200 * 1024) } }, 2, NOW, CID);
    expect(cut.payload.prompt).toMatchObject({ truncated: true, originalBytes: 200 * 1024, expandable: true });
    expect(jsonBytes(cut.payload)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });

  it('keeps the whole payload under 96 KB: shrinks texts, then falls back to a marker', () => {
    const three = { a: 'ab cd '.repeat(10240).slice(0, 60 * 1024), b: 'ef gh '.repeat(10240).slice(0, 60 * 1024), c: 'ij kl '.repeat(10240).slice(0, 60 * 1024) };
    const shrunk = buildEvent({ from: 'ai-adapters', to: 'llama-server', kind: 'llm', summary: 's', payload: three }, 1, NOW, CID);
    expect(jsonBytes(shrunk.payload)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    expect(shrunk.payload.a).toMatchObject({ truncated: true });
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, 'mn op '.repeat(10240).slice(0, 60 * 1024)]));
    const marker = buildEvent({ from: 'ai-adapters', to: 'llama-server', kind: 'llm', summary: 's', payload: many }, 2, NOW, CID);
    expect(marker.payload).toMatchObject({ truncated: true });
    expect(jsonBytes(marker.payload)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });

  it('catalogs 14 kinds and 23 node ids', () => {
    expect(DIAGNOSTICS_KINDS).toHaveLength(14);
    expect(DIAGNOSTICS_NODE_IDS).toHaveLength(23);
    expect(new Set(DIAGNOSTICS_NODE_IDS).size).toBe(23);
  });
});

describe('validateIngestEvent', () => {
  const valid = { ts: NOW, correlationId: CID, from: 'browser', to: 'web', kind: 'http', summary: 'GET /', payload: { status: 200 }, durationMs: 4, ok: true, poll: false, span: { id: 's1', phase: 'start' } };

  it('accepts a valid event and keeps a recent ts', () => {
    const result = validateIngestEvent(valid, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toMatchObject({ from: 'browser', to: 'web', kind: 'http', ts: NOW, correlationId: CID, span: { id: 's1', phase: 'start' } });
  });

  it('drops a stale or future ts instead of rejecting', () => {
    for (const ts of [NOW - 11 * 60_000, NOW + 60_000, Number.NaN]) {
      const result = validateIngestEvent({ ...valid, ts }, NOW);
      expect(result.ok && result.draft.ts).toBeUndefined();
    }
  });

  const bad: Array<[string, unknown]> = [
    ['not an object', 'x'],
    ['array', []],
    ['null', null],
    ['unknown from', { ...valid, from: 'nope' }],
    ['unknown to', { ...valid, to: 7 }],
    ['unknown kind', { ...valid, kind: 'dns' }],
    ['empty summary', { ...valid, summary: '' }],
    ['huge summary', { ...valid, summary: 's'.repeat(2000) }],
    ['bad correlation', { ...valid, correlationId: 'ABC' }],
    ['missing correlation', { ...valid, correlationId: undefined }],
    ['payload array', { ...valid, payload: [] }],
    ['payload null', { ...valid, payload: null }],
    ['ok not boolean', { ...valid, ok: 'yes' }],
    ['simulated not boolean', { ...valid, simulated: 1 }],
    ['negative duration', { ...valid, durationMs: -1 }],
    ['duration string', { ...valid, durationMs: '4' }],
    ['span phase', { ...valid, span: { id: 's', phase: 'middle' } }],
    ['span id too long', { ...valid, span: { id: 'x'.repeat(65), phase: 'start' } }],
  ];
  it.each(bad)('rejects %s', (_name, raw) => {
    expect(validateIngestEvent(raw, NOW).ok).toBe(false);
  });
});
