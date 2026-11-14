import type { components } from '@bricomission/api-client';
import type { KitchenProjectView } from '../kitchen-draft/types';

/** API contract types (generated from openapi.json). */
export type SimulationView = components['schemas']['SimulationViewDto'];
export type RenderView = components['schemas']['RenderViewDto'];

/** Slider position on first load (0-100); kept while another Render or Simulation is shown. */
export const SLIDER_START = 50;

export interface ResultsState {
  load: 'loading' | 'ready' | 'signedOut' | 'notFound';
  project: KitchenProjectView | null;
  /** Newest first. */
  simulations: SimulationView[];
  /** Simulation shown (default: the active one, else the newest). */
  shownSimulationId: string | null;
  /** Render shown in the slider (always a succeeded Render of the shown Simulation, or null). */
  shownRenderId: string | null;
  /** Photo position of the last Render the person picked: kept while another Simulation (even a running one) is shown. */
  shownPosition: number;
  /** Before/after position: state of the page, not of the image. */
  sliderValue: number;
  online: boolean;
  /** A POST is in flight. */
  starting: boolean;
  /** Page alert from the last start attempt. */
  alert: 'none' | 'queueFull' | 'startFailed';
  /** Failed Render ids still to retry one after the other ("Try again" retries every failed Render). */
  retryQueue: string[];
}

export const INITIAL_RESULTS_STATE: ResultsState = {
  load: 'loading',
  project: null,
  simulations: [],
  shownSimulationId: null,
  shownRenderId: null,
  shownPosition: 0,
  sliderValue: SLIDER_START,
  online: true,
  starting: false,
  alert: 'none',
  retryQueue: [],
};

export type ResultsAction =
  | { type: 'loaded'; project: KitchenProjectView; simulations: SimulationView[] }
  | { type: 'loadFailed'; kind: 'signedOut' | 'notFound' }
  | { type: 'simulationsLoaded'; simulations: SimulationView[] }
  | { type: 'simulationUpdated'; simulation: SimulationView }
  | { type: 'startRequested' }
  | { type: 'startFinished'; simulation: SimulationView | null; alert?: ResultsState['alert'] }
  | { type: 'simulationShown'; simulationId: string }
  | { type: 'renderShown'; renderId: string }
  | { type: 'sliderMoved'; value: number }
  | { type: 'retryQueued'; renderIds: string[] }
  | { type: 'retryShifted' }
  | { type: 'connectivity'; online: boolean };

export function isSimulationActive(simulation: { status: string } | null | undefined): boolean {
  return simulation?.status === 'active';
}

const clampSlider = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** Puts `simulation` in the list (replacing the same id), newest (highest ordinal) first. */
function upsert(simulations: SimulationView[], simulation: SimulationView): SimulationView[] {
  const rest = simulations.filter((candidate) => candidate.id !== simulation.id);
  return [simulation, ...rest].sort((a, b) => b.ordinal - a.ordinal);
}

const succeededRenders = (simulation: SimulationView | null | undefined) => (simulation?.renders ?? []).filter((render) => render.status === 'succeeded' && render.fullUrl);

/** Resolves the shown Simulation and Render after any change. The slider value is never touched. */
function withDefaults(state: ResultsState): ResultsState {
  const active = state.simulations.find(isSimulationActive);
  const shownSimulation = (active ?? state.simulations.find((simulation) => simulation.id === state.shownSimulationId) ?? state.simulations[0]) || null;
  const candidates = succeededRenders(shownSimulation);
  const shownRender =
    candidates.find((render) => render.id === state.shownRenderId) ??
    // Switching Simulation keeps the same photo when that Render exists there.
    candidates.find((render) => render.photoPosition === state.shownPosition) ??
    candidates[0] ??
    null;
  return { ...state, shownSimulationId: shownSimulation?.id ?? null, shownRenderId: shownRender?.id ?? null };
}

export function resultsReducer(state: ResultsState, action: ResultsAction): ResultsState {
  switch (action.type) {
    case 'loaded':
      return withDefaults({ ...state, load: 'ready', project: action.project, simulations: sorted(action.simulations), shownSimulationId: null, shownRenderId: null, shownPosition: 0 });
    case 'loadFailed':
      return { ...state, load: action.kind };
    case 'simulationsLoaded':
      return withDefaults({ ...state, simulations: sorted(action.simulations) });
    case 'simulationUpdated':
      return withDefaults({ ...state, simulations: upsert(state.simulations, action.simulation) });
    case 'startRequested':
      return { ...state, starting: true, alert: 'none' };
    case 'startFinished':
      if (!action.simulation) return { ...state, starting: false, alert: action.alert ?? 'none' };
      return withDefaults({ ...state, starting: false, alert: 'none', simulations: upsert(state.simulations, action.simulation), shownSimulationId: action.simulation.id });
    case 'simulationShown':
      return activeSimulation(state) ? state : withDefaults({ ...state, shownSimulationId: action.simulationId });
    case 'renderShown': {
      const picked = state.simulations.flatMap((simulation) => simulation.renders).find((candidate) => candidate.id === action.renderId);
      return withDefaults({ ...state, shownRenderId: action.renderId, shownPosition: picked?.photoPosition ?? state.shownPosition });
    }
    case 'sliderMoved':
      return { ...state, sliderValue: clampSlider(action.value) };
    case 'retryQueued':
      return { ...state, retryQueue: action.renderIds };
    case 'retryShifted':
      return { ...state, retryQueue: state.retryQueue.slice(1) };
    case 'connectivity':
      return { ...state, online: action.online };
  }
}

function sorted(simulations: SimulationView[]): SimulationView[] {
  return [...simulations].sort((a, b) => b.ordinal - a.ordinal);
}

export function activeSimulation(state: ResultsState): SimulationView | null {
  return state.simulations.find(isSimulationActive) ?? null;
}

export function shownSimulation(state: ResultsState): SimulationView | null {
  return state.simulations.find((simulation) => simulation.id === state.shownSimulationId) ?? null;
}

export function shownRender(state: ResultsState): RenderView | null {
  return shownSimulation(state)?.renders.find((render) => render.id === state.shownRenderId) ?? null;
}

export type ResultsPhase = 'loading' | 'empty' | 'active' | 'failed' | 'partial' | 'succeeded';

export function resultsPhase(state: ResultsState): ResultsPhase {
  if (state.load !== 'ready') return 'loading';
  if (activeSimulation(state) || state.starting) return 'active';
  const shown = shownSimulation(state);
  if (!shown) return 'empty';
  return shown.status === 'failed' ? 'failed' : shown.status === 'partial' ? 'partial' : 'succeeded';
}

/** The primary CTA can start a Simulation. */
export function canStart(state: ResultsState): boolean {
  return state.load === 'ready' && state.online && !state.starting && !activeSimulation(state) && (state.project?.photos.length ?? 0) > 0;
}

/** Retry buttons work only while nothing runs (the API answers 409 otherwise). */
export function canRetry(state: ResultsState): boolean {
  return state.load === 'ready' && state.online && !state.starting && !activeSimulation(state);
}

/** Failed Renders of a Simulation, in Photo order. */
export function failedRenders(simulation: SimulationView | null | undefined): RenderView[] {
  return (simulation?.renders ?? []).filter((render) => render.status === 'failed');
}

/** Every Render of a failed Simulation was interrupted (API restart). */
export function isInterrupted(simulation: SimulationView | null | undefined): boolean {
  const failed = failedRenders(simulation);
  return failed.length > 0 && failed.every((render) => render.errorCode === 'interrupted');
}

/** "Rendering {n} of {count}": n is the Render being generated (1-based), at least 1 while rendering. */
export function progressNumbers(simulation: SimulationView): { n: number; count: number; percent: number } {
  const count = Math.max(simulation.progress.total, 1);
  const done = simulation.progress.succeeded + simulation.progress.failed;
  const n = Math.min(count, Math.max(1, simulation.progress.current > 0 ? simulation.progress.current : done + 1));
  return { n, count, percent: Math.round((n / count) * 100) };
}

/** Stage of the status card: studying references, waiting for the GPU (nothing rendered yet), or rendering. */
export function activeStage(simulation: SimulationView | null): 'describing' | 'queued' | 'rendering' {
  if (!simulation) return 'queued';
  if (simulation.stage === 'describing') return 'describing';
  return simulation.progress.current === 0 && simulation.progress.succeeded + simulation.progress.failed === 0 ? 'queued' : 'rendering';
}

/** Jobs ahead in the GPU queue for the queued status line; null hides it (unknown or 0). */
export function jobsAhead(simulation: SimulationView | null): number | null {
  const waiting = simulation?.renders.find((render) => render.status === 'queued' && typeof render.position === 'number' && render.position > 0);
  return waiting?.position ?? null;
}

/** Counts of the style references: distinct gallery styles (id prefix) and own photos. */
export function styleSources(simulation: SimulationView): { styles: string[]; uploads: number } {
  const styles: string[] = [];
  let uploads = 0;
  for (const reference of simulation.style.references) {
    if (reference.kind === 'upload') {
      uploads += 1;
      continue;
    }
    const styleId = reference.refId.replace(/-\d+$/, '');
    if (!styles.includes(styleId)) styles.push(styleId);
  }
  return { styles, uploads };
}

/** 1-based position of a Render's photo within its Simulation. */
export function photoNumber(render: RenderView | null): number {
  return (render?.photoPosition ?? 0) + 1;
}
