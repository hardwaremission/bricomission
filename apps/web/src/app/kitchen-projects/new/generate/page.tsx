import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { AccountEntry } from '../../../../components/AccountEntry';
import { GenerateScreen } from '../../../../components/generate/GenerateScreen';
import { LanguageSelector } from '../../../../components/LanguageSelector';
import { DEFAULT_LOCALE, isLocale } from '../../../../i18n/locales';

// Locale per request (src/proxy.ts). The HTML is identical for every visitor: the draft and the
// session load on the client, so the service worker's page cache never holds private data.
export const dynamic = 'force-dynamic';

/**
 * Generate (design: docs/design/login-gate-claim.md): step 3 of 3 of the anonymous draft. The
 * costly actions open the Login Gate; after sign-in the draft is claimed.
 */
export default async function KitchenGeneratePage() {
  const t = await getTranslations('generate');
  const locale = await getLocale();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center justify-between px-md">
        <Link
          href="/kitchen-projects/new/moodboard"
          prefetch={false}
          aria-label={t('backToMoodboard')}
          data-testid="generate-back"
          className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-text"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-sm">
          <LanguageSelector current={isLocale(locale) ? locale : DEFAULT_LOCALE} />
          <AccountEntry />
        </div>
      </header>
      <GenerateScreen />
    </div>
  );
}
