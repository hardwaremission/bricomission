import { ArrowLeft, CircleAlert, RotateCcw } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { LanguageSelector } from '../../../components/LanguageSelector';
import { Wordmark } from '../../../components/Wordmark';
import { DEFAULT_LOCALE, isLocale } from '../../../i18n/locales';
import { safeReturnTo } from '../../../lib/auth/return-to';

export const dynamic = 'force-dynamic';

const REASONS = ['cancelled', 'expired', 'unavailable'] as const;
type Reason = (typeof REASONS)[number] | 'generic';

function reasonOf(value: unknown): Reason {
  return (REASONS as readonly unknown[]).includes(value) ? (value as Reason) : 'generic';
}

/**
 * Sign-in problem page (design: docs/design/homeowner-password-login.md, "/auth/error").
 * `?reason=cancelled|expired|unavailable`; `failed` and unknown values show the generic
 * helper. "Try again" restarts sign-in with the original (re-validated) returnTo.
 */
export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const t = await getTranslations('auth.error');
  const locale = await getLocale();
  const reason = reasonOf(params.reason);
  const returnTo = safeReturnTo(typeof params.returnTo === 'string' ? params.returnTo : null);
  const retry = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center justify-between px-md">
        <Wordmark />
        <LanguageSelector current={isLocale(locale) ? locale : DEFAULT_LOCALE} />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-8 pb-lg">
        <section className="flex flex-col gap-3">
          <span className="flex size-14 items-center justify-center rounded-pill bg-secondary" aria-hidden="true">
            <CircleAlert size={26} className="text-danger" />
          </span>
          <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
          <p data-testid="auth-error-helper" data-reason={reason} className="text-body text-text-muted">
            {t(`reasons.${reason}`)}
          </p>
        </section>

        <div className="flex flex-col items-center gap-sm">
          <a
            href={retry}
            data-testid="auth-error-retry"
            className="flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill bg-primary px-md py-[14px] text-center text-body font-semibold text-white hover:bg-primary-hover"
          >
            <RotateCcw size={20} aria-hidden="true" className="shrink-0" />
            <span>{t('tryAgain')}</span>
          </a>
          <a
            href="/"
            data-testid="auth-error-home"
            className="flex min-h-11 items-center gap-1.5 text-small leading-5 font-medium text-primary underline"
          >
            <ArrowLeft size={16} aria-hidden="true" className="shrink-0" />
            <span>{t('backHome')}</span>
          </a>
        </div>
      </main>
    </div>
  );
}
