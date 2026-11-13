import type { GpuJobErrorCode } from '@bricomission/shared-types';

/** The broker queue already holds `maxQueued` jobs. */
export class GpuQueueFullError extends Error {
  override readonly name = 'GpuQueueFullError';

  constructor(readonly maxQueued: number) {
    super(`GPU job queue is full (${maxQueued} queued)`);
  }
}

/** A GPU job ended `failed`. Carries only the public code, never the adapter message. */
export class GpuJobFailedError extends Error {
  override readonly name = 'GpuJobFailedError';

  constructor(
    readonly jobId: string,
    readonly code: GpuJobErrorCode,
  ) {
    super(`GPU job failed: ${code}`);
  }
}
