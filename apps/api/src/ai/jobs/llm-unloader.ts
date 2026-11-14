import type { AiEndpointsProvider } from '../ai-endpoints.provider.js';
import { AiBackendError } from '../adapters/ai-backend.error.js';
import { DEFAULT_LLM_MODEL } from '../adapters/llama-server-llm.adapter.js';

/** Frees the GPU memory of the resident LLM (spike A3: llama-server router mode). */
export interface LlmUnloader {
  unload(): Promise<void>;
}

export const LLM_UNLOADER = Symbol('LLM_UNLOADER');

/** The fake adapters hold no GPU memory. */
export class NoopLlmUnloader implements LlmUnloader {
  async unload(): Promise<void> {}
}

/**
 * llama-server in router mode: `POST /models/unload` `{ model }` answers in about 0.01 s and VRAM
 * falls back to the desktop level; the next chat request with that `model` reloads it (about 7 s).
 * The base URL is read per call (hot-swappable endpoints). Errors are {@link AiBackendError}s.
 */
export class LlamaRouterUnloader implements LlmUnloader {
  constructor(
    private readonly endpoints: AiEndpointsProvider,
    private readonly model: string = DEFAULT_LLM_MODEL,
    private readonly timeoutMs = 10_000,
  ) {}

  async unload(): Promise<void> {
    const baseUrl = this.endpoints.get().llmBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/models/unload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    await res.body?.cancel().catch(() => undefined);
    // 400/404 mean "not loaded" (already unloaded): fine.
    if (!res.ok && res.status !== 400 && res.status !== 404) throw new AiBackendError(res.status);
  }
}
