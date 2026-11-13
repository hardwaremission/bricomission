import { randomUUID } from 'node:crypto';

/** Broker settings. `now` and `newId` are injectable for deterministic tests. */
export interface GpuBrokerOptions {
  /** LLM jobs that may run together (never alongside an image job). */
  llmConcurrency: number;
  /** Queued (not running) jobs accepted before `submit` throws `GpuQueueFullError`. */
  maxQueued: number;
  imageTimeoutMs: number;
  llmTimeoutMs: number;
  /** How long finished jobs stay readable. */
  retentionMs: number;
  now: () => number;
  newId: () => string;
}

export const DEFAULT_GPU_BROKER_OPTIONS: GpuBrokerOptions = {
  llmConcurrency: 1,
  maxQueued: 20,
  imageTimeoutMs: 180_000,
  llmTimeoutMs: 120_000,
  retentionMs: 3_600_000,
  now: () => Date.now(),
  newId: () => randomUUID(),
};

/** Reads the `GPU_BROKER_*` env vars; invalid or missing values fall back to the defaults. */
export function gpuBrokerOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): GpuBrokerOptions {
  const d = DEFAULT_GPU_BROKER_OPTIONS;
  return {
    ...d,
    llmConcurrency: positiveInt(env.GPU_BROKER_LLM_CONCURRENCY, d.llmConcurrency),
    maxQueued: positiveInt(env.GPU_BROKER_MAX_QUEUED, d.maxQueued),
    imageTimeoutMs: positiveInt(env.GPU_BROKER_IMAGE_TIMEOUT_MS, d.imageTimeoutMs),
    llmTimeoutMs: positiveInt(env.GPU_BROKER_LLM_TIMEOUT_MS, d.llmTimeoutMs),
    retentionMs: positiveInt(env.GPU_BROKER_RETENTION_MS, d.retentionMs),
  };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return fallback;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
