import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUERY_INSTRUCTION, embeddingConfigFromEnv } from '../../src/catalog/catalog.config.js';
import {
  CATALOG_EMBEDDING_DIMENSIONS,
  EmbeddingDimensionError,
  EmbeddingUnavailableError,
} from '../../src/catalog/embedding/embedder.js';
import { FakeEmbedder } from '../../src/catalog/embedding/fake.embedder.js';
import { EMBEDDING_BATCH_SIZE, LlamaServerEmbedder } from '../../src/catalog/embedding/llama-server.embedder.js';

const norm = (v: number[]): number => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
const dot = (a: number[], b: number[]): number => a.reduce((sum, x, i) => sum + x * b[i], 0);

describe('FakeEmbedder', () => {
  it('is deterministic, 1024-dimensional and L2-normalized', async () => {
    const embedder = new FakeEmbedder();
    const [a] = await embedder.embedDocuments(['Oak laminate worktop 300 cm']);
    const [b] = await embedder.embedDocuments(['Oak laminate worktop 300 cm']);
    expect(a).toEqual(b);
    expect(a).toHaveLength(CATALOG_EMBEDDING_DIMENSIONS);
    expect(embedder.dimensions).toBe(1024);
    expect(norm(a)).toBeCloseTo(1, 10);
    expect(norm(await embedder.embedQuery(''))).toBeCloseTo(1, 10);
  });

  it('scores lexically similar texts higher', async () => {
    const embedder = new FakeEmbedder();
    const query = await embedder.embedQuery('oak worktop');
    const [oak, tap] = await embedder.embedDocuments(['Oak laminate worktop', 'Mixer tap chrome']);
    expect(dot(query, oak)).toBeGreaterThan(dot(query, tap));
  });
});

function vectorOf(size: number, seed: number): number[] {
  return Array.from({ length: size }, (_, i) => ((i * 7 + seed) % 13) - 6);
}

function okResponse(inputs: string[], size = CATALOG_EMBEDDING_DIMENSIONS): Response {
  // Reverse the order to check that results are sorted by index.
  const data = inputs.map((_, index) => ({ index, embedding: vectorOf(size, index) })).reverse();
  return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('LlamaServerEmbedder (mocked fetch)', () => {
  it('posts batches of 16 to /v1/embeddings, keeps input order and normalizes', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      return okResponse(body.input);
    });
    const embedder = new LlamaServerEmbedder({
      baseUrl: 'http://embedder:8080/',
      model: 'qwen3-embedding-0.6b-q8_0',
      queryInstruction: 'Q: ',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const texts = Array.from({ length: 35 }, (_, i) => `chunk ${i}`);
    const vectors = await embedder.embedDocuments(texts);
    expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(35 / EMBEDDING_BATCH_SIZE));
    expect(fetchMock.mock.calls[0][0]).toBe('http://embedder:8080/v1/embeddings');
    const sizes = fetchMock.mock.calls.map((call) => (JSON.parse(String(call[1]?.body)) as { input: string[] }).input.length);
    expect(sizes).toEqual([16, 16, 3]);
    expect(vectors).toHaveLength(35);
    expect(vectors.every((v) => v.length === 1024 && Math.abs(norm(v) - 1) < 1e-9)).toBe(true);
    // index 0 of each batch maps to seed 0
    const expected0 = vectorOf(1024, 0);
    expect(vectors[16][5]).toBeCloseTo(expected0[5] / norm(expected0), 12);
  });

  it('prefixes queries with the instruction and leaves documents raw', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      okResponse((JSON.parse(String(init?.body)) as { input: string[] }).input),
    );
    const embedder = new LlamaServerEmbedder({
      baseUrl: 'http://x',
      model: 'm',
      queryInstruction: 'Instruct: find\nQuery: ',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await embedder.embedQuery('oak');
    await embedder.embedDocuments(['raw passage']);
    const inputs = fetchMock.mock.calls.map((call) => (JSON.parse(String(call[1]?.body)) as { input: string[] }).input[0]);
    expect(inputs).toEqual(['Instruct: find\nQuery: oak', 'raw passage']);
  });

  it('throws EmbeddingDimensionError when the model returns the wrong size', async () => {
    const embedder = new LlamaServerEmbedder({
      baseUrl: 'http://x',
      model: 'm',
      queryInstruction: '',
      fetch: (async () => okResponse(['a'], 768)) as unknown as typeof fetch,
    });
    await expect(embedder.embedQuery('a')).rejects.toBeInstanceOf(EmbeddingDimensionError);
    await expect(embedder.embedQuery('a')).rejects.toThrow(/returned 768, expected 1024/);
  });

  it('throws EmbeddingUnavailableError on network failure and on error statuses', async () => {
    const down = new LlamaServerEmbedder({
      baseUrl: 'http://x',
      model: 'm',
      queryInstruction: '',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });
    await expect(down.embedDocuments(['a'])).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    const loading = new LlamaServerEmbedder({
      baseUrl: 'http://x',
      model: 'm',
      queryInstruction: '',
      fetch: (async () => new Response('{"error":"Loading model"}', { status: 503 })) as unknown as typeof fetch,
    });
    await expect(loading.embedQuery('a')).rejects.toThrow(EmbeddingUnavailableError);
    await expect(loading.embedQuery('a')).rejects.toThrow('HTTP 503');
  });
});

describe('embeddingConfigFromEnv', () => {
  it('defaults to the Qwen instruction and decodes a literal \\n from compose', () => {
    expect(embeddingConfigFromEnv({}).queryInstruction).toBe(DEFAULT_QUERY_INSTRUCTION);
    expect(embeddingConfigFromEnv({ EMBEDDING_QUERY_INSTRUCTION: 'A\\nQuery: ' }).queryInstruction).toBe('A\nQuery: ');
    expect(embeddingConfigFromEnv({ EMBEDDING_QUERY_INSTRUCTION: '' }).queryInstruction).toBe('');
    expect(embeddingConfigFromEnv({ EMBEDDING_URL: 'http://embedder:8080' }).url).toBe('http://embedder:8080');
  });
});
