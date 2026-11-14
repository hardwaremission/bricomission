import { createHash } from 'node:crypto';
import { contentText, type LlmAdapter, type LlmContentPart, type LlmRequest, type LlmResult } from './llm-adapter.js';
import { ActivityTracker, type FakeAdapterOptions, shortHash } from './fake-adapter.support.js';

const SKU = /\b[A-Z]{2,}-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/;
const PRICE = /(\d+(?:[.,]\d{1,2})?)\s*EUR\b/;
const TIERS = ['luxury', 'high', 'medium', 'low'] as const;

interface FakeCandidate {
  ref: number;
  sku: string;
  name: string;
  unit: string;
  price: string;
}

/** Product lines of the `[source N]` blocks of a budget prompt: SKU, name, unit and the printed price. */
function candidatesFromPrompt(req: LlmRequest): FakeCandidate[] {
  const prompt = req.messages.map((m) => contentText(m.content)).join('\n');
  const found: FakeCandidate[] = [];
  for (const block of prompt.matchAll(/\[source (\d+)\][^\n]*\n([\s\S]*?)\n\[\/source \1\]/g)) {
    for (const line of (block[2] as string).split('\n')) {
      const sku = SKU.exec(line);
      const price = PRICE.exec(line);
      if (!sku || !price || price.index < sku.index) continue;
      const between = line.slice(sku.index + sku[0].length, price.index);
      // Catalog tables print `SKU | name | unit | price EUR`; plain text prints `SKU name unit price EUR`.
      const cells = between.split('|').map((cell) => cell.trim()).filter(Boolean);
      const words = (cells.length > 1 ? (cells[0] as string) : between).trim().split(/\s+/);
      const unit = cells.length > 1 ? (cells.at(-1) as string) : words.length > 1 ? (words.pop() as string) : 'unit';
      found.push({ ref: Number(block[1]), sku: sku[0], name: (cells.length > 1 ? (cells[0] as string) : words.join(' ')).slice(0, 120) || sku[0], unit: unit.slice(0, 12), price: price[1] as string });
    }
  }
  return found;
}

/** `ordered` (default) answers luxury > high > medium > low on totals; `misordered` mirrors it (always out of order, no ties) to exercise retry and relabel. */
export type FakeBudgetOrder = 'ordered' | 'misordered';

export interface FakeLlmOptions extends FakeAdapterOptions {
  budgetOrder?: FakeBudgetOrder;
}

/**
 * Budget JSON for a prompt (feature budget-tier-computation Decision 7, tier order in simulations-ux-overhaul):
 * candidates sorted by printed price, descending (ties by SKU). Tier i takes `sorted[i]` with quantity `4 - i`
 * when there are at least four candidates, else every tier takes `sorted[0]`; price x quantity then strictly
 * decreases, so the default answer satisfies luxury > high > medium > low. `misordered` swaps the tiers
 * (luxury gets the low tier's item and quantity). Same prompt, same JSON; every price is the one printed.
 */
function fakeBudgetJson(req: LlmRequest, order: FakeBudgetOrder): string {
  const sorted = candidatesFromPrompt(req).sort((a, b) => Number(b.price.replace(',', '.')) - Number(a.price.replace(',', '.')) || a.sku.localeCompare(b.sku));
  const tiers: Record<string, { items: object[] }> = {};
  TIERS.forEach((tier, index) => {
    const rank = order === 'ordered' ? index : TIERS.length - 1 - index;
    const candidate = sorted.length === 0 ? undefined : (sorted[sorted.length >= TIERS.length ? rank : 0] as FakeCandidate);
    tiers[tier] = { items: candidate ? [{ name: candidate.name, sku: candidate.sku, chunkRef: candidate.ref, quotedPrice: candidate.price, quantity: String(TIERS.length - rank), unit: candidate.unit }] : [] };
  });
  return JSON.stringify({ tiers });
}

const PALETTE = ['warm white', 'sage green', 'navy blue', 'charcoal', 'terracotta', 'soft grey', 'natural oak', 'matte black'];
const MATERIALS = ['oak wood', 'quartz', 'marble', 'brushed steel', 'ceramic tile', 'concrete', 'walnut veneer', 'matte lacquer'];
const CABINET_STYLES = ['shaker', 'flat-panel', 'handleless', 'framed', 'open shelving', 'two-tone'];
const LIGHTING = ['natural daylight', 'warm pendant light', 'under-cabinet strips', 'bright recessed spots'];
const KEYWORDS = ['minimal', 'cosy', 'industrial', 'rustic', 'scandinavian', 'modern', 'classic', 'bold', 'airy', 'textured', 'sleek', 'earthy'];
const INVENTORY = [
  ['base cabinet', 'Base cabinets'],
  ['wall cabinet', 'Wall cabinets'],
  ['worktop', 'Worktop'],
  ['sink', 'Sink'],
  ['hob', 'Hob'],
  ['fridge', 'Fridge'],
  ['backsplash', 'Backsplash'],
  ['flooring', 'Flooring'],
] as const;

/** The first image of a request, hashed (the fakes derive everything from its bytes). */
function imageDigest(req: LlmRequest): Buffer {
  const images = req.messages.flatMap((m) => (typeof m.content === 'string' ? [] : m.content.filter((p): p is Extract<LlmContentPart, { type: 'image' }> => p.type === 'image')));
  const hash = createHash('sha256');
  for (const image of images) hash.update(image.data);
  if (images.length === 0) hash.update(shortHash(req));
  return hash.digest();
}

function pick<T>(list: readonly T[], digest: Buffer, offset: number, count: number): T[] {
  const picked: T[] = [];
  for (let i = 0; picked.length < count && i < list.length * 2; i++) {
    const item = list[((digest[(offset + i) % digest.length] as number) + i) % list.length] as T;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}

/** Style traits of one reference image, derived from its bytes (task `style_traits`). */
function fakeStyleTraitsJson(req: LlmRequest): string {
  const d = imageDigest(req);
  return JSON.stringify({
    palette: pick(PALETTE, d, 0, 2),
    materials: pick(MATERIALS, d, 4, 2),
    cabinetStyle: pick(CABINET_STYLES, d, 8, 1)[0],
    lighting: pick(LIGHTING, d, 12, 1)[0],
    keywords: pick(KEYWORDS, d, 16, 3),
  });
}

/** Element inventory of one Render, derived from its bytes (task `inventory`); counts are quantities, never amounts. */
function fakeInventoryJson(req: LlmRequest): string {
  const d = imageDigest(req);
  const elements = INVENTORY.map(([category, label], index) => ({ category, label, count: 1 + ((d[index] as number) % 4) })).filter((_, index) => (d[index + 8] as number) % 5 !== 0);
  return JSON.stringify({ elements });
}

/**
 * Deterministic LLM fake: `fake:<sha256-16 of the request>`, or, when the request carries a
 * `jsonSchema`, deterministic Budget JSON derived from the prompt's catalog chunks. Task `style_traits`
 * returns traits from a hash of the image bytes and task `inventory` an element list from the same
 * hash (simulations-ux-overhaul). No GPU, no network.
 */
export class FakeLlmAdapter implements LlmAdapter {
  readonly calls: LlmRequest[] = [];
  private readonly tracker = new ActivityTracker();

  constructor(private readonly options: FakeLlmOptions = {}) {}

  get active(): number {
    return this.tracker.active;
  }

  get maxActive(): number {
    return this.tracker.maxActive;
  }

  complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult> {
    this.calls.push(req);
    return this.tracker.track(this.options, signal, () => {
      const text =
        req.task === 'style_traits' ? fakeStyleTraitsJson(req) : req.task === 'inventory' ? fakeInventoryJson(req) : req.jsonSchema ? fakeBudgetJson(req, this.options.budgetOrder ?? 'ordered') : `fake:${shortHash(req)}`;
      const promptChars = req.messages.reduce((sum, m) => sum + contentText(m.content).length, 0);
      return { text, promptTokens: Math.ceil(promptChars / 4), completionTokens: Math.ceil(text.length / 4) };
    });
  }
}
