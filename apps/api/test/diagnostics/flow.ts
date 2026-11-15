import { expect } from 'vitest';
import type { KitchenApp } from '../support/kitchen-app.js';
import { HOMEOWNER_SUB } from '../support/kitchen-app.js';

export interface FlowResult {
  projectId: string;
  simulationId: string;
  simulationPostCorrelation?: string;
  simulation: { status: string; renders: Array<{ status: string }> };
  budget: { status: string; tiers: Array<{ tier: string; totalCents: number }> };
}

/** A full fake run: owned project (3 photos, a gallery pick and an own reference), Simulation, selection, Budget. */
export async function runFakeSimulationAndBudget(k: KitchenApp): Promise<FlowResult> {
  const project = await k.ownedProject(HOMEOWNER_SUB, 3, { gallery: true, upload: true });
  const created = await k.createSimulation(project.id);
  expect(created.status).toBe(202);
  const simulation = await k.settleSimulation(project.id, created.body.simulation.id);
  expect(simulation.status).toBe('succeeded');
  const put = await k.http().put(`/kitchen-projects/${project.id}/selected-simulation`).set('Authorization', await k.bearer()).send({ simulationId: simulation.id });
  expect(put.status).toBe(200);
  const post = await k.http().post(`/kitchen-projects/${project.id}/budget`).set('Authorization', await k.bearer());
  expect(post.status).toBe(202);
  let budget: FlowResult['budget'] | undefined;
  for (let i = 0; i < 500; i++) {
    const res = await k.http().get(`/kitchen-projects/${project.id}/budgets/${post.body.budget.id}`).set('Authorization', await k.bearer());
    if (res.body.status === 'succeeded' || res.body.status === 'failed') {
      budget = res.body;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!budget) throw new Error('budget did not settle');
  return { projectId: project.id, simulationId: simulation.id, simulation, budget };
}
