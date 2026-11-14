import type { SimulationView } from './simulation-state';

/**
 * Pure rules of the owned project page (docs/design/simulations-ux-overhaul.md, S7 and S8):
 * "My simulations", the budget button, the edit entries and the Generate button. The component
 * owns the effects; this module only derives what to show from the API's Simulations.
 */

/** Photos shown on a card before the `+n` cell. */
export const CARD_THUMBS = 3;

export const isActive = (simulation: SimulationView): boolean => simulation.status === 'active';

/** A Simulation can be selected (and priced) only when every Render succeeded. */
export const isSelectable = (simulation: SimulationView): boolean => simulation.status === 'succeeded';

export const selectedSimulation = (simulations: SimulationView[]): SimulationView | null => simulations.find((simulation) => simulation.selected) ?? null;

export const activeSimulation = (simulations: SimulationView[]): SimulationView | null => simulations.find(isActive) ?? null;

/** A Budget is queued or running for any Simulation (one per project at a time). */
export const hasActiveBudget = (simulations: SimulationView[]): boolean =>
  simulations.some((simulation) => simulation.budget?.status === 'queued' || simulation.budget?.status === 'running');

/** Why the three edit entries are disabled (`null` = editable). The API answers 409 for both. */
export function editBlock(simulations: SimulationView[]): 'simulation' | 'budget' | null {
  if (activeSimulation(simulations)) return 'simulation';
  return hasActiveBudget(simulations) ? 'budget' : null;
}

export type BudgetButton =
  /** No selected, fully succeeded Simulation. */
  | { kind: 'disabled' }
  /** Selected, no current Budget (or a failed one): starts one. */
  | { kind: 'get'; simulationId: string }
  /** Current Budget exists. */
  | { kind: 'see'; simulationId: string }
  /** Budget queued or running. */
  | { kind: 'computing'; simulationId: string };

export function budgetButton(simulations: SimulationView[]): BudgetButton {
  const selected = selectedSimulation(simulations);
  if (!selected || !isSelectable(selected)) return { kind: 'disabled' };
  const status = selected.budget?.status;
  if (status === 'succeeded') return { kind: 'see', simulationId: selected.id };
  if (status === 'queued' || status === 'running') return { kind: 'computing', simulationId: selected.id };
  return { kind: 'get', simulationId: selected.id };
}

/** The instruction alert shows while nothing is selected (and there is something to select). */
export const showInstruction = (simulations: SimulationView[]): boolean => simulations.length > 0 && !selectedSimulation(simulations);

/** Failed Renders of a Simulation. */
export const failedCount = (simulation: SimulationView): number => simulation.renders.filter((render) => render.status === 'failed').length;

/** Thumbnails of the succeeded Renders: the first three and how many more there are. */
export function cardThumbs(simulation: SimulationView): { shown: Array<{ id: string; thumbUrl: string }>; more: number } {
  const thumbs = simulation.renders.flatMap((render) => (render.status === 'succeeded' && render.thumbUrl ? [{ id: render.id, thumbUrl: render.thumbUrl }] : []));
  return { shown: thumbs.slice(0, CARD_THUMBS), more: Math.max(0, thumbs.length - CARD_THUMBS) };
}

/** Puts the selection on `simulationId` (null clears it) without another round trip. */
export function withSelection(simulations: SimulationView[], simulationId: string | null): SimulationView[] {
  return simulations.map((simulation) => (simulation.selected === (simulation.id === simulationId) ? simulation : { ...simulation, selected: simulation.id === simulationId }));
}

/** Removes a deleted Simulation (a deleted selected one leaves no selection). */
export const withoutSimulation = (simulations: SimulationView[], simulationId: string): SimulationView[] => simulations.filter((simulation) => simulation.id !== simulationId);

/** Card meta date, e.g. "14 Nov, 17:19" (locale style). */
export function formatSimulationDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Measurements row of the summary card: `420 x 310 x 250 cm`, or null while one value is missing. */
export function measurementsLabel(measurements: { lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null } | null): string | null {
  const { lengthCm, widthCm, heightCm } = measurements ?? {};
  if (lengthCm == null || widthCm == null || heightCm == null) return null;
  return `${lengthCm} x ${widthCm} x ${heightCm} cm`;
}

/** A project can start a Simulation: at least one photo and all three measurements. */
export function projectReady(project: { photos: unknown[]; measurements: { lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null } } | null): boolean {
  return project !== null && project.photos.length > 0 && measurementsLabel(project.measurements) !== null;
}
