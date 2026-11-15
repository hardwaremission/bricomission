import type { LlmAdapter, LlmMessage, LlmRequest, LlmResult } from '../../ai/adapters/llm-adapter.js';
import type { Diagnostics } from '../diagnostics.types.js';
import { makeThumb } from '../thumbnail.js';

export interface LlmInstrumentOptions {
  /** True for the fake adapter: events carry `simulated: true` and `model: fake:...`. */
  simulated: boolean;
  /** Router model id (`LLM_MODEL`), or `fake` label. */
  model: string;
}

type MessagePayload = { role: string; parts: Array<{ type: 'text'; text: string } | { type: 'image'; mime: string; bytes: number; thumbnail?: unknown }> };

/** Chat messages as dashboard payload: text in full, images as a thumbnail plus size, never bytes. */
export async function describeMessages(messages: readonly LlmMessage[]): Promise<MessagePayload[]> {
  const out: MessagePayload[] = [];
  for (const message of messages) {
    const parts: MessagePayload['parts'] = [];
    if (typeof message.content === 'string') parts.push({ type: 'text', text: message.content });
    else {
      for (const part of message.content) {
        if (part.type === 'text') parts.push({ type: 'text', text: part.text });
        else parts.push({ type: 'image', mime: part.mime, bytes: part.data.length, thumbnail: await makeThumb(part.data) });
      }
    }
    out.push({ role: message.role, parts });
  }
  return out;
}

/**
 * Decorates the LLM adapter (node `ai-adapters` > `llama-server`, kind `llm`). Installed only when
 * diagnostics are enabled; the wrapped adapter's behavior and errors pass through unchanged.
 */
export class InstrumentedLlmAdapter implements LlmAdapter {
  constructor(
    private readonly inner: LlmAdapter,
    private readonly diagnostics: Diagnostics,
    private readonly options: LlmInstrumentOptions,
  ) {}

  async complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult> {
    const task = req.task ?? 'chat';
    const model = this.options.simulated ? `fake:${this.options.model}` : this.options.model;
    const images = req.messages.reduce((n, m) => n + (typeof m.content === 'string' ? 0 : m.content.filter((p) => p.type === 'image').length), 0);
    const span = this.diagnostics.span({
      from: 'ai-adapters',
      to: 'llama-server',
      kind: 'llm',
      summary: `chat completion task=${task}${images > 0 ? `, ${images} image${images === 1 ? '' : 's'}` : ''}`,
      simulated: this.options.simulated,
      payload: {
        model,
        task,
        maxTokens: req.maxTokens ?? null,
        schemaFields: req.jsonSchema ? Object.keys((req.jsonSchema as { properties?: object }).properties ?? {}) : null,
        messages: await describeMessages(req.messages),
      },
    });
    try {
      const result = await this.inner.complete(req, signal);
      span.end({
        summary: `${task} reply: ${result.promptTokens} prompt + ${result.completionTokens} completion tokens`,
        payload: { model, task, reply: result.text, promptTokens: result.promptTokens, completionTokens: result.completionTokens },
        ok: true,
      });
      return result;
    } catch (error) {
      span.end({ summary: `failed (${errorLabel(error)})`, payload: { model, task }, ok: false });
      throw error;
    }
  }
}

/** Short, secret-free error label (the class name; never the message, which may echo a prompt). */
export function errorLabel(error: unknown): string {
  return error instanceof Error ? error.name : 'error';
}
