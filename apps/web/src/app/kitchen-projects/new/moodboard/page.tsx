import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { AccountEntry } from '../../../../components/AccountEntry';
import { LanguageSelector } from '../../../../components/LanguageSelector';
import { MoodboardScreen } from '../../../../components/moodboard/MoodboardScreen';
import { DEFAULT_LOCALE, isLocale } from '../../../../i18n/locales';

// Locale per request (src/proxy.ts). The HTML is identical for every visitor: the draft and
// the Style Gallery load on the client from /api, so the service worker's page cache never
// holds private data.
export const dynamic = 'force-dynamic';

/**
 * Moodboard (design: docs/design/moodboard-selection.md): step 2 of 3 of the anonymous draft.
 * Pick Style Gallery kitchens and add own reference photos.
 */
export default async function KitchenMoodboardPage() {
  const t = await getTranslations('moodboard');
  const locale = await getLocale();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center justify-between px-md">
        <Link
          href="/kitchen-projects/new"
          prefetch={false}
          aria-label={t('backToCapture')}
          data-testid="moodboard-back"
          className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-text"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-sm">
          <LanguageSelector current={isLocale(locale) ? locale : DEFAULT_LOCALE} />
          <AccountEntry />
        </div>
      </header>
      <MoodboardScreen />
    </div>
  );
}
