'use client';

import { useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';

/**
 * Photo for the next Render (docs/design/controlnet-render.md, frame 2; 2+ photos only): a
 * radiogroup of 96x72 thumbnails; the selected one has a 3 px primary stroke and a check badge.
 * Arrow keys move the selection (roving tabindex).
 */
export function PhotoPicker({
  photos,
  selectedId,
  disabled,
  onSelect,
  title,
  helper,
  optionLabel,
}: {
  photos: Array<{ id: string; thumbUrl: string }>;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (photoId: string) => void;
  title: string;
  helper: string;
  optionLabel: (n: number) => string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0 || disabled) return;
    event.preventDefault();
    const next = (index + delta + photos.length) % photos.length;
    onSelect(photos[next].id);
    refs.current[next]?.focus();
  };
  return (
    <section className="flex flex-col gap-3" aria-labelledby="results-photos-title">
      <div className="flex flex-col gap-1">
        <h2 id="results-photos-title" className="text-[18px] leading-6 font-semibold text-text">
          {title}
        </h2>
        <p className="text-small leading-5 text-text-muted">{helper}</p>
      </div>
      <div role="radiogroup" aria-labelledby="results-photos-title" aria-disabled={disabled} data-scroll-x className="-mx-md flex gap-3 overflow-x-auto px-md">
        {photos.map((photo, index) => {
          const selected = photo.id === selectedId;
          return (
            <button
              key={photo.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={optionLabel(index + 1)}
              aria-disabled={disabled}
              tabIndex={selected || (!selectedId && index === 0) ? 0 : -1}
              data-testid={`results-photo-${index + 1}`}
              onClick={() => !disabled && onSelect(photo.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`relative h-[72px] w-24 shrink-0 overflow-hidden rounded-md ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <img src={`/api${photo.thumbUrl}`} alt="" className="size-full object-cover" />
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
