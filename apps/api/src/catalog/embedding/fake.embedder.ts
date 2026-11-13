import { CATALOG_EMBEDDING_DIMENSIONS, type Embedder, l2Normalize } from './embedder.js';

/** Model id stored for documents embedded by the fake (tests only). */
export const FAKE_EMBEDDING_MODEL = 'fake-token-hash-1024';

/** Lowercased word tokens (Unicode letters and digits; hyphenated SKUs stay whole). */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic, offline embedder for tests: feature hashing of word tokens into
 * 1024 signed buckets, L2-normalized. Texts sharing words score higher, which is
 * enough to test ranking without a model, network or GPU.
 */
export class FakeEmbedder implements Embedder {
  readonly model: string = FAKE_EMBEDDING_MODEL;
  readonly dimensions = CATALOG_EMBEDDING_DIMENSIONS;

  embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.vector(text)));
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(this.vector(text));
  }

  vector(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) {
      vector[0] = 1;
      return vector;
    }
    for (const token of tokens) {
      const hash = fnv1a(token);
      const sign = (hash & 0x80000000) === 0 ? 1 : -1;
      vector[hash % this.dimensions] += sign;
    }
    return l2Normalize(vector);
  }
}
