import { RENDER_WORKFLOW } from '../../ai/adapters/comfyui-workflow.js';
import type { ImageAdapter, ImageRequest, ImageResult } from '../../ai/adapters/image-adapter.js';
import type { Diagnostics } from '../diagnostics.types.js';
import { makeThumb } from '../thumbnail.js';
import { errorLabel } from './llm.js';

/**
 * Decorates the image adapter (node `ai-adapters` > `comfyui`, kind `image`): the ComfyUI request with
 * positive and negative prompt, ControlNet and IP-Adapter settings and thumbnails, then the result.
 * The seed and image bytes never leave. Installed only when diagnostics are enabled.
 */
export class InstrumentedImageAdapter implements ImageAdapter {
  constructor(
    private readonly inner: ImageAdapter,
    private readonly diagnostics: Diagnostics,
    private readonly simulated: boolean,
  ) {}

  async render(req: ImageRequest, signal: AbortSignal): Promise<ImageResult> {
    const references = req.references ?? [];
    const w = RENDER_WORKFLOW;
    const models = this.simulated
      ? { checkpoint: 'fake', note: 'fake adapter: tinted copy of the photo' }
      : { checkpoint: w.checkpoint, controlNet: w.controlNets[req.mode], depthAssist: req.control.depthAssist ? w.controlNets.depth : null, ipAdapter: references.length > 0 ? w.ipAdapter : null, clipVision: references.length > 0 ? w.clipVision : null };
    const span = this.diagnostics.span({
      from: 'ai-adapters',
      to: 'comfyui',
      kind: 'image',
      summary: `ComfyUI /prompt ${req.width}x${req.height}, ControlNet ${req.mode}, ${references.length} reference${references.length === 1 ? '' : 's'}`,
      simulated: this.simulated,
      payload: {
        model: this.simulated ? 'fake' : w.checkpoint,
        models,
        size: { width: req.width, height: req.height },
        positivePrompt: req.prompt,
        negativePrompt: req.negativePrompt,
        controlNet: { mode: req.mode, strength: req.control.strength, endPercent: req.control.endPercent, cannyLow: req.control.cannyLow, cannyHigh: req.control.cannyHigh, depthAssist: req.control.depthAssist },
        input: { bytes: req.image.length, thumbnail: await makeThumb(req.image) },
        references: await Promise.all(references.map(async (r, index) => ({ index: index + 1, weight: Number(r.weight.toFixed(3)), bytes: r.image.length, thumbnail: await makeThumb(r.image) }))),
      },
    });
    try {
      const result = await this.inner.render(req, signal);
      span.end({
        summary: `render done in ${result.seconds.toFixed(1)} s (${(result.image.length / 1024).toFixed(0)} KB)`,
        payload: { seconds: result.seconds, bytes: result.image.length, thumbnail: await makeThumb(result.image) },
        ok: true,
      });
      return result;
    } catch (error) {
      span.end({ summary: `failed (${errorLabel(error)})`, payload: {}, ok: false });
      throw error;
    }
  }
}
