import type { RenderErrorCode } from '@bricomission/shared-types';
import type { CreateRenderResult, NewRender, RenderRecord, RenderRepository } from '../../src/kitchen-projects/renders/render.repository.js';

/** In-memory RenderRepository with the Prisma implementation's semantics (single process, no lock needed). */
export class MemoryRenderRepository implements RenderRepository {
  readonly rows = new Map<string, RenderRecord>();
  failNext: Error | null = null;

  async createQueued(render: NewRender, maxNonFailed: number): Promise<CreateRenderResult> {
    this.maybeFail();
    const mine = [...this.rows.values()].filter((row) => row.kitchenProjectId === render.kitchenProjectId);
    if (mine.some((row) => row.status === 'queued' || row.status === 'running')) return 'in_progress';
    if (mine.filter((row) => row.status !== 'failed').length >= maxNonFailed) return 'limit_reached';
    const row: RenderRecord = {
      ...render,
      status: 'queued',
      fullKey: null,
      thumbKey: null,
      errorCode: null,
      gpuJobId: null,
      startedAt: null,
      finishedAt: null,
      seconds: null,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async listByProject(projectId: string): Promise<RenderRecord[]> {
    this.maybeFail();
    return [...this.rows.values()]
      .filter((row) => row.kitchenProjectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((row) => ({ ...row }));
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

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async failActive(errorCode: RenderErrorCode, finishedAt: Date): Promise<number> {
    this.maybeFail();
    let count = 0;
    for (const row of this.rows.values()) {
      if (row.status === 'queued' || row.status === 'running') {
        Object.assign(row, { status: 'failed', errorCode, finishedAt });
        count++;
      }
    }
    return count;
  }

  private maybeFail() {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }
}
