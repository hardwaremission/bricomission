import 'reflect-metadata';
import { Controller, Get, Injectable, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { GpuJobBrokerService } from '../../src/ai/jobs/gpu-job-broker.service.js';
import { GpuResidencyHook } from '../../src/ai/jobs/gpu-residency.hook.js';
import {
  correlationMiddleware,
  currentCorrelation,
  currentCorrelationId,
  isValidCorrelationId,
  mintCorrelationId,
  resolveCorrelationId,
  runWithCorrelation,
  SYSTEM_CORRELATION_ID,
} from '../../src/diagnostics/correlation.js';
import { flush, Gate, testOptions } from '../gpu-test-helpers.js';

const as = (id: string) => ({ correlationId: id });

describe('correlation ids', () => {
  it('mints 16 hex characters, unique', () => {
    const ids = new Set(Array.from({ length: 200 }, mintCorrelationId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('validates a browser-sent id: keeps a valid one, replaces anything else', () => {
    const good = '0123456789abcdef';
    expect(isValidCorrelationId(good)).toBe(true);
    expect(resolveCorrelationId(good)).toBe(good);
    for (const bad of ['ABCDEF0123456789', '0123456789abcde', '0123456789abcdef0', 'system', '', undefined, ['0123456789abcdef'], 42, '../../etc/passwd', '0123456789abcdeg']) {
      const resolved = resolveCorrelationId(bad);
      expect(resolved).toMatch(/^[0-9a-f]{16}$/);
      expect(resolved).not.toBe(bad);
    }
  });

  it('reports `system` outside any context and the id inside one', () => {
    expect(currentCorrelationId()).toBe(SYSTEM_CORRELATION_ID);
    expect(runWithCorrelation(as('abc'), () => currentCorrelationId())).toBe('abc');
    expect(runWithCorrelation(undefined, () => currentCorrelation())).toBeUndefined();
  });
});

describe('correlation context through the broker (regression of spike A2)', () => {
  function makeBroker(hook = new GpuResidencyHook(), overrides = {}) {
    return new GpuJobBrokerService(testOptions(overrides), hook);
  }

  it('a job started from another job finish() keeps its own submitter context (corr-B, not corr-A)', async () => {
    const seen: Record<string, string | undefined> = {};
    const hook = new GpuResidencyHook();
    hook.beforeImage = async () => {
      seen.hook = currentCorrelation()?.correlationId;
    };
    const broker = makeBroker(hook);
    const gateA = new Gate();
    const events: string[] = [];
    runWithCorrelation(as('corr-A'), () => {
      broker.submit('image', async () => {
        seen.A = currentCorrelation()?.correlationId;
        await gateA.wait();
      });
    });
    const hb = runWithCorrelation(as('corr-B'), () => {
      const handle = broker.submit('image', async () => {
        seen.B = currentCorrelation()?.correlationId;
        await new Promise((r) => setTimeout(r, 5));
        seen.Bafter = currentCorrelation()?.correlationId;
      });
      broker.events(handle.jobId)?.subscribe((e) => events.push(`${e.status}:${currentCorrelationId()}`));
      return handle;
    });
    await flush();
    gateA.open();
    await hb.result;
    await flush();
    expect(seen).toMatchObject({ A: 'corr-A', B: 'corr-B', Bafter: 'corr-B', hook: 'corr-B' });
    expect(events).toEqual(['queued:corr-B', 'running:corr-B', 'done:corr-B']);
  });

  it('a job submitted outside any request does not inherit the finishing job context', async () => {
    const broker = makeBroker();
    const gateA = new Gate();
    let seenB: string | undefined = 'unset';
    runWithCorrelation(as('corr-A'), () => {
      broker.submit('image', async () => gateA.wait());
    });
    const hb = broker.submit('image', async () => {
      seenB = currentCorrelation()?.correlationId;
    });
    await flush();
    gateA.open();
    await hb.result;
    expect(seenB).toBeUndefined();
  });

  it('the timeout path keeps the job context', async () => {
    const broker = makeBroker(new GpuResidencyHook(), { imageTimeoutMs: 20 });
    const seen: string[] = [];
    const handle = runWithCorrelation(as('corr-T'), () => {
      const h = broker.submit('image', async () => new Promise<void>(() => undefined));
      broker.events(h.jobId)?.subscribe((e) => seen.push(`${e.status}:${currentCorrelationId()}`));
      return h;
    });
    await expect(handle.result).rejects.toThrow();
    expect(seen).toEqual(['queued:corr-T', 'running:corr-T', 'failed:corr-T']);
  });

  it('runner-like chain (awaits, Promise.all, timers, fire-and-forget) keeps one id', async () => {
    const broker = makeBroker();
    const trace: string[] = [];
    const background: Promise<void>[] = [];
    await runWithCorrelation(as('corr-R'), async () => {
      const step = (name: string) => trace.push(`${name}:${currentCorrelationId()}`);
      step('start');
      await broker.submit('llm', async () => step('llm-run')).result;
      step('after-llm');
      await Promise.all(
        [1, 2, 3].map(async (k) => {
          await broker.submit('image', async () => step(`image-${k}`)).result;
          step(`after-image-${k}`);
        }),
      );
      background.push(
        (async () => {
          await new Promise((r) => setTimeout(r, 5));
          step('background');
        })(),
      );
      queueMicrotask(() => step('microtask'));
      await new Promise((r) => setImmediate(r));
      step('after-immediate');
    });
    await Promise.all(background);
    expect(trace).toHaveLength(12);
    expect(trace.every((t) => t.endsWith(':corr-R'))).toBe(true);
  });
});

describe('correlation middleware over HTTP', () => {
  @Injectable()
  class Work {
    async run(): Promise<{ before: string; after: string }> {
      const before = currentCorrelationId();
      await new Promise((r) => setTimeout(r, 10));
      return { before, after: currentCorrelationId() };
    }
  }
  @Controller('t')
  class Ctl {
    constructor(private readonly work: Work) {}
    @Get()
    get() {
      return this.work.run();
    }
  }
  @Module({ controllers: [Ctl], providers: [Work] })
  class Mod implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(correlationMiddleware).forRoutes('{*path}');
    }
  }

  it('keeps a valid header id, mints for a bad one, and isolates concurrent requests', async () => {
    const app = (await Test.createTestingModule({ imports: [Mod] }).compile()).createNestApplication({ logger: false });
    await app.init();
    const good = '00112233445566ff';
    const [a, b, c] = await Promise.all([
      request(app.getHttpServer()).get('/t').set('X-Correlation-Id', good),
      request(app.getHttpServer()).get('/t').set('X-Correlation-Id', 'not valid'),
      request(app.getHttpServer()).get('/t'),
    ]);
    expect(a.body).toEqual({ before: good, after: good });
    for (const res of [b, c]) {
      expect(res.body.before).toMatch(/^[0-9a-f]{16}$/);
      expect(res.body.after).toBe(res.body.before);
    }
    expect(b.body.before).not.toBe(c.body.before);
    await app.close();
  });
});
