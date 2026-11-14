import type { components } from '@bricomission/api-client';

/** One Render of a Simulation (generated from openapi.json). */
export type RenderView = components['schemas']['RenderViewDto'];

/** Poll period of an active Simulation or Budget (controlnet-render OQ-6). */
export const POLL_MS = 2000;
/** First poll soon after the POST: its 202 always says `queued`, even when the GPU was free. */
export const FIRST_POLL_MS = 500;

/** A Render, Budget or Simulation that is still in flight (`queued`, `running` or `active`). */
export function isActive(item: { status: string } | null | undefined): boolean {
  return item?.status === 'queued' || item?.status === 'running' || item?.status === 'active';
}

/** Strips `claimed` and `start` from the results URL; returns whether a Simulation should start. */
export function consumeStartParam(search: string): { start: boolean; changed: boolean } {
  const params = new URLSearchParams(search);
  const start = params.get('start') === '1';
  const changed = params.has('start') || params.has('claimed');
  return { start, changed };
}

/** Injectable timer (tests drive it by hand). */
export interface PollTimer {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const browserTimer: PollTimer = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Polls one active Simulation or Budget (first after `firstDelayMs`, then every `intervalMs`) until `fetchOnce` returns a terminal item, or
 * `stop()` is called (offline, unmount). One request at a time: the next poll is scheduled after
 * the previous answer arrives. Failed requests keep polling.
 */
export function startPolling<T extends { status: string }>(options: {
  fetchOnce: () => Promise<T | null>;
  onRender: (render: T) => void;
  timer?: PollTimer;
  intervalMs?: number;
  firstDelayMs?: number;
}): { stop: () => void } {
  const timer = options.timer ?? browserTimer;
  const interval = options.intervalMs ?? POLL_MS;
  const first = options.firstDelayMs ?? FIRST_POLL_MS;
  let stopped = false;
  let handle: unknown = null;
  const tick = async () => {
    handle = null;
    const render = await options.fetchOnce();
    if (stopped) return;
    if (render) options.onRender(render);
    if (render && !isActive(render)) return;
    handle = timer.set(() => void tick(), interval);
  };
  handle = timer.set(() => void tick(), first);
  return {
    stop: () => {
      stopped = true;
      if (handle !== null) timer.clear(handle);
      handle = null;
    },
  };
}
