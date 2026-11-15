import { describe, expect, it } from 'vitest';
import {
  asThumbnail,
  isSensitiveKey,
  MAX_ARRAY_ITEMS,
  MAX_DEPTH,
  MAX_TEXT_BYTES,
  MAX_THUMB_BYTES,
  REDACTED,
  redact,
  redactPayload,
} from '../../src/diagnostics/redact.js';

const JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiMGUyYTFjNCIsInJvbGVzIjpbInVzZXIiXX0.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
const SECRETS = [
  JWT,
  'abc123-secret-value',
  'bm_session=opaque-session-id-777',
  'bm-diagnostics-dev-token',
  'P@ssw0rd!x',
  'hunter2hunter2',
  'AKIAIOSFODNN7EXAMPLE',
  '654321',
  'sup3r-client-secret',
  'seed-98765',
  'b.private@example.com',
];

function dump(value: unknown): string {
  return JSON.stringify(value);
}

describe('redact: fuzz table of secrets in keys', () => {
  const sensitive: Array<[string, unknown]> = [
    ['authorization', `Bearer ${JWT}`],
    ['Authorization', 'abc123-secret-value'],
    ['cookie', 'bm_session=opaque-session-id-777'],
    ['Set-Cookie', 'bm_draft=abc123-secret-value; Path=/'],
    ['bm_session', 'opaque-session-id-777'],
    ['bm_draft', 'abc123-secret-value'],
    ['X-Draft-Token', 'abc123-secret-value'],
    ['x-diagnostics-token', 'bm-diagnostics-dev-token'],
    ['draftToken', 'abc123-secret-value'],
    ['access_token', JWT],
    ['refresh_token', JWT],
    ['id_token', JWT],
    ['password', 'P@ssw0rd!x'],
    ['adminPassword', 'hunter2hunter2'],
    ['client_secret', 'sup3r-client-secret'],
    ['S3_SECRET_KEY', 'hunter2hunter2'],
    ['accessKeyId', 'AKIAIOSFODNN7EXAMPLE'],
    ['code', '654321'],
    ['otp', 654321],
    ['styleSeed', 'seed-98765'],
    ['seed', 98765],
    ['sessionId', 'opaque-session-id-777'],
    ['apiKey', 'abc123-secret-value'],
  ];

  it.each(sensitive)('replaces the value of %s', (key, value) => {
    const out = redact({ [key]: value, nested: { deep: { [key]: value } }, list: [{ [key]: value }] });
    const text = dump(out);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(text).toContain(REDACTED);
  });

  it('keeps booleans and counters under similar names (hasSession, maxTokens, promptTokens)', () => {
    const out = redact({ hasSession: true, hasDraftToken: false, maxTokens: 4096, promptTokens: 12, completionTokens: 3, tokensPerSecond: 31.5, codeLength: 6 });
    expect(out).toEqual({ hasSession: true, hasDraftToken: false, maxTokens: 4096, promptTokens: 12, completionTokens: 3, tokensPerSecond: 31.5, codeLength: 6 });
  });

  it('classifies key names', () => {
    for (const key of ['token', 'Token', 'x_draft_token', 'session', 'password', 'userPassword', 'cookie']) expect(isSensitiveKey(key)).toBe(true);
    for (const key of ['tokens', 'maxTokens', 'summary', 'prompt', 'model', 'hasSession', 'status']) expect(isSensitiveKey(key)).toBe(false);
  });
});

describe('redact: secrets inside strings', () => {
  const cases: Array<[string, string]> = [
    ['Bearer header', `Authorization: Bearer ${JWT}`],
    ['bare Bearer', `forwarded Bearer ${JWT} upstream`],
    ['bare JWT', `token was ${JWT} end`],
    ['cookie header', 'Cookie: bm_session=opaque-session-id-777; bm_draft=abc123-secret-value'],
    ['set-cookie', 'set-cookie: bm_session=opaque-session-id-777; HttpOnly; Path=/'],
    ['draft token header', 'X-Draft-Token: abc123-secret-value'],
    ['json in text', '{"password":"P@ssw0rd!x","client_secret":"sup3r-client-secret"}'],
    ['form body', 'grant_type=password&username=bm-homeowner&password=P@ssw0rd!x&client_secret=sup3r-client-secret'],
    ['oidc callback', 'GET /auth/callback?code=654321&state=abc123-secret-value&session_state=opaque-session-id-777'],
    ['env style', 'S3_SECRET_KEY=hunter2hunter2 access_token=abc123-secret-value'],
  ];

  it.each(cases)('masks %s', (_name, text) => {
    const out = redact({ text, nested: [{ line: text }] });
    const dumped = dump(out);
    for (const secret of SECRETS) expect(dumped).not.toContain(secret);
    expect(dumped).not.toContain('654321');
  });

  it('masks emails but keeps the domain', () => {
    expect(redact('mail sent to b.private@example.com now')).toBe('mail sent to b***@example.com now');
  });

  it('keeps prompts and style texts verbatim', () => {
    const prompt = 'Modern white kitchen, oak island 2.4 m, matte black handles; negative: blurry, text, watermark.\nTask: describe 3 references (42 % upload 1).';
    expect(redact(prompt)).toBe(prompt);
    expect(redact({ messages: [{ role: 'user', content: prompt }] })).toEqual({ messages: [{ role: 'user', content: prompt }] });
  });
});

describe('redact: images and binaries', () => {
  it('never lets image bytes, Buffers or data URIs through', () => {
    const dataUri = `data:image/jpeg;base64,${Buffer.alloc(3000, 7).toString('base64')}`;
    const out = redact({
      buffer: Buffer.alloc(5000, 1),
      u8: new Uint8Array(10),
      ab: new ArrayBuffer(8),
      dataUri,
      inText: `look: ${dataUri} done`,
      blob: Buffer.alloc(4000, 9).toString('base64'),
    });
    const text = dump(out);
    expect(text).not.toContain('data:image');
    expect(text).not.toContain(Buffer.alloc(3000, 7).toString('base64'));
    expect(out).toMatchObject({ buffer: { binary: true, bytes: 5000 }, u8: { binary: true, bytes: 10 }, ab: { binary: true, bytes: 8 } });
  });

  it('passes only thumbnails made by asThumbnail, at most 96 px', () => {
    const small = `data:image/jpeg;base64,${Buffer.alloc(900, 3).toString('base64')}`;
    const thumb = asThumbnail(small, 96, 64, 123456);
    expect(redact({ ref: thumb })).toEqual({ ref: { kind: 'thumbnail', dataUri: small, width: 96, height: 64, bytes: 900, originalBytes: 123456 } });
    // A look-alike object is not a thumbnail.
    expect(dump(redact({ ref: { kind: 'thumbnail', dataUri: small, width: 96, height: 64, bytes: 900 } }))).not.toContain('data:image');
    expect(() => asThumbnail(small, 97, 64)).toThrow();
    expect(() => asThumbnail(`data:image/jpeg;base64,${Buffer.alloc(MAX_THUMB_BYTES + 100, 1).toString('base64')}`, 96, 96)).toThrow();
    expect(() => asThumbnail('data:image/png;base64,AAAA', 10, 10)).toThrow();
  });
});

describe('redact: errors and shapes', () => {
  it('keeps name and message of errors (with cause) and never the stack', () => {
    const error = new Error(`upstream failed with Bearer ${JWT}`, { cause: new TypeError('connect ECONNREFUSED password=hunter2hunter2') });
    const text = dump(redact({ error }));
    expect(text).toContain('upstream failed');
    expect(text).toContain('TypeError');
    expect(text).not.toContain(JWT);
    expect(text).not.toContain('hunter2hunter2');
    expect(text).not.toContain('at ');
  });

  it('converts Date, bigint, Set, Map, NaN and drops functions and prototype keys', () => {
    const polluted = JSON.parse('{"__proto__":{"x":1},"ok":1}') as unknown;
    const out = redact({ d: new Date(Date.UTC(2026, 10, 15)), n: 12n, s: new Set([1, 2]), m: new Map([['a', 1]]), nan: Number.NaN, fn: () => 1, polluted }) as Record<string, unknown>;
    expect(out).toMatchObject({ d: '2026-11-15T00:00:00.000Z', n: '12', s: [1, 2], m: { a: 1 }, nan: null });
    expect('fn' in out).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out.polluted, '__proto__')).toBe(false);
  });

  it('caps arrays at 50 items and depth at 6, and survives cycles', () => {
    const arr = redact(Array.from({ length: 80 }, (_, i) => i)) as unknown[];
    expect(arr).toHaveLength(MAX_ARRAY_ITEMS + 1);
    expect(arr[MAX_ARRAY_ITEMS]).toEqual({ truncated: true, omittedItems: 30 });
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;
    expect(dump(redact(loop)).length).toBeGreaterThan(0);
    let deep: unknown = 'leaf';
    for (let i = 0; i < MAX_DEPTH + 3; i += 1) deep = { next: deep };
    expect(dump(redact(deep))).toContain('"reason":"depth"');
  });

  it('redactPayload always returns an object', () => {
    expect(redactPayload(undefined)).toEqual({});
    expect(redactPayload('text')).toEqual({ value: 'text' });
    expect(redactPayload({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('redact: long text', () => {
  it('lets a 20 KB prompt through whole', () => {
    const prompt = 'warm oak island '.repeat(1366).slice(0, 20 * 1024);
    expect(redact({ prompt })).toEqual({ prompt });
  });

  it('truncates a 200 KB field with an expandable marker', () => {
    const big = 'ab cd '.repeat(35_000); // 210 KB
    const out = redact({ big }) as { big: { text: string; truncated: boolean; originalBytes: number; expandable: boolean } };
    expect(out.big.truncated).toBe(true);
    expect(out.big.expandable).toBe(true);
    expect(out.big.originalBytes).toBe(Buffer.byteLength(big));
    expect(Buffer.byteLength(out.big.text)).toBeLessThanOrEqual(MAX_TEXT_BYTES);
    expect(big.startsWith(out.big.text)).toBe(true);
  });

  it('cuts multi-byte text on a character boundary', () => {
    const big = 'ñ'.repeat(40_000); // 80 KB
    const out = redact(big) as { text: string; truncated: boolean };
    expect(out.truncated).toBe(true);
    expect(out.text).not.toContain('�');
  });
});
