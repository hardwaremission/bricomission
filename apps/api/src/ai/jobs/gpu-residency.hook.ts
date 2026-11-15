import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DIAGNOSTICS, type Diagnostics } from '../../diagnostics/diagnostics.types.js';
import { NULL_DIAGNOSTICS } from '../../diagnostics/null-diagnostics.js';
import { type LlmUnloader, LLM_UNLOADER, NoopLlmUnloader } from './llm-unloader.js';

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

  /** Diagnostics only: the LLM was unloaded, so the next LLM job reloads it. */
  private llmUnloaded = false;

  constructor(
    @Optional() @Inject(LLM_UNLOADER) private readonly unloader?: LlmUnloader,
    @Optional() @Inject(DIAGNOSTICS) private readonly diagnostics: Diagnostics = NULL_DIAGNOSTICS,
  ) {}

  async beforeImage(): Promise<void> {
    if (!this.unloader) return;
    const d = this.diagnostics;
    const simulated = this.unloader instanceof NoopLlmUnloader;
    if (d.enabled) d.emit({ from: 'gpu-broker', to: 'residency-hook', kind: 'residency', summary: 'beforeImage: unload LLM', simulated: simulated || undefined, payload: { hook: 'beforeImage', action: 'unload LLM' } });
    const span = d.enabled ? d.span({ from: 'residency-hook', to: 'llama-server', kind: 'http', summary: 'POST /models/unload', simulated: simulated || undefined, payload: { method: 'POST', path: '/models/unload', model: 'router model' } }) : undefined;
    try {
      await this.unloader.unload();
      this.llmUnloaded = true;
      span?.end({ summary: 'POST /models/unload: LLM unloaded', ok: true });
    } catch (error) {
      span?.end({ summary: `failed (${error instanceof Error ? error.name : 'unknown'})`, ok: false });
      this.logger.warn(`LLM unload failed (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }

  async afterImage(): Promise<void> {}

  async beforeLlm(): Promise<void> {
    const d = this.diagnostics;
    if (!d.enabled) return;
    const simulated = this.unloader instanceof NoopLlmUnloader || undefined;
    if (this.llmUnloaded) {
      this.llmUnloaded = false;
      d.emit({ from: 'gpu-broker', to: 'residency-hook', kind: 'residency', summary: 'beforeLlm: the LLM was unloaded, the request reloads it', simulated, payload: { hook: 'beforeLlm', action: 'reload on next request' } });
      d.emit({ from: 'llama-server', to: 'llama-server', kind: 'step', summary: 'LLM reload (cold), about 7 s', simulated, payload: { reason: 'unloaded before the last image job' } });
    } else {
      d.emit({ from: 'gpu-broker', to: 'residency-hook', kind: 'residency', summary: 'beforeLlm: nothing (ComfyUI stays warm)', simulated, payload: { hook: 'beforeLlm', action: 'none' } });
    }
  }

  async afterLlm(): Promise<void> {}
}
