/** ControlNet settings of one Render (feature controlnet-render; tuned 2026-11-15). */
export interface RenderControl {
  /** Primary ControlNet (`mode`) strength and the fraction of the steps it guides (0-1). */
  strength: number;
  endPercent: number;
  /** ComfyUI `Canny` thresholds (0-1); used when `mode` is canny. */
  cannyLow: number;
  cannyHigh: number;
  /** Depth ControlNet stacked on a canny Render for the whole run (keeps walls, windows, cabinets); null = off. */
  depthAssist: { strength: number; endPercent: number } | null;
}

/**
 * Defaults tuned on the GPU on 2026-11-15 (spec Implementation Notes, tuning round 8 "AB"): canny
 * with high thresholds guides only the first half of the steps, and a full-run depth assist keeps
 * walls, windows and cabinets. Every lower-control setting that removed clutter also turned
 * cabinets into doors or windows into cabinets on some seeds.
 */
export const DEFAULT_RENDER_CONTROL: RenderControl = {
  strength: 0.8,
  endPercent: 0.5,
  cannyLow: 0.6,
  cannyHigh: 0.95,
  depthAssist: { strength: 0.7, endPercent: 1 },
};

/**
 * ControlNet render request (feature controlnet-render). The geometry comes from `image`
 * through canny edges or a depth map. Storage stays with the caller: adapters never touch MinIO.
 */
export interface ImageRequest {
  mode: 'depth' | 'canny';
  /** JPEG of exactly `width` x `height` (the stored "before" crop). */
  image: Buffer;
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
  seed: number;
  control: RenderControl;
}

export interface ImageResult {
  /** PNG or JPEG bytes of the Render (the caller re-encodes and stores them). */
  image: Buffer;
  seconds: number;
}

/** Image backend. Always called through the GPU job broker, which runs it exclusively. */
export interface ImageAdapter {
  render(req: ImageRequest, signal: AbortSignal): Promise<ImageResult>;
}
