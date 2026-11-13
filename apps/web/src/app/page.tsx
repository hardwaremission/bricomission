import Link from 'next/link';
import { ArrowRight, Camera, ReceiptText, Sparkles, type LucideIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { AccountEntry } from '../components/AccountEntry';
import { ApiStatus } from '../components/ApiStatus';
import { LanguageSelector } from '../components/LanguageSelector';
import { Wordmark } from '../components/Wordmark';
import { isLocale, DEFAULT_LOCALE } from '../i18n/locales';

// Locale comes from the cookie / Accept-Language on every request (src/proxy.ts).
export const dynamic = 'force-dynamic';

const STEPS: ReadonlyArray<{ key: 'capture' | 'design' | 'budget'; Icon: LucideIcon }> = [
  { key: 'capture', Icon: Camera },
  { key: 'design', Icon: Sparkles },
  { key: 'budget', Icon: ReceiptText },
];

/**
 * Home (design: docs/design/web-pwa-shell.md, frame "Home" 390x844; header actions from
 * docs/design/homeowner-password-login.md). The HTML is the same for anonymous and
 * signed-in visitors: AccountEntry hydrates the signed-in state on the client.
 */
export default async function HomePage() {
  const t = await getTranslations('home');
  const locale = await getLocale();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center justify-between px-md">
        <Wordmark />
        <div className="flex items-center gap-sm">
          <LanguageSelector current={isLocale(locale) ? locale : DEFAULT_LOCALE} />
          <AccountEntry />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-md pb-lg">
        <section className="flex flex-col gap-3">
          <h1 className="text-display font-bold text-text">{t('headline')}</h1>
          <p className="text-body text-text-muted">{t('valueProposition')}</p>
        </section>

        <ol className="flex flex-col gap-3">
          {STEPS.map(({ key, Icon }) => (
            <li key={key} className="flex items-center gap-md rounded-lg bg-surface p-md shadow-card">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-secondary" aria-hidden="true">
                <Icon size={22} className="text-primary" />
              </span>
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <h2 className="text-body font-semibold text-text">{t(`steps.${key}.title`)}</h2>
                <p className="text-small leading-5 text-text-muted">{t(`steps.${key}.description`)}</p>
              </div>
            </li>
          ))}
        </ol>

        <Link
          href="/professionals/register"
          prefetch={false}
          data-testid="professional-link"
          className="flex min-h-11 w-full items-center justify-center text-center text-small leading-5 font-medium text-primary underline"
        >
          {t('professionalLink')}
        </Link>
      </main>

      <footer className="flex shrink-0 flex-col gap-3 bg-surface px-md pt-3 pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] shadow-sheet">
        <ApiStatus />
        <Link
          href="/kitchen-projects/new"
          prefetch={false}
          data-testid="home-cta-start"
          className="flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill bg-primary px-md py-[14px] text-center text-body font-semibold text-white hover:bg-primary-hover"
        >
          <span>{t('cta')}</span>
          <ArrowRight size={20} aria-hidden="true" className="shrink-0" />
        </Link>
      </footer>
    </div>
  );
}
