import { describe, expect, it, vi } from 'vitest';
import type { AccessResult } from '../src/lib/auth/session';
import { createClaimDraftHandler } from '../src/lib/kitchen-draft/claim-draft';

const BASE = 'http://api.internal:3000';
const DRAFT_TOKEN = 'T'.repeat(43);
const ACCESS = 'access-token-xyz';
const PROJECT = { id: 'p1', status: 'claimed', photos: [], moodboard: [], claimedAt: '2026-11-15T10:00:00.000Z' };
const SAME = { host: 'localhost:3100', origin: 'http://localhost:3100' };
const COOKIES = `bm_session=s; bm_draft=${DRAFT_TOKEN}`;
const CLEAR_DRAFT = 'bm_draft=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';

function setup(responses: Array<Response | Error>, access: AccessResult = { kind: 'token', token: ACCESS }, secure = false) {
  const queue = [...responses];
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error('unexpected fetch');
    if (next instanceof Error) throw next;
    return next;
  });
  const resolveAccessToken = vi.fn(async () => access);
  const logError = vi.fn<(message: string) => void>();
  const handler = createClaimDraftHandler({ baseUrl: () => BASE, secureCookies: () => secure, resolveAccessToken, fetchImpl, logError });
  return { handler, fetchImpl, resolveAccessToken, logError };
}

const post = (headers: Record<string, string>) => new Request('http://localhost:3100/api/kitchen-projects/drafts/current/claim', { method: 'POST', headers });

describe('POST /api/kitchen-projects/drafts/current/claim (BFF claim route)', () => {
  it.each<Record<string, string>>([{ cookie: COOKIES }, { host: 'localhost:3100', cookie: COOKIES }, { host: 'localhost:3100', origin: 'http://evil.example', cookie: COOKIES }])(
    '403 without a same-origin Origin %j: no session lookup, no upstream call',
    async (headers) => {
      const { handler, fetchImpl, resolveAccessToken } = setup([]);
      expect((await handler(post(headers))).status).toBe(403);
      expect(resolveAccessToken).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('401 without a valid session and no upstream call; a stale session cookie is cleared', async () => {
    const { handler, fetchImpl } = setup([], { kind: 'anonymous', clearCookie: false });
    const res = await handler(post({ ...SAME, cookie: `bm_draft=${DRAFT_TOKEN}` }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    const stale = setup([], { kind: 'anonymous', clearCookie: true });
    const res2 = await stale.handler(post({ ...SAME, cookie: COOKIES }));
    expect(res2.status).toBe(401);
    expect(res2.headers.get('set-cookie')).toBe('bm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    expect(stale.fetchImpl).not.toHaveBeenCalled();
  });

  it('503 when the session store or Keycloak is unavailable', async () => {
    const { handler, fetchImpl } = setup([], { kind: 'unavailable' });
    expect((await handler(post({ ...SAME, cookie: COOKIES }))).status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('404 without a bm_draft cookie and no upstream call', async () => {
    const { handler, fetchImpl } = setup([]);
    const res = await handler(post({ ...SAME, cookie: 'bm_session=s' }));
    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('200: sends Bearer + X-Draft-Token upstream, returns { project }, clears bm_draft, no-store', async () => {
    const { handler, fetchImpl } = setup([Response.json({ project: PROJECT })]);
    const res = await handler(post({ ...SAME, cookie: COOKIES, authorization: 'Bearer forged', 'x-draft-token': 'forged' }));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ project: PROJECT });
    expect(body).not.toContain(DRAFT_TOKEN);
    expect(body).not.toContain(ACCESS);
    expect(res.headers.get('set-cookie')).toBe(CLEAR_DRAFT);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/kitchen-projects/drafts/current/claim`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ accept: 'application/json', authorization: `Bearer ${ACCESS}`, 'x-draft-token': DRAFT_TOKEN });
  });

  it('adds Secure to the cleared cookie on https deployments', async () => {
    const { handler } = setup([Response.json({ project: PROJECT })], { kind: 'token', token: ACCESS }, true);
    expect((await handler(post({ ...SAME, cookie: COOKIES }))).headers.get('set-cookie')).toBe(`${CLEAR_DRAFT}; Secure`);
  });

  it('404 upstream (expired, unknown or another Account): 404 and bm_draft cleared', async () => {
    const { handler } = setup([Response.json({ statusCode: 404, message: 'Not Found' }, { status: 404 })]);
    const res = await handler(post({ ...SAME, cookie: COOKIES }));
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBe(CLEAR_DRAFT);
  });

  it.each([401, 403, 503])('%i upstream passes through and keeps bm_draft', async (status) => {
    const { handler } = setup([Response.json({ statusCode: status }, { status })]);
    const res = await handler(post({ ...SAME, cookie: COOKIES }));
    expect(res.status).toBe(status);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('502 when upstream is unreachable (class name logged only) or answers garbage; bm_draft kept', async () => {
    const { handler, logError } = setup([new TypeError('fetch failed: secret detail')]);
    const res = await handler(post({ ...SAME, cookie: COOKIES }));
    expect(res.status).toBe(502);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(logError).toHaveBeenCalledWith('claim draft: upstream unreachable (TypeError)');
    const garbage = setup([new Response('nope', { status: 200 })]);
    expect((await garbage.handler(post({ ...SAME, cookie: COOKIES }))).status).toBe(502);
    const teapot = setup([new Response('x', { status: 500 })]);
    expect((await teapot.handler(post({ ...SAME, cookie: COOKIES }))).status).toBe(502);
  });
});
