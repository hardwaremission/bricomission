'use client';

import { Hourglass, Loader, ReceiptText } from 'lucide-react';

/**
 * Queued/running/first-run card (docs/design/budget-tier-computation.md, frame 3 and panel 4).
 * Running: spinner, "Calculating…" and an indeterminate bar. Queued: hourglass, "Waiting for the
 * GPU" and the jobs-ahead line when known. Empty: receipt icon, title and helper.
 */
export function BudgetStatusCard({
  status,
  label,
  detail,
}: {
  status: 'queued' | 'running' | 'empty';
  label: string;
  /** Jobs-ahead line (queued) or the helper (empty); null hides it. */
  detail: string | null;
}) {
  const busy = status !== 'empty';
  return (
    <div
      aria-busy={busy}
      data-testid={busy ? 'budget-placeholder' : 'budget-empty'}
      className="flex w-full items-center justify-center rounded-lg bg-surface-muted p-md"
    >
      <div
        role={busy ? 'status' : undefined}
        aria-live={busy ? 'polite' : undefined}
        data-testid="budget-status"
        data-status={status}
        className="flex w-full max-w-[320px] flex-col items-center gap-3 rounded-[16px] bg-surface p-md shadow-card"
      >
        {status === 'running' ? (
          <Loader size={24} aria-hidden="true" className="animate-spin text-primary" />
        ) : status === 'queued' ? (
          <Hourglass size={24} aria-hidden="true" className="text-primary" />
        ) : (
          <ReceiptText size={24} aria-hidden="true" className="text-primary" />
        )}
        <p className="w-full text-center text-body font-semibold text-text">{label}</p>
        {status === 'running' ? (
          <span aria-hidden="true" className="flex h-1.5 w-full overflow-hidden rounded-pill bg-border">
            <span className="bm-indeterminate h-1.5 w-20 shrink-0 rounded-pill bg-primary" />
          </span>
        ) : detail ? (
          <p data-testid={status === 'queued' ? 'budget-position' : 'budget-empty-helper'} className="w-full text-center text-small leading-5 text-text-muted">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}
