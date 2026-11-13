import type { LlmAdapter, LlmRequest, LlmResult } from './llm-adapter.js';
import { ActivityTracker, type FakeAdapterOptions, shortHash } from './fake-adapter.support.js';

/** Deterministic LLM fake: `fake:<sha256-16 of the request>`. No GPU, no network. */
export class FakeLlmAdapter implements LlmAdapter {
  readonly calls: LlmRequest[] = [];
  private readonly tracker = new ActivityTracker();

  constructor(private readonly options: FakeAdapterOptions = {}) {}

  get active(): number {
    return this.tracker.active;
  }

  get maxActive(): number {
    return this.tracker.maxActive;
  }

  complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult> {
    this.calls.push(req);
    return this.tracker.track(this.options, signal, () => {
      const text = `fake:${shortHash(req)}`;
      const promptChars = req.messages.reduce((sum, m) => sum + m.content.length, 0);
      return { text, promptTokens: Math.ceil(promptChars / 4), completionTokens: Math.ceil(text.length / 4) };
    });
  }
}
