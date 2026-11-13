import { createHash, randomBytes } from 'node:crypto';
import type { SessionRepository, StoredSession } from './db/session-repository';
import { OidcInvalidGrantError, type OidcClient } from './oidc';

/**
 * Web sessions (BFF). The browser holds only an opaque random id in the HttpOnly cookie
 * `bm_session`; the database row is keyed by its SHA-256. Tokens never reach the browser.
 */
export const SESSION_COOKIE = 'bm_session';
export const TX_COOKIE = 'bm_auth_tx';
/** Login transaction lifetime (cookie Max-Age and row expiry). */
export const TX_TTL_SECONDS = 600;
/** Cookie lifetime: Keycloak's SSO session max (10 h). The row expiry is what counts. */
export const SESSION_COOKIE_MAX_AGE = 36_000;
/** Refresh the access token when it expires within this margin. */
export const REFRESH_MARGIN_MS = 30_000;

export function newOpaqueId(): string {
  return randomBytes(32).toString('base64url');
}

export function hashId(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Value of one cookie from a Cookie header, or null. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      return value === '' ? null : value;
    }
  }
  return null;
}

export function setCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearCookie(name: string, secure: boolean): string {
  return setCookie(name, '', 0, secure);
}

export type SessionLookup = { kind: 'none'; staleCookie: boolean } | { kind: 'active'; idHash: Buffer; session: StoredSession };

/** How the API proxy should call upstream for this request. */
export type AccessResult =
  | { kind: 'anonymous'; clearCookie: boolean }
  | { kind: 'token'; token: string }
  /** Keycloak or the database is unreachable while a session cookie is present: 503. */
  | { kind: 'unavailable' };

export interface SessionServiceDeps {
  /** Lazy accessors: they may throw (missing config, bad key), which counts as unavailable. */
  repo: () => SessionRepository;
  oidc: () => OidcClient;
  now?: () => number;
  logError?: (message: string) => void;
}

function className(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

export function createSessionService({ repo, oidc, now = Date.now, logError = console.error }: SessionServiceDeps) {
  // Single-flight refresh per session in this process: concurrent requests share one call.
  const inflight = new Map<string, Promise<AccessResult>>();

  /** Throws when the database (or config) is unavailable. Never touches it without a cookie. */
  async function getSession(cookieHeader: string | null): Promise<SessionLookup> {
    const value = readCookie(cookieHeader, SESSION_COOKIE);
    if (!value) return { kind: 'none', staleCookie: false };
    const idHash = hashId(value);
    const session = await repo().findSession(idHash);
    return session ? { kind: 'active', idHash, session } : { kind: 'none', staleCookie: true };
  }

  async function refresh(idHash: Buffer, session: StoredSession): Promise<AccessResult> {
    let tokens;
    try {
      tokens = await oidc().refresh(session.refreshToken);
    } catch (error) {
      if (error instanceof OidcInvalidGrantError) {
        try {
          await repo().deleteSession(idHash);
        } catch (dbError) {
          logError(`web session: delete after invalid_grant failed (${className(dbError)})`);
          return { kind: 'unavailable' };
        }
        return { kind: 'anonymous', clearCookie: true };
      }
      logError(`web session: token refresh failed (${className(error)})`);
      return { kind: 'unavailable' };
    }
    try {
      await repo().updateTokens(idHash, tokens);
    } catch (error) {
      logError(`web session: storing refreshed tokens failed (${className(error)})`);
      return { kind: 'unavailable' };
    }
    return { kind: 'token', token: tokens.accessToken };
  }

  async function getValidAccessToken(cookieHeader: string | null): Promise<AccessResult> {
    let lookup: SessionLookup;
    try {
      lookup = await getSession(cookieHeader);
    } catch (error) {
      logError(`web session: lookup failed (${className(error)})`);
      return { kind: 'unavailable' };
    }
    if (lookup.kind === 'none') return { kind: 'anonymous', clearCookie: lookup.staleCookie };
    const { idHash, session } = lookup;
    if (session.accessExpiresAt.getTime() - now() > REFRESH_MARGIN_MS) return { kind: 'token', token: session.accessToken };
    const key = idHash.toString('hex');
    let pending = inflight.get(key);
    if (!pending) {
      pending = refresh(idHash, session).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return pending;
  }

  return { getSession, getValidAccessToken };
}

export type SessionService = ReturnType<typeof createSessionService>;
