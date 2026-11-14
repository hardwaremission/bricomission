import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale } from '../../i18n/locales';
import { AccountEntry } from '../AccountEntry';
import { LanguageSelector } from '../LanguageSelector';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Header (back to the project, language, account) of the edit pages of a claimed project. The
 * HTML is the same for everyone: the project loads on the client through the /api proxy, so the
 * service worker's page cache never holds private data. Returns the lowercase project id.
 */
export async function EditPageShell({ params, children }: { params: Promise<{ projectId: string }>; children: (projectId: string) => ReactNode }) {
  const { projectId } = await params;
  if (!UUID.test(projectId)) notFound();
  const id = projectId.toLowerCase();
  const t = await getTranslations('project.edit');
  const locale = await getLocale();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center justify-between gap-sm px-md">
        <Link
          href={`/kitchen-projects/${id}`}
          prefetch={false}
          aria-label={t('back')}
          data-testid="edit-back"
          className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-text"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-sm">
          <LanguageSelector current={isLocale(locale) ? locale : DEFAULT_LOCALE} />
          <AccountEntry />
        </div>
      </header>
      {children(id)}
    </div>
  );
}
