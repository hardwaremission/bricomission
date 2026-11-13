import * as client from 'openid-client';
import { callbackUrl, oidcEndpoints, type AuthConfig } from './config';

/**
 * OIDC client of the web server (confidential client bricomission-web) on openid-client 6.
 * The configuration is built from explicit metadata, no discovery: the issuer and the
 * authorization endpoint use the public Keycloak URL (what the browser and the token `iss`
 * see); token, JWKS and logout go over the internal backchannel URL.
 * ID tokens are verified (signature via the JWKS, iss, aud, nonce, exp) on every grant.
 */
export interface TokenResult {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface SignInResult extends TokenResult {
  sub: string;
  username: string;
  displayName: string;
}

export interface AuthorizationParams {
  state: string;
  nonce: string;
  codeChallenge: string;
  locale: string;
  register: boolean;
}

export interface OidcClient {
  authorizationUrl(params: AuthorizationParams): string;
  /** `search` is the callback query string as received. */
  exchangeCode(search: URLSearchParams, checks: { state: string; nonce: string; codeVerifier: string }): Promise<SignInResult>;
  refresh(refreshToken: string): Promise<TokenResult>;
  /** Ends the Keycloak SSO session of this refresh token (backchannel, 3 s timeout). */
  logout(refreshToken: string): Promise<void>;
}

/** The refresh token was rejected (expired, revoked, session ended). */
export class OidcInvalidGrantError extends Error {}
/** Keycloak could not be reached or answered with a server error. */
export class OidcUnavailableError extends Error {}
/** Keycloak answered, but the response failed validation or was an OAuth error. */
export class OidcRejectedError extends Error {}

/** Keycloak's default SSO session max (10 h) when the token response has no refresh expiry. */
const DEFAULT_REFRESH_SECONDS = 36_000;
export const LOGOUT_TIMEOUT_MS = 3000;

export function classifyOidcError(error: unknown): Error {
  if (error instanceof OidcInvalidGrantError || error instanceof OidcUnavailableError || error instanceof OidcRejectedError) return error;
  if (error instanceof client.ResponseBodyError) {
    if (error.error === 'invalid_grant') return new OidcInvalidGrantError(error.error);
    if (error.status >= 500) return new OidcUnavailableError(`status ${error.status}`);
    return new OidcRejectedError(error.error);
  }
  if (error instanceof client.ClientError) {
    // Non-conform status (for example a 502 from a proxy or an HTML error page).
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Response && cause.status >= 500) return new OidcUnavailableError(`status ${cause.status}`);
    return new OidcRejectedError(error.code ?? 'client error');
  }
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new OidcUnavailableError(error.name);
  }
  // fetch() network failures are plain TypeErrors; openid-client's argument errors carry a code.
  if (error instanceof TypeError && !('code' in error)) return new OidcUnavailableError('network');
  return new OidcRejectedError(error instanceof Error ? error.constructor.name : typeof error);
}

export interface OidcClientOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Token endpoint timeout in seconds. */
  timeoutSeconds?: number;
}

function expiresAt(now: number, seconds: unknown, fallback: number): Date {
  const n = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
  return new Date(now + n * 1000);
}

export function createOidcClient(config: AuthConfig, { fetchImpl, now = Date.now, timeoutSeconds = 5 }: OidcClientOptions = {}): OidcClient {
  const endpoints = oidcEndpoints(config);
  const server: client.ServerMetadata = {
    issuer: endpoints.issuer,
    authorization_endpoint: endpoints.authorizationEndpoint,
    token_endpoint: endpoints.tokenEndpoint,
    jwks_uri: endpoints.jwksUri,
    end_session_endpoint: endpoints.endSessionEndpoint,
    // Keycloak returns `iss` on the authorization response (RFC 9207); require and check it.
    authorization_response_iss_parameter_supported: true,
    code_challenge_methods_supported: ['S256'],
  };
  const configuration = new client.Configuration(server, config.clientId, { id_token_signed_response_alg: 'RS256' }, client.ClientSecretPost(config.clientSecret));
  if ([endpoints.issuer, endpoints.tokenEndpoint].some((u) => u.startsWith('http:'))) client.allowInsecureRequests(configuration);
  configuration.timeout = timeoutSeconds;
  if (fetchImpl) configuration[client.customFetch] = (url, init) => fetchImpl(url, init as RequestInit);
  // Verifies ID token signatures against jwks_uri (openid-client skips it by default for
  // token endpoint responses received over TLS).
  client.enableNonRepudiationChecks(configuration);
  const doFetch = fetchImpl ?? fetch;

  function tokens(result: client.TokenEndpointResponse, issuedAt: number): TokenResult {
    if (!result.refresh_token) throw new OidcRejectedError('no refresh_token');
    return {
      accessToken: result.access_token,
      accessExpiresAt: expiresAt(issuedAt, result.expires_in, 60),
      refreshToken: result.refresh_token,
      refreshExpiresAt: expiresAt(issuedAt, (result as { refresh_expires_in?: unknown }).refresh_expires_in, DEFAULT_REFRESH_SECONDS),
    };
  }

  return {
    authorizationUrl({ state, nonce, codeChallenge, locale, register }) {
      const params: Record<string, string> = {
        redirect_uri: callbackUrl(config),
        response_type: 'code',
        scope: 'openid',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
        ui_locales: locale,
      };
      // Keycloak 26 opens its registration page for prompt=create (verified 2026-11-13).
      if (register) params.prompt = 'create';
      return client.buildAuthorizationUrl(configuration, params).toString();
    },

    async exchangeCode(search, { state, nonce, codeVerifier }) {
      const issuedAt = now();
      const current = new URL(callbackUrl(config));
      current.search = search.toString();
      try {
        const result = await client.authorizationCodeGrant(configuration, current, {
          pkceCodeVerifier: codeVerifier,
          expectedState: state,
          expectedNonce: nonce,
          idTokenExpected: true,
        });
        const claims = result.claims();
        if (!claims) throw new OidcRejectedError('no id_token');
        const username = typeof claims.preferred_username === 'string' ? claims.preferred_username : claims.sub;
        const name = typeof claims.name === 'string' ? claims.name.trim() : '';
        return { ...tokens(result, issuedAt), sub: claims.sub, username, displayName: name || username };
      } catch (error) {
        throw classifyOidcError(error);
      }
    },

    async refresh(refreshToken) {
      const issuedAt = now();
      try {
        return tokens(await client.refreshTokenGrant(configuration, refreshToken), issuedAt);
      } catch (error) {
        throw classifyOidcError(error);
      }
    },

    async logout(refreshToken) {
      let response: Response;
      try {
        response = await doFetch(endpoints.endSessionEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken }),
          redirect: 'manual',
          signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
        });
      } catch (error) {
        throw classifyOidcError(error);
      }
      if (response.status >= 500) throw new OidcUnavailableError(`status ${response.status}`);
      if (!response.ok) throw new OidcRejectedError(`status ${response.status}`);
    },
  };
}
