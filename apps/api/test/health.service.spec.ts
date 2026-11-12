import { afterEach, describe, expect, it, vi } from 'vitest';
import { DB_PING_TIMEOUT_MS, HealthService } from '../src/health/health.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

function serviceWith(queryRaw: () => Promise<unknown>): HealthService {
  return new HealthService({ $queryRaw: vi.fn(queryRaw) } as unknown as PrismaService);
}

describe('HealthService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports database up when SELECT 1 resolves', async () => {
    await expect(serviceWith(() => Promise.resolve([{ '?column?': 1 }])).check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('reports database down when the query rejects', async () => {
    const service = serviceWith(() => Promise.reject(new Error('connect ECONNREFUSED postgres:5432')));
    await expect(service.check()).resolves.toEqual({ status: 'error', database: 'down' });
  });

  it('reports database down when the query hangs past the 2 s timeout', async () => {
    vi.useFakeTimers();
    const service = serviceWith(() => new Promise(() => undefined));
    const result = service.check();
    await vi.advanceTimersByTimeAsync(DB_PING_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ status: 'error', database: 'down' });
    expect(DB_PING_TIMEOUT_MS).toBe(2000);
  });
});
