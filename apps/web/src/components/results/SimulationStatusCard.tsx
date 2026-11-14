'use client';

import { Hourglass, Loader } from 'lucide-react';

/**
 * Status card of a running Simulation (docs/design/simulations-ux-overhaul.md, S3 and S5).
 * `rendering`: spinner, "Rendering n of N", percent and a determinate bar (n/N); `describing`:
 * "Studying your style references" with an indeterminate bar; `queued`: hourglass, "Waiting for
 * the GPU" and the jobs-ahead line when known. `role="status"` is the only live region.
 */
export function SimulationStatusCard({
  stage,
  label,
  percent,
  percentLabel,
  aheadLabel,
}: {
  stage: 'describing' | 'queued' | 'rendering';
  label: string;
  percent: number;
  percentLabel: string;
  aheadLabel: string | null;
}) {
  return (
    <div aria-busy="true" data-testid="results-placeholder" className="flex w-full flex-col gap-3 rounded-[16px] bg-surface p-md shadow-card">
      <div role="status" aria-live="polite" data-testid="results-status" data-status={stage} className="flex items-center gap-sm">
        {stage === 'queued' ? (
          <Hourglass size={24} aria-hidden="true" className="shrink-0 text-primary" />
        ) : (
          <Loader size={24} aria-hidden="true" className="shrink-0 animate-spin text-primary" />
        )}
        <p className="min-w-0 flex-1 text-body font-semibold text-text">{label}</p>
        {stage === 'rendering' ? (
          <p data-testid="results-percent" className="shrink-0 text-small leading-5 font-semibold text-text-muted">
            {percentLabel}
          </p>
        ) : null}
      </div>
      {stage === 'rendering' ? (
        <span aria-hidden="true" data-testid="results-progress-bar" data-percent={percent} className="flex h-1.5 w-full overflow-hidden rounded-pill bg-border">
          <span className="h-1.5 shrink-0 rounded-pill bg-primary" style={{ width: `${percent}%` }} />
        </span>
      ) : stage === 'describing' ? (
        <span aria-hidden="true" className="flex h-1.5 w-full overflow-hidden rounded-pill bg-border">
          <span className="bm-indeterminate h-1.5 w-20 shrink-0 rounded-pill bg-primary" />
        </span>
      ) : aheadLabel ? (
        <p data-testid="results-position" className="text-small leading-5 text-text-muted">
          {aheadLabel}
        </p>
      ) : null}
    </div>
  );
}
