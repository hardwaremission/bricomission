'use client';

/**
 * "Your renders" (docs/design/controlnet-render.md, frame 2): succeeded Renders newest first as
 * 110x75 thumbnails in a horizontal strip; the one in the slider has a 3 px primary stroke and
 * `aria-current`. Tapping a thumbnail shows it in the slider.
 */
export function RenderHistory({
  renders,
  shownId,
  disabled,
  onShow,
  title,
  counter,
  itemLabel,
}: {
  renders: Array<{ id: string; thumbUrl: string | null; number: number }>;
  shownId: string | null;
  disabled: boolean;
  onShow: (renderId: string) => void;
  title: string;
  counter: string;
  itemLabel: (n: number) => string;
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="results-history-title" data-testid="results-history">
      <div className="flex items-center justify-between gap-sm">
        <h2 id="results-history-title" className="text-[18px] leading-6 font-semibold text-text">
          {title}
        </h2>
        <p data-testid="results-history-count" className="shrink-0 text-small leading-5 font-semibold text-text-muted">
          {counter}
        </p>
      </div>
      <ul data-scroll-x className="-mx-md flex gap-3 overflow-x-auto px-md">
        {renders.map((render) => {
          const shown = render.id === shownId;
          return (
            <li key={render.id} className="shrink-0">
              <button
                type="button"
                aria-label={itemLabel(render.number)}
                aria-current={shown ? 'true' : undefined}
                aria-disabled={disabled}
                data-testid="results-history-item"
                data-render-id={render.id}
                onClick={() => !disabled && onShow(render.id)}
                className={`relative block h-[75px] w-[110px] overflow-hidden rounded-md bg-surface-muted ${disabled ? 'cursor-not-allowed' : ''}`}
              >
                {render.thumbUrl ? <img src={`/api${render.thumbUrl}`} alt="" className="size-full object-cover" /> : null}
                {shown ? <span aria-hidden="true" className="absolute inset-0 rounded-md border-[3px] border-primary" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
