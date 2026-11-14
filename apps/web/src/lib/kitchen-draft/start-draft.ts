import { hasSameOrigin } from '../auth/origin';
import { readCookie, setCookie } from '../auth/session';
import { DRAFT_COOKIE, DRAFT_COOKIE_MAX_AGE, DRAFT_TOKEN_HEADER } from './draft-cookie';

export interface StartDraftOptions {
  baseUrl: () => string;
  /** Adds `Secure` to the cookie (https deployments). */
  secureCookies: () => boolean;
  fetchImpl?: typeof fetch;
  logError?: (message: string) => void;
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extraHeaders } });
}

function className(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

/**
 * BFF route `POST /api/kitchen-projects/drafts`: starts (or resumes) the browser's anonymous
 * kitchen draft. It needs a same-origin Origin (else 403: a cross-site form must not swap the
 * victim's draft cookie). With a `bm_draft` cookie that still resolves to a live draft it
 * returns that draft with 200 and creates nothing (a double tap creates one draft). Otherwise
 * it calls the API, moves `draftToken` into the HttpOnly `bm_draft` cookie and returns 201
 * `{ draft }` without the token.
 */
export function createStartDraftHandler({ baseUrl, secureCookies, fetchImpl = fetch, logError = console.error }: StartDraftOptions) {
  return async function startDraft(request: Request): Promise<Response> {
    if (!hasSameOrigin(request)) return json(403, { status: 'error' });
    const base = baseUrl().replace(/\/+$/, '');
    try {
      const existing = readCookie(request.headers.get('cookie'), DRAFT_COOKIE);
      if (existing) {
        const current = await fetchImpl(`${base}/kitchen-projects/drafts/current`, {
          headers: { accept: 'application/json', [DRAFT_TOKEN_HEADER]: existing },
          redirect: 'manual',
        });
        if (current.status === 200) return json(200, { draft: await current.json() });
        if (current.status !== 404) return json(current.status >= 500 ? current.status : 502, { status: 'error' });
        // 404: the stored draft expired or never existed; start a new one and replace the cookie.
      }
      const created = await fetchImpl(`${base}/kitchen-projects/drafts`, {
        method: 'POST',
        headers: { accept: 'application/json' },
        redirect: 'manual',
      });
      if (created.status !== 201) {
        const body: unknown = await created.json().catch(() => ({ status: 'error' }));
        return json(created.status, body);
      }
      const { draft, draftToken } = (await created.json()) as { draft: unknown; draftToken: unknown };
      if (typeof draftToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(draftToken)) return json(502, { status: 'error' });
      return json(201, { draft }, { 'set-cookie': setCookie(DRAFT_COOKIE, draftToken, DRAFT_COOKIE_MAX_AGE, secureCookies()) });
    } catch (error) {
      logError(`start draft: upstream unreachable (${className(error)})`);
      return json(502, { status: 'error' });
    }
  };
}
