import {
  CATALOG_EMBEDDING_DIMENSIONS,
  type Embedder,
  EmbeddingDimensionError,
  EmbeddingUnavailableError,
  l2Normalize,
} from './embedder.js';

export const EMBEDDING_BATCH_SIZE = 16;
export const EMBEDDING_QUERY_TIMEOUT_MS = 10_000;
export const EMBEDDING_BATCH_TIMEOUT_MS = 120_000;

export interface LlamaServerEmbedderOptions {
  /** Base URL of llama-server, e.g. `http://embedder:8080`. */
  baseUrl: string;
  /** Model id stored with each document (`EMBEDDING_MODEL`). */
  model: string;
  /** Prefix prepended to queries only (Qwen3-Embedding instruction); '' for none. */
  queryInstruction: string;
  dimensions?: number;
  fetch?: typeof fetch;
}

interface EmbeddingsResponse {
  data?: { index?: number; embedding?: unknown }[];
}

/**
 * Client for llama-server's OpenAI-compatible `POST /v1/embeddings` (CPU embedder,
 * compose profile `rag`). Batches of 16, per-call timeouts, L2 normalization and a
 * dimension guard. Network failures, timeouts and error statuses become
 * {@link EmbeddingUnavailableError}; error messages never include the response body.
 */
export class LlamaServerEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly queryInstruction: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LlamaServerEmbedderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.model = options.model;
    this.queryInstruction = options.queryInstruction;
    this.dimensions = options.dimensions ?? CATALOG_EMBEDDING_DIMENSIONS;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
      vectors.push(...(await this.request(batch, EMBEDDING_BATCH_TIMEOUT_MS)));
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.request([`${this.queryInstruction}${text}`], EMBEDDING_QUERY_TIMEOUT_MS);
    return vector;
  }

  private async request(input: string[], timeoutMs: number): Promise<number[][]> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input, model: this.model, encoding_format: 'float' }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      throw new EmbeddingUnavailableError(`embedding endpoint unreachable (${reason})`);
    }
    if (!response.ok) {
      throw new EmbeddingUnavailableError(`embedding endpoint answered HTTP ${response.status}`);
    }
    let body: EmbeddingsResponse;
    try {
      body = (await response.json()) as EmbeddingsResponse;
    } catch {
      throw new EmbeddingUnavailableError('embedding endpoint returned invalid JSON');
    }
    const data = Array.isArray(body.data) ? body.data : [];
    if (data.length !== input.length) {
      throw new EmbeddingUnavailableError(`embedding endpoint returned ${data.length} vectors for ${input.length} inputs`);
    }
    const ordered = data
      .map((item, position) => ({ index: typeof item.index === 'number' ? item.index : position, embedding: item.embedding }))
      .sort((a, b) => a.index - b.index);
    return ordered.map(({ embedding }) => {
      if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === 'number')) {
        throw new EmbeddingUnavailableError('embedding endpoint returned a malformed vector');
      }
      if (embedding.length !== this.dimensions) {
        throw new EmbeddingDimensionError(
          `embedding dimension mismatch: model returned ${embedding.length}, expected ${this.dimensions} (check the GGUF loaded by the embedder)`,
        );
      }
      return l2Normalize(embedding as number[]);
    });
  }
}
