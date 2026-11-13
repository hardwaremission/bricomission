import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '../i18n/locales';

/**
 * POST /locale: the only writer of the NEXT_LOCALE cookie (explicit choice from Language
 * Selection or the selector). Body: form field `locale`. 303 to "/" on success; 400 for a
 * value outside LOCALES; 403 for a cross-origin post.
 */
export async function handleSetLocale(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers.get('origin'), request.headers.get('host'))) {
    return Response.json({ status: 'error' }, { status: 403 });
  }
  const value: unknown = await request
    .formData()
    .then((form) => form.get('locale'))
    .catch(() => null);
  if (!isLocale(value)) {
    return Response.json({ status: 'error' }, { status: 400 });
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: '/',
      'cache-control': 'no-store',
      'set-cookie': `${LOCALE_COOKIE}=${value}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`,
    },
  });
}

/** A missing Origin (non-browser client) passes; a present one must match Host. */
function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return true;
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}
