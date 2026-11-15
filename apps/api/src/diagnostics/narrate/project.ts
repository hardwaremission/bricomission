import type { Diagnostics } from '../diagnostics.types.js';
import { makeThumb } from '../thumbnail.js';

/** image-pipeline -> storage-client: a processed photo (type, sizes, thumbnail). */
export async function photoProcessed(d: Diagnostics, input: { source: string; bytesIn: number; width: number; height: number; fullBytes: number; thumbBytes: number; image: Buffer; from?: 'image-pipeline' }): Promise<void> {
  if (!d.enabled) return;
  d.emit({
    from: 'image-pipeline',
    to: 'storage-client',
    kind: 'object',
    summary: `process photo ${input.source}: ${(input.bytesIn / 1024).toFixed(0)} KB in, ${input.width}x${input.height}, full ${(input.fullBytes / 1024).toFixed(0)} KB, thumb ${(input.thumbBytes / 1024).toFixed(0)} KB`,
    payload: { type: input.source, bytesIn: input.bytesIn, width: input.width, height: input.height, fullBytes: input.fullBytes, thumbBytes: input.thumbBytes, thumbnail: (await makeThumb(input.image, input.fullBytes)) ?? null },
  });
}

/** project-service step (self): claim, edits, sweeper. */
export function projectStep(d: Diagnostics, summary: string, payload: Record<string, unknown> = {}, system = false): void {
  if (!d.enabled) return;
  d.emit({ from: 'project-service', to: 'project-service', kind: 'step', summary, payload, ...(system ? { correlationId: 'system' } : {}) });
}
