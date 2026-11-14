import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type LlmUnloader, LLM_UNLOADER } from './llm-unloader.js';

/**
 * GPU residency (feature simulations-ux-overhaul, spike A3, docs/spikes/simulations-gpu-spike.md).
 * Called by the broker around jobs while the GPU is held:
 * - `beforeImage()` unloads the LLM (router-mode `POST /models/unload`): a render beside the
 *   resident vision model is 46-100 % slower and reaches the card limit. The next LLM request
 *   reloads it. An unload failure is logged and never fails the image job (the LLM may be down).
 * - `beforeLlm()` does nothing: an LLM load beside the resident ComfyUI models fits (13.2 GB) and
 *   keeping ComfyUI warm saves the cold-render penalty. Call ComfyUI `POST /free` here only if a
 *   load error is ever seen.
 * - `afterImage()` and `afterLlm()` are no-ops.
 */
@Injectable()
export class GpuResidencyHook {
  private readonly logger = new Logger(GpuResidencyHook.name);

  constructor(@Optional() @Inject(LLM_UNLOADER) private readonly unloader?: LlmUnloader) {}

  async beforeImage(): Promise<void> {
    if (!this.unloader) return;
    try {
      await this.unloader.unload();
    } catch (error) {
      this.logger.warn(`LLM unload failed (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }

  async afterImage(): Promise<void> {}

  async beforeLlm(): Promise<void> {}

  async afterLlm(): Promise<void> {}
}
