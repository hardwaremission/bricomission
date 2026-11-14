'use client';

import { Hourglass, Loader } from 'lucide-react';

/**
 * Queued/running placeholder (docs/design/controlnet-render.md, frame 1 and panel 3): the selected
 * photo dimmed behind a centred status card. Running: spinner, "Generating…" and an indeterminate
 * bar. Queued: hourglass, "Waiting for the GPU" and the jobs-ahead line when known.
 */
export function RenderStatusCard({
  photoSrc,
  width,
  height,
  status,
  label,
  aheadLabel,
}: {
  photoSrc: string | null;
  width: number;
  height: number;
  status: 'queued' | 'running';
  label: string;
  aheadLabel: string | null;
}) {
  return (
    <div
      aria-busy="true"
      data-testid="results-placeholder"
      className="relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-surface-muted"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {photoSrc ? <img src={photoSrc} alt="" className="absolute inset-0 size-full object-cover brightness-75" /> : null}
      <div
        role="status"
        aria-live="polite"
        data-testid="results-status"
        data-status={status}
        className="relative flex w-[240px] max-w-[calc(100%-32px)] flex-col items-center gap-3 rounded-[16px] bg-surface p-md shadow-card"
      >
        {status === 'running' ? (
          <Loader size={24} aria-hidden="true" className="animate-spin text-primary" />
        ) : (
          <Hourglass size={24} aria-hidden="true" className="text-primary" />
        )}
        <p className="w-full text-center text-body font-semibold text-text">{label}</p>
        {status === 'running' ? (
          <span aria-hidden="true" className="flex h-1.5 w-full overflow-hidden rounded-pill bg-border">
            <span className="bm-indeterminate h-1.5 w-20 shrink-0 rounded-pill bg-primary" />
          </span>
        ) : aheadLabel ? (
          <p data-testid="results-position" className="w-full text-center text-small leading-5 text-text-muted">
            {aheadLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}
