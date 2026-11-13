import { createHash, randomBytes } from 'node:crypto';
import { LOCALE_COOKIE, resolveLocale, DEFAULT_LOCALE } from '../../i18n/locales';
import type { AuthConfig } from './config';
import type { SessionRepository } from './db/session-repository';
import { OidcUnavailableError, type OidcClient } from './oidc';
import { hasSameOrigin } from './origin';
import { safeReturnTo } from './return-to';
import {
  clearCookie,
  hashId,
  newOpaqueId,
  readCookie,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE,
  setCookie,
  TX_COOKIE,
  TX_TTL_SECONDS,
  type SessionService,
} from './session';

/**
 * Handlers of the /auth/* routes (thin route files in src/app/auth/ delegate here).
 * Failures never create a session; browser-facing failures redirect (303) to the designed
 * /auth/error page with one of the reason codes below.
 */
export type AuthErrorReason = 'cancelled' | 'expired' | 'unavailable' | 'failed';

export interface AuthHandlerDeps {
  /** Throws AuthConfigError when secrets are missing. */
  config: () => AuthConfig;
  repo: () => SessionRepository;
  oidc: () => OidcClient;
  sessions: SessionService;
  now?: () => number;
  logError?: (message: string) => void;
}

const NO_STORE = { 'cache-control': 'no-store' };

function className(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

function redirect(location: string, cookies: string[] = [], status = 303): Response {
  const headers = new Headers({ location, ...NO_STORE });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

export function errorLocation(reason: AuthErrorReason, returnTo = '/'): string {
  const params = new URLSearchParams({ reason });
  if (returnTo !== '/') params.set('returnTo', returnTo);
  return `/auth/error?${params.toString()}`;
}

function jsonError(status: number, cookies: string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json', ...NO_STORE });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify({ status: 'error' }), { status, headers });
}

function isSecure(config: AuthConfig | null): boolean {
  return config?.webPublicUrl.startsWith('https:') ?? false;
}

export function createAuthHandlers({ config, repo, oidc, sessions, now = Date.now, logError = console.error }: AuthHandlerDeps) {
  function tryConfig(): AuthConfig | null {
    try {
      return config();
    } catch (error) {
      logError(`web auth: configuration unavailable (${className(error)})`);
      return null;
    }
  }

  /** GET /auth/login?returnTo=<path>[&mode=register] */
  async function login(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
    const cfg = tryConfig();
    if (!cfg) return redirect(errorLocation('unavailable', returnTo));
    // Cookies are host-scoped: the session must be created on the canonical host.
    const canonical = new URL(cfg.webPublicUrl);
    if (request.headers.get('host') !== canonical.host) {
      return redirect(`${canonical.origin}${url.pathname}${url.search}`, [], 307);
    }
    const cookieHeader = request.headers.get('cookie');
    const locale = resolveLocale(readCookie(cookieHeader, LOCALE_COOKIE), request.headers.get('accept-language')) ?? DEFAULT_LOCALE;
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const txId = newOpaqueId();
    let location: string;
    try {
      await repo().insertTransaction(hashId(txId), {
        state,
        nonce,
        codeVerifier,
        returnTo,
        locale,
        expiresAt: new Date(now() + TX_TTL_SECONDS * 1000),
      });
      location = oidc().authorizationUrl({ state, nonce, codeChallenge, locale, register: url.searchParams.get('mode') === 'register' });
    } catch (error) {
      logError(`web auth: login could not start (${className(error)})`);
      return redirect(errorLocation('unavailable', returnTo));
    }
    return redirect(location, [setCookie(TX_COOKIE, txId, TX_TTL_SECONDS, isSecure(cfg))]);
  }

  /** GET /auth/callback?code&state&iss (or error=...) */
  async function callback(request: Request): Promise<Response> {
    const cfg = tryConfig();
    const secure = isSecure(cfg);
    const clearTx = clearCookie(TX_COOKIE, secure);
    const fail = (reason: AuthErrorReason, returnTo = '/') => redirect(errorLocation(reason, returnTo), [clearTx]);
    if (!cfg) return fail('unavailable');
    const params = new URL(request.url).searchParams;
    const cookieHeader = request.headers.get('cookie');
    const txValue = readCookie(cookieHeader, TX_COOKIE);
    if (!txValue) return fail('expired');

    let tx;
    try {
      tx = await repo().takeTransaction(hashId(txValue));
    } catch (error) {
      logError(`web auth: transaction lookup failed (${className(error)})`);
      return fail('unavailable');
    }
    if (!tx) return fail('expired');
    const { returnTo } = tx;
    if (params.get('state') !== tx.state) return fail('failed', returnTo);
    const oauthError = params.get('error');
    if (oauthError) return fail(oauthError === 'access_denied' ? 'cancelled' : 'failed', returnTo);
    if (!params.get('code')) return fail('failed', returnTo);

    let result;
    try {
      result = await oidc().exchangeCode(params, { state: tx.state, nonce: tx.nonce, codeVerifier: tx.codeVerifier });
    } catch (error) {
      logError(`web auth: code exchange failed (${className(error)})`);
      return fail(error instanceof OidcUnavailableError ? 'unavailable' : 'failed', returnTo);
    }

    const sessionId = newOpaqueId();
    try {
      // A previous session of this browser is replaced, never reused (no session fixation).
      const previous = readCookie(cookieHeader, SESSION_COOKIE);
      if (previous) await repo().deleteSession(hashId(previous));
      await repo().insertSession(hashId(sessionId), result);
    } catch (error) {
      logError(`web auth: session could not be stored (${className(error)})`);
      return fail('unavailable', returnTo);
    }
    return redirect(returnTo, [clearTx, setCookie(SESSION_COOKIE, sessionId, SESSION_COOKIE_MAX_AGE, secure)]);
  }

  /** POST /auth/logout (form). Ends the Keycloak session, deletes the row, clears the cookie. */
  async function logout(request: Request): Promise<Response> {
    if (!hasSameOrigin(request)) return jsonError(403);
    const cfg = tryConfig();
    const clear = clearCookie(SESSION_COOKIE, isSecure(cfg));
    const value = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
    if (value && cfg) {
      const idHash = hashId(value);
      try {
        const session = await repo().findSession(idHash);
        if (session) {
          try {
            await oidc().logout(session.refreshToken);
          } catch (error) {
            // The local session is removed anyway.
            logError(`web auth: Keycloak logout failed (${className(error)})`);
          }
        }
        await repo().deleteSession(idHash);
      } catch (error) {
        logError(`web auth: session removal failed (${className(error)})`);
      }
    }
    return redirect('/', [clear]);
  }

  /** GET /auth/session: signed-in state for the UI. Never returns tokens. */
  async function session(request: Request): Promise<Response> {
    const cookieHeader = request.headers.get('cookie');
    if (!readCookie(cookieHeader, SESSION_COOKIE)) return Response.json({ signedIn: false }, { headers: NO_STORE });
    const cfg = tryConfig();
    if (!cfg) return jsonError(503);
    try {
      const lookup = await sessions.getSession(cookieHeader);
      if (lookup.kind === 'none') {
        const headers = new Headers(NO_STORE);
        headers.append('set-cookie', clearCookie(SESSION_COOKIE, isSecure(cfg)));
        return Response.json({ signedIn: false }, { headers });
      }
      return Response.json(
        { signedIn: true, user: { username: lookup.session.username, displayName: lookup.session.displayName } },
        { headers: NO_STORE },
      );
    } catch (error) {
      logError(`web auth: session lookup failed (${className(error)})`);
      return jsonError(503);
    }
  }

  return { login, callback, logout, session };
}

export type AuthHandlers = ReturnType<typeof createAuthHandlers>;
