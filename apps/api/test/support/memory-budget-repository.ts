import type { BudgetErrorCode, BudgetStage } from '@bricomission/shared-types';
import type { BudgetRecord, BudgetRepository, BudgetSuccess, CreateBudgetResult, NewBudget } from '../../src/kitchen-projects/budget/budget.repository.js';

/** In-memory BudgetRepository with the Prisma implementation's semantics (single process, no lock needed). */
export class MemoryBudgetRepository implements BudgetRepository {
  readonly rows = new Map<string, BudgetRecord>();
  failNext: Error | null = null;

  async createQueued(budget: NewBudget): Promise<CreateBudgetResult> {
    this.maybeFail();
    const mine = [...this.rows.values()].filter((row) => row.kitchenProjectId === budget.kitchenProjectId);
    if (mine.some((row) => row.status === 'queued' || row.status === 'running')) return 'in_progress';
    for (const row of mine) if (row.simulationId === budget.simulationId && row.status === 'failed') this.rows.delete(row.id);
    const row: BudgetRecord = { ...budget, status: 'queued', relabeled: false, errorCode: null, attempts: 0, promptTokens: null, completionTokens: null, gpuJobId: null, startedAt: null, finishedAt: null, tiers: [] };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async hasActive(projectId: string): Promise<boolean> {
    this.maybeFail();
    return [...this.rows.values()].some((row) => row.kitchenProjectId === projectId && (row.status === 'queued' || row.status === 'running'));
  }

  async listBySimulation(simulationId: string): Promise<BudgetRecord[]> {
    this.maybeFail();
    return [...this.rows.values()]
      .filter((row) => row.simulationId === simulationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((row) => ({ ...row }));
  }

  async find(projectId: string, budgetId: string): Promise<BudgetRecord | null> {
    this.maybeFail();
    const row = this.rows.get(budgetId);
    return row && row.kitchenProjectId === projectId ? { ...row } : null;
  }

  async setProgress(id: string, stage: BudgetStage, done: number, total: number): Promise<void> {
    const row = this.rows.get(id);
    if (row && (row.status === 'queued' || row.status === 'running')) Object.assign(row, { stage, progressDone: done, progressTotal: total });
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
    for (const old of [...this.rows.values()]) if (old.id !== id && old.simulationId === row.simulationId && old.status === 'succeeded') this.rows.delete(old.id);
    Object.assign(row, { status: 'succeeded', stage: 'pricing', ...success });
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
