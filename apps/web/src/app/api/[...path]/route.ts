import { createApiProxy } from '../../../lib/api-proxy';
import { readAuthConfig } from '../../../lib/auth/config';
import { authRuntime } from '../../../lib/auth/runtime';
import { clearCookie, SESSION_COOKIE } from '../../../lib/auth/session';

// Runtime env (not next.config rewrites, which standalone output bakes in at build time).
export const dynamic = 'force-dynamic';

const proxy = createApiProxy({
  baseUrl: () => process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3000',
  // The session's access token (refreshed when needed); the database is touched only when
  // the request carries a bm_session cookie.
  resolveAccessToken: (cookieHeader) => authRuntime().sessions.getValidAccessToken(cookieHeader),
  clearSessionCookie: () => clearCookie(SESSION_COOKIE, readAuthConfig().webPublicUrl.startsWith('https:')),
});

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
