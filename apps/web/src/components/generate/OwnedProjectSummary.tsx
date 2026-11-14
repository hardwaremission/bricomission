'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { measurementsLabel } from '../../lib/simulations/project-simulations';
import type { KitchenProjectView } from '../../lib/kitchen-draft/types';

const LINK_CLASS = 'flex h-11 shrink-0 items-center justify-end text-small leading-5 font-semibold underline';

function Row({ label, testId, link }: { label: string; testId: string; link: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-sm" data-testid={testId}>
      <p className="min-w-0 text-body font-semibold text-text">{label}</p>
      {link}
    </div>
  );
}

/**
 * Summary card of the owned project page (docs/design/simulations-ux-overhaul.md, S7): photos,
 * measurements (cm) and styles, each row 44 px high with an underlined primary edit link at the
 * right. The links go to the edit pages and become inert text (`aria-disabled`) while a Simulation
 * or Budget is active (S8).
 */
export function OwnedProjectSummary({ project, projectId, editable }: { project: KitchenProjectView; projectId: string; editable: boolean }) {
  const t = useTranslations('project.summary');
  const measured = measurementsLabel(project.measurements);
  const entry = (section: 'photos' | 'measurements' | 'styles', label: string) =>
    editable ? (
      <Link href={`/kitchen-projects/${projectId}/edit/${section}`} prefetch={false} data-testid={`project-edit-${section}`} className={`${LINK_CLASS} text-primary`}>
        {label}
      </Link>
    ) : (
      <span role="link" aria-disabled="true" data-testid={`project-edit-${section}`} className={`${LINK_CLASS} cursor-not-allowed text-text-muted`}>
        {label}
      </span>
    );
  return (
    <section className="flex shrink-0 flex-col gap-1 rounded-lg bg-surface p-md shadow-card" data-testid="project-summary">
      <Row testId="summary-photos" label={t('photos', { count: project.photos.length })} link={entry('photos', t('editPhotos'))} />
      <hr className="h-px border-0 bg-border" />
      <Row testId="summary-measurements" label={measured ?? t('missing')} link={entry('measurements', t('editMeasurements'))} />
      <hr className="h-px border-0 bg-border" />
      <Row testId="summary-styles" label={t('styles', { count: project.moodboard.length })} link={entry('styles', t('editStyles'))} />
    </section>
  );
}
