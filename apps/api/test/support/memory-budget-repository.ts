import type { BudgetErrorCode } from '@bricomission/shared-types';
import type { BudgetRecord, BudgetRepository, BudgetSuccess, CreateBudgetResult, NewBudget } from '../../src/kitchen-projects/budget/budget.repository.js';

/** In-memory BudgetRepository with the Prisma implementation's semantics (single process, no lock needed). */
export class MemoryBudgetRepository implements BudgetRepository {
  readonly rows = new Map<string, BudgetRecord>();
  failNext: Error | null = null;

  async createQueued(budget: NewBudget, maxNonFailed: number): Promise<CreateBudgetResult> {
    this.maybeFail();
    const mine = [...this.rows.values()].filter((row) => row.kitchenProjectId === budget.kitchenProjectId);
    if (mine.some((row) => row.status === 'queued' || row.status === 'running')) return 'in_progress';
    if (mine.filter((row) => row.status !== 'failed').length >= maxNonFailed) return 'limit_reached';
    const row: BudgetRecord = { ...budget, status: 'queued', errorCode: null, attempts: 0, promptTokens: null, completionTokens: null, gpuJobId: null, startedAt: null, finishedAt: null, tiers: [] };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async listByProject(projectId: string): Promise<BudgetRecord[]> {
    this.maybeFail();
    return [...this.rows.values()]
      .filter((row) => row.kitchenProjectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((row) => ({ ...row }));
  }

  async find(projectId: string, budgetId: string): Promise<BudgetRecord | null> {
    this.maybeFail();
    const row = this.rows.get(budgetId);
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

  async markSucceeded(id: string, success: BudgetSuccess): Promise<boolean> {
    const row = this.rows.get(id);
    if (row?.status !== 'running') return false;
    Object.assign(row, { status: 'succeeded', ...success });
    return true;
  }

  async markFailed(id: string, errorCode: BudgetErrorCode, finishedAt: Date, attempts?: number): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || (row.status !== 'queued' && row.status !== 'running')) return false;
    Object.assign(row, { status: 'failed', errorCode, finishedAt, ...(attempts === undefined ? {} : { attempts }) });
    return true;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async failActive(errorCode: BudgetErrorCode, finishedAt: Date): Promise<number> {
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
