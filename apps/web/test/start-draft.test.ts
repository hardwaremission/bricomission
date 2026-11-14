import { describe, expect, it, vi } from 'vitest';
import { createStartDraftHandler } from '../src/lib/kitchen-draft/start-draft';

const BASE = 'http://api.internal:3000';
const TOKEN = 'T'.repeat(43);
const DRAFT = { id: 'd1', status: 'draft', photos: [] };
const SAME = { host: 'localhost:3100', origin: 'http://localhost:3100' };

function setup(responses: Array<Response | Error>, secure = false) {
  const queue = [...responses];
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error('unexpected fetch');
    if (next instanceof Error) throw next;
    return next;
  });
  const logError = vi.fn<(message: string) => void>();
  const handler = createStartDraftHandler({ baseUrl: () => BASE, secureCookies: () => secure, fetchImpl, logError });
  return { handler, fetchImpl, logError };
}

const post = (headers: Record<string, string>) => new Request('http://localhost:3100/api/kitchen-projects/drafts', { method: 'POST', headers });

describe('POST /api/kitchen-projects/drafts (BFF start route)', () => {
  it.each<Record<string, string>>([{}, { host: 'localhost:3100' }, { host: 'localhost:3100', origin: 'http://evil.example' }, { host: 'localhost:3100', origin: 'null' }])(
    '403 without a same-origin Origin %j and no upstream call',
    async (headers) => {
      const { handler, fetchImpl } = setup([]);
      const res = await handler(post(headers));
      expect(res.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('creates: 201, HttpOnly bm_draft cookie, token stripped from the body', async () => {
    const { handler, fetchImpl } = setup([Response.json({ draft: DRAFT, draftToken: TOKEN }, { status: 201 })]);
    const res = await handler(post(SAME));
    expect(res.status).toBe(201);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ draft: DRAFT });
    expect(body).not.toContain(TOKEN);
    expect(res.headers.get('set-cookie')).toBe(`bm_draft=${TOKEN}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE}/kitchen-projects/drafts`);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('adds Secure on https deployments', async () => {
    const { handler } = setup([Response.json({ draft: DRAFT, draftToken: TOKEN }, { status: 201 })], true);
    expect((await handler(post(SAME))).headers.get('set-cookie')).toMatch(/; Secure$/);
  });

  it('resumes: 200 with the live draft, no create call, no new cookie', async () => {
    const { handler, fetchImpl } = setup([Response.json(DRAFT)]);
    const res = await handler(post({ ...SAME, cookie: `bm_draft=${TOKEN}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: DRAFT });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE}/kitchen-projects/drafts/current`);
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('x-draft-token')).toBe(TOKEN);
  });

  it('an expired cookie (404) starts a new draft and replaces the cookie', async () => {
    const { handler, fetchImpl } = setup([new Response(null, { status: 404 }), Response.json({ draft: DRAFT, draftToken: TOKEN.replace(/T/g, 'U') }, { status: 201 })]);
    const res = await handler(post({ ...SAME, cookie: `bm_draft=${TOKEN}` }));
    expect(res.status).toBe(201);
    expect(res.headers.get('set-cookie')).toContain(`bm_draft=${'U'.repeat(43)};`);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('passes the 429 capacity error through without a cookie', async () => {
    const { handler } = setup([Response.json({ statusCode: 429, code: 'draft_capacity' }, { status: 429 })]);
    const res = await handler(post(SAME));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('draft_capacity');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('502 when the API is unreachable, logging the class name only', async () => {
    const { handler, logError } = setup([new TypeError('fetch failed http://api.internal:3000')]);
    const res = await handler(post(SAME));
    expect(res.status).toBe(502);
    expect(logError).toHaveBeenCalledWith('start draft: upstream unreachable (TypeError)');
  });

  it('502 when the API answers a malformed token', async () => {
    const { handler } = setup([Response.json({ draft: DRAFT, draftToken: 'short' }, { status: 201 })]);
    const res = await handler(post(SAME));
    expect(res.status).toBe(502);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
