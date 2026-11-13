import { ChevronDown, Globe } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Wordmark } from '../../components/Wordmark';
import { DEFAULT_LOCALE, LOCALES, LOCALE_NATIVE_NAMES } from '../../i18n/locales';

export const dynamic = 'force-dynamic';

/**
 * Language Selection (design frame "Language Selection"): shown when no supported
 * language can be detected. Always English (src/proxy.ts forces `en` on this route).
 * A plain form post to /locale works without JavaScript.
 */
export default async function LanguagePage() {
  const t = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'language' });
  return (
    <form method="post" action="/locale" className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center px-md">
        <Wordmark />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-xl pb-lg">
        <section className="flex flex-col gap-3">
          <span className="flex size-14 items-center justify-center rounded-pill bg-secondary" aria-hidden="true">
            <Globe size={26} className="text-primary" />
          </span>
          <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
          <p className="text-body text-text-muted">{t('helper')}</p>
        </section>

        <div className="flex flex-col gap-sm">
          <label htmlFor="language-select" className="text-small leading-5 font-semibold text-text">
            {t('fieldLabel')}
          </label>
          <div className="relative">
            <select
              id="language-select"
              name="locale"
              data-testid="language-select"
              defaultValue={DEFAULT_LOCALE}
              className="h-[52px] w-full appearance-none rounded-md border border-border bg-surface-muted pr-11 pl-md text-body text-text"
            >
              {LOCALES.map((locale) => (
                <option key={locale} value={locale} lang={locale}>
                  {LOCALE_NATIVE_NAMES[locale]}
                </option>
              ))}
            </select>
            <ChevronDown
              size={20}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-md -translate-y-1/2 text-text"
            />
          </div>
        </div>
      </main>

      <footer className="flex shrink-0 flex-col bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        <button
          type="submit"
          data-testid="language-continue"
          className="flex min-h-[52px] w-full items-center justify-center rounded-pill bg-primary px-md py-[14px] text-body font-semibold text-white hover:bg-primary-hover"
        >
          {t('continue')}
        </button>
      </footer>
    </form>
  );
}
