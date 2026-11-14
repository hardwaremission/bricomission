import { printedPricesCents } from './budget-extraction.js';
import type { RetrievedChunk } from './budget-prompt.js';

export type PriceBand = 'premium' | 'mid' | 'basic';

/** A Catalog product line found in a retrieved chunk. The price is a hint only: verification still runs on the model's quote. */
export interface BandedProduct {
  category: string;
  ref: number;
  sku: string;
  priceCents: bigint;
  band: PriceBand;
}

const SKU = /\b[A-Z]{2,}-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g;

/** SKU lines of a chunk with their unit price (the last decimal-formatted number after the SKU). */
export function parseProductLines(chunk: RetrievedChunk): { ref: number; sku: string; priceCents: bigint }[] {
  const found: { ref: number; sku: string; priceCents: bigint }[] = [];
  for (const line of chunk.text.split('\n')) {
    const skus = line.match(SKU);
    if (!skus) continue;
    const sku = skus[0] as string;
    const rest = line.slice(line.indexOf(sku) + sku.length);
    const prices = printedPricesCents(rest, true);
    const priceCents = prices.at(-1);
    if (priceCents !== undefined && priceCents > 0n) found.push({ ref: chunk.ref, sku, priceCents });
  }
  return found;
}

/**
 * Splits the products of each category into price terciles (premium, mid, basic). A category with
 * fewer than three distinct SKUs gets no bands. Products are ranked by price ascending (ties by SKU),
 * rank `i` of `n` is basic below `n/3`, mid below `2n/3`, else premium. Pure and deterministic.
 */
export function assignPriceBands(chunks: readonly RetrievedChunk[]): BandedProduct[] {
  const byCategory = new Map<string, Map<string, { ref: number; priceCents: bigint }>>();
  for (const chunk of chunks) {
    const category = chunk.category ?? 'other';
    const skus = byCategory.get(category) ?? new Map<string, { ref: number; priceCents: bigint }>();
    for (const line of parseProductLines(chunk)) if (!skus.has(line.sku)) skus.set(line.sku, { ref: line.ref, priceCents: line.priceCents });
    byCategory.set(category, skus);
  }
  const result: BandedProduct[] = [];
  for (const [category, skus] of byCategory) {
    if (skus.size < 3) continue;
    const ranked = [...skus.entries()].sort(([skuA, a], [skuB, b]) => (a.priceCents === b.priceCents ? skuA.localeCompare(skuB) : a.priceCents < b.priceCents ? -1 : 1));
    const n = ranked.length;
    ranked.forEach(([sku, entry], i) => {
      const band: PriceBand = i * 3 < n ? 'basic' : i * 3 < 2 * n ? 'mid' : 'premium';
      result.push({ category, ref: entry.ref, sku, priceCents: entry.priceCents, band });
    });
  }
  return result;
}

/** Prompt lines `category: premium = SKU, SKU; mid = ...; basic = ...` (empty when no category has bands). */
export function renderPriceBands(products: readonly BandedProduct[]): string {
  const categories = [...new Set(products.map((product) => product.category))];
  return categories
    .map((category) => {
      const parts = (['premium', 'mid', 'basic'] as const).map((band) => `${band} = ${products.filter((p) => p.category === category && p.band === band).map((p) => p.sku).join(', ')}`);
      return `${category}: ${parts.join('; ')}`;
    })
    .join('\n');
}
