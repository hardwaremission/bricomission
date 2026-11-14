import type { RenderErrorCode } from '@bricomission/shared-types';
import type { NewRender, RenderRecord, RenderRepository } from '../../src/kitchen-projects/renders/render.repository.js';

/** In-memory RenderRepository with the Prisma implementation's semantics (single process, no lock needed). */
export class MemoryRenderRepository implements RenderRepository {
  readonly rows = new Map<string, RenderRecord>();
  failNext: Error | null = null;

  /** Inserts a `queued` Render (the Simulation repository creates them with their Simulation). */
  insert(render: NewRender): RenderRecord {
    this.maybeFail();
    const row: RenderRecord = {
      ...render,
      attempts: 1,
      status: 'queued',
      fullKey: null,
      thumbKey: null,
      errorCode: null,
      gpuJobId: null,
      inventory: null,
      startedAt: null,
      finishedAt: null,
      seconds: null,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async find(projectId: string, renderId: string): Promise<RenderRecord | null> {
    this.maybeFail();
    const row = this.rows.get(renderId);
    return row && row.kitchenProjectId === projectId ? { ...row } : null;
  }

  async setGpuJob(id: string, gpuJobId: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.gpuJobId = gpuJobId;
  }

  async markRunning(id: string, startedAt: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (row?.status !== 'queued') return false;
    Object.assign(row, { status: 'running', startedAt });
    return true;
  }

  async markSucceeded(id: string, result: { fullKey: string; thumbKey: string; finishedAt: Date; seconds: number }): Promise<boolean> {
    const row = this.rows.get(id);
    if (row?.status !== 'running') return false;
    Object.assign(row, { status: 'succeeded', ...result });
    return true;
  }

  async markFailed(id: string, errorCode: RenderErrorCode, finishedAt: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || (row.status !== 'queued' && row.status !== 'running')) return false;
    Object.assign(row, { status: 'failed', errorCode, finishedAt });
    return true;
  }

  async setInventory(id: string, inventory: unknown): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.inventory = inventory;
  }

  private maybeFail() {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }
}
