/**
 * Same-origin proxy from the browser's /api/* to the API (API_INTERNAL_URL). Not an open
 * proxy: the target is always the fixed base plus re-encoded path segments plus the
 * original query; only an allowlist of request headers is forwarded (never cookies).
 */
export const FORWARDED_REQUEST_HEADERS = ['accept', 'accept-language', 'authorization', 'content-type', 'last-event-id'] as const;
export const RETURNED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'www-authenticate'] as const;

const PREFIX = '/api/';

export interface ProxyOptions {
  baseUrl: () => string;
  fetchImpl?: typeof fetch;
  logError?: (message: string) => void;
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

export function createApiProxy({ baseUrl, fetchImpl = fetch, logError = console.error }: ProxyOptions) {
  return async function proxyRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = upstreamPath(url.pathname);
    if (path === null) return jsonError(400);
    const target = `${baseUrl().replace(/\/+$/, '')}${path}${url.search}`;

    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;

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
      return jsonError(502);
    }

    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    for (const name of RETURNED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    const noBody = request.method === 'HEAD' || upstream.status === 204 || upstream.status === 304;
    return new Response(noBody ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}
