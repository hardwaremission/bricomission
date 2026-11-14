import type { CatalogSearchResult, KitchenMeasurements } from '@bricomission/shared-types';
import type { LlmMessage } from '../../../ai/adapters/llm-adapter.js';
import { type MergedElement, renderInventory } from './inventory.js';
import { type BandedProduct, renderPriceBands } from './price-bands.js';

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
  /** The retrieval query (category) that first returned the chunk; the price bands group by it. */
  category?: string;
}

/** The queries for a project: fixed category queries (Decision 2). */
export function buildBudgetQueries(): string[] {
  return [...BUDGET_QUERIES];
}

/**
 * De-duplicates the hits of every query by chunk id, ranks them (SKU matches first, then score,
 * then document order for a stable result) and keeps at most `limit` chunks and `CHUNK_CHARS_MAX`
 * characters of text. Numbers the survivors from 1. `categories[i]` names the query of
 * `hitsPerQuery[i]`; a chunk keeps the category of the first query that returned it.
 */
export function selectChunks(hitsPerQuery: readonly (readonly CatalogSearchResult[])[], limit: number, maxChars = CHUNK_CHARS_MAX, categories: readonly string[] = []): RetrievedChunk[] {
  const unique = new Map<string, CatalogSearchResult>();
  const categoryOf = new Map<string, string>();
  hitsPerQuery.forEach((hits, index) => {
    for (const hit of hits) {
      if (!unique.has(hit.chunkId)) unique.set(hit.chunkId, hit);
      const category = categories[index];
      if (category !== undefined && !categoryOf.has(hit.chunkId)) categoryOf.set(hit.chunkId, category);
    }
  });
  const ranked = [...unique.values()].sort(
    (a, b) => b.score - a.score || a.catalogName.localeCompare(b.catalogName) || a.pageNumber - b.pageNumber || a.chunkId.localeCompare(b.chunkId),
  );
  const chosen: RetrievedChunk[] = [];
  let chars = 0;
  for (const hit of ranked) {
    if (chosen.length >= limit) break;
    if (chars + hit.text.length > maxChars && chosen.length > 0) continue;
    const category = categoryOf.get(hit.chunkId);
    chosen.push({ ref: chosen.length + 1, catalogName: hit.catalogName, pageNumber: hit.pageNumber, text: hit.text, ...(category === undefined ? {} : { category }) });
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
  '- Tiers must be strictly ordered by total cost: luxury costs more than high, high more than medium, medium more than low. When price bands are listed, take luxury items from the premium band and low items from the basic band.',
  '- When the room inventory is listed, cover those elements with the listed quantities (they are counts, not prices).',
  '- Answer with the JSON object only.',
].join('\n');

/** Optional inputs of the prompt: the merged element inventory and the price bands of the retrieved products. */
export interface BudgetPromptContext {
  inventory?: readonly MergedElement[];
  bands?: readonly BandedProduct[];
}

/** Chat messages of one attempt. `feedback` (a retry) lists why the previous answer was rejected. */
export function buildBudgetMessages(measurements: KitchenMeasurements, chunks: readonly RetrievedChunk[], feedback?: string, context: BudgetPromptContext = {}): LlmMessage[] {
  const { lengthCm, widthCm, heightCm } = measurements;
  const metres = (cm: number | null): string => (cm === null ? 'unknown' : (cm / 100).toFixed(2));
  const area = lengthCm !== null && widthCm !== null ? ((lengthCm * widthCm) / 10_000).toFixed(1) : 'unknown';
  const room = `Room: length ${metres(lengthCm)} m, width ${metres(widthCm)} m, ceiling height ${metres(heightCm)} m, floor area ${area} m2.`;
  const inventory = context.inventory && context.inventory.length > 0 ? `\n\nRoom inventory (elements seen in the renders; quantities only):\n${renderInventory(context.inventory)}` : '';
  const bandText = context.bands && context.bands.length > 0 ? renderPriceBands(context.bands) : '';
  const bands = bandText ? `\n\nPrice bands per category (hints; copy the real price from the source):\n${bandText}` : '';
  const extras = `${inventory}${bands}`;
  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${room}${extras}\n\nCatalog sources:\n\n${renderChunks(chunks)}` },
  ];
  if (feedback) messages.push({ role: 'user', content: feedback });
  return messages;
}
