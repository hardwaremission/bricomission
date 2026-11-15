import type { Embedder } from '../../catalog/embedding/embedder.js';
import type { Diagnostics } from '../diagnostics.types.js';
import { errorLabel } from './llm.js';

/** Decorates the embedder (node `catalog-search` > `embedder`, kind `embed`). Installed only when enabled. */
export class InstrumentedEmbedder implements Embedder {
  constructor(
    private readonly inner: Embedder,
    private readonly diagnostics: Diagnostics,
  ) {}

  get model(): string {
    return this.inner.model;
  }

  get dimensions(): number {
    return this.inner.dimensions;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.run(`embed ${texts.length} Catalog passage${texts.length === 1 ? '' : 's'}`, { passages: texts.length }, () => this.inner.embedDocuments(texts));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.run('POST /v1/embeddings (query)', { query: text }, () => this.inner.embedQuery(text));
  }

  private async run<T>(summary: string, request: Record<string, unknown>, call: () => Promise<T>): Promise<T> {
    const base = { model: this.inner.model, dimensions: this.inner.dimensions };
    const span = this.diagnostics.span({ from: 'catalog-search', to: 'embedder', kind: 'embed', summary, payload: { ...base, ...request } });
    try {
      const result = await call();
      span.end({ summary: `${summary}: ${this.inner.dimensions} dimensions`, payload: base, ok: true });
      return result;
    } catch (error) {
      span.end({ summary: `failed (${errorLabel(error)})`, payload: base, ok: false });
      throw error;
    }
  }
}
