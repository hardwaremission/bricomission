import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { ImageAdapter, ImageRequest, ImageResult } from './image-adapter.js';
import { ActivityTracker, type FakeAdapterOptions } from './fake-adapter.support.js';

/** Visible, deterministic change: a blue tint and a 24 px border (so before/after differ in E2E). */
const TINT = { r: 41, g: 104, b: 236 };
const BORDER = 24;

type Rgb = { r: number; g: number; b: number };

/** Tint of a Render: the default blue, or the weighted mix of the references' hash colours (so different weights differ, the same weights repeat). */
export function referenceTint(references: ImageRequest['references']): Rgb {
  if (!references || references.length === 0) return TINT;
  let total = 0;
  const mix = { r: 0, g: 0, b: 0 };
  for (const reference of references) {
    const digest = createHash('sha256').update(reference.image).digest();
    mix.r += (digest[0] as number) * reference.weight;
    mix.g += (digest[1] as number) * reference.weight;
    mix.b += (digest[2] as number) * reference.weight;
    total += reference.weight;
  }
  return total > 0 ? { r: Math.round(mix.r / total), g: Math.round(mix.g / total), b: Math.round(mix.b / total) } : TINT;
}

/**
 * Deterministic failure switch (no env, no header): a "poison photo" is a nearly solid magenta image
 * (every channel mean within 24 of 255/0/255; see `poisonPhoto()` in the tests and
 * `apps/web/e2e/fixtures/fail-once.jpg`). The first render of a Render whose input is poisoned
 * fails once per seed; the retry (same seed) succeeds. Only the fake adapter knows this switch.
 */
export async function isPoisonPhoto(image: Buffer): Promise<boolean> {
  // An 8x8 raw thumbnail (JPEG shrink-on-load, about 3 ms; `stats()` would decode the whole image).
  const { data } = await sharp(image).resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = data.length / 3;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 3) {
    r += data[i] as number;
    g += data[i + 1] as number;
    b += data[i + 2] as number;
  }
  return r / pixels > 231 && g / pixels < 24 && b / pixels > 231;
}

export interface FakeImageAdapterOptions extends FakeAdapterOptions {
  /** Return the input bytes unchanged (no image decoding): for scheduling tests that need no pixels. */
  echo?: boolean;
}

/**
 * Deterministic image fake: a transform of the input photo (same input, same PNG). No GPU, no
 * storage. Proves storage and UI flows, never render quality.
 */
export class FakeImageAdapter implements ImageAdapter {
  readonly calls: ImageRequest[] = [];
  private readonly tracker = new ActivityTracker();
  private readonly failedOnce = new Set<number>();

  constructor(private readonly options: FakeImageAdapterOptions = {}) {}

  get active(): number {
    return this.tracker.active;
  }

  get maxActive(): number {
    return this.tracker.maxActive;
  }

  render(req: ImageRequest, signal: AbortSignal): Promise<ImageResult> {
    this.calls.push(req);
    return this.tracker.track(this.options, signal, async () => {
      if (!this.options.echo && !this.failedOnce.has(req.seed) && (await isPoisonPhoto(req.image))) {
        this.failedOnce.add(req.seed);
        throw new Error('fake image adapter: poison photo fails once');
      }
      return this.finish(req);
    });
  }

  private async finish(req: ImageRequest): Promise<ImageResult> {
    return ({
      image: this.options.echo ? req.image : await fakeTransform(req),
      seconds: (this.options.delayMs ?? 0) / 1000,
    });
  }
}

async function fakeTransform(req: ImageRequest): Promise<Buffer> {
  // sharp applies one resize per pipeline: the inner resize plus the border give the exact size.
  const tint = referenceTint(req.references);
  const border = req.width > 4 * BORDER && req.height > 4 * BORDER ? BORDER : 0;
  return sharp(req.image)
    .resize({ width: req.width - 2 * border, height: req.height - 2 * border, fit: 'cover' })
    .tint(tint)
    .extend({ top: border, bottom: border, left: border, right: border, background: tint })
    .png()
    .toBuffer();
}
