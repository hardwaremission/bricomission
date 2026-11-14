import type { SimulationStage } from '@bricomission/shared-types';
import type { NewRender, RenderRecord } from '../../src/kitchen-projects/renders/render.repository.js';
import {
  isReady,
  type NewSimulation,
  type RetryResult,
  type SelectResult,
  type SimulationAggregate,
  type SimulationRecord,
  type SimulationRepository,
  type StyleResult,
} from '../../src/kitchen-projects/simulations/simulations.repository.js';
import type { MemoryBudgetRepository } from './memory-budget-repository.js';
import type { MemoryRenderRepository } from './memory-render-repository.js';

/** In-memory SimulationRepository with the Prisma implementation's semantics (single process, no lock needed). */
export class MemorySimulationRepository implements SimulationRepository {
  readonly rows = new Map<string, SimulationRecord>();
  failNext: Error | null = null;

  constructor(
    readonly renders: MemoryRenderRepository,
    readonly budgets: MemoryBudgetRepository,
  ) {}

  async createQueued(simulation: NewSimulation, renders: NewRender[]): Promise<SimulationAggregate | 'in_progress'> {
    this.maybeFail();
    const mine = this.ofProject(simulation.kitchenProjectId);
    if (mine.some((row) => row.stage !== 'finished')) return 'in_progress';
    const ordinal = Math.max(0, ...mine.map((row) => row.ordinal)) + 1;
    const row: SimulationRecord = { ...simulation, ordinal, stage: 'describing', selected: false, updatedAt: simulation.createdAt };
    this.rows.set(row.id, row);
    for (const render of renders) this.renders.insert(render);
    return this.aggregate(row);
  }

  /** Adds a finished Simulation with Renders in the given statuses (test seeding); returns it. */
  seed(simulation: Partial<SimulationRecord> & { id: string; kitchenProjectId: string }, renders: RenderRecord[] = []): SimulationAggregate {
    const row: SimulationRecord = {
      ordinal: Math.max(0, ...this.ofProject(simulation.kitchenProjectId).map((r) => r.ordinal)) + 1,
      styleSeed: 1,
      blendMode: 'both',
      styleWeights: null,
      styleText: '',
      styleKeywords: [],
      styleDegraded: false,
      stage: 'finished',
      selected: false,
      createdAt: new Date('2026-11-15T09:00:00.000Z'),
      updatedAt: new Date('2026-11-15T09:00:00.000Z'),
      ...simulation,
    };
    this.rows.set(row.id, row);
    for (const render of renders) this.renders.rows.set(render.id, { ...render });
    return this.aggregate(row);
  }

  async countByProject(projectId: string): Promise<number> {
    this.maybeFail();
    return this.ofProject(projectId).length;
  }

  async hasActive(projectId: string): Promise<boolean> {
    this.maybeFail();
    return this.ofProject(projectId).some((row) => row.stage !== 'finished');
  }

  async listByProject(projectId: string): Promise<SimulationAggregate[]> {
    this.maybeFail();
    return this.ofProject(projectId)
      .sort((a, b) => b.ordinal - a.ordinal)
      .map((row) => this.aggregate(row));
  }

  async find(projectId: string, simulationId: string): Promise<SimulationAggregate | null> {
    this.maybeFail();
    const row = this.rows.get(simulationId);
    return row && row.kitchenProjectId === projectId ? this.aggregate(row) : null;
  }

  async findSelected(projectId: string): Promise<SimulationAggregate | null> {
    this.maybeFail();
    const row = this.ofProject(projectId).find((candidate) => candidate.selected);
    return row ? this.aggregate(row) : null;
  }

  async setStage(id: string, stage: SimulationStage, updatedAt: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) Object.assign(row, { stage, updatedAt });
  }

  async setStyle(id: string, style: StyleResult, updatedAt: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    Object.assign(row, { styleText: style.styleText, styleKeywords: style.styleKeywords, styleDegraded: style.styleDegraded, updatedAt });
    for (const render of this.renders.rows.values()) if (render.simulationId === id && render.status === 'queued') render.prompt = style.prompt;
  }

  async beginRetry(projectId: string, simulationId: string, renderId: string, at: Date): Promise<RetryResult> {
    this.maybeFail();
    const render = this.renders.rows.get(renderId);
    if (render?.simulationId !== simulationId || render.kitchenProjectId !== projectId) return 'not_found';
    if (this.ofProject(projectId).some((row) => row.stage !== 'finished')) return 'in_progress';
    if (render.status !== 'failed') return 'not_failed';
    Object.assign(render, { status: 'queued', errorCode: null, finishedAt: null, startedAt: null, gpuJobId: null, seconds: null, attempts: render.attempts + 1 });
    const row = this.rows.get(simulationId) as SimulationRecord;
    Object.assign(row, { stage: 'rendering', updatedAt: at });
    return this.aggregate(row);
  }

  async select(projectId: string, simulationId: string | null, at: Date): Promise<SelectResult> {
    this.maybeFail();
    if (simulationId === null) {
      for (const row of this.ofProject(projectId)) if (row.selected) Object.assign(row, { selected: false, updatedAt: at });
      return 'ok';
    }
    const target = this.rows.get(simulationId);
    if (target?.kitchenProjectId !== projectId) return 'not_found';
    if (!isReady(this.aggregate(target))) return 'not_ready';
    for (const row of this.ofProject(projectId)) if (row.selected && row.id !== simulationId) Object.assign(row, { selected: false, updatedAt: at });
    Object.assign(target, { selected: true, updatedAt: at });
    return 'ok';
  }

  async delete(projectId: string, simulationId: string): Promise<void> {
    const row = this.rows.get(simulationId);
    if (row?.kitchenProjectId !== projectId) return;
    this.rows.delete(simulationId);
    for (const render of [...this.renders.rows.values()]) if (render.simulationId === simulationId) this.renders.rows.delete(render.id);
    for (const budget of [...this.budgets.rows.values()]) if (budget.simulationId === simulationId) this.budgets.rows.delete(budget.id);
  }

  async recoverInterrupted(finishedAt: Date): Promise<number> {
    this.maybeFail();
    let count = 0;
    for (const render of this.renders.rows.values()) {
      if (render.status === 'queued' || render.status === 'running') {
        Object.assign(render, { status: 'failed', errorCode: 'interrupted', finishedAt });
        count++;
      }
    }
    for (const row of this.rows.values()) if (row.stage !== 'finished') Object.assign(row, { stage: 'finished', updatedAt: finishedAt });
    return count;
  }

  private ofProject(projectId: string): SimulationRecord[] {
    return [...this.rows.values()].filter((row) => row.kitchenProjectId === projectId);
  }

  private aggregate(row: SimulationRecord): SimulationAggregate {
    const renders = [...this.renders.rows.values()]
      .filter((render) => render.simulationId === row.id)
      .sort((a, b) => a.photoPosition - b.photoPosition || a.createdAt.getTime() - b.createdAt.getTime())
      .map((render) => ({ ...render }));
    const budgets = [...this.budgets.rows.values()].filter((budget) => budget.simulationId === row.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const budget = budgets.find((b) => b.status === 'succeeded') ?? budgets.find((b) => b.status === 'queued' || b.status === 'running');
    return { ...row, styleWeights: row.styleWeights ? row.styleWeights.map((entry) => ({ ...entry })) : null, styleKeywords: [...row.styleKeywords], renders, budget: budget ? { id: budget.id, status: budget.status } : null };
  }

  private maybeFail() {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }
}
