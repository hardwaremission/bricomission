import type { AiEndpointsProvider } from '../ai-endpoints.provider.js';
import { AiBackendError } from './ai-backend.error.js';
import type { LlmAdapter, LlmRequest, LlmResult } from './llm-adapter.js';

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

/** llama.cpp `llama-server` through its OpenAI-compatible, non-streaming chat endpoint. */
export class LlamaServerLlmAdapter implements LlmAdapter {
  constructor(private readonly endpoints: AiEndpointsProvider) {}

  async complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult> {
    const body: Record<string, unknown> = { messages: req.messages, stream: false };
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.jsonSchema !== undefined) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'out', strict: true, schema: req.jsonSchema },
      };
    }
    // Read the endpoint per call so a hot-swapped provider takes effect immediately.
    const baseUrl = this.endpoints.get().llmBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      // Drop the body: it may echo prompts or internal details.
      await res.body?.cancel().catch(() => undefined);
      throw new AiBackendError(res.status);
    }
    let json: ChatCompletionResponse;
    try {
      json = (await res.json()) as ChatCompletionResponse;
    } catch {
      throw new AiBackendError(null);
    }
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new AiBackendError(null);
    return {
      text,
      promptTokens: toCount(json.usage?.prompt_tokens),
      completionTokens: toCount(json.usage?.completion_tokens),
    };
  }
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
