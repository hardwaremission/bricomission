import { describe, expect, it } from 'vitest';
import {
  budgetButton,
  cardThumbs,
  editBlock,
  failedCount,
  formatSimulationDate,
  isSelectable,
  measurementsLabel,
  projectReady,
  selectedSimulation,
  showInstruction,
  withSelection,
  withoutSimulation,
} from '../src/lib/simulations/project-simulations';
import type { RenderView, SimulationView } from '../src/lib/simulations/simulation-state';

function render(n: number, status: RenderView['status']): RenderView {
  return { id: `r${n}`, status, photoPosition: n, thumbUrl: status === 'succeeded' ? `/t/${n}` : null } as unknown as RenderView;
}

function sim(ordinal: number, overrides: Partial<SimulationView> = {}, renders: RenderView[] = [render(0, 'succeeded')]): SimulationView {
  return { id: `s${ordinal}`, ordinal, status: 'succeeded', selected: false, budget: null, renders, ...overrides } as unknown as SimulationView;
}

describe('project-simulations', () => {
  it('only a fully succeeded Simulation is selectable', () => {
    expect(isSelectable(sim(1))).toBe(true);
    for (const status of ['active', 'partial', 'failed'] as const) expect(isSelectable(sim(1, { status }))).toBe(false);
  });

  it('budget button: disabled without a selected succeeded Simulation, get, see, computing', () => {
    expect(budgetButton([])).toEqual({ kind: 'disabled' });
    expect(budgetButton([sim(1)])).toEqual({ kind: 'disabled' });
    expect(budgetButton([sim(1, { selected: true, status: 'partial' })])).toEqual({ kind: 'disabled' });
    expect(budgetButton([sim(2, { selected: true })])).toEqual({ kind: 'get', simulationId: 's2' });
    expect(budgetButton([sim(2, { selected: true, budget: { id: 'b', status: 'failed' } })])).toEqual({ kind: 'get', simulationId: 's2' });
    expect(budgetButton([sim(2, { selected: true, budget: { id: 'b', status: 'succeeded' } })])).toEqual({ kind: 'see', simulationId: 's2' });
    expect(budgetButton([sim(2, { selected: true, budget: { id: 'b', status: 'running' } })])).toEqual({ kind: 'computing', simulationId: 's2' });
    expect(budgetButton([sim(2, { selected: true, budget: { id: 'b', status: 'queued' } })])).toEqual({ kind: 'computing', simulationId: 's2' });
  });

  it('edits are blocked while a Simulation or a Budget is active', () => {
    expect(editBlock([sim(1)])).toBeNull();
    expect(editBlock([sim(1), sim(2, { status: 'active' })])).toBe('simulation');
    expect(editBlock([sim(1, { budget: { id: 'b', status: 'running' } })])).toBe('budget');
    expect(editBlock([sim(1, { budget: { id: 'b', status: 'succeeded' } })])).toBeNull();
  });

  it('the instruction shows only with Simulations and no selection', () => {
    expect(showInstruction([])).toBe(false);
    expect(showInstruction([sim(1)])).toBe(true);
    expect(showInstruction([sim(1, { selected: true })])).toBe(false);
  });

  it('thumbnails: the first three succeeded Renders and the rest as +n', () => {
    const renders = [0, 1, 2, 3, 4, 5].map((n) => render(n, n === 1 ? 'failed' : 'succeeded'));
    const { shown, more } = cardThumbs(sim(1, {}, renders));
    expect(shown.map((thumb) => thumb.id)).toEqual(['r0', 'r2', 'r3']);
    expect(more).toBe(2);
    expect(failedCount(sim(1, {}, renders))).toBe(1);
  });

  it('selection and removal are applied to the list', () => {
    const list = [sim(2), sim(1, { selected: true })];
    expect(selectedSimulation(list)?.id).toBe('s1');
    expect(selectedSimulation(withSelection(list, 's2'))?.id).toBe('s2');
    expect(withSelection(list, 's2').filter((simulation) => simulation.selected)).toHaveLength(1);
    expect(selectedSimulation(withSelection(list, null))).toBeNull();
    expect(withoutSimulation(list, 's1').map((simulation) => simulation.id)).toEqual(['s2']);
    expect(withSelection(list, 's1')[1]).toBe(list[1]);
  });

  it('formats measurements in cm and the card date, and checks readiness', () => {
    expect(measurementsLabel({ lengthCm: 420, widthCm: 310, heightCm: 250 })).toBe('420 x 310 x 250 cm');
    expect(measurementsLabel({ lengthCm: 420, widthCm: null, heightCm: 250 })).toBeNull();
    expect(measurementsLabel(null)).toBeNull();
    expect(formatSimulationDate('2026-11-14T17:19:00.000Z', 'en')).toMatch(/Nov/);
    const project = { photos: [{}], measurements: { lengthCm: 420, widthCm: 310, heightCm: 250 } };
    expect(projectReady(project)).toBe(true);
    expect(projectReady({ ...project, photos: [] })).toBe(false);
    expect(projectReady({ ...project, measurements: { lengthCm: null, widthCm: 1, heightCm: 1 } })).toBe(false);
    expect(projectReady(null)).toBe(false);
  });
});
