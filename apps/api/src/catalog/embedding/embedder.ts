/**
 * Vector dimension of every Catalog chunk embedding. It must match the model
 * (Qwen3-Embedding-0.6B, ADR 0004), the `vector(1024)` column in the migration
 * and the dimension guard of the llama-server client.
 */
export const CATALOG_EMBEDDING_DIMENSIONS = 1024;

/** Nest injection token for the active {@link Embedder}. */
export const EMBEDDER = Symbol('EMBEDDER');

/** Turns text into L2-normalized vectors of {@link CATALOG_EMBEDDING_DIMENSIONS} numbers. */
export interface Embedder {
  /** Identifier stored with each Catalog document; re-ingestion is needed when it changes. */
  readonly model: string;
  readonly dimensions: number;
  /** Embeds Catalog passages as they are (no instruction prefix). */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Embeds a search query (with the model's query instruction prefix, if any). */
  embedQuery(text: string): Promise<number[]>;
}

/** The embedding endpoint is down, unreachable, slow or answered with an error status. */
export class EmbeddingUnavailableError extends Error {
  override readonly name = 'EmbeddingUnavailableError';
}

/** The endpoint answered, but with vectors of the wrong size (wrong model loaded). */
export class EmbeddingDimensionError extends Error {
  override readonly name = 'EmbeddingDimensionError';
}

/** Scales a vector to unit length. A zero vector is returned unchanged. */
export function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm === 0 || !Number.isFinite(norm)) return vector.slice();
  return vector.map((value) => value / norm);
}
