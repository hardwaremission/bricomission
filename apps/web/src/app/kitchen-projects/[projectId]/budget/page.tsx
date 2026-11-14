import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { AccountEntry } from '../../../../components/AccountEntry';
import { LanguageSelector } from '../../../../components/LanguageSelector';
import { BudgetScreen } from '../../../../components/budget/BudgetScreen';
import { DEFAULT_LOCALE, isLocale } from '../../../../i18n/locales';

// Identical HTML for every visitor: the project and its Budgets load on the client through the
// /api proxy (the session's token), so the service worker's page cache never holds private data.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Budget Tier Overview (design: docs/design/budget-tier-computation.md). Owner only. */
export default async function KitchenBudgetPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!UUID.test(projectId)) notFound();
  const id = projectId.toLowerCase();
  const t = await getTranslations('budget');
  const locale = await getLocale();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-xxl shrink-0 items-center justify-between gap-sm px-md">
        <Link
          href={`/kitchen-projects/${id}`}
          prefetch={false}
          aria-label={t('back')}
          data-testid="budget-back"
          className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-text"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-sm">
          <LanguageSelector current={isLocale(locale) ? locale : DEFAULT_LOCALE} />
          <AccountEntry />
        </div>
      </header>
      <BudgetScreen projectId={id} />
    </div>
  );
}
