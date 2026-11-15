import type { Diagnostics } from '../diagnostics.types.js';
import { makeThumbs } from '../thumbnail.js';

/** One style reference as the runner holds it (scaled JPEG plus its blend weight). */
export interface NarratedReference {
  kind: 'gallery' | 'upload';
  weight: number;
  image: Buffer;
}

const pct = (weight: number): number => Math.round(weight * 1000) / 10;

/** `weights gallery-modern 31 %, upload 1 42 % ...` (style-engine, `compute`). */
export function styleWeights(d: Diagnostics, input: { blendMode: string; isFirst: boolean; entries: Array<{ kind: 'gallery' | 'upload'; refId: string; weight: number }> }): void {
  if (!d.enabled) return;
  const label = (e: { kind: string; refId: string }, i: number): string => (e.kind === 'gallery' ? e.refId : `upload ${i + 1}`);
  const text = input.entries.map((e, i) => `${label(e, i)} ${pct(e.weight)} %`).join(', ') || 'no references';
  d.emit({
    from: 'simulation-runner',
    to: 'style-engine',
    kind: 'compute',
    summary: `weights (${input.isFirst ? 'equal, first Simulation' : 'seeded, generate again'}): ${text}`,
    payload: { blendMode: input.blendMode, isFirst: input.isFirst, references: input.entries.map((e, i) => ({ kind: e.kind, label: label(e, i), percent: pct(e.weight) })) },
  });
}

/** The scaled reference images (thumbnails) that go to the vision model and IP-Adapter. */
export async function referencesLoaded(d: Diagnostics, blendMode: string, references: readonly NarratedReference[]): Promise<void> {
  if (!d.enabled) return;
  const thumbs = await makeThumbs(references.map((r) => r.image));
  d.emit({
    from: 'simulation-runner',
    to: 'style-engine',
    kind: 'compute',
    summary: `${references.length} reference image${references.length === 1 ? '' : 's'} scaled to 768 px (blend mode ${blendMode})`,
    payload: { blendMode, references: references.map((r, i) => ({ kind: r.kind, percent: pct(r.weight), bytes: r.image.length, thumbnail: thumbs[i] ?? null })) },
  });
}

/** The calculated style text and keywords (style-engine -> simulation-runner, `compute`). */
export function mergedStyle(d: Diagnostics, input: { text: string; keywords: readonly string[]; degraded: boolean; blendMode: string }): void {
  if (!d.enabled) return;
  d.emit({
    from: 'style-engine',
    to: 'simulation-runner',
    kind: 'compute',
    summary: input.degraded ? 'style_degraded: using the dominant style text' : `merged traits text (${input.text.length} chars)`,
    payload: { blendMode: input.blendMode, degraded: input.degraded, text: input.text, keywords: input.keywords },
  });
}

/** simulation-runner `step` (self): describing, rendering k of N, retry, finished. */
export function runnerStep(d: Diagnostics, summary: string, payload: Record<string, unknown> = {}, ok?: boolean): void {
  if (!d.enabled) return;
  d.emit({ from: 'simulation-runner', to: 'simulation-runner', kind: 'step', summary, payload, ok });
}

/** simulation-runner -> gpu-broker `queue` submit. */
export function submitJob(d: Diagnostics, summary: string, payload: Record<string, unknown> = {}): void {
  if (!d.enabled) return;
  d.emit({ from: 'simulation-runner', to: 'gpu-broker', kind: 'queue', summary, payload });
}

/** image-pipeline -> storage-client: the encoded Render objects. */
export function renderEncoded(d: Diagnostics, input: { fullBytes: number; thumbBytes: number; width: number; height: number; keys: string[] }): void {
  if (!d.enabled) return;
  d.emit({
    from: 'image-pipeline',
    to: 'storage-client',
    kind: 'object',
    summary: `encode Render ${input.width}x${input.height}: full ${(input.fullBytes / 1024).toFixed(0)} KB, thumb ${(input.thumbBytes / 1024).toFixed(0)} KB`,
    payload: { width: input.width, height: input.height, fullBytes: input.fullBytes, thumbBytes: input.thumbBytes, keys: input.keys },
  });
}

/** image-pipeline -> storage-client: the "before" crop of a Render. */
export function beforeCrop(d: Diagnostics, input: { index: number; total: number; width: number; height: number; bytes: number; key: string }): void {
  if (!d.enabled) return;
  d.emit({
    from: 'image-pipeline',
    to: 'storage-client',
    kind: 'object',
    summary: `crop photo ${input.index} of ${input.total} to ${input.width}x${input.height} ("before")`,
    payload: { width: input.width, height: input.height, bytes: input.bytes, key: input.key },
  });
}
