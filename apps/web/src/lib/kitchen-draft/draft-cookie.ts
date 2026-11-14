/**
 * Anonymous kitchen draft cookie (feature kitchen-capture-draft). It holds the API's opaque
 * draft token; HttpOnly, so page scripts never see it. The API row's expiry is what counts:
 * Max-Age only bounds how long the browser keeps sending it.
 */
export const DRAFT_COOKIE = 'bm_draft';
export const DRAFT_COOKIE_MAX_AGE = 2_592_000;
/** Upstream header the /api proxy sets from the cookie (a client-sent one is never forwarded). */
export const DRAFT_TOKEN_HEADER = 'x-draft-token';
