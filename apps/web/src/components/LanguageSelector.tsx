'use client';

import { useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Globe, X } from 'lucide-react';
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from '../i18n/locales';
import { postLocale } from '../lib/set-locale';

/**
 * Compact language selector (design: "LanguageSelector (closed)" pill + "open (bottom sheet)").
 * A native modal <dialog> gives focus containment, Escape to close and an inert background.
 */
export function LanguageSelector({ current }: { current: Locale }) {
  const t = useTranslations('language');
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();

  const close = () => dialogRef.current?.close();
  const choose = (locale: Locale) => {
    if (locale === current) {
      close();
      return;
    }
    startTransition(async () => {
      // On failure the sheet stays open with the current language still marked.
      const ok = await postLocale(locale).catch(() => false);
      if (ok) {
        close();
        router.refresh();
      }
    });
  };

  return (
    <>
      <button
        type="button"
        data-testid="locale-selector"
        aria-haspopup="dialog"
        aria-label={t('selectorLabel', { language: LOCALE_NATIVE_NAMES[current] })}
        onClick={() => dialogRef.current?.showModal()}
        className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-pill bg-surface-muted px-3.5 text-text max-[375px]:gap-1 max-[375px]:px-2.5"
      >
        {/* Below 375 px (developer rule, homeowner-password-login design): compact pill that
            keeps the full native name at 12/16, never a language code. */}
        <Globe size={18} aria-hidden="true" className="shrink-0 max-[375px]:size-4" />
        <span data-testid="locale-selector-label" className="text-small leading-5 font-semibold whitespace-nowrap max-[375px]:text-[12px] max-[375px]:leading-4">
          {LOCALE_NATIVE_NAMES[current]}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 max-[375px]:size-3.5" />
      </button>

      <dialog
        ref={dialogRef}
        data-testid="locale-sheet"
        aria-labelledby="locale-sheet-title"
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes the sheet.
          if (event.target === event.currentTarget) close();
        }}
        className="m-0 mt-auto max-h-dvh w-full max-w-none overflow-y-auto rounded-t-lg bg-surface p-0 text-text shadow-sheet backdrop:bg-[#18223166]"
      >
        <div className="flex flex-col gap-xs px-md pt-sm pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))]">
          <div className="flex h-[52px] items-center justify-between">
            <h2 id="locale-sheet-title" className="text-[18px] leading-6 font-semibold">
              {t('sheetTitle')}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t('close')}
              className="flex size-11 items-center justify-center rounded-pill bg-surface-muted text-text"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <ul className="flex flex-col gap-xs" aria-busy={pending}>
            {LOCALES.map((locale) => {
              const selected = locale === current;
              return (
                <li key={locale}>
                  <button
                    type="button"
                    lang={locale}
                    data-testid={`locale-option-${locale}`}
                    aria-current={selected ? 'true' : undefined}
                    disabled={pending}
                    onClick={() => choose(locale)}
                    className={`flex h-12 w-full items-center justify-between rounded-md px-3 text-left text-body focus-visible:outline-offset-0 ${
                      selected ? 'bg-surface-muted font-semibold' : 'font-normal'
                    }`}
                  >
                    <span>{LOCALE_NATIVE_NAMES[locale]}</span>
                    {selected ? <Check size={20} aria-hidden="true" className="text-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </>
  );
}
