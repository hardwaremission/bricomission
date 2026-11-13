import { describe, expect, it, vi } from 'vitest';
import { AuthConfigError } from '../src/lib/auth/config';
import { createMemorySessionRepository, type SessionRepository } from '../src/lib/auth/db/session-repository';
import { createAuthHandlers } from '../src/lib/auth/handlers';
import { OidcRejectedError, OidcUnavailableError, type OidcClient, type SignInResult } from '../src/lib/auth/oidc';
import { createSessionService, hashId, SESSION_COOKIE, TX_COOKIE } from '../src/lib/auth/session';
import { CONFIG } from './support/fake-keycloak';

const WEB = 'http://localhost:3100';
const NOW = 1_800_000_000_000;

const SIGNED_IN: SignInResult = {
  sub: 'u1',
  username: 'bm-homeowner',
  displayName: 'Hugo Homeowner',
  accessToken: 'eyJ-access',
  accessExpiresAt: new Date(NOW + 300_000),
  refreshToken: 'eyJ-refresh',
  refreshExpiresAt: new Date(NOW + 28_800_000),
};

function setup({ repoOverride, configError = false }: { repoOverride?: Partial<SessionRepository>; configError?: boolean } = {}) {
  const memory = createMemorySessionRepository(() => NOW);
  const repo: SessionRepository = { ...memory.repo, ...repoOverride };
  const oidc = {
    authorizationUrl: vi.fn((p: { state: string; locale: string; register: boolean }) => `http://localhost:8180/auth?state=${p.state}&ui_locales=${p.locale}&register=${p.register}`),
    exchangeCode: vi.fn(async () => SIGNED_IN),
    refresh: vi.fn(),
    logout: vi.fn(async () => undefined),
  } satisfies OidcClient;
  const logError = vi.fn();
  const config = () => {
    if (configError) throw new AuthConfigError('missing');
    return CONFIG;
  };
  const sessions = createSessionService({ repo: () => repo, oidc: () => oidc, now: () => NOW, logError });
  const handlers = createAuthHandlers({ config, repo: () => repo, oidc: () => oidc, sessions, now: () => NOW, logError });
  return { handlers, memory, oidc, logError };
}

function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`${WEB}${path}`, { headers: { host: 'localhost:3100', ...headers } });
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

function cookieValue(res: Response, name: string): string | undefined {
  return setCookies(res)
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]
    ?.slice(name.length + 1);
}

async function startLogin(handlers: ReturnType<typeof setup>['handlers'], path = '/auth/login?returnTo=%2Fkitchen-projects%2Fnew') {
  const res = await handlers.login(get(path, { cookie: 'NEXT_LOCALE=de' }));
  const tx = cookieValue(res, TX_COOKIE) ?? '';
  const state = new URL(res.headers.get('location') ?? '').searchParams.get('state') ?? '';
  return { res, tx, state };
}

describe('GET /auth/login', () => {
  it('stores a transaction and redirects 303 to Keycloak with the web locale', async () => {
    const { handlers, memory, oidc } = setup();
    const { res, tx } = await startLogin(handlers);
    expect(res.status).toBe(303);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('location')).toContain('ui_locales=de');
    expect(oidc.authorizationUrl).toHaveBeenCalledWith(expect.objectContaining({ locale: 'de', register: false }));
    const call = oidc.authorizationUrl.mock.calls[0]?.[0] as unknown as { codeChallenge: string; nonce: string };
    expect(call.codeChallenge).toMatch(/^[\w-]{43}$/);
    expect(setCookies(res).find((c) => c.startsWith(`${TX_COOKIE}=`))).toMatch(/Max-Age=600; HttpOnly; SameSite=Lax$/);
    const stored = memory.transactions.get(hashId(tx).toString('hex'));
    expect(stored).toMatchObject({ returnTo: '/kitchen-projects/new', locale: 'de', nonce: call.nonce, expiresAt: new Date(NOW + 600_000) });
    expect(memory.transactions.has(tx)).toBe(false);
  });

  it('falls back to en, keeps only safe returnTo paths and maps mode=register', async () => {
    const { handlers, memory, oidc } = setup();
    const res = await handlers.login(get('/auth/login?returnTo=%2F%2Fevil.example&mode=register'));
    const stored = memory.transactions.get(hashId(cookieValue(res, TX_COOKIE) ?? '').toString('hex'));
    expect(stored?.returnTo).toBe('/');
    expect(oidc.authorizationUrl).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en', register: true }));
  });

  it('redirects 307 to the canonical host first (cookies are host-scoped)', async () => {
    const { handlers, memory } = setup();
    const res = await handlers.login(new Request('http://127.0.0.1:3100/auth/login?returnTo=%2F', { headers: { host: '127.0.0.1:3100' } }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3100/auth/login?returnTo=%2F');
    expect(memory.transactions.size).toBe(0);
  });

  it('shows the unavailable page when the database or the configuration fails', async () => {
    const down = setup({ repoOverride: { insertTransaction: async () => { throw new Error('ECONNREFUSED'); } } });
    const res = await down.handlers.login(get('/auth/login?returnTo=%2Fx'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/auth/error?reason=unavailable&returnTo=%2Fx');
    expect(down.logError).toHaveBeenCalledWith('web auth: login could not start (Error)');
    const noConfig = setup({ configError: true });
    expect((await noConfig.handlers.login(get('/auth/login'))).headers.get('location')).toBe('/auth/error?reason=unavailable');
  });
});

describe('GET /auth/callback', () => {
  async function callback(handlers: ReturnType<typeof setup>['handlers'], query: string, cookie: string) {
    return handlers.callback(get(`/auth/callback?${query}`, { cookie }));
  }

  it('creates the session and redirects 303 to returnTo', async () => {
    const { handlers, memory, oidc } = setup();
    const { tx, state } = await startLogin(handlers);
    const res = await callback(handlers, `code=c1&state=${state}&iss=x`, `${TX_COOKIE}=${tx}`);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/kitchen-projects/new');
    const sessionCookie = setCookies(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(sessionCookie).toMatch(/^bm_session=[\w-]{43}; Path=\/; Max-Age=36000; HttpOnly; SameSite=Lax$/);
    expect(setCookies(res)).toContain(`${TX_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    const id = cookieValue(res, SESSION_COOKIE) ?? '';
    expect(memory.sessions.get(hashId(id).toString('hex'))).toMatchObject({ username: 'bm-homeowner', accessToken: 'eyJ-access' });
    expect(memory.sessions.has(id)).toBe(false);
    const [search, checks] = oidc.exchangeCode.mock.calls[0] as unknown as [URLSearchParams, { state: string }];
    expect(search.get('code')).toBe('c1');
    expect(checks.state).toBe(state);
    expect(memory.transactions.size).toBe(0);
  });

  it('a reused transaction is expired and creates no session', async () => {
    const { handlers, memory } = setup();
    const { tx, state } = await startLogin(handlers);
    await callback(handlers, `code=c1&state=${state}`, `${TX_COOKIE}=${tx}`);
    const again = await callback(handlers, `code=c1&state=${state}`, `${TX_COOKIE}=${tx}`);
    expect(again.headers.get('location')).toBe('/auth/error?reason=expired');
    expect(memory.sessions.size).toBe(1);
  });

  it.each([
    ['no transaction cookie', 'expired', ''],
    ['an unknown transaction', 'expired', `${TX_COOKIE}=unknown`],
  ])('%s -> %s', async (_label, reason, cookie) => {
    const { handlers, memory } = setup();
    const res = await callback(handlers, 'code=c&state=s', cookie);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/auth/error?reason=${reason}`);
    expect(memory.sessions.size).toBe(0);
  });

  it('an expired transaction -> expired', async () => {
    const { handlers, memory } = setup();
    const { tx, state } = await startLogin(handlers);
    const stored = memory.transactions.get(hashId(tx).toString('hex'));
    if (stored) stored.expiresAt = new Date(NOW - 1);
    const res = await callback(handlers, `code=c&state=${state}`, `${TX_COOKIE}=${tx}`);
    expect(res.headers.get('location')).toBe('/auth/error?reason=expired');
  });

  it.each([
    ['state mismatch', 'failed', (state: string) => `code=c&state=${state}x`],
    ['access_denied', 'cancelled', (state: string) => `error=access_denied&state=${state}`],
    ['another OAuth error', 'failed', (state: string) => `error=server_error&state=${state}`],
    ['no code', 'failed', (state: string) => `state=${state}`],
  ])('%s -> %s, transaction consumed, no session', async (_label, reason, query) => {
    const { handlers, memory, oidc } = setup();
    const { tx, state } = await startLogin(handlers);
    const res = await callback(handlers, query(state), `${TX_COOKIE}=${tx}`);
    expect(res.headers.get('location')).toBe(`/auth/error?reason=${reason}&returnTo=%2Fkitchen-projects%2Fnew`);
    expect(memory.sessions.size).toBe(0);
    expect(memory.transactions.size).toBe(0);
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });

  it.each([
    ['OidcRejectedError (ID token or exchange rejected)', 'failed', new OidcRejectedError('id token')],
    ['OidcUnavailableError (Keycloak unreachable)', 'unavailable', new OidcUnavailableError('network')],
  ])('code exchange failure %s -> %s', async (_label, reason, error) => {
    const { handlers, memory, oidc } = setup();
    oidc.exchangeCode.mockRejectedValueOnce(error);
    const { tx, state } = await startLogin(handlers);
    const res = await callback(handlers, `code=c&state=${state}`, `${TX_COOKIE}=${tx}`);
    expect(res.headers.get('location')).toBe(`/auth/error?reason=${reason}&returnTo=%2Fkitchen-projects%2Fnew`);
    expect(memory.sessions.size).toBe(0);
    expect(setCookies(res).some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it('replaces a previous session of the browser', async () => {
    const { handlers, memory } = setup();
    await memory.repo.insertSession(hashId('old'), SIGNED_IN);
    const { tx, state } = await startLogin(handlers);
    await callback(handlers, `code=c&state=${state}`, `${TX_COOKIE}=${tx}; ${SESSION_COOKIE}=old`);
    expect(memory.sessions.has(hashId('old').toString('hex'))).toBe(false);
    expect(memory.sessions.size).toBe(1);
  });
});

describe('POST /auth/logout', () => {
  function post(headers: Record<string, string>) {
    return new Request(`${WEB}/auth/logout`, { method: 'POST', headers: { host: 'localhost:3100', ...headers } });
  }

  it('rejects a missing or foreign Origin with 403 and keeps the session', async () => {
    const { handlers, memory } = setup();
    await memory.repo.insertSession(hashId('s'), SIGNED_IN);
    for (const headers of [{ cookie: `${SESSION_COOKIE}=s` }, { cookie: `${SESSION_COOKIE}=s`, origin: 'http://evil.example' }] as Array<Record<string, string>>) {
      expect((await handlers.logout(post(headers))).status).toBe(403);
    }
    expect(memory.sessions.size).toBe(1);
  });

  it('ends the Keycloak session, deletes the row, clears the cookie and redirects 303 to /', async () => {
    const { handlers, memory, oidc } = setup();
    await memory.repo.insertSession(hashId('s'), SIGNED_IN);
    const res = await handlers.logout(post({ cookie: `${SESSION_COOKIE}=s`, origin: WEB }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
    expect(oidc.logout).toHaveBeenCalledWith('eyJ-refresh');
    expect(memory.sessions.size).toBe(0);
    expect(setCookies(res)).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  });

  it('still removes the local session when Keycloak is unreachable', async () => {
    const { handlers, memory, oidc, logError } = setup();
    oidc.logout.mockRejectedValueOnce(new OidcUnavailableError('TimeoutError'));
    await memory.repo.insertSession(hashId('s'), SIGNED_IN);
    const res = await handlers.logout(post({ cookie: `${SESSION_COOKIE}=s`, origin: WEB }));
    expect(res.status).toBe(303);
    expect(memory.sessions.size).toBe(0);
    expect(logError).toHaveBeenCalledWith('web auth: Keycloak logout failed (OidcUnavailableError)');
  });
});

describe('GET /auth/session', () => {
  it('answers signedIn:false without touching the repository when there is no cookie', async () => {
    const findSession = vi.fn();
    const { handlers } = setup({ repoOverride: { findSession } });
    const res = await handlers.session(get('/auth/session'));
    expect(await res.json()).toEqual({ signedIn: false });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(findSession).not.toHaveBeenCalled();
  });

  it('returns the user and never a token', async () => {
    const { handlers, memory } = setup();
    await memory.repo.insertSession(hashId('s'), SIGNED_IN);
    const res = await handlers.session(get('/auth/session', { cookie: `${SESSION_COOKIE}=s` }));
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ signedIn: true, user: { username: 'bm-homeowner', displayName: 'Hugo Homeowner' } });
    expect(text).not.toContain('eyJ');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('clears a stale cookie and answers 503 when the database is down', async () => {
    const { handlers } = setup();
    const stale = await handlers.session(get('/auth/session', { cookie: `${SESSION_COOKIE}=gone` }));
    expect(await stale.json()).toEqual({ signedIn: false });
    expect(setCookies(stale)).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    const down = setup({ repoOverride: { findSession: async () => { throw new Error('down'); } } });
    const res = await down.handlers.session(get('/auth/session', { cookie: `${SESSION_COOKIE}=s` }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error' });
  });
});
