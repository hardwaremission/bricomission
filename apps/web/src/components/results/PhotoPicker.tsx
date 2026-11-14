'use client';

import { useRef, type KeyboardEvent } from 'react';
import { Check, CircleAlert, RefreshCw } from 'lucide-react';
import type { RenderView } from '../../lib/simulations/simulation-state';

/**
 * "Photos in this simulation" (docs/design/simulations-ux-overhaul.md, S4 and S5): a wrapping grid
 * of 4:3 thumbnails, 3 flexible columns, gap 12, no horizontal scroll. Succeeded Renders are
 * radios (the shown one: 3 px primary stroke + check badge); a failed Render is a tile with a 2 px
 * danger stroke and a 44 px Retry pill. Arrow keys move between the radios (roving tabindex).
 */
export function PhotoPicker({
  renders,
  shownId,
  retryDisabled,
  onShow,
  onRetry,
  title,
  helper,
  optionLabel,
  failedLabel,
  retryText,
  retryLabel,
}: {
  renders: RenderView[];
  shownId: string | null;
  retryDisabled: boolean;
  onShow: (renderId: string) => void;
  onRetry: (renderId: string) => void;
  title: string;
  helper: string;
  optionLabel: (n: number) => string;
  failedLabel: (n: number) => string;
  retryText: string;
  retryLabel: (n: number) => string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement | null>());
  const radios = renders.filter((render) => render.status === 'succeeded' && render.thumbUrl);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = radios[(index + delta + radios.length) % radios.length];
    if (!next) return;
    onShow(next.id);
    refs.current.get(next.id)?.focus();
  };
  return (
    <section className="flex flex-col gap-3" aria-labelledby="results-photos-title" data-testid="results-photos">
      <div className="flex flex-col gap-1">
        <h2 id="results-photos-title" className="text-[18px] leading-6 font-semibold text-text">
          {title}
        </h2>
        <p className="text-small leading-5 text-text-muted">{helper}</p>
      </div>
      <div role="radiogroup" aria-labelledby="results-photos-title" className="grid grid-cols-3 gap-3">
        {renders.map((render) => {
          const n = render.photoPosition + 1;
          if (render.status === 'failed') {
            return (
              <div
                key={render.id}
                role="group"
                aria-label={failedLabel(n)}
                data-testid={`results-render-${n}`}
                data-state="failed"
                className="relative flex aspect-[4/3] min-w-0 flex-col justify-between overflow-hidden rounded-md border-2 border-danger bg-surface-muted p-1"
              >
                <img src={`/api${render.beforeUrl}`} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
                <span className="relative flex items-center gap-1 text-[12px] leading-4 font-semibold text-text">
                  <CircleAlert size={16} aria-hidden="true" className="shrink-0 text-danger" />
                  <span className="min-w-0 break-words">{failedLabel(n)}</span>
                </span>
                <button
                  type="button"
                  aria-label={retryLabel(n)}
                  aria-disabled={retryDisabled}
                  data-testid={`results-retry-render-${n}`}
                  onClick={() => !retryDisabled && onRetry(render.id)}
                  className={`relative flex h-11 items-center justify-center gap-1 rounded-pill bg-surface-muted px-2 text-small leading-5 font-semibold text-text ${retryDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <RefreshCw size={16} aria-hidden="true" className="shrink-0 text-primary" />
                  <span>{retryText}</span>
                </button>
              </div>
            );
          }
          const index = radios.findIndex((candidate) => candidate.id === render.id);
          if (index < 0) return null;
          const selected = render.id === shownId;
          return (
            <button
              key={render.id}
              ref={(el) => {
                refs.current.set(render.id, el);
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={optionLabel(n)}
              tabIndex={selected || (!shownId && index === 0) ? 0 : -1}
              data-testid={`results-render-${n}`}
              data-render-id={render.id}
              onClick={() => onShow(render.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-md bg-surface-muted"
            >
              <img src={`/api${render.thumbUrl}`} alt="" className="size-full object-cover" />
              {selected ? (
                <>
                  <span aria-hidden="true" className="absolute inset-0 rounded-md border-[3px] border-primary" />
                  <span aria-hidden="true" className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-pill bg-primary text-white">
                    <Check size={14} />
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
