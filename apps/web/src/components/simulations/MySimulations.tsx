'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Circle, Info, Loader, Maximize2, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { cardThumbs, failedCount, formatSimulationDate, isActive, isSelectable, showInstruction } from '../../lib/simulations/project-simulations';
import { progressNumbers, type SimulationView } from '../../lib/simulations/simulation-state';
import { DeleteSimulationDialog } from './DeleteSimulationDialog';

const OUTLINE = 'flex h-11 min-w-0 grow items-center justify-center gap-1.5 rounded-pill border border-border bg-surface px-sm text-small leading-5 font-semibold';
const SOFT = 'flex h-11 min-w-0 grow items-center justify-center gap-1.5 rounded-pill bg-surface-muted px-sm text-small leading-5 font-semibold text-text';
const DISABLED =
  'flex h-11 min-w-0 grow cursor-not-allowed items-center justify-center gap-1.5 rounded-pill border border-border bg-surface-muted px-sm text-small leading-5 font-semibold text-text-muted';

function SimulationCard({
  simulation,
  projectId,
  busy,
  onSelect,
  onDelete,
}: {
  simulation: SimulationView;
  projectId: string;
  busy: boolean;
  onSelect: (simulation: SimulationView) => void;
  onDelete: (simulation: SimulationView) => void;
}) {
  const t = useTranslations('simulations');
  const locale = useLocale();
  const n = simulation.ordinal;
  const active = isActive(simulation);
  const partial = simulation.status === 'partial' || simulation.status === 'failed';
  const selectable = isSelectable(simulation);
  const { selected } = simulation;
  const { shown, more } = cardThumbs(simulation);
  const failed = failedCount(simulation);
  const open = `/kitchen-projects/${projectId}/results?simulation=${simulation.id}`;
  const progress = active ? progressNumbers(simulation) : null;
  const stroke = selected ? 'border-[3px] border-primary' : partial ? 'border border-warning' : '';
  const deleteDisabled = active || busy;
  return (
    <div
      data-testid={`simulation-${n}`}
      data-status={simulation.status}
      data-selected={selected}
      className={`flex min-w-0 flex-col gap-md rounded-lg bg-surface p-md ${selected || partial ? stroke : 'shadow-card'}`}
    >
      <div className="flex items-center justify-between gap-sm">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-body font-semibold text-text">{t('name', { n })}</p>
          {active ? null : (
            <p className="text-small leading-5 text-text-muted">{t('meta', { date: formatSimulationDate(simulation.createdAt, locale), count: simulation.renders.length })}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {active && progress ? (
            <p className="flex items-center gap-1.5 text-small leading-5 font-semibold text-text" data-testid="simulation-progress">
              <Loader size={16} aria-hidden="true" className="animate-spin text-primary" />
              <span>{t('rendering', { n: progress.n, count: progress.count })}</span>
            </p>
          ) : null}
          {selected ? (
            <span
              role="radio"
              aria-checked="true"
              aria-label={t('selectedNamed', { n })}
              data-testid={`simulation-select-${n}`}
              className="flex h-7 items-center gap-1 rounded-pill bg-primary px-[10px] text-[12px] leading-4 font-semibold text-white"
            >
              <Check size={14} aria-hidden="true" />
              {t('selected')}
            </span>
          ) : null}
          {!active && !selected && partial && failed > 0 ? (
            <span className="flex h-7 items-center gap-1 rounded-pill bg-surface-muted px-[10px] text-[12px] leading-4 font-semibold text-text" data-testid={`simulation-failed-${n}`}>
              <TriangleAlert size={14} aria-hidden="true" className="text-warning" />
              {t('photosFailed', { count: failed })}
            </span>
          ) : null}
          {selected ? null : (
            <button
              type="button"
              aria-label={t('deleteNamed', { n })}
              aria-disabled={deleteDisabled}
              data-testid={`simulation-delete-${n}`}
              onClick={() => !deleteDisabled && onDelete(simulation)}
              className={`-my-2 flex size-11 shrink-0 items-center justify-center rounded-pill ${deleteDisabled ? 'cursor-not-allowed' : ''}`}
            >
              <Trash2 size={20} aria-hidden="true" className={deleteDisabled ? 'text-text-muted' : 'text-danger'} />
            </button>
          )}
        </div>
      </div>

      {active && progress ? (
        <span aria-hidden="true" data-testid="simulation-progress-bar" data-percent={progress.percent} className="flex h-1.5 w-full overflow-hidden rounded-pill bg-border">
          <span className="h-1.5 shrink-0 rounded-pill bg-primary" style={{ width: `${progress.percent}%` }} />
        </span>
      ) : shown.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {shown.map((thumb) => (
            <span key={thumb.id} className="h-12 w-16 overflow-hidden rounded-sm bg-surface-muted">
              <img src={`/api${thumb.thumbUrl}`} alt="" className="size-full object-cover" />
            </span>
          ))}
          {more > 0 ? (
            <span className="flex h-12 w-16 items-center justify-center rounded-sm bg-surface-muted text-small leading-5 font-semibold text-text-muted" data-testid={`simulation-more-${n}`}>
              +{more}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-sm">
        <Link href={open} prefetch={false} aria-label={t(partial ? 'openRetryNamed' : 'openNamed', { n })} data-testid={`simulation-open-${n}`} className={`${OUTLINE} text-primary`}>
          {active || partial ? null : <Maximize2 size={16} aria-hidden="true" className="shrink-0" />}
          <span>{partial ? t('openRetry') : t('open')}</span>
        </Link>
        {selected ? (
          <button
            type="button"
            aria-label={t('deleteNamed', { n })}
            aria-disabled={deleteDisabled}
            data-testid={`simulation-delete-${n}`}
            onClick={() => !deleteDisabled && onDelete(simulation)}
            className={`${OUTLINE} text-danger`}
          >
            <Trash2 size={16} aria-hidden="true" className="shrink-0" />
            <span>{t('delete')}</span>
          </button>
        ) : (
          <button
            type="button"
            role="radio"
            aria-checked={false}
            aria-label={t('selectNamed', { n })}
            aria-disabled={!selectable || busy}
            data-testid={`simulation-select-${n}`}
            onClick={() => selectable && !busy && onSelect(simulation)}
            className={selectable ? SOFT : DISABLED}
          >
            <Circle size={16} aria-hidden="true" className="shrink-0" />
            <span>{t('select')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "My simulations" (docs/design/simulations-ux-overhaul.md, S7 and S8): title with counter, the
 * instruction alert while nothing is selected, one card per Simulation (newest first) in a radio
 * group, the empty card, and the delete confirmation. Selecting and deleting go through the
 * callbacks (the real API); `pendingId` disables the cards while one call is in flight.
 */
export function MySimulations({
  simulations,
  projectId,
  pendingId,
  onSelect,
  onDelete,
}: {
  simulations: SimulationView[];
  projectId: string;
  pendingId: string | null;
  onSelect: (simulation: SimulationView) => void;
  onDelete: (simulation: SimulationView) => Promise<void>;
}) {
  const t = useTranslations('simulations');
  const [confirm, setConfirm] = useState<SimulationView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const close = () => !deleting && setConfirm(null);
  const confirmDelete = async () => {
    if (!confirm) return;
    setDeleting(true);
    await onDelete(confirm);
    setDeleting(false);
    setConfirm(null);
  };
  return (
    <section className="flex flex-col gap-3" aria-labelledby="my-simulations-title" data-testid="my-simulations">
      <div className="flex items-center justify-between gap-sm">
        <h2 id="my-simulations-title" className="text-[18px] leading-6 font-semibold text-text">
          {t('title')}
        </h2>
        <p data-testid="my-simulations-count" className="shrink-0 text-small leading-5 font-semibold text-text-muted">
          {simulations.length}
        </p>
      </div>
      {showInstruction(simulations) ? (
        <div role="status" data-testid="simulations-instruction" className="flex items-start gap-3 rounded-lg border border-primary bg-surface p-md">
          <Info size={20} aria-hidden="true" className="shrink-0 text-primary" />
          <p className="min-w-0 grow text-small leading-5 text-text">{t('instruction')}</p>
        </div>
      ) : null}
      {simulations.length === 0 ? (
        <div data-testid="simulations-empty" className="flex flex-col items-center gap-3 rounded-lg bg-surface p-md text-center shadow-card">
          <Sparkles size={24} aria-hidden="true" className="text-primary" />
          <p className="text-body font-semibold text-text">{t('empty.title')}</p>
          <p className="text-small leading-5 text-text-muted">{t('empty.helper')}</p>
        </div>
      ) : (
        <div role="radiogroup" aria-label={t('title')} className="flex flex-col gap-3">
          {simulations.map((simulation) => (
            <SimulationCard key={simulation.id} simulation={simulation} projectId={projectId} busy={pendingId !== null} onSelect={onSelect} onDelete={setConfirm} />
          ))}
        </div>
      )}
      <DeleteSimulationDialog
        open={confirm !== null}
        title={t('deleteDialog.title', { n: confirm?.ordinal ?? 0 })}
        message={t('deleteDialog.message')}
        confirmLabel={t('deleteDialog.confirm')}
        cancelLabel={t('deleteDialog.cancel')}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={close}
      />
    </section>
  );
}
