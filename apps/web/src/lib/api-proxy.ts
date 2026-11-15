import type { AccessResult } from './auth/session';
import { readCookie } from './auth/session';
import { hasSameOrigin, UNSAFE_METHODS } from './auth/origin';
import { DRAFT_COOKIE, DRAFT_TOKEN_HEADER } from './kitchen-draft/draft-cookie';
import { CORRELATION_HEADER, resolveCorrelationId } from './diagnostics/correlation';
import { type DiagnosticsEmitter, isPollRoute, NULL_EMITTER, routeTemplate } from './diagnostics/emitter';

/**
 * Same-origin proxy from the browser's /api/* to the API (API_INTERNAL_URL). Not an open
 * proxy: the target is always the fixed base plus re-encoded path segments plus the
 * original query; only an allowlist of request headers is forwarded (never cookies).
 * Authorization never comes from the browser: a client `Authorization` header is dropped and
 * the server session's access token (homeowner-password-login) is attached instead.
 * The anonymous kitchen draft cookie `bm_draft` (kitchen-capture-draft) becomes the upstream
 * `X-Draft-Token`; a client-sent `x-draft-token` is never forwarded (not in the allowlist).
 * With a session or draft cookie, unsafe methods need a same-origin Origin header (CSRF).
 * Diagnostics (diagnostics-dashboard, only with an enabled emitter): the BFF mints or keeps (when valid) the
 * `X-Correlation-Id` of the request, forwards it upstream and reports metadata-only events
 * (route template, status, ms, booleans); never a cookie, token, header value or body.
 */
export const FORWARDED_REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'last-event-id'] as const;
export const RETURNED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'www-authenticate'] as const;

const PREFIX = '/api/';
const SESSION_COOKIE_NAME = 'bm_session';

export interface ProxyOptions {
  baseUrl: () => string;
  /** Session lookup (with refresh) for the request's Cookie header. Default: anonymous. */
  resolveAccessToken?: (cookieHeader: string | null) => Promise<AccessResult>;
  /** Set-Cookie value that clears the session cookie (after invalid_grant or a stale cookie). */
  clearSessionCookie?: () => string;
  fetchImpl?: typeof fetch;
  logError?: (message: string) => void;
  /** Diagnostics emitter; default: off (no events, no correlation header). */
  diagnostics?: DiagnosticsEmitter;
}

function jsonError(status: number): Response {
  return Response.json({ status: 'error' }, { status, headers: { 'cache-control': 'no-store' } });
}

/** Re-encodes the path after /api/. Null for `.`/`..`, separators or bad encoding. */
export function upstreamPath(rawPathname: string): string | null {
  if (!rawPathname.startsWith(PREFIX)) return null;
  const segments = rawPathname.slice(PREFIX.length).split('/');
  const encoded: string[] = [];
  for (const raw of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) return null;
    encoded.push(encodeURIComponent(decoded));
  }
  if (encoded.length === 0 || encoded[0] === '') return null;
  return `/${encoded.join('/')}`;
}

export function createApiProxy({
  baseUrl,
  resolveAccessToken = async () => ({ kind: 'anonymous', clearCookie: false }),
  clearSessionCookie = () => `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  fetchImpl = fetch,
  logError = console.error,
  diagnostics = NULL_EMITTER,
}: ProxyOptions) {
  /** Per-request diagnostics context; undefined when diagnostics are off. */
  interface Trace {
    correlationId: string;
    route: string;
    poll: boolean;
  }

  async function handle(request: Request, trace: Trace | undefined): Promise<Response> {
    const url = new URL(request.url);
    const path = upstreamPath(url.pathname);
    if (path === null) return jsonError(400);
    const cookieHeader = request.headers.get('cookie');
    const draftToken = readCookie(cookieHeader, DRAFT_COOKIE);
    // CSRF: checked before any session lookup or upstream call.
    const hasCredentialCookie = readCookie(cookieHeader, SESSION_COOKIE_NAME) !== null || draftToken !== null;
    if (UNSAFE_METHODS.has(request.method) && hasCredentialCookie && !hasSameOrigin(request)) return jsonError(403);
    const target = `${baseUrl().replace(/\/+$/, '')}${path}${url.search}`;

    const lookupStartedAt = Date.now();
    const access = await resolveAccessToken(cookieHeader);
    if (trace && readCookie(cookieHeader, SESSION_COOKIE_NAME) !== null) {
      diagnostics.emit({
        correlationId: trace.correlationId,
        from: 'web',
        to: 'postgres',
        kind: 'session',
        summary: `web_session lookup: ${access.kind}`,
        payload: { table: 'web_session', result: access.kind, ms: Date.now() - lookupStartedAt },
        durationMs: Date.now() - lookupStartedAt,
        ok: access.kind !== 'unavailable',
        poll: trace.poll || undefined,
      });
    }
    if (access.kind === 'unavailable') return jsonError(503);

    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    if (access.kind === 'token') headers.set('authorization', `Bearer ${access.token}`);
    if (draftToken !== null) headers.set(DRAFT_TOKEN_HEADER, draftToken);
    if (trace) headers.set(CORRELATION_HEADER, trace.correlationId);
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;

    const endUpstream = trace
      ? diagnostics.span({
          correlationId: trace.correlationId,
          from: 'web',
          to: 'api-guards',
          kind: 'http',
          summary: `${request.method} ${trace.route}`,
          payload: { method: request.method, route: trace.route, hasSession: access.kind === 'token', hasDraftToken: draftToken !== null },
          poll: trace.poll || undefined,
        })
      : undefined;
    let upstream: Response;
    try {
      upstream = await fetchImpl(target, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
        signal: request.signal,
        ...(hasBody ? { duplex: 'half' } : {}),
      } as RequestInit);
    } catch (error) {
      logError(`api proxy: upstream unreachable (${error instanceof Error ? error.constructor.name : typeof error})`);
      endUpstream?.({ summary: `${request.method} ${trace?.route} failed (upstream unreachable)`, payload: { method: request.method, route: trace?.route, status: 502, hasSession: access.kind === 'token', hasDraftToken: draftToken !== null }, ok: false });
      return jsonError(502);
    }
    endUpstream?.({ summary: `${request.method} ${trace?.route} -> ${upstream.status}`, payload: { method: request.method, route: trace?.route, status: upstream.status, hasSession: access.kind === 'token', hasDraftToken: draftToken !== null }, ok: upstream.status < 400 });

    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    for (const name of RETURNED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    if (access.kind === 'anonymous' && access.clearCookie) responseHeaders.append('set-cookie', clearSessionCookie());
    const noBody = request.method === 'HEAD' || upstream.status === 204 || upstream.status === 304;
    return new Response(noBody ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  }

  return async function proxyRequest(request: Request): Promise<Response> {
    if (!diagnostics.enabled) return handle(request, undefined);
    const url = new URL(request.url);
    const route = routeTemplate(url.pathname);
    const trace: Trace = { correlationId: resolveCorrelationId(request.headers.get(CORRELATION_HEADER)), route, poll: isPollRoute(request.method, route) };
    const locale = request.headers.get('accept-language')?.split(',')[0]?.trim().slice(0, 12) ?? null;
    const end = diagnostics.span({
      correlationId: trace.correlationId,
      from: 'browser',
      to: 'web',
      kind: 'http',
      summary: `${request.method} ${route}`,
      payload: { method: request.method, route, locale },
      poll: trace.poll || undefined,
    });
    let response: Response | undefined;
    try {
      response = await handle(request, trace);
      return response;
    } finally {
      const status = response?.status ?? 500;
      const bytes = Number(response?.headers.get('content-length') ?? '') || null;
      end({ summary: `${request.method} ${route} -> ${status}`, payload: { method: request.method, route, status, bytes, locale }, ok: status < 400 });
    }
  };
}
