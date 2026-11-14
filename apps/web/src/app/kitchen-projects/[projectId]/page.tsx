import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { AccountEntry } from '../../../components/AccountEntry';
import { OwnedProjectScreen } from '../../../components/generate/OwnedProjectScreen';
import { LanguageSelector } from '../../../components/LanguageSelector';
import { Wordmark } from '../../../components/Wordmark';
import { DEFAULT_LOCALE, isLocale } from '../../../i18n/locales';

// Identical HTML for every visitor: the project loads on the client through the /api proxy
// (the session's token), so the service worker's page cache never holds private data.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owned Kitchen Project (design: docs/design/login-gate-claim.md, frame 5). */
export default async function KitchenProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!UUID.test(projectId)) notFound();
  const locale = await getLocale();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center justify-between gap-sm px-md">
        <Link href="/" prefetch={false} data-testid="project-logo" className="flex h-11 w-[140px] shrink-0 items-center">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-sm">
          <LanguageSelector current={isLocale(locale) ? locale : DEFAULT_LOCALE} />
          <AccountEntry />
        </div>
      </header>
      <OwnedProjectScreen projectId={projectId.toLowerCase()} />
    </div>
  );
}
