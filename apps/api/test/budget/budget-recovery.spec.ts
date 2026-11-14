import { describe, expect, it } from 'vitest';
import type { BudgetRecord } from '../../src/kitchen-projects/budget/budget.repository.js';
import { BudgetRecoveryService } from '../../src/kitchen-projects/budget/budget-recovery.service.js';
import { createKitchenApp } from '../support/kitchen-app.js';
import { MemoryBudgetRepository } from '../support/memory-budget-repository.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const PROJECT = '00000000-0000-4000-8000-000000000001';

function row(id: string, status: BudgetRecord['status']): BudgetRecord {
  const done = status === 'succeeded' || status === 'failed';
  return {
    id,
    kitchenProjectId: PROJECT,
    simulationId: '00000000-0000-4000-8000-0000000000aa',
    status,
    stage: 'pricing',
    progressDone: 0,
    progressTotal: 0,
    relabeled: false,
    errorCode: status === 'failed' ? 'timeout' : null,
    currency: 'EUR',
    vatBps: 2100,
    attempts: 0,
    prompt: 'p',
    promptTokens: null,
    completionTokens: null,
    gpuJobId: null,
    createdAt: NOW,
    startedAt: null,
    finishedAt: done ? NOW : null,
    tiers: [],
  };
}

describe('BudgetRecoveryService (Scenario 5: restart)', () => {
  it('marks queued and running Budgets failed/interrupted and leaves terminal ones alone', async () => {
    const repo = new MemoryBudgetRepository();
    for (const [id, status] of [['a', 'queued'], ['b', 'running'], ['c', 'succeeded'], ['d', 'failed']] as const) repo.rows.set(id, row(id, status));
    const service = new BudgetRecoveryService(repo, () => NOW);
    expect(await service.recover()).toBe(2);
    expect(repo.rows.get('a')).toMatchObject({ status: 'failed', errorCode: 'interrupted', finishedAt: NOW });
    expect(repo.rows.get('b')).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(repo.rows.get('c')?.status).toBe('succeeded');
    expect(repo.rows.get('d')?.errorCode).toBe('timeout');
    expect(await service.recover()).toBe(0);
  });

  it('never throws when the database is down at start', async () => {
    const repo = new MemoryBudgetRepository();
    repo.failNext = new Error('db down');
    expect(await new BudgetRecoveryService(repo, () => NOW).recover()).toBe(0);
  });

  it('a restart with an active row leaves it interrupted and the next POST is 202', async () => {
    const budgets = new MemoryBudgetRepository();
    const first = await createKitchenApp({ budgets });
    const seeded = await first.seedDraft();
    const claimed = await first.claim(await first.token(), seeded.draftToken);
    const projectId = claimed.body.project.id as string;
    budgets.rows.set('stale', { ...row('stale', 'running'), kitchenProjectId: projectId });
    await first.app.close();
    // New app = restart: the recovery service runs on bootstrap against the same rows.
    const second = await createKitchenApp({ budgets });
    expect(budgets.rows.get('stale')).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    // The project of the first app does not exist in the second one: a fresh claimed project takes the POST.
    const seeded2 = await second.seedDraft();
    const claimed2 = await second.claim(await second.token(), seeded2.draftToken);
    second.seedReadySimulation(claimed2.body.project.id);
    const post = await second.http().post(`/kitchen-projects/${claimed2.body.project.id}/budget`).set('Authorization', `Bearer ${await second.token()}`);
    expect(post.status).toBe(202);
    await second.app.close();
  });
});
