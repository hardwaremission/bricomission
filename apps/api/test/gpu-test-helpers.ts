import type { GpuJobEvent } from '@bricomission/shared-types';
import { firstValueFrom, toArray } from 'rxjs';
import { DEFAULT_GPU_BROKER_OPTIONS, type GpuBrokerOptions } from '../src/ai/jobs/gpu-broker.options.js';
import type { GpuJobBrokerService } from '../src/ai/jobs/gpu-job-broker.service.js';

/** A manually released barrier: adapters await `wait()`, tests call `open()`. */
export class Gate {
  private release!: () => void;
  private readonly promise = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  wait = (): Promise<void> => this.promise;

  open(): void {
    this.release();
  }
}

/** Hands out one gate per adapter call, in call order. */
export class GateQueue {
  readonly gates: Gate[] = [];

  next = (): Promise<void> => {
    const gate = new Gate();
    this.gates.push(gate);
    return gate.wait();
  };

  open(index: number): void {
    this.gates[index].open();
  }
}

/** Lets pending promise callbacks (and the broker's async hooks) run. No wall-clock sleep. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** Deterministic clock and ids for broker tests. */
export function testOptions(overrides: Partial<GpuBrokerOptions> = {}): GpuBrokerOptions & { clock: { t: number } } {
  const clock = { t: Date.UTC(2026, 10, 13, 10, 0, 0) };
  let n = 0;
  return {
    ...DEFAULT_GPU_BROKER_OPTIONS,
    now: () => clock.t,
    newId: () => `job-${++n}`,
    ...overrides,
    clock,
  };
}

export function collectEvents(broker: GpuJobBrokerService, jobId: string, afterSeq?: number): Promise<GpuJobEvent[]> {
  const events = broker.events(jobId, afterSeq);
  if (!events) throw new Error(`unknown job ${jobId}`);
  return firstValueFrom(events.pipe(toArray()));
}
