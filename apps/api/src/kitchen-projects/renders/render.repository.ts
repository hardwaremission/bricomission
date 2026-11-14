import { Injectable } from '@nestjs/common';
import type { RenderErrorCode, RenderMode, RenderStatus } from '@bricomission/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';

/** A `kitchen_render` row (feature controlnet-render). `prompt`, `seed`, `gpuJobId` are internal. */
export interface RenderRecord {
  id: string;
  kitchenProjectId: string;
  photoId: string | null;
  status: RenderStatus;
  mode: RenderMode;
  styleId: string | null;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  beforeKey: string;
  fullKey: string | null;
  thumbKey: string | null;
  errorCode: RenderErrorCode | null;
  gpuJobId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  seconds: number | null;
}

export type NewRender = Pick<RenderRecord, 'id' | 'kitchenProjectId' | 'photoId' | 'mode' | 'styleId' | 'prompt' | 'seed' | 'width' | 'height' | 'beforeKey'> & {
  createdAt: Date;
};

export type CreateRenderResult = RenderRecord | 'in_progress' | 'limit_reached';

/** Persistence of Renders. Tests use an in-memory implementation with the same semantics. */
export interface RenderRepository {
  /**
   * Under the project row lock: `in_progress` when a Render of the project is queued or running,
   * `limit_reached` when it already has `maxNonFailed` non-failed Renders, else inserts `queued`.
   */
  createQueued(render: NewRender, maxNonFailed: number): Promise<CreateRenderResult>;
  /** Renders of the project, newest first. */
  listByProject(projectId: string): Promise<RenderRecord[]>;
  find(projectId: string, renderId: string): Promise<RenderRecord | null>;
  setGpuJob(id: string, gpuJobId: string): Promise<void>;
  /** `queued -> running`; false when the row is no longer queued. */
  markRunning(id: string, startedAt: Date): Promise<boolean>;
  /** `running -> succeeded`; false when the row is no longer running (e.g. it timed out). */
  markSucceeded(id: string, result: { fullKey: string; thumbKey: string; finishedAt: Date; seconds: number }): Promise<boolean>;
  /** `queued|running -> failed`; false when the row was already terminal. */
  markFailed(id: string, errorCode: RenderErrorCode, finishedAt: Date): Promise<boolean>;
  delete(id: string): Promise<void>;
  /** Marks every queued/running Render `failed` with `errorCode` (start-up recovery). */
  failActive(errorCode: RenderErrorCode, finishedAt: Date): Promise<number>;
}

export const RENDER_REPOSITORY = Symbol('RENDER_REPOSITORY');

const ACTIVE: RenderStatus[] = ['queued', 'running'];

type Row = Omit<RenderRecord, 'errorCode'> & { errorCode: string | null };

function toRecord(row: Row): RenderRecord {
  return { ...row, errorCode: row.errorCode as RenderErrorCode | null };
}

@Injectable()
export class PrismaRenderRepository implements RenderRepository {
  constructor(private readonly prisma: PrismaService) {}

  createQueued(render: NewRender, maxNonFailed: number): Promise<CreateRenderResult> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent Render requests of the same project.
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${render.kitchenProjectId}::uuid FOR UPDATE`;
      const active = await tx.kitchenRender.count({ where: { kitchenProjectId: render.kitchenProjectId, status: { in: ACTIVE } } });
      if (active > 0) return 'in_progress' as const;
      const kept = await tx.kitchenRender.count({ where: { kitchenProjectId: render.kitchenProjectId, status: { not: 'failed' } } });
      if (kept >= maxNonFailed) return 'limit_reached' as const;
      return toRecord(await tx.kitchenRender.create({ data: { ...render, status: 'queued' } }));
    });
  }

  async listByProject(projectId: string): Promise<RenderRecord[]> {
    const rows = await this.prisma.kitchenRender.findMany({ where: { kitchenProjectId: projectId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return rows.map(toRecord);
  }

  async find(projectId: string, renderId: string): Promise<RenderRecord | null> {
    const row = await this.prisma.kitchenRender.findFirst({ where: { id: renderId, kitchenProjectId: projectId } });
    return row ? toRecord(row) : null;
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

  async delete(id: string): Promise<void> {
    await this.prisma.kitchenRender.deleteMany({ where: { id } });
  }

  async failActive(errorCode: RenderErrorCode, finishedAt: Date): Promise<number> {
    const { count } = await this.prisma.kitchenRender.updateMany({ where: { status: { in: ACTIVE } }, data: { status: 'failed', errorCode, finishedAt } });
    return count;
  }
}
