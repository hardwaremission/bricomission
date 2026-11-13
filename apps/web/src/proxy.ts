import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_HEADER } from './i18n/locale-header';
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from './i18n/locales';

/**
 * Locale resolution for page requests (Next.js 16 proxy, formerly middleware).
 * - `/language` always renders English.
 * - `/` with no valid cookie and no supported browser language redirects (307) to `/language`.
 * - Otherwise the resolved locale (fallback `en`) is forwarded to the app in LOCALE_HEADER,
 *   overwriting any client-sent value. Detection never writes the cookie.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const resolved = resolveLocale(request.cookies.get(LOCALE_COOKIE)?.value, request.headers.get('accept-language'));
  if (pathname === '/' && resolved === null) {
    const url = request.nextUrl.clone();
    url.pathname = '/language';
    url.search = '';
    return NextResponse.redirect(url, 307);
  }
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, pathname === '/language' ? DEFAULT_LOCALE : (resolved ?? DEFAULT_LOCALE));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only: not the API proxy, the cookie setter, Next assets or public files.
  matcher: ['/((?!api/|locale$|_next/|icons/|sw\\.js$|manifest\\.webmanifest$|favicon\\.ico$).*)'],
};
