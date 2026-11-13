import type { Embedder } from './embedding/embedder.js';
import { LlamaServerEmbedder } from './embedding/llama-server.embedder.js';

export const DEFAULT_EMBEDDING_URL = 'http://127.0.0.1:8090';
export const DEFAULT_EMBEDDING_MODEL = 'qwen3-embedding-0.6b-q8_0';
/** Qwen3-Embedding query instruction (documents are embedded raw). */
export const DEFAULT_QUERY_INSTRUCTION =
  'Instruct: Given a product search query, retrieve catalog passages that contain matching products\nQuery: ';

export interface EmbeddingConfig {
  url: string;
  model: string;
  queryInstruction: string;
}

/**
 * Embedding settings from the environment. An unset `EMBEDDING_QUERY_INSTRUCTION`
 * means the Qwen default; an empty one means no prefix (bge-m3 fallback). Compose
 * cannot carry a newline in a default, so a literal `\n` is turned into one.
 */
export function embeddingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const instruction = env.EMBEDDING_QUERY_INSTRUCTION ?? DEFAULT_QUERY_INSTRUCTION;
  return {
    url: env.EMBEDDING_URL || DEFAULT_EMBEDDING_URL,
    model: env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    queryInstruction: instruction.replace(/\\n/g, '\n'),
  };
}

export function createEmbedderFromEnv(env: NodeJS.ProcessEnv = process.env): Embedder {
  const config = embeddingConfigFromEnv(env);
  return new LlamaServerEmbedder({ baseUrl: config.url, model: config.model, queryInstruction: config.queryInstruction });
}
