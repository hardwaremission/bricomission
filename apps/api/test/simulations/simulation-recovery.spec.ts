import { describe, expect, it } from 'vitest';
import type { RenderRecord } from '../../src/kitchen-projects/renders/render.repository.js';
import { SimulationRecoveryService } from '../../src/kitchen-projects/simulations/simulation-recovery.service.js';
import { createKitchenApp } from '../support/kitchen-app.js';
import { MemoryBudgetRepository } from '../support/memory-budget-repository.js';
import { MemoryRenderRepository } from '../support/memory-render-repository.js';
import { MemorySimulationRepository } from '../support/memory-simulation-repository.js';

const NOW = new Date('2026-11-16T09:00:00.000Z');
const PROJECT = '00000000-0000-4000-8000-000000000001';
const SIM = '00000000-0000-4000-8000-0000000000a1';

function render(id: string, status: RenderRecord['status']): RenderRecord {
  const done = status === 'succeeded' || status === 'failed';
  return {
    id,
    kitchenProjectId: PROJECT,
    simulationId: SIM,
    photoId: null,
    photoPosition: 0,
    attempts: 1,
    status,
    mode: 'canny',
    prompt: 'p',
    seed: 1,
    width: 1216,
    height: 832,
    beforeKey: `k/${id}/before.jpg`,
    fullKey: status === 'succeeded' ? `k/${id}/full.jpg` : null,
    thumbKey: status === 'succeeded' ? `k/${id}/thumb.jpg` : null,
    errorCode: status === 'failed' ? 'timeout' : null,
    gpuJobId: null,
    inventory: null,
    createdAt: NOW,
    startedAt: null,
    finishedAt: done ? NOW : null,
    seconds: null,
  };
}

function repos() {
  const renders = new MemoryRenderRepository();
  const simulations = new MemorySimulationRepository(renders, new MemoryBudgetRepository());
  simulations.seed({ id: SIM, kitchenProjectId: PROJECT, stage: 'rendering' }, [render('a', 'queued'), render('b', 'running'), render('c', 'succeeded'), render('d', 'failed')]);
  return { renders, simulations };
}

describe('SimulationRecoveryService (restart recovery)', () => {
  it('marks queued and running Renders failed/interrupted, finishes the Simulation and leaves terminal Renders alone', async () => {
    const { renders, simulations } = repos();
    const service = new SimulationRecoveryService(simulations, () => NOW);
    expect(await service.recover()).toBe(2);
    expect(renders.rows.get('a')).toMatchObject({ status: 'failed', errorCode: 'interrupted', finishedAt: NOW });
    expect(renders.rows.get('b')).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(renders.rows.get('c')).toMatchObject({ status: 'succeeded', errorCode: null });
    expect(renders.rows.get('d')).toMatchObject({ status: 'failed', errorCode: 'timeout' });
    expect(simulations.rows.get(SIM)?.stage).toBe('finished');
    expect(await service.recover()).toBe(0);
  });

  it('a database failure only logs (the API still boots)', async () => {
    const { simulations } = repos();
    simulations.failNext = new Error('ECONNREFUSED');
    expect(await new SimulationRecoveryService(simulations, () => NOW).recover()).toBe(0);
  });

  it('runs at application start', async () => {
    const renders = new MemoryRenderRepository();
    const budgets = new MemoryBudgetRepository();
    const simulations = new MemorySimulationRepository(renders, budgets);
    const first = await createKitchenApp({ renders, budgets, simulations });
    const project = await first.ownedProject();
    await first.app.close();
    // A Simulation that was running when the API stopped.
    simulations.seed({ id: SIM, kitchenProjectId: project.id, stage: 'rendering' }, [{ ...render('stale', 'running'), kitchenProjectId: project.id }]);
    const second = await createKitchenApp({ renders, budgets, simulations });
    expect(renders.rows.get('stale')).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(simulations.rows.get(SIM)?.stage).toBe('finished');
    await second.app.close();
  });
});
