import type { BudgetTier } from '@bricomission/shared-types';
import { formatHundredths, lineSubtotalCents, parsePriceCents, parseQuantityHundredths, tierTotals } from '../budget-math.js';
import type { BudgetItemRecord, BudgetTierRecord } from '../budget.repository.js';
import type { RetrievedChunk } from './budget-prompt.js';

export const BUDGET_TIERS: readonly BudgetTier[] = ['luxury', 'high', 'medium', 'low'];
/** At most 5 items a tier: 4 tiers x 5 items stay near 1 000 completion tokens (about 40 s at 25 tok/s). */
export const MAX_ITEMS_PER_TIER = 5;

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'sku', 'chunkRef', 'quotedPrice', 'quantity', 'unit'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    sku: { type: 'string', minLength: 3, maxLength: 40 },
    chunkRef: { type: 'integer', minimum: 1, maximum: 100 },
    quotedPrice: { type: 'string', pattern: '^[0-9]{1,6}([.,][0-9]{1,2})?$' },
    quantity: { type: 'string', pattern: '^[0-9]{1,4}([.,][0-9]{1,2})?$' },
    unit: { type: 'string', minLength: 1, maxLength: 12 },
  },
} as const;

const TIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: { items: { type: 'array', minItems: 1, maxItems: MAX_ITEMS_PER_TIER, items: ITEM_SCHEMA } },
} as const;

/** JSON Schema of the answer (`LlmRequest.jsonSchema`): the four tiers as keys, at most 5 items each. */
export const BUDGET_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tiers'],
  properties: {
    tiers: {
      type: 'object',
      additionalProperties: false,
      required: [...BUDGET_TIERS],
      properties: Object.fromEntries(BUDGET_TIERS.map((tier) => [tier, TIER_SCHEMA])),
    },
  },
} as const;

export type RejectReason = 'chunk_ref_unknown' | 'sku_not_in_source' | 'price_not_in_source' | 'bad_price' | 'bad_quantity' | 'bad_fields' | 'duplicate_sku';

export interface RejectedItem {
  tier: BudgetTier;
  /** 1-based position in the model's list. */
  index: number;
  sku: string;
  reason: RejectReason;
}

export interface Extraction {
  /** False when the text is not the expected JSON shape. */
  wellFormed: boolean;
  items: Record<BudgetTier, BudgetItemRecord[]>;
  rejected: RejectedItem[];
}

const emptyItems = (): Record<BudgetTier, BudgetItemRecord[]> => ({ luxury: [], high: [], medium: [], low: [] });

/** Numbers printed in a Catalog line as cents. `1.299,00`, `189.90`, `189,9` and `12` all parse; 3-digit groups are thousands.
 * With `decimalOnly`, bare integers (`300` in "300 cm", digits of a SKU) are not prices. */
export function printedPricesCents(line: string, decimalOnly = false): bigint[] {
  const cents: bigint[] = [];
  for (const token of line.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    if (decimalOnly && !/[.,]/.test(token)) continue;
    const lastSep = Math.max(token.lastIndexOf('.'), token.lastIndexOf(','));
    let text = token;
    if (lastSep >= 0) {
      const decimals = token.length - lastSep - 1;
      text = decimals <= 2 ? `${token.slice(0, lastSep).replace(/[.,]/g, '')}.${token.slice(lastSep + 1)}` : token.replace(/[.,]/g, '');
    }
    const value = parsePriceCents(text);
    if (value !== null) cents.push(value);
  }
  return cents;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks one quoted price against the text of the cited chunk (ADR 0002). The SKU must appear
 * in the chunk, and the price must be a number printed on a line that carries the SKU. When
 * the SKU lines print no decimal price at all (an unusual layout), a price printed anywhere
 * in the chunk is accepted. Returns the verified line (the source quote) or the reject reason.
 */
export function verifyAgainstChunk(chunk: RetrievedChunk, sku: string, priceCents: bigint): { quote: string } | { reason: 'sku_not_in_source' | 'price_not_in_source' } {
  const skuPattern = new RegExp(`(?<![A-Za-z0-9-])${escapeRegex(sku)}(?![A-Za-z0-9-])`, 'i');
  const lines = chunk.text.split('\n');
  const skuLines = lines.filter((line) => skuPattern.test(line));
  if (skuLines.length === 0) return { reason: 'sku_not_in_source' };
  // The SKU's own digits are not prices; when a line prints a decimal-formatted price, only decimal-formatted
  // numbers count (a quoted `300` must not match "300 cm" or `BM-SYN-WTP-300`).
  const hit = skuLines.find((line) => {
    const rest = line.replace(new RegExp(skuPattern.source, 'gi'), ' ');
    return printedPricesCents(rest, /\d[.,]\d{1,2}(?!\d)/.test(rest)).includes(priceCents);
  });
  if (hit) return { quote: hit.trim().slice(0, 200) };
  const priced = skuLines.some((line) => /\d[.,]\d{1,2}(?!\d)/.test(line.replace(new RegExp(skuPattern.source, 'gi'), ' ')));
  if (!priced && printedPricesCents(chunk.text).includes(priceCents)) return { quote: (skuLines[0] as string).trim().slice(0, 200) };
  return { reason: 'price_not_in_source' };
}

interface RawItem {
  name?: unknown;
  sku?: unknown;
  chunkRef?: unknown;
  quotedPrice?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strips a currency marker the model may append (`189.90 EUR`, `189,90 €`). */
function cleanDecimal(text: string): string {
  return text.replace(/\s*(?:EUR|€)\s*$/i, '').trim();
}

/** Parses the model's text and verifies every Line Item; rejected items never reach the result. */
export function extractBudget(text: string, chunks: readonly RetrievedChunk[]): Extraction {
  const result: Extraction = { wellFormed: false, items: emptyItems(), rejected: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return result;
  }
  const tiers = isRecord(parsed) && isRecord(parsed.tiers) ? parsed.tiers : null;
  if (!tiers) return result;
  const byRef = new Map(chunks.map((chunk) => [chunk.ref, chunk]));
  for (const tier of BUDGET_TIERS) {
    const list = isRecord(tiers[tier]) && Array.isArray((tiers[tier] as { items?: unknown }).items) ? ((tiers[tier] as { items: unknown[] }).items as unknown[]) : null;
    if (!list) return { wellFormed: false, items: emptyItems(), rejected: [] };
    const seen = new Set<string>();
    list.slice(0, MAX_ITEMS_PER_TIER * 2).forEach((raw, offset) => {
      const index = offset + 1;
      const item = (isRecord(raw) ? raw : {}) as RawItem;
      const sku = typeof item.sku === 'string' ? item.sku.trim() : '';
      const reject = (reason: RejectReason): void => {
        result.rejected.push({ tier, index, sku: sku.slice(0, 40), reason });
      };
      const name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '';
      const unit = typeof item.unit === 'string' ? item.unit.trim().slice(0, 12) : '';
      if (!name || !sku || !unit || typeof item.chunkRef !== 'number' || typeof item.quotedPrice !== 'string' || typeof item.quantity !== 'string') return reject('bad_fields');
      const chunk = byRef.get(item.chunkRef);
      if (!chunk) return reject('chunk_ref_unknown');
      const price = parsePriceCents(cleanDecimal(item.quotedPrice));
      if (price === null) return reject('bad_price');
      const quantity = parseQuantityHundredths(cleanDecimal(item.quantity));
      if (quantity === null) return reject('bad_quantity');
      const verified = verifyAgainstChunk(chunk, sku, price);
      if ('reason' in verified) return reject(verified.reason);
      if (seen.has(sku.toLowerCase()) || result.items[tier].length >= MAX_ITEMS_PER_TIER) return reject('duplicate_sku');
      seen.add(sku.toLowerCase());
      result.items[tier].push({
        position: result.items[tier].length,
        productName: name,
        sku,
        catalogName: chunk.catalogName,
        pageNumber: chunk.pageNumber,
        sourceQuote: verified.quote,
        quotedPrice: cleanDecimal(item.quotedPrice),
        unitPriceCents: price,
        quantity: formatHundredths(quantity),
        quantityHundredths: Number(quantity),
        unit,
        subtotalCents: lineSubtotalCents(price, quantity),
      });
    });
  }
  result.wellFormed = true;
  return result;
}

/** True when every tier kept at least one verified Line Item. */
export function isComplete(extraction: Extraction): boolean {
  return extraction.wellFormed && BUDGET_TIERS.every((tier) => extraction.items[tier].length > 0);
}

/** The tier rows with the code-computed totals (`budget-math`). */
export function buildTiers(items: Record<BudgetTier, BudgetItemRecord[]>, vatBps: number): BudgetTierRecord[] {
  return BUDGET_TIERS.map((tier) => ({ tier, ...tierTotals(items[tier].map((item) => item.subtotalCents), vatBps), items: items[tier] }));
}

const REASON_TEXT: Record<RejectReason, string> = {
  chunk_ref_unknown: 'the chunkRef is not a listed source',
  sku_not_in_source: 'the SKU is not printed in the cited source',
  price_not_in_source: 'the price is not the one printed for that SKU in the cited source',
  bad_price: 'the price is not a plain decimal',
  bad_quantity: 'the quantity is not a positive decimal',
  bad_fields: 'a field is missing or has the wrong type',
  duplicate_sku: 'the SKU repeats inside the tier',
};

/** The retry message: why the previous answer was rejected, without echoing model text. */
export function buildFeedback(extraction: Extraction): string {
  if (!extraction.wellFormed) return 'Your previous answer was not the required JSON object with the four tiers. Answer again with the complete JSON only.';
  const empty = BUDGET_TIERS.filter((tier) => extraction.items[tier].length === 0);
  const lines = extraction.rejected.slice(0, 12).map((r) => `- ${r.tier} item ${r.index} (${r.sku || 'no SKU'}): ${REASON_TEXT[r.reason]}`);
  return [
    `Your previous answer was rejected: tiers without a valid item: ${empty.join(', ') || 'none'}.`,
    ...lines,
    'Answer again with the complete JSON. Copy each SKU and price exactly as printed in the cited source.',
  ].join('\n');
}
