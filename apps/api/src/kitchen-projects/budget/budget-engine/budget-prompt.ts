import type { CatalogSearchResult, KitchenMeasurements } from '@bricomission/shared-types';
import type { LlmMessage } from '../../../ai/adapters/llm-adapter.js';

/** Fixed category queries of the retrieval step (Decision 2); each runs with `QUERY_LIMIT` results. */
export const BUDGET_QUERIES: readonly string[] = ['base cabinet', 'wall cabinet', 'worktop', 'sink and tap', 'tiles', 'flooring', 'lighting', 'appliances'];
export const QUERY_LIMIT = 5;
/** Total characters of Catalog text sent to the LLM at most. */
export const CHUNK_CHARS_MAX = 12_000;

/** One Catalog chunk numbered for the prompt (`[source N]`). */
export interface RetrievedChunk {
  ref: number;
  catalogName: string;
  pageNumber: number;
  text: string;
}

/** The queries for a project: fixed category queries (Decision 2). */
export function buildBudgetQueries(): string[] {
  return [...BUDGET_QUERIES];
}

/**
 * De-duplicates the hits of every query by chunk id, ranks them (SKU matches first, then score,
 * then document order for a stable result) and keeps at most `limit` chunks and `CHUNK_CHARS_MAX`
 * characters of text. Numbers the survivors from 1.
 */
export function selectChunks(hitsPerQuery: readonly (readonly CatalogSearchResult[])[], limit: number, maxChars = CHUNK_CHARS_MAX): RetrievedChunk[] {
  const unique = new Map<string, CatalogSearchResult>();
  for (const hits of hitsPerQuery) for (const hit of hits) if (!unique.has(hit.chunkId)) unique.set(hit.chunkId, hit);
  const ranked = [...unique.values()].sort(
    (a, b) => b.score - a.score || a.catalogName.localeCompare(b.catalogName) || a.pageNumber - b.pageNumber || a.chunkId.localeCompare(b.chunkId),
  );
  const chosen: RetrievedChunk[] = [];
  let chars = 0;
  for (const hit of ranked) {
    if (chosen.length >= limit) break;
    if (chars + hit.text.length > maxChars && chosen.length > 0) continue;
    chosen.push({ ref: chosen.length + 1, catalogName: hit.catalogName, pageNumber: hit.pageNumber, text: hit.text });
    chars += hit.text.length;
  }
  return chosen;
}

/** The numbered chunk block the fake adapter and the verification both rely on. */
export function renderChunks(chunks: readonly RetrievedChunk[]): string {
  return chunks.map((chunk) => `[source ${chunk.ref}] ${chunk.catalogName}, page ${chunk.pageNumber}\n${chunk.text}\n[/source ${chunk.ref}]`).join('\n\n');
}

const SYSTEM = [
  'You are a kitchen renovation estimator. Build a Budget from the numbered product catalog sources below.',
  'Rules:',
  '- Use ONLY products that appear in the sources. Never invent a product, a SKU or a price.',
  '- For every item copy the SKU and the unit price exactly as printed in the cited source, and set chunkRef to that source number.',
  '- Do not compute totals or subtotals. Give only the quantity of each item for this kitchen (unit as printed: unit, m, m2 or h).',
  '- Return four tiers: luxury (premium products), high, medium and low (the cheapest suitable products). Each tier lists 3 to 5 items that cover a kitchen: cabinets, worktop, sink and tap, appliances, tiles or flooring when the sources have them.',
  '- Keep names short: the English product name only, at most 6 words. No explanations, no extra fields.',
  '- Answer with the JSON object only.',
].join('\n');

/** Chat messages of one attempt. `feedback` (a retry) lists why the previous answer was rejected. */
export function buildBudgetMessages(measurements: KitchenMeasurements, chunks: readonly RetrievedChunk[], feedback?: string): LlmMessage[] {
  const { lengthCm, widthCm, heightCm } = measurements;
  const metres = (cm: number | null): string => (cm === null ? 'unknown' : (cm / 100).toFixed(2));
  const area = lengthCm !== null && widthCm !== null ? ((lengthCm * widthCm) / 10_000).toFixed(1) : 'unknown';
  const room = `Room: length ${metres(lengthCm)} m, width ${metres(widthCm)} m, ceiling height ${metres(heightCm)} m, floor area ${area} m2.`;
  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${room}\n\nCatalog sources:\n\n${renderChunks(chunks)}` },
  ];
  if (feedback) messages.push({ role: 'user', content: feedback });
  return messages;
}
