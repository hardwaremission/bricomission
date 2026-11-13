import type { Locale } from '../i18n/locales';

/** Calls the cookie setter (POST /locale) without following its redirect to Home. */
export async function postLocale(locale: Locale): Promise<boolean> {
  const body = new URLSearchParams({ locale });
  const response = await fetch('/locale', { method: 'POST', body, redirect: 'manual', credentials: 'same-origin' });
  // 303 to "/" shows up as an opaque redirect when not followed.
  return response.type === 'opaqueredirect' || response.ok;
}
