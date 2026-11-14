import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { AccountEntry } from '../../../components/AccountEntry';
import { CaptureScreen } from '../../../components/capture/CaptureScreen';
import { LanguageSelector } from '../../../components/LanguageSelector';
import { DEFAULT_LOCALE, isLocale } from '../../../i18n/locales';

// Locale per request (src/proxy.ts). The HTML is identical for every visitor: the draft
// loads on the client from /api, so the service worker's page cache never holds private data.
export const dynamic = 'force-dynamic';

/**
 * Capture (design: docs/design/kitchen-capture-draft.md, frames 1-4): photos and room
 * measurements of an anonymous draft Kitchen Project.
 */
export default async function KitchenCapturePage() {
  const t = await getTranslations('capture');
  const locale = await getLocale();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center justify-between px-md">
        <Link
          href="/"
          prefetch={false}
          aria-label={t('backToHome')}
          data-testid="capture-back"
          className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-text"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-sm">
          <LanguageSelector current={isLocale(locale) ? locale : DEFAULT_LOCALE} />
          <AccountEntry />
        </div>
      </header>
      <CaptureScreen />
    </div>
  );
}
