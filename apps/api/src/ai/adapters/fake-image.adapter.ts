import sharp from 'sharp';
import type { ImageAdapter, ImageRequest, ImageResult } from './image-adapter.js';
import { ActivityTracker, type FakeAdapterOptions } from './fake-adapter.support.js';

/** Visible, deterministic change: a blue tint and a 24 px border (so before/after differ in E2E). */
const TINT = { r: 41, g: 104, b: 236 };
const BORDER = 24;

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

  constructor(private readonly options: FakeImageAdapterOptions = {}) {}

  get active(): number {
    return this.tracker.active;
  }

  get maxActive(): number {
    return this.tracker.maxActive;
  }

  render(req: ImageRequest, signal: AbortSignal): Promise<ImageResult> {
    this.calls.push(req);
    return this.tracker.track(this.options, signal, async () => ({
      image: this.options.echo ? req.image : await fakeTransform(req),
      seconds: (this.options.delayMs ?? 0) / 1000,
    }));
  }
}

async function fakeTransform(req: ImageRequest): Promise<Buffer> {
  // sharp applies one resize per pipeline: the inner resize plus the border give the exact size.
  const border = req.width > 4 * BORDER && req.height > 4 * BORDER ? BORDER : 0;
  return sharp(req.image)
    .resize({ width: req.width - 2 * border, height: req.height - 2 * border, fit: 'cover' })
    .tint(TINT)
    .extend({ top: border, bottom: border, left: border, right: border, background: TINT })
    .png()
    .toBuffer();
}
