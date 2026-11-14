'use client';

import { Check, CircleAlert, Hourglass, Loader } from 'lucide-react';
import type { RenderView } from '../../lib/simulations/simulation-state';

/**
 * Per-photo tiles of a running Simulation (docs/design/simulations-ux-overhaul.md, S3): wrap, gap
 * 12, 4:3. Done: the thumbnail + a 24 primary check badge; running: 3 px primary stroke + spinner;
 * queued: muted tile with an hourglass; failed: 2 px danger stroke. Tiles are named `Photo {n}`.
 */
export function SimulationTiles({ renders, label, failedLabel }: { renders: RenderView[]; label: (n: number) => string; failedLabel: (n: number) => string }) {
  return (
    <ul className="grid grid-cols-3 gap-3" data-testid="results-tiles">
      {renders.map((render) => {
        const n = render.photoPosition + 1;
        const state = render.status === 'succeeded' ? 'done' : render.status;
        const name = render.status === 'failed' ? failedLabel(n) : label(n);
        return (
          <li
            key={render.id}
            role="img"
            aria-label={name}
            data-testid={`results-tile-${n}`}
            data-state={state}
            className={`relative flex aspect-[4/3] min-w-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted ${
              render.status === 'queued' ? 'border border-border' : ''
            } ${render.status === 'failed' ? 'border-2 border-danger' : ''}`}
          >
            {render.status === 'succeeded' && render.thumbUrl ? (
              <>
                <img src={`/api${render.thumbUrl}`} alt="" className="absolute inset-0 size-full object-cover" />
                <span aria-hidden="true" className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-pill bg-primary text-white">
                  <Check size={14} />
                </span>
              </>
            ) : null}
            {render.status === 'running' ? (
              <>
                <img src={`/api${render.beforeUrl}`} alt="" className="absolute inset-0 size-full object-cover brightness-75" />
                <span aria-hidden="true" className="absolute inset-0 rounded-md border-[3px] border-primary" />
                <Loader size={24} aria-hidden="true" className="relative animate-spin text-primary" />
              </>
            ) : null}
            {render.status === 'queued' ? <Hourglass size={20} aria-hidden="true" className="text-text-muted" /> : null}
            {render.status === 'failed' ? <CircleAlert size={20} aria-hidden="true" className="text-danger" /> : null}
          </li>
        );
      })}
    </ul>
  );
}
