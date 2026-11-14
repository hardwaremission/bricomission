'use client';

import type { SimulationView } from '../../lib/simulations/simulation-state';

/**
 * "Your simulations" (docs/design/simulations-ux-overhaul.md, S4): one card per Simulation, newest
 * first. Card p 12, gap 8, surface, radius 16; title 14/20 semibold; 64x48 thumbnails wrap (gap 8,
 * row gap 8). The shown Simulation has a 3 px primary stroke and `aria-current`; tapping a card
 * shows that Simulation.
 */
export function SimulationHistory({
  simulations,
  shownId,
  disabled,
  onShow,
  title,
  counter,
  itemTitle,
  itemLabel,
}: {
  simulations: SimulationView[];
  shownId: string | null;
  disabled: boolean;
  onShow: (simulationId: string) => void;
  title: string;
  counter: string;
  itemTitle: (n: number) => string;
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
      <ul className="flex flex-col gap-3">
        {simulations.map((simulation) => {
          const shown = simulation.id === shownId;
          const thumbs = simulation.renders.filter((render) => render.status === 'succeeded' && render.thumbUrl);
          return (
            <li key={simulation.id}>
              <button
                type="button"
                aria-label={itemLabel(simulation.ordinal)}
                aria-current={shown ? 'true' : undefined}
                aria-disabled={disabled}
                data-testid={`simulation-${simulation.ordinal}`}
                data-simulation-id={simulation.id}
                onClick={() => !disabled && onShow(simulation.id)}
                className={`relative flex w-full min-w-0 flex-col gap-2 rounded-[16px] bg-surface p-3 text-left shadow-card ${disabled ? 'cursor-not-allowed' : ''}`}
              >
                <span className="text-small leading-5 font-semibold text-text">{itemTitle(simulation.ordinal)}</span>
                <span className="flex flex-wrap gap-2">
                  {thumbs.map((render) => (
                    <span key={render.id} className="h-12 w-16 overflow-hidden rounded-sm bg-surface-muted">
                      <img src={`/api${render.thumbUrl}`} alt="" className="size-full object-cover" />
                    </span>
                  ))}
                </span>
                {shown ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[16px] border-[3px] border-primary" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
