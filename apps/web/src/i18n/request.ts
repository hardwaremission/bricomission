import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, resolveLocale } from './locales';
import { LOCALE_HEADER } from './locale-header';

// next-intl "without i18n routing": no locale in the URL. src/proxy.ts resolves the locale
// per request and forwards it in LOCALE_HEADER (always `en` on /language).
export default getRequestConfig(async () => {
  const forwarded = (await headers()).get(LOCALE_HEADER);
  const locale = isLocale(forwarded)
    ? forwarded
    : (resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get('accept-language')) ?? DEFAULT_LOCALE);
  const messages = (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>;
  return { locale, messages };
});
