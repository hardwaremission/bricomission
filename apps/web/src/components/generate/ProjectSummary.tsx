'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Ruler } from 'lucide-react';
import { formatMeasurement, type Measurements } from '../../lib/kitchen-draft/measurements';

interface Thumb {
  id: string;
  thumbUrl: string;
}

/** Thumbnail strip: 3 equal cells, the first 2 images and a `+n` cell when there are more. */
function ThumbStrip({ items, testId, missing, more }: { items: Thumb[]; testId: string; missing: string; more: (count: number) => string }) {
  if (items.length === 0) {
    return (
      <p data-testid={testId} data-count={0} className="text-small leading-5 text-text-muted">
        {missing}
      </p>
    );
  }
  const shown = items.slice(0, 2);
  const rest = items.length - shown.length;
  return (
    <div data-testid={testId} data-count={items.length} className="grid grid-cols-3 gap-sm">
      {shown.map((item) => (
        // Plain <img>: same-origin thumbnails through the /api proxy (decorative; the section title names them).
        <img key={item.id} src={`/api${item.thumbUrl}`} alt="" data-testid={`${testId}-thumb`} className="h-[60px] w-full rounded-md bg-surface-muted object-cover" />
      ))}
      {rest > 0 ? (
        <span className="flex h-[60px] items-center justify-center rounded-md bg-surface-muted text-small leading-5 font-semibold text-text-muted" data-testid={`${testId}-more`}>
          {more(rest)}
        </span>
      ) : null}
    </div>
  );
}

function SectionHeader({ id, title, edit }: { id: string; title: string; edit?: { href: string; label: string; name: string; testId: string } }) {
  return (
    <div className="flex items-center justify-between gap-sm">
      <h2 id={id} className="text-body font-semibold text-text">
        {title}
      </h2>
      {edit ? (
        <Link
          href={edit.href}
          prefetch={false}
          aria-label={edit.name}
          data-testid={edit.testId}
          className="flex h-11 min-w-11 items-center justify-center px-sm text-small leading-5 font-semibold text-primary underline"
        >
          {edit.label}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Summary card of a draft or claimed Kitchen Project (docs/design/login-gate-claim.md, frames 1
 * and 5): photos, measurements and Moodboard. Generate shows Edit links and the Moodboard count;
 * the owned page is read-only. Missing parts show "—".
 */
export function ProjectSummary({
  photos,
  moodboard,
  measurements,
  editable,
}: {
  photos: Thumb[];
  moodboard: Thumb[];
  measurements: Measurements | null;
  editable: boolean;
}) {
  const t = useTranslations('generate.summary');
  const locale = useLocale();
  const { lengthCm, widthCm, heightCm } = measurements ?? { lengthCm: null, widthCm: null, heightCm: null };
  const measured =
    lengthCm !== null && widthCm !== null && heightCm !== null
      ? t('measurements', {
          length: formatMeasurement(lengthCm, 'm', locale),
          width: formatMeasurement(widthCm, 'm', locale),
          height: formatMeasurement(heightCm, 'm', locale),
        })
      : t('missing');
  const more = (count: number) => t('more', { count });
  return (
    <section className="flex shrink-0 flex-col gap-md rounded-lg bg-surface p-md shadow-card" data-testid="project-summary">
      <div className="flex flex-col gap-md" role="group" aria-labelledby="summary-kitchen-title">
        <SectionHeader
          id="summary-kitchen-title"
          title={t('kitchenTitle')}
          edit={editable ? { href: '/kitchen-projects/new', label: t('edit'), name: t('editKitchen'), testId: 'summary-edit-kitchen' } : undefined}
        />
        <ThumbStrip items={photos} testId="summary-photos" missing={t('missing')} more={more} />
        <p className="flex items-center gap-sm text-small leading-5 text-text" data-testid="summary-measurements">
          <Ruler size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span>{measured}</span>
        </p>
      </div>
      <hr className="h-px border-0 bg-border" />
      <div className="flex flex-col gap-md" role="group" aria-labelledby="summary-style-title">
        <SectionHeader
          id="summary-style-title"
          title={t('styleTitle')}
          edit={editable ? { href: '/kitchen-projects/new/moodboard', label: t('edit'), name: t('editStyle'), testId: 'summary-edit-style' } : undefined}
        />
        <ThumbStrip items={moodboard} testId="summary-moodboard" missing={t('missing')} more={more} />
        {editable ? (
          <p className="text-small leading-5 text-text-muted" data-testid="summary-moodboard-count">
            {t('moodboardCount', { count: moodboard.length })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
