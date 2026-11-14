import { randomUUID } from 'node:crypto';
import type { AiEndpointsProvider } from '../ai-endpoints.provider.js';
import { AiBackendError } from './ai-backend.error.js';
import { abortError } from './fake-adapter.support.js';
import { buildRenderWorkflow, RENDER_OUTPUT_NODE } from './comfyui-workflow.js';
import type { ImageAdapter, ImageRequest, ImageResult } from './image-adapter.js';

export interface ComfyUiImageAdapterOptions {
  /** History poll period (default 250 ms). */
  pollMs?: number;
}

interface HistoryEntry {
  status?: { status_str?: unknown; completed?: unknown };
  outputs?: Record<string, { images?: Array<{ filename?: unknown; subfolder?: unknown; type?: unknown }> }>;
}

/**
 * ComfyUI (SDXL + ControlNet) over its HTTP API (feature controlnet-render): upload the input
 * as `bm-<random uuid>.jpg` (no project or user data; style references too), queue the workflow, poll the history,
 * then download the `PreviewImage` output from the temp dir. The base URL is read per call so a
 * hot-swapped endpoint provider takes effect at once. Aborting sends a best-effort
 * `POST /interrupt`. Errors are {@link AiBackendError}s that never carry a URL or backend body.
 */
export class ComfyUiImageAdapter implements ImageAdapter {
  private readonly pollMs: number;

  constructor(
    private readonly endpoints: AiEndpointsProvider,
    options: ComfyUiImageAdapterOptions = {},
  ) {
    this.pollMs = options.pollMs ?? 250;
  }

  async render(req: ImageRequest, signal: AbortSignal): Promise<ImageResult> {
    const base = this.endpoints.get().comfyuiBaseUrl.replace(/\/+$/, '');
    if (signal.aborted) throw abortError();
    const onAbort = () => void this.interrupt(base);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const inputImage = await this.upload(base, req.image, signal);
      const references: Array<{ inputImage: string; weight: number }> = [];
      for (const reference of req.references ?? []) references.push({ inputImage: await this.upload(base, reference.image, signal), weight: reference.weight });
      const started = Date.now();
      const promptId = await this.queue(base, req, inputImage, references, signal);
      const entry = await this.waitFor(base, promptId, signal);
      const image = await this.download(base, entry, signal);
      return { image, seconds: (Date.now() - started) / 1000 };
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  private async upload(base: string, image: Buffer, signal: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), `bm-${randomUUID()}.jpg`);
    form.append('overwrite', 'true');
    const body = await this.json<{ name?: unknown; subfolder?: unknown }>(await fetch(`${base}/upload/image`, { method: 'POST', body: form, signal }));
    if (typeof body.name !== 'string' || body.name === '') throw new AiBackendError(null);
    return typeof body.subfolder === 'string' && body.subfolder !== '' ? `${body.subfolder}/${body.name}` : body.name;
  }

  private async queue(base: string, req: ImageRequest, inputImage: string, references: Array<{ inputImage: string; weight: number }>, signal: AbortSignal): Promise<string> {
    const workflow = buildRenderWorkflow({
      mode: req.mode,
      inputImage,
      width: req.width,
      height: req.height,
      prompt: req.prompt,
      negativePrompt: req.negativePrompt,
      seed: req.seed,
      control: req.control,
      references,
    });
    const res = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
      signal,
    });
    const body = await this.json<{ prompt_id?: unknown }>(res);
    if (typeof body.prompt_id !== 'string' || body.prompt_id === '') throw new AiBackendError(null);
    return body.prompt_id;
  }

  private async waitFor(base: string, promptId: string, signal: AbortSignal): Promise<HistoryEntry> {
    for (;;) {
      const history = await this.json<Record<string, HistoryEntry>>(await fetch(`${base}/history/${encodeURIComponent(promptId)}`, { signal }));
      const entry = history[promptId];
      if (entry) {
        if (entry.status?.status_str === 'error') throw new AiBackendError(null);
        if (entry.status?.completed === true || entry.outputs?.[RENDER_OUTPUT_NODE]) return entry;
      }
      await sleep(this.pollMs, signal);
    }
  }

  private async download(base: string, entry: HistoryEntry, signal: AbortSignal): Promise<Buffer> {
    const image = entry.outputs?.[RENDER_OUTPUT_NODE]?.images?.[0];
    if (!image || typeof image.filename !== 'string') throw new AiBackendError(null);
    const query = new URLSearchParams({
      filename: image.filename,
      subfolder: typeof image.subfolder === 'string' ? image.subfolder : '',
      type: typeof image.type === 'string' ? image.type : 'temp',
    });
    const res = await fetch(`${base}/view?${query.toString()}`, { signal });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new AiBackendError(res.status);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) throw new AiBackendError(null);
    return bytes;
  }

  /** Non-2xx: the body is dropped (it may echo the prompt or internals). */
  private async json<T>(res: Response): Promise<T> {
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new AiBackendError(res.status);
    }
    try {
      const body = (await res.json()) as unknown;
      if (body === null || typeof body !== 'object') throw new Error('not an object');
      return body as T;
    } catch {
      throw new AiBackendError(null);
    }
  }

  private async interrupt(base: string): Promise<void> {
    try {
      const res = await fetch(`${base}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      await res.body?.cancel().catch(() => undefined);
    } catch {
      // Best effort: the broker already failed the job.
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
