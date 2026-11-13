import { Injectable } from '@nestjs/common';

/**
 * Called by the broker around every image job, while the GPU is held exclusively.
 * No-op today: serialization alone keeps VRAM in budget (LLM and ComfyUI caches
 * coexist; only simultaneous compute overloads the card). `controlnet-render` may
 * plug in ComfyUI `POST /free` or an LLM stop here if real renders need it.
 */
@Injectable()
export class GpuResidencyHook {
  async beforeImage(): Promise<void> {}

  async afterImage(): Promise<void> {}
}
