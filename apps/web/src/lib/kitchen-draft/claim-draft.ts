import { hasSameOrigin } from '../auth/origin';
import { type AccessResult, clearCookie, readCookie, SESSION_COOKIE } from '../auth/session';
import { DRAFT_COOKIE, DRAFT_TOKEN_HEADER } from './draft-cookie';

export interface ClaimDraftOptions {
  baseUrl: () => string;
  /** Adds `Secure` to the cleared cookies (https deployments). */
  secureCookies: () => boolean;
  /** The session's access token (refreshed when needed); see `SessionService.getValidAccessToken`. */
  resolveAccessToken: (cookieHeader: string | null) => Promise<AccessResult>;
  fetchImpl?: typeof fetch;
  logError?: (message: string) => void;
}

function json(status: number, body: unknown, setCookies: string[] = []): Response {
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return Response.json(body, { status, headers });
}

function className(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

/**
 * BFF route `POST /api/kitchen-projects/drafts/current/claim` (feature login-gate-claim): binds
 * the browser's anonymous draft to the signed-in Account at the Login Gate.
 * - A same-origin Origin is required (else 403): a cross-site form must not claim the draft.
 * - No valid session gives 401 without any upstream call; the session store or Keycloak being
 *   unreachable gives 503. No `bm_draft` cookie gives 404.
 * - Upstream gets `Authorization` from the session and `X-Draft-Token` from the cookie.
 * - On 200 (claimed) and on 404 (expired or not this Account's) the `bm_draft` cookie is cleared:
 *   the token no longer opens anything. Other statuses keep it, so the draft is never lost.
 * - Upstream unreachable: 502. The body is `{ project }` on success; tokens never reach it.
 */
export function createClaimDraftHandler({ baseUrl, secureCookies, resolveAccessToken, fetchImpl = fetch, logError = console.error }: ClaimDraftOptions) {
  return async function claimDraft(request: Request): Promise<Response> {
    if (!hasSameOrigin(request)) return json(403, { status: 'error' });
    const cookieHeader = request.headers.get('cookie');
    const access = await resolveAccessToken(cookieHeader);
    if (access.kind === 'unavailable') return json(503, { status: 'error' });
    if (access.kind === 'anonymous') {
      return json(401, { status: 'error' }, access.clearCookie ? [clearCookie(SESSION_COOKIE, secureCookies())] : []);
    }
    const draftToken = readCookie(cookieHeader, DRAFT_COOKIE);
    if (!draftToken) return json(404, { status: 'error' });

    let upstream: Response;
    try {
      upstream = await fetchImpl(`${baseUrl().replace(/\/+$/, '')}/kitchen-projects/drafts/current/claim`, {
        method: 'POST',
        headers: { accept: 'application/json', authorization: `Bearer ${access.token}`, [DRAFT_TOKEN_HEADER]: draftToken },
        redirect: 'manual',
      });
    } catch (error) {
      logError(`claim draft: upstream unreachable (${className(error)})`);
      return json(502, { status: 'error' });
    }
    const clearDraft = clearCookie(DRAFT_COOKIE, secureCookies());
    if (upstream.status === 200) {
      const body = (await upstream.json().catch(() => null)) as { project?: unknown } | null;
      if (!body || typeof body.project !== 'object' || body.project === null) return json(502, { status: 'error' });
      return json(200, { project: body.project }, [clearDraft]);
    }
    if (upstream.status === 404) return json(404, { status: 'error' }, [clearDraft]);
    if (upstream.status === 401 || upstream.status === 403 || upstream.status === 503) return json(upstream.status, { status: 'error' });
    return json(502, { status: 'error' });
  };
}
