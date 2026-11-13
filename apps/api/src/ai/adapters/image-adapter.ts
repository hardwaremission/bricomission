/** ControlNet render request (geometry from depth or canny). */
export interface ImageRequest {
  mode: 'depth' | 'canny';
  /** Object key of the source photo in storage. */
  sourceImageKey: string;
  prompt: string;
  seed: number;
}

export interface ImageResult {
  /** Object key of the rendered image in storage. */
  imageKey: string;
  seconds: number;
}

/** Image backend. Always called through the GPU job broker, which runs it exclusively. */
export interface ImageAdapter {
  render(req: ImageRequest, signal: AbortSignal): Promise<ImageResult>;
}
