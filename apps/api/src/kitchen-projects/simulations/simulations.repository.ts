import { Injectable } from '@nestjs/common';
import type { BudgetStatus, SimulationStage, StyleBlendMode } from '@bricomission/shared-types';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type NewRender, type RenderRecord, toRenderRecord } from '../renders/render.repository.js';

/** One reference of the calculated style with its blend weight (stored in `simulation.style_weights`). */
export interface StoredStyleWeight {
  kind: 'gallery' | 'upload';
  refId: string;
  weight: number;
}

/** A `simulation` row. `styleSeed` and `styleWeights` are internal provenance, never returned. */
export interface SimulationRecord {
  id: string;
  kitchenProjectId: string;
  ordinal: number;
  styleSeed: number;
  blendMode: StyleBlendMode;
  /** Null for a Simulation migrated from the single-Render model. */
  styleWeights: StoredStyleWeight[] | null;
  styleText: string;
  styleKeywords: string[];
  styleDegraded: boolean;
  stage: SimulationStage;
  selected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A Simulation with its Renders (in Photo order) and its Budget, if any. */
export interface SimulationAggregate extends SimulationRecord {
  renders: RenderRecord[];
  budget: { id: string; status: BudgetStatus } | null;
}

export type NewSimulation = Pick<
  SimulationRecord,
  'id' | 'kitchenProjectId' | 'styleSeed' | 'blendMode' | 'styleWeights' | 'styleText' | 'styleKeywords' | 'styleDegraded' | 'createdAt'
>;

export interface StyleResult {
  styleText: string;
  styleKeywords: string[];
  styleDegraded: boolean;
  /** The full positive prompt every queued Render of the Simulation now uses. */
  prompt: string;
}

export type SelectResult = 'ok' | 'not_found' | 'not_ready';
export type RetryResult = SimulationAggregate | 'not_found' | 'not_failed' | 'in_progress';

/** True when every Render of a finished Simulation succeeded (the only selectable, budget-eligible state). */
export function isReady(simulation: Pick<SimulationAggregate, 'stage' | 'renders'>): boolean {
  return simulation.stage === 'finished' && simulation.renders.length > 0 && simulation.renders.every((render) => render.status === 'succeeded');
}

/**
 * Persistence of Simulations and their Renders. Tests use an in-memory implementation with the
 * same semantics. "Active" = stage is not `finished`; at most one active Simulation per project.
 */
export interface SimulationRepository {
  /**
   * Under the project row lock: `in_progress` when the project has an active Simulation, else
   * inserts the Simulation (ordinal = max + 1, never reused) and its queued Renders.
   */
  createQueued(simulation: NewSimulation, renders: NewRender[]): Promise<SimulationAggregate | 'in_progress'>;
  /** Number of Simulations ever created and still stored for the project (0 = the next one is the first). */
  countByProject(projectId: string): Promise<number>;
  /** True when the project has a Simulation that is not `finished`. */
  hasActive(projectId: string): Promise<boolean>;
  /** Newest first. */
  listByProject(projectId: string): Promise<SimulationAggregate[]>;
  find(projectId: string, simulationId: string): Promise<SimulationAggregate | null>;
  findSelected(projectId: string): Promise<SimulationAggregate | null>;
  setStage(id: string, stage: SimulationStage, updatedAt: Date): Promise<void>;
  /** Stores the merged style and rewrites the prompt of the Simulation's queued Renders. */
  setStyle(id: string, style: StyleResult, updatedAt: Date): Promise<void>;
  /**
   * Under the project row lock: refuses when another Simulation is active or the Render did not
   * fail; else resets the Render to `queued` (attempts + 1, error cleared) and the Simulation to `rendering`.
   */
  beginRetry(projectId: string, simulationId: string, renderId: string, at: Date): Promise<RetryResult>;
  /** Selects `simulationId` (clearing any other) or clears the selection (null). `not_ready` unless finished with every Render succeeded. */
  select(projectId: string, simulationId: string | null, at: Date): Promise<SelectResult>;
  /** Deletes the Simulation; Renders and Budgets cascade. */
  delete(projectId: string, simulationId: string): Promise<void>;
  /** Start-up recovery: active Renders become `failed`/`interrupted`, unfinished Simulations `finished`. Returns the Render count. */
  recoverInterrupted(finishedAt: Date): Promise<number>;
}

export const SIMULATION_REPOSITORY = Symbol('SIMULATION_REPOSITORY');

const RENDER_ACTIVE = ['queued', 'running'] as const;

type AggregateRow = {
  id: string;
  kitchenProjectId: string;
  ordinal: number;
  styleSeed: number;
  blendMode: StyleBlendMode;
  styleWeights: unknown;
  styleText: string;
  styleKeywords: unknown;
  styleDegraded: boolean;
  stage: SimulationStage;
  selected: boolean;
  createdAt: Date;
  updatedAt: Date;
  renders: Parameters<typeof toRenderRecord>[0][];
  budgets: { id: string; status: BudgetStatus; createdAt: Date }[];
};

const INCLUDE = {
  renders: { orderBy: [{ photoPosition: 'asc' }, { createdAt: 'asc' }] },
  budgets: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.SimulationInclude;

function toWeights(value: unknown): StoredStyleWeight[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry): StoredStyleWeight[] => {
    const item = entry as Partial<StoredStyleWeight> | null;
    return item && (item.kind === 'gallery' || item.kind === 'upload') && typeof item.refId === 'string' && typeof item.weight === 'number'
      ? [{ kind: item.kind, refId: item.refId, weight: item.weight }]
      : [];
  });
}

function toAggregate(row: AggregateRow): SimulationAggregate {
  // Current Budget: the succeeded one, else the newest active one (failed Budgets are not shown).
  const budget = row.budgets.find((b) => b.status === 'succeeded') ?? row.budgets.find((b) => b.status === 'queued' || b.status === 'running');
  return {
    id: row.id,
    kitchenProjectId: row.kitchenProjectId,
    ordinal: row.ordinal,
    styleSeed: row.styleSeed,
    blendMode: row.blendMode,
    styleWeights: toWeights(row.styleWeights),
    styleText: row.styleText,
    styleKeywords: Array.isArray(row.styleKeywords) ? row.styleKeywords.filter((k): k is string => typeof k === 'string') : [],
    styleDegraded: row.styleDegraded,
    stage: row.stage,
    selected: row.selected,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    renders: row.renders.map(toRenderRecord),
    budget: budget ? { id: budget.id, status: budget.status } : null,
  };
}

@Injectable()
export class PrismaSimulationRepository implements SimulationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createQueued(simulation: NewSimulation, renders: NewRender[]): Promise<SimulationAggregate | 'in_progress'> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent Simulation requests of the same project.
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${simulation.kitchenProjectId}::uuid FOR UPDATE`;
      const active = await tx.simulation.count({ where: { kitchenProjectId: simulation.kitchenProjectId, stage: { not: 'finished' } } });
      if (active > 0) return 'in_progress' as const;
      const last = await tx.simulation.aggregate({ where: { kitchenProjectId: simulation.kitchenProjectId }, _max: { ordinal: true } });
      await tx.simulation.create({
        data: {
          ...simulation,
          styleWeights: simulation.styleWeights as never,
          styleKeywords: simulation.styleKeywords as never,
          ordinal: (last._max.ordinal ?? 0) + 1,
          stage: 'describing',
          updatedAt: simulation.createdAt,
        },
      });
      await tx.kitchenRender.createMany({ data: renders.map((render) => ({ ...render, status: 'queued' as const })) });
      return toAggregate((await tx.simulation.findUniqueOrThrow({ where: { id: simulation.id }, include: INCLUDE })) as AggregateRow);
    });
  }

  countByProject(projectId: string): Promise<number> {
    return this.prisma.simulation.count({ where: { kitchenProjectId: projectId } });
  }

  async hasActive(projectId: string): Promise<boolean> {
    return (await this.prisma.simulation.count({ where: { kitchenProjectId: projectId, stage: { not: 'finished' } } })) > 0;
  }

  async listByProject(projectId: string): Promise<SimulationAggregate[]> {
    const rows = await this.prisma.simulation.findMany({ where: { kitchenProjectId: projectId }, orderBy: [{ ordinal: 'desc' }], include: INCLUDE });
    return (rows as AggregateRow[]).map(toAggregate);
  }

  async find(projectId: string, simulationId: string): Promise<SimulationAggregate | null> {
    const row = await this.prisma.simulation.findFirst({ where: { id: simulationId, kitchenProjectId: projectId }, include: INCLUDE });
    return row ? toAggregate(row as AggregateRow) : null;
  }

  async findSelected(projectId: string): Promise<SimulationAggregate | null> {
    const row = await this.prisma.simulation.findFirst({ where: { kitchenProjectId: projectId, selected: true }, include: INCLUDE });
    return row ? toAggregate(row as AggregateRow) : null;
  }

  async setStage(id: string, stage: SimulationStage, updatedAt: Date): Promise<void> {
    await this.prisma.simulation.updateMany({ where: { id }, data: { stage, updatedAt } });
  }

  async setStyle(id: string, style: StyleResult, updatedAt: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.simulation.updateMany({
        where: { id },
        data: { styleText: style.styleText, styleKeywords: style.styleKeywords as never, styleDegraded: style.styleDegraded, updatedAt },
      }),
      this.prisma.kitchenRender.updateMany({ where: { simulationId: id, status: 'queued' }, data: { prompt: style.prompt } }),
    ]);
  }

  beginRetry(projectId: string, simulationId: string, renderId: string, at: Date): Promise<RetryResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${projectId}::uuid FOR UPDATE`;
      const render = await tx.kitchenRender.findFirst({ where: { id: renderId, simulationId, kitchenProjectId: projectId } });
      if (!render) return 'not_found' as const;
      const active = await tx.simulation.count({ where: { kitchenProjectId: projectId, stage: { not: 'finished' } } });
      if (active > 0) return 'in_progress' as const;
      if (render.status !== 'failed') return 'not_failed' as const;
      await tx.kitchenRender.update({
        where: { id: renderId },
        data: { status: 'queued', errorCode: null, finishedAt: null, startedAt: null, gpuJobId: null, seconds: null, attempts: { increment: 1 } },
      });
      await tx.simulation.update({ where: { id: simulationId }, data: { stage: 'rendering', updatedAt: at } });
      return toAggregate((await tx.simulation.findUniqueOrThrow({ where: { id: simulationId }, include: INCLUDE })) as AggregateRow);
    });
  }

  select(projectId: string, simulationId: string | null, at: Date): Promise<SelectResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${projectId}::uuid FOR UPDATE`;
      if (simulationId === null) {
        await tx.simulation.updateMany({ where: { kitchenProjectId: projectId, selected: true }, data: { selected: false, updatedAt: at } });
        return 'ok' as const;
      }
      const row = await tx.simulation.findFirst({ where: { id: simulationId, kitchenProjectId: projectId }, include: { renders: { select: { status: true } } } });
      if (!row) return 'not_found' as const;
      if (!isReady({ stage: row.stage, renders: row.renders as RenderRecord[] })) return 'not_ready' as const;
      await tx.simulation.updateMany({ where: { kitchenProjectId: projectId, selected: true, id: { not: simulationId } }, data: { selected: false, updatedAt: at } });
      await tx.simulation.update({ where: { id: simulationId }, data: { selected: true, updatedAt: at } });
      return 'ok' as const;
    });
  }

  async delete(projectId: string, simulationId: string): Promise<void> {
    await this.prisma.simulation.deleteMany({ where: { id: simulationId, kitchenProjectId: projectId } });
  }

  recoverInterrupted(finishedAt: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.kitchenRender.updateMany({
        where: { status: { in: [...RENDER_ACTIVE] } },
        data: { status: 'failed', errorCode: 'interrupted', finishedAt },
      });
      await tx.simulation.updateMany({ where: { stage: { not: 'finished' } }, data: { stage: 'finished', updatedAt: finishedAt } });
      return count;
    });
  }
}
