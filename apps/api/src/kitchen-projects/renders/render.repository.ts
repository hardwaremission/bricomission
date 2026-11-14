import { Injectable } from '@nestjs/common';
import type { RenderErrorCode, RenderMode, RenderStatus } from '@bricomission/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';

/** A `kitchen_render` row (feature controlnet-render, grouped by Simulation). `prompt`, `seed`, `gpuJobId` and `inventory` are internal. */
export interface RenderRecord {
  id: string;
  kitchenProjectId: string;
  simulationId: string;
  photoId: string | null;
  photoPosition: number;
  attempts: number;
  status: RenderStatus;
  mode: RenderMode;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  beforeKey: string;
  fullKey: string | null;
  thumbKey: string | null;
  errorCode: RenderErrorCode | null;
  gpuJobId: string | null;
  /** Vision inventory of `full` (phase C); null until read. */
  inventory: unknown;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  seconds: number | null;
}

export type NewRender = Pick<
  RenderRecord,
  'id' | 'kitchenProjectId' | 'simulationId' | 'photoId' | 'photoPosition' | 'mode' | 'prompt' | 'seed' | 'width' | 'height' | 'beforeKey'
> & {
  createdAt: Date;
};

/**
 * Persistence of single Renders. Renders are created and listed with their Simulation
 * (`SimulationRepository`); this interface holds the per-Render state changes. Tests use an
 * in-memory implementation with the same semantics.
 */
export interface RenderRepository {
  find(projectId: string, renderId: string): Promise<RenderRecord | null>;
  setGpuJob(id: string, gpuJobId: string): Promise<void>;
  /** `queued -> running`; false when the row is no longer queued. */
  markRunning(id: string, startedAt: Date): Promise<boolean>;
  /** `running -> succeeded`; false when the row is no longer running (e.g. it timed out). */
  markSucceeded(id: string, result: { fullKey: string; thumbKey: string; finishedAt: Date; seconds: number }): Promise<boolean>;
  /** `queued|running -> failed`; false when the row was already terminal. */
  markFailed(id: string, errorCode: RenderErrorCode, finishedAt: Date): Promise<boolean>;
  /** Caches the vision inventory of `full` (read once, reused by every Budget recompute). */
  setInventory(id: string, inventory: unknown): Promise<void>;
}

export const RENDER_REPOSITORY = Symbol('RENDER_REPOSITORY');

const ACTIVE: RenderStatus[] = ['queued', 'running'];

type Row = Omit<RenderRecord, 'errorCode'> & { errorCode: string | null };

/** Maps a Prisma row (which also carries the legacy `styleId` column) to the record. */
export function toRenderRecord(row: Row): RenderRecord {
  return {
    id: row.id,
    kitchenProjectId: row.kitchenProjectId,
    simulationId: row.simulationId,
    photoId: row.photoId,
    photoPosition: row.photoPosition,
    attempts: row.attempts,
    status: row.status,
    mode: row.mode,
    prompt: row.prompt,
    seed: row.seed,
    width: row.width,
    height: row.height,
    beforeKey: row.beforeKey,
    fullKey: row.fullKey,
    thumbKey: row.thumbKey,
    errorCode: row.errorCode as RenderErrorCode | null,
    gpuJobId: row.gpuJobId,
    inventory: row.inventory,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    seconds: row.seconds,
  };
}

@Injectable()
export class PrismaRenderRepository implements RenderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(projectId: string, renderId: string): Promise<RenderRecord | null> {
    const row = await this.prisma.kitchenRender.findFirst({ where: { id: renderId, kitchenProjectId: projectId } });
    return row ? toRenderRecord(row) : null;
  }

  async setGpuJob(id: string, gpuJobId: string): Promise<void> {
    await this.prisma.kitchenRender.update({ where: { id }, data: { gpuJobId } });
  }

  async markRunning(id: string, startedAt: Date): Promise<boolean> {
    const { count } = await this.prisma.kitchenRender.updateMany({ where: { id, status: 'queued' }, data: { status: 'running', startedAt } });
    return count === 1;
  }

  async markSucceeded(id: string, result: { fullKey: string; thumbKey: string; finishedAt: Date; seconds: number }): Promise<boolean> {
    const { count } = await this.prisma.kitchenRender.updateMany({ where: { id, status: 'running' }, data: { status: 'succeeded', ...result } });
    return count === 1;
  }

  async markFailed(id: string, errorCode: RenderErrorCode, finishedAt: Date): Promise<boolean> {
    const { count } = await this.prisma.kitchenRender.updateMany({ where: { id, status: { in: ACTIVE } }, data: { status: 'failed', errorCode, finishedAt } });
    return count === 1;
  }

  async setInventory(id: string, inventory: unknown): Promise<void> {
    await this.prisma.kitchenRender.update({ where: { id }, data: { inventory: inventory as never } });
  }
}
