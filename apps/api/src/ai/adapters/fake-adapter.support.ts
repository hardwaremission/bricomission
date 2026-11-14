import { createHash } from 'node:crypto';

/** Options shared by the deterministic fake adapters. */
export interface FakeAdapterOptions {
  /** Simulated work time per call (default 0). */
  delayMs?: number;
  /** Awaited on every call before it completes; lets tests decide when a call finishes. */
  gate?: () => Promise<void>;
}

/** First 16 hex chars of the sha256 of the JSON request. */
export function shortHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

/** Tracks concurrent calls so tests can assert that work never overlapped. */
export class ActivityTracker {
  active = 0;
  maxActive = 0;

  async track<T>(options: FakeAdapterOptions, signal: AbortSignal, produce: () => T | Promise<T>): Promise<T> {
    if (signal.aborted) throw abortError();
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await waitOrAbort(options, signal);
      return await produce();
    } finally {
      this.active -= 1;
    }
  }
}

async function waitOrAbort(options: FakeAdapterOptions, signal: AbortSignal): Promise<void> {
  const work: Promise<void>[] = [];
  if (options.gate) work.push(options.gate());
  if (options.delayMs && options.delayMs > 0) {
    const ms = options.delayMs;
    work.push(new Promise((resolve) => setTimeout(resolve, ms)));
  }
  if (work.length === 0) return;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    await Promise.race([Promise.all(work), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
