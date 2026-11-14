'use client';

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronsLeftRight } from 'lucide-react';

const STEP = 5;

/**
 * Before/after comparison (docs/design/controlnet-render.md, frame 2; the position is controlled by
 * the page: simulations-ux-overhaul S4): the Render (`after`) is the
 * base layer; the `before` image lies on top, clipped to the handle position. Both images have the
 * same size (the API's centre crop), so they align pixel for pixel. Pointer drag anywhere on the
 * slider, or arrow keys (step 5), Home and End on the handle (`role="slider"`, 0-100).
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  width,
  height,
  value,
  onChange,
  labels,
}: {
  beforeSrc: string;
  afterSrc: string;
  width: number;
  height: number;
  /** Handle position 0-100: owned by the page so it survives switching Render or Simulation. */
  value: number;
  onChange: (value: number) => void;
  labels: { slider: string; before: string; after: string; beforeAlt: string; afterAlt: string };
}) {
  const setValue = onChange;
  const box = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const fromPointer = useCallback((clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setValue(Math.round(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))));
  }, [setValue]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    fromPointer(event.clientX);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) fromPointer(event.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? value - STEP
        : event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? value + STEP
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 100
              : null;
    if (next === null) return;
    event.preventDefault();
    setValue(Math.min(100, Math.max(0, next)));
  };

  return (
    <div
      ref={box}
      data-testid="results-compare"
      className="relative w-full touch-none overflow-hidden rounded-lg bg-surface-muted select-none"
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Plain <img>: same-origin private images through the /api proxy. */}
      <img src={afterSrc} alt={labels.afterAlt} draggable={false} data-testid="results-after" className="absolute inset-0 size-full object-cover" />
      <img
        src={beforeSrc}
        alt={labels.beforeAlt}
        draggable={false}
        data-testid="results-before"
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}
      />
      <span aria-hidden="true" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" style={{ left: `${value}%` }} />
      <span className="absolute top-3 left-3 rounded-pill bg-white px-2 py-0.5 text-[12px] leading-4 font-semibold text-text">{labels.before}</span>
      <span className="absolute top-3 right-3 rounded-pill bg-white px-2 py-0.5 text-[12px] leading-4 font-semibold text-text">{labels.after}</span>
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels.slider}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-orientation="horizontal"
        data-testid="results-slider"
        onKeyDown={onKeyDown}
        className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-pill"
        style={{ left: `${value}%` }}
      >
        <span className="flex size-10 items-center justify-center rounded-pill bg-white text-text shadow-[0_1px_2px_#0000001F]">
          <ChevronsLeftRight size={20} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
