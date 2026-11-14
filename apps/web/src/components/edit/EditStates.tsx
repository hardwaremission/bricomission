'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { GenerateAlert } from '../generate/GenerateAlert';
import type { EditBlockReason } from '../../lib/kitchen-draft/project-edit-client';

/** Gate of an edit page: the page works, edits are refused (409), or the project is not reachable. */
export type EditGate = 'ok' | EditBlockReason | 'signedOut' | 'notFound';

export const EDIT_MAIN_CLASS = 'flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-md pt-sm pb-lg';

/** Hint shown while edits are blocked (docs/design/simulations-ux-overhaul.md, S8). */
export function EditBlockedAlert({ reason }: { reason: EditBlockReason }) {
  const t = useTranslations('project.edit');
  return <GenerateAlert tone="warning" message={reason === 'budget' ? t('blockedBudget') : t('blockedSimulation')} testId="edit-blocked" />;
}

/** Signed out or unknown project on an edit page: the same states as the owned project page. */
export function EditGateScreen({ gate, projectId, path }: { gate: 'signedOut' | 'notFound'; projectId: string; path: string }) {
  const t = useTranslations('project');
  if (gate === 'signedOut') {
    const href = `/auth/login?returnTo=${encodeURIComponent(path)}`;
    return (
      <main className={EDIT_MAIN_CLASS} data-testid="edit-signed-out" data-project={projectId}>
        <h1 className="text-h1 font-bold text-text">{t('signedOut.title')}</h1>
        <a
          href={href}
          data-testid="edit-sign-in"
          className="flex min-h-[52px] w-full items-center justify-center rounded-pill bg-primary px-md py-[14px] text-center text-body font-semibold text-white hover:bg-primary-hover"
        >
          {t('signedOut.signIn')}
        </a>
      </main>
    );
  }
  return (
    <main className={EDIT_MAIN_CLASS} data-testid="edit-not-found">
      <h1 className="text-h1 font-bold text-text">{t('notFound.title')}</h1>
      <Link href="/" prefetch={false} data-testid="edit-home" className="flex h-11 shrink-0 items-center text-small leading-5 font-semibold text-primary underline">
        {t('notFound.home')}
      </Link>
    </main>
  );
}
