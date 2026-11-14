import type { components } from '@bricomission/api-client';
import type { KitchenProjectView } from '../kitchen-draft/types';

/** API contract types (generated from openapi.json). */
export type RenderView = components['schemas']['RenderViewDto'];
export type RenderListResponse = components['schemas']['RenderListResponseDto'];

/** Poll period of an active Render (controlnet-render OQ-6). */
export const POLL_MS = 2000;
/** First poll soon after the POST: its 202 always says `queued`, even when the GPU was free. */
export const FIRST_POLL_MS = 500;

export interface ResultsState {
  load: 'loading' | 'ready' | 'signedOut' | 'notFound';
  project: KitchenProjectView | null;
  /** Newest first. */
  renders: RenderView[];
  maxRenders: number;
  /** Render shown in the slider (default: the active one, else the newest). */
  shownId: string | null;
  /** Photo for the next Render (default: the shown Render's photo, else photo 1). */
  photoId: string | null;
  online: boolean;
  /** A POST is in flight. */
  starting: boolean;
  /** Page alert from the last start attempt. */
  alert: 'none' | 'queueFull' | 'startFailed';
}

export const INITIAL_RESULTS_STATE: ResultsState = {
  load: 'loading',
  project: null,
  renders: [],
  maxRenders: 10,
  shownId: null,
  photoId: null,
  online: true,
  starting: false,
  alert: 'none',
};

export type ResultsAction =
  | { type: 'loaded'; project: KitchenProjectView; renders: RenderView[]; maxRenders: number }
  | { type: 'loadFailed'; kind: 'signedOut' | 'notFound' }
  | { type: 'rendersLoaded'; renders: RenderView[]; maxRenders: number }
  | { type: 'renderUpdated'; render: RenderView }
  | { type: 'startRequested' }
  | { type: 'startFinished'; render: RenderView | null; alert?: ResultsState['alert'] }
  | { type: 'photoSelected'; photoId: string }
  | { type: 'renderShown'; renderId: string }
  | { type: 'connectivity'; online: boolean };

export function isActive(render: RenderView | null | undefined): boolean {
  return render?.status === 'queued' || render?.status === 'running';
}

/** Puts `render` in the list (replacing the same id), newest first. */
function upsert(renders: RenderView[], render: RenderView): RenderView[] {
  const rest = renders.filter((candidate) => candidate.id !== render.id);
  return [render, ...rest].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

function withDefaults(state: ResultsState): ResultsState {
  const active = state.renders.find(isActive);
  const shown = (active ?? state.renders.find((render) => render.id === state.shownId) ?? state.renders[0]) || null;
  const photos = state.project?.photos ?? [];
  const photoId = state.photoId && photos.some((photo) => photo.id === state.photoId) ? state.photoId : (shown?.photoId ?? photos[0]?.id ?? null);
  return { ...state, shownId: shown?.id ?? null, photoId };
}

export function resultsReducer(state: ResultsState, action: ResultsAction): ResultsState {
  switch (action.type) {
    case 'loaded':
      return withDefaults({ ...state, load: 'ready', project: action.project, renders: action.renders, maxRenders: action.maxRenders, shownId: null, photoId: null });
    case 'loadFailed':
      return { ...state, load: action.kind };
    case 'rendersLoaded':
      return withDefaults({ ...state, renders: action.renders, maxRenders: action.maxRenders });
    case 'renderUpdated': {
      // The started Render stays the shown one when it finishes (startFinished selected it).
      return withDefaults({ ...state, renders: upsert(state.renders, action.render) });
    }
    case 'startRequested':
      return { ...state, starting: true, alert: 'none' };
    case 'startFinished':
      if (!action.render) return { ...state, starting: false, alert: action.alert ?? 'none' };
      return withDefaults({ ...state, starting: false, alert: 'none', renders: upsert(state.renders, action.render), shownId: action.render.id });
    case 'photoSelected':
      return { ...state, photoId: action.photoId };
    case 'renderShown':
      return isActive(activeRender(state)) ? state : withDefaults({ ...state, shownId: action.renderId });
    case 'connectivity':
      return { ...state, online: action.online };
  }
}

export function activeRender(state: ResultsState): RenderView | null {
  return state.renders.find(isActive) ?? null;
}

export function shownRender(state: ResultsState): RenderView | null {
  return state.renders.find((render) => render.id === state.shownId) ?? null;
}

/** Non-failed Renders: the history counter and the limit. */
export function keptCount(state: ResultsState): number {
  return state.renders.filter((render) => render.status !== 'failed').length;
}

/** Succeeded Renders: the history strip, newest first. */
export function historyRenders(state: ResultsState): RenderView[] {
  return state.renders.filter((render) => render.status === 'succeeded');
}

export type ResultsPhase = 'loading' | 'empty' | 'active' | 'failed' | 'succeeded';

export function resultsPhase(state: ResultsState): ResultsPhase {
  if (state.load !== 'ready') return 'loading';
  if (activeRender(state) || state.starting) return 'active';
  const shown = shownRender(state);
  if (!shown) return 'empty';
  return shown.status === 'failed' ? 'failed' : 'succeeded';
}

export function limitReached(state: ResultsState): boolean {
  return keptCount(state) >= state.maxRenders;
}

/** The primary CTA can start a Render. */
export function canStart(state: ResultsState): boolean {
  return state.load === 'ready' && state.online && !state.starting && !activeRender(state) && !limitReached(state) && (state.project?.photos.length ?? 0) > 0;
}

/** Photo of the next Render: "Try again" keeps the failed Render's photo, otherwise the picked one. */
export function nextPhotoId(state: ResultsState): string | null {
  const shown = shownRender(state);
  if (resultsPhase(state) === 'failed' && shown?.photoId) return shown.photoId;
  return state.photoId;
}

/** 1-based number of a photo in the project (photo 1 when unknown). */
export function photoNumber(state: ResultsState, photoId: string | null): number {
  const index = state.project?.photos.findIndex((photo) => photo.id === photoId) ?? -1;
  return index >= 0 ? index + 1 : 1;
}

/** Jobs ahead in the GPU queue for the queued status line; null hides it (unknown or 0). */
export function jobsAhead(render: RenderView | null): number | null {
  return render?.status === 'queued' && typeof render.position === 'number' && render.position > 0 ? render.position : null;
}

/** Strips `claimed` and `start` from the results URL; returns whether a Render should start. */
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
 * Polls one active Render (first after `firstDelayMs`, then every `intervalMs`) until `fetchOnce` returns a terminal Render, or
 * `stop()` is called (offline, unmount). One request at a time: the next poll is scheduled after
 * the previous answer arrives. Failed requests keep polling.
 */
export function startPolling(options: {
  fetchOnce: () => Promise<RenderView | null>;
  onRender: (render: RenderView) => void;
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
