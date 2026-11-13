import { describe, expect, it, vi } from 'vitest';
import {
  createOidcClient,
  OidcInvalidGrantError,
  OidcRejectedError,
  OidcUnavailableError,
} from '../src/lib/auth/oidc';
import { CONFIG, idTokenClaims, INTERNAL, ISSUER, json, newSigningKey, signJwt } from './support/fake-keycloak';

const key = newSigningKey();

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function fakeKeycloak(tokenHandler: Handler, extra: Record<string, Handler> = {}) {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = new URLSearchParams(init.body ? String(init.body) : '');
    calls.push({ url, body });
    if (url === `${INTERNAL}/certs`) return json({ keys: [key.jwk] });
    if (url === `${INTERNAL}/token`) return tokenHandler(url, init);
    const handler = extra[url];
    if (handler) return handler(url, init);
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function tokenResponse(claims: Record<string, unknown> = idTokenClaims(), signer = key) {
  return json({
    access_token: 'access-1',
    expires_in: 300,
    refresh_token: 'refresh-1',
    refresh_expires_in: 28800,
    token_type: 'Bearer',
    id_token: signJwt(signer.privateKey, signer.kid, claims),
    scope: 'openid profile email',
  });
}

function callbackSearch(extra: Record<string, string> = {}) {
  return new URLSearchParams({ code: 'code-1', state: 'state-1', iss: ISSUER, ...extra });
}

const CHECKS = { state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' };

describe('authorizationUrl', () => {
  it('points the browser at the public Keycloak with PKCE S256, state, nonce and ui_locales', () => {
    const oidc = createOidcClient(CONFIG);
    const url = new URL(oidc.authorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c', locale: 'de', register: false }));
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/protocol/openid-connect/auth`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'bricomission-web',
      redirect_uri: 'http://localhost:3100/auth/callback',
      response_type: 'code',
      scope: 'openid',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      state: 's',
      nonce: 'n',
      ui_locales: 'de',
    });
  });

  it('adds prompt=create only for registration', () => {
    const oidc = createOidcClient(CONFIG);
    const url = new URL(oidc.authorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c', locale: 'en', register: true }));
    expect(url.searchParams.get('prompt')).toBe('create');
  });
});

describe('exchangeCode', () => {
  it('exchanges the code on the internal token endpoint with the secret and PKCE verifier', async () => {
    const { fetchImpl, calls } = fakeKeycloak(() => tokenResponse());
    const now = Date.now();
    const oidc = createOidcClient(CONFIG, { fetchImpl, now: () => now });
    const result = await oidc.exchangeCode(callbackSearch(), CHECKS);
    expect(result).toMatchObject({ sub: 'user-123', username: 'bm-homeowner', displayName: 'Hugo Homeowner', accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(result.accessExpiresAt.getTime()).toBe(now + 300_000);
    expect(result.refreshExpiresAt.getTime()).toBe(now + 28_800_000);
    const token = calls.find((c) => c.url === `${INTERNAL}/token`);
    expect(Object.fromEntries(token?.body ?? [])).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code-1',
      code_verifier: 'verifier-1',
      redirect_uri: 'http://localhost:3100/auth/callback',
      client_id: 'bricomission-web',
      client_secret: 'test-secret',
    });
    expect(calls.some((c) => c.url === `${INTERNAL}/certs`)).toBe(true);
  });

  it('falls back to the username when the ID token has no name', async () => {
    const { fetchImpl } = fakeKeycloak(() => tokenResponse(idTokenClaims({ name: undefined })));
    const result = await createOidcClient(CONFIG, { fetchImpl }).exchangeCode(callbackSearch(), CHECKS);
    expect(result.displayName).toBe('bm-homeowner');
  });

  it.each([
    ['wrong nonce', idTokenClaims({ nonce: 'other' })],
    ['wrong audience', idTokenClaims({ aud: 'bricomission-dev-cli', azp: 'bricomission-dev-cli' })],
    ['wrong issuer (internal URL)', idTokenClaims({ iss: 'http://keycloak:8080/realms/BricoMission' })],
    ['expired', idTokenClaims({ iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 })],
  ])('rejects an ID token with %s', async (_label, claims) => {
    const { fetchImpl } = fakeKeycloak(() => tokenResponse(claims));
    await expect(createOidcClient(CONFIG, { fetchImpl }).exchangeCode(callbackSearch(), CHECKS)).rejects.toBeInstanceOf(OidcRejectedError);
  });

  it('rejects an ID token signed by a key outside the JWKS', async () => {
    const stranger = newSigningKey('k1');
    const { fetchImpl } = fakeKeycloak(() => tokenResponse(idTokenClaims(), stranger));
    await expect(createOidcClient(CONFIG, { fetchImpl }).exchangeCode(callbackSearch(), CHECKS)).rejects.toBeInstanceOf(OidcRejectedError);
  });

  it('rejects an authorization response whose iss is not the public issuer', async () => {
    const { fetchImpl } = fakeKeycloak(() => tokenResponse());
    await expect(
      createOidcClient(CONFIG, { fetchImpl }).exchangeCode(callbackSearch({ iss: 'http://evil.example/realms/BricoMission' }), CHECKS),
    ).rejects.toBeInstanceOf(OidcRejectedError);
  });

  it('maps a rejected code to OidcInvalidGrantError and an unreachable Keycloak to OidcUnavailableError', async () => {
    const rejected = fakeKeycloak(() => json({ error: 'invalid_grant', error_description: 'Code not valid' }, 400));
    await expect(createOidcClient(CONFIG, { fetchImpl: rejected.fetchImpl }).exchangeCode(callbackSearch(), CHECKS)).rejects.toBeInstanceOf(
      OidcInvalidGrantError,
    );
    const down = fakeKeycloak(() => {
      throw new TypeError('fetch failed');
    });
    await expect(createOidcClient(CONFIG, { fetchImpl: down.fetchImpl }).exchangeCode(callbackSearch(), CHECKS)).rejects.toBeInstanceOf(
      OidcUnavailableError,
    );
  });
});

describe('refresh', () => {
  it('returns the new tokens and expiries', async () => {
    const { fetchImpl, calls } = fakeKeycloak(() => tokenResponse(idTokenClaims({ nonce: undefined })));
    const now = Date.now();
    const tokens = await createOidcClient(CONFIG, { fetchImpl, now: () => now }).refresh('refresh-0');
    expect(tokens).toEqual({
      accessToken: 'access-1',
      accessExpiresAt: new Date(now + 300_000),
      refreshToken: 'refresh-1',
      refreshExpiresAt: new Date(now + 28_800_000),
    });
    expect(calls.find((c) => c.url === `${INTERNAL}/token`)?.body.get('refresh_token')).toBe('refresh-0');
  });

  it('maps invalid_grant, 5xx and network errors', async () => {
    const invalid = fakeKeycloak(() => json({ error: 'invalid_grant' }, 400));
    await expect(createOidcClient(CONFIG, { fetchImpl: invalid.fetchImpl }).refresh('r')).rejects.toBeInstanceOf(OidcInvalidGrantError);
    const failing = fakeKeycloak(() => json({ error: 'server_error' }, 503));
    await expect(createOidcClient(CONFIG, { fetchImpl: failing.fetchImpl }).refresh('r')).rejects.toBeInstanceOf(OidcUnavailableError);
    const down = fakeKeycloak(() => {
      throw new TypeError('fetch failed');
    });
    await expect(createOidcClient(CONFIG, { fetchImpl: down.fetchImpl }).refresh('r')).rejects.toBeInstanceOf(OidcUnavailableError);
  });
});

describe('logout', () => {
  it('posts the client credentials and refresh token to the internal logout endpoint', async () => {
    const { fetchImpl, calls } = fakeKeycloak(() => json({}), { [`${INTERNAL}/logout`]: () => new Response(null, { status: 204 }) });
    await createOidcClient(CONFIG, { fetchImpl }).logout('refresh-9');
    const call = calls.find((c) => c.url === `${INTERNAL}/logout`);
    expect(Object.fromEntries(call?.body ?? [])).toEqual({ client_id: 'bricomission-web', client_secret: 'test-secret', refresh_token: 'refresh-9' });
  });

  it('reports an unreachable Keycloak as OidcUnavailableError', async () => {
    const { fetchImpl } = fakeKeycloak(() => json({}));
    await expect(createOidcClient(CONFIG, { fetchImpl }).logout('r')).rejects.toBeInstanceOf(OidcUnavailableError);
  });
});
