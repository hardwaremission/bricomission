import { describe, expect, it, vi } from 'vitest';
import { createMemorySessionRepository, type SessionRepository, type StoredSession } from '../src/lib/auth/db/session-repository';
import { OidcInvalidGrantError, OidcUnavailableError, type OidcClient } from '../src/lib/auth/oidc';
import {
  clearCookie,
  createSessionService,
  hashId,
  newOpaqueId,
  readCookie,
  REFRESH_MARGIN_MS,
  SESSION_COOKIE,
  setCookie,
} from '../src/lib/auth/session';

const NOW = 1_800_000_000_000;

function storedSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sub: 'u1',
    username: 'bm-homeowner',
    displayName: 'Hugo Homeowner',
    accessToken: 'access-old',
    accessExpiresAt: new Date(NOW + 200_000),
    refreshToken: 'refresh-old',
    refreshExpiresAt: new Date(NOW + 28_800_000),
    ...overrides,
  };
}

function fakeOidc(refresh: OidcClient['refresh']): OidcClient {
  return {
    authorizationUrl: () => 'http://kc/auth',
    exchangeCode: vi.fn(),
    refresh: vi.fn(refresh),
    logout: vi.fn(async () => undefined),
  };
}

async function setup(session: StoredSession | null, refresh: OidcClient['refresh'] = async () => { throw new Error('unused'); }) {
  const memory = createMemorySessionRepository(() => NOW);
  const cookie = newOpaqueId();
  if (session) await memory.repo.insertSession(hashId(cookie), session);
  const repoAccessor = vi.fn(() => memory.repo);
  const oidc = fakeOidc(refresh);
  const logError = vi.fn();
  const service = createSessionService({ repo: repoAccessor, oidc: () => oidc, now: () => NOW, logError });
  return { service, memory, cookie, header: `NEXT_LOCALE=de; ${SESSION_COOKIE}=${cookie}`, oidc, repoAccessor, logError };
}

describe('cookie helpers', () => {
  it('opaque ids are 32 random bytes in base64url; rows are keyed by their SHA-256', () => {
    const id = newOpaqueId();
    expect(Buffer.from(id, 'base64url')).toHaveLength(32);
    expect(hashId(id)).toHaveLength(32);
    expect(hashId(id).toString('base64url')).not.toBe(id);
  });

  it('readCookie finds one cookie in a header', () => {
    expect(readCookie('a=1; bm_session=xyz; b=2', 'bm_session')).toBe('xyz');
    expect(readCookie('a=1', 'bm_session')).toBeNull();
    expect(readCookie(null, 'bm_session')).toBeNull();
    expect(readCookie('bm_session=', 'bm_session')).toBeNull();
  });

  it('cookies are HttpOnly, SameSite=Lax, Path=/, Secure only on https', () => {
    expect(setCookie('bm_session', 'v', 60, false)).toBe('bm_session=v; Path=/; Max-Age=60; HttpOnly; SameSite=Lax');
    expect(setCookie('bm_session', 'v', 60, true)).toContain('; Secure');
    expect(clearCookie('bm_auth_tx', false)).toBe('bm_auth_tx=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  });
});

describe('getValidAccessToken', () => {
  it('is anonymous without touching the repository when there is no cookie', async () => {
    const { service, repoAccessor } = await setup(storedSession());
    expect(await service.getValidAccessToken('NEXT_LOCALE=de')).toEqual({ kind: 'anonymous', clearCookie: false });
    expect(await service.getValidAccessToken(null)).toEqual({ kind: 'anonymous', clearCookie: false });
    expect(repoAccessor).not.toHaveBeenCalled();
  });

  it('returns the stored access token while it is valid for more than 30 s', async () => {
    const { service, header, oidc } = await setup(storedSession({ accessExpiresAt: new Date(NOW + REFRESH_MARGIN_MS + 1000) }));
    expect(await service.getValidAccessToken(header)).toEqual({ kind: 'token', token: 'access-old' });
    expect(oidc.refresh).not.toHaveBeenCalled();
  });

  it('treats an unknown or expired session as anonymous and clears the cookie', async () => {
    const { service } = await setup(null);
    expect(await service.getValidAccessToken(`${SESSION_COOKIE}=unknown`)).toEqual({ kind: 'anonymous', clearCookie: true });
    const expired = await setup(storedSession({ refreshExpiresAt: new Date(NOW - 1) }));
    expect(await expired.service.getValidAccessToken(expired.header)).toEqual({ kind: 'anonymous', clearCookie: true });
  });

  it('refreshes once for concurrent requests and stores the new tokens', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { service, header, oidc, memory, cookie } = await setup(storedSession({ accessExpiresAt: new Date(NOW + 10_000) }), async () => {
      await gate;
      return {
        accessToken: 'access-new',
        accessExpiresAt: new Date(NOW + 300_000),
        refreshToken: 'refresh-new',
        refreshExpiresAt: new Date(NOW + 28_800_000),
      };
    });
    const pending = [service.getValidAccessToken(header), service.getValidAccessToken(header), service.getValidAccessToken(header)];
    release();
    expect(await Promise.all(pending)).toEqual(Array(3).fill({ kind: 'token', token: 'access-new' }));
    expect(oidc.refresh).toHaveBeenCalledTimes(1);
    expect(oidc.refresh).toHaveBeenCalledWith('refresh-old');
    expect(await memory.repo.findSession(hashId(cookie))).toMatchObject({ accessToken: 'access-new', refreshToken: 'refresh-new' });
  });

  it('on invalid_grant deletes the row and goes anonymous with a cleared cookie', async () => {
    const { service, header, memory, cookie } = await setup(storedSession({ accessExpiresAt: new Date(NOW) }), async () => {
      throw new OidcInvalidGrantError('invalid_grant');
    });
    expect(await service.getValidAccessToken(header)).toEqual({ kind: 'anonymous', clearCookie: true });
    expect(await memory.repo.findSession(hashId(cookie))).toBeNull();
  });

  it('keeps the session and reports unavailable when Keycloak is unreachable', async () => {
    const { service, header, memory, cookie, logError } = await setup(storedSession({ accessExpiresAt: new Date(NOW) }), async () => {
      throw new OidcUnavailableError('network');
    });
    expect(await service.getValidAccessToken(header)).toEqual({ kind: 'unavailable' });
    expect(await memory.repo.findSession(hashId(cookie))).not.toBeNull();
    expect(logError).toHaveBeenCalledWith('web session: token refresh failed (OidcUnavailableError)');
  });

  it('reports unavailable when the database fails while a cookie is present', async () => {
    const broken: SessionRepository = {
      ...createMemorySessionRepository().repo,
      findSession: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    };
    const service = createSessionService({ repo: () => broken, oidc: () => fakeOidc(async () => { throw new Error(); }), logError: () => undefined });
    expect(await service.getValidAccessToken(`${SESSION_COOKIE}=x`)).toEqual({ kind: 'unavailable' });
  });

  it('reports unavailable when the configuration (session key) is invalid', async () => {
    const service = createSessionService({
      repo: () => {
        throw new Error('bad key');
      },
      oidc: () => fakeOidc(async () => { throw new Error(); }),
      logError: () => undefined,
    });
    expect(await service.getValidAccessToken(`${SESSION_COOKIE}=x`)).toEqual({ kind: 'unavailable' });
  });
});
