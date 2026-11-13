/** The 11 MVP locales (PRD §3 Internationalization). English is canonical. */
export const LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Device persistence of an explicit language choice (never written by detection). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Native names, shown untranslated in every UI language, in LOCALES order. */
export const LOCALE_NATIVE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  sv: 'Svenska',
  no: 'Norsk',
  da: 'Dansk',
  fi: 'Suomi',
};

/** Browser primary subtags that map to a different supported locale (Norwegian = Bokmål). */
const SUBTAG_ALIASES: Readonly<Record<string, Locale>> = { nb: 'no', nn: 'no' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Maps one language tag (`pt-BR`, `nb-NO`, `de`) to a supported locale, or null. */
export function localeFromTag(tag: string): Locale | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  const mapped = SUBTAG_ALIASES[primary] ?? primary;
  return isLocale(mapped) ? mapped : null;
}

/**
 * Resolution order: a valid cookie, then the highest-q supported language of
 * Accept-Language (ties keep header order; `*` and q=0 count as unsupported), else null
 * (the caller shows Language Selection).
 */
export function resolveLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale | null {
  if (isLocale(cookie)) return cookie;
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.split(';').map((s) => s.trim());
      const qParam = params.find((p) => /^q=/i.test(p));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0, index };
    })
    .filter(({ tag, q }) => tag !== '' && tag !== '*' && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    const locale = localeFromTag(tag);
    if (locale) return locale;
  }
  return null;
}
