import { describe, expect, it } from 'vitest';
import type { RenderRecord } from '../../src/kitchen-projects/renders/render.repository.js';
import { RenderRecoveryService } from '../../src/kitchen-projects/renders/render-recovery.service.js';
import { createKitchenApp } from '../support/kitchen-app.js';
import { MemoryRenderRepository } from '../support/memory-render-repository.js';

const NOW = new Date('2026-11-16T09:00:00.000Z');

function row(id: string, status: RenderRecord['status']): RenderRecord {
  const done = status === 'succeeded' || status === 'failed';
  return {
    id,
    kitchenProjectId: '00000000-0000-4000-8000-0000000000p1'.replace('p1', '01'),
    photoId: null,
    status,
    mode: 'canny',
    styleId: 'modern',
    prompt: 'p',
    seed: 1,
    width: 1216,
    height: 832,
    beforeKey: `k/${id}/before.jpg`,
    fullKey: status === 'succeeded' ? `k/${id}/full.jpg` : null,
    thumbKey: status === 'succeeded' ? `k/${id}/thumb.jpg` : null,
    errorCode: status === 'failed' ? 'timeout' : null,
    gpuJobId: null,
    createdAt: NOW,
    startedAt: null,
    finishedAt: done ? NOW : null,
    seconds: null,
  };
}

describe('RenderRecoveryService (Scenario 3: restart)', () => {
  it('marks queued and running Renders failed/interrupted and leaves terminal ones alone', async () => {
    const repo = new MemoryRenderRepository();
    for (const [id, status] of [['a', 'queued'], ['b', 'running'], ['c', 'succeeded'], ['d', 'failed']] as const) repo.rows.set(id, row(id, status));
    const service = new RenderRecoveryService(repo, () => NOW);
    expect(await service.recover()).toBe(2);
    expect(repo.rows.get('a')).toMatchObject({ status: 'failed', errorCode: 'interrupted', finishedAt: NOW });
    expect(repo.rows.get('b')).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(repo.rows.get('c')).toMatchObject({ status: 'succeeded', errorCode: null });
    expect(repo.rows.get('d')).toMatchObject({ status: 'failed', errorCode: 'timeout' });
  });

  it('a database failure only logs (the API still boots)', async () => {
    const repo = new MemoryRenderRepository();
    repo.failNext = new Error('ECONNREFUSED');
    expect(await new RenderRecoveryService(repo, () => NOW).recover()).toBe(0);
  });

  it('runs at application start', async () => {
    const repo = new MemoryRenderRepository();
    repo.rows.set('a', row('a', 'running'));
    const k = await createKitchenApp({ renders: repo });
    expect(repo.rows.get('a')).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    await k.app.close();
  });
});
