import type { ImageAdapter, ImageRequest, ImageResult } from './image-adapter.js';
import { ActivityTracker, type FakeAdapterOptions, shortHash } from './fake-adapter.support.js';

/** Deterministic image fake: `fake/<sha256-16 of the request>.png`. No GPU, no storage writes. */
export class FakeImageAdapter implements ImageAdapter {
  readonly calls: ImageRequest[] = [];
  private readonly tracker = new ActivityTracker();

  constructor(private readonly options: FakeAdapterOptions = {}) {}

  get active(): number {
    return this.tracker.active;
  }

  get maxActive(): number {
    return this.tracker.maxActive;
  }

  render(req: ImageRequest, signal: AbortSignal): Promise<ImageResult> {
    this.calls.push(req);
    return this.tracker.track(this.options, signal, () => ({
      imageKey: `fake/${shortHash(req)}.png`,
      seconds: (this.options.delayMs ?? 0) / 1000,
    }));
  }
}
