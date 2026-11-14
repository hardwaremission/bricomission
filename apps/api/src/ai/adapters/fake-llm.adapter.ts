import type { LlmAdapter, LlmRequest, LlmResult } from './llm-adapter.js';
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
  const prompt = req.messages.map((m) => m.content).join('\n');
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

/**
 * Budget JSON for a prompt (feature budget-tier-computation, Decision 7): candidates sorted by
 * printed price, descending (ties by SKU); tier i takes positions i, i+4, i+8 (modulo, no repeats),
 * quantity 1-3 from the position. Same prompt, same JSON; every price is the one printed.
 */
function fakeBudgetJson(req: LlmRequest): string {
  const sorted = candidatesFromPrompt(req).sort((a, b) => Number(b.price.replace(',', '.')) - Number(a.price.replace(',', '.')) || a.sku.localeCompare(b.sku));
  const tiers: Record<string, { items: object[] }> = {};
  TIERS.forEach((tier, index) => {
    const picked = new Map<string, FakeCandidate>();
    if (sorted.length > 0) for (let k = 0; k < 3; k++) {
      const candidate = sorted[(index + 4 * k) % sorted.length] as FakeCandidate;
      if (!picked.has(candidate.sku)) picked.set(candidate.sku, candidate);
    }
    tiers[tier] = {
      items: [...picked.values()].map((c, position) => ({ name: c.name, sku: c.sku, chunkRef: c.ref, quotedPrice: c.price, quantity: String(1 + ((index + position) % 3)), unit: c.unit })),
    };
  });
  return JSON.stringify({ tiers });
}

/**
 * Deterministic LLM fake: `fake:<sha256-16 of the request>`, or, when the request carries a
 * `jsonSchema`, deterministic Budget JSON derived from the prompt's catalog chunks. No GPU, no network.
 */
export class FakeLlmAdapter implements LlmAdapter {
  readonly calls: LlmRequest[] = [];
  private readonly tracker = new ActivityTracker();

  constructor(private readonly options: FakeAdapterOptions = {}) {}

  get active(): number {
    return this.tracker.active;
  }

  get maxActive(): number {
    return this.tracker.maxActive;
  }

  complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult> {
    this.calls.push(req);
    return this.tracker.track(this.options, signal, () => {
      const text = req.jsonSchema ? fakeBudgetJson(req) : `fake:${shortHash(req)}`;
      const promptChars = req.messages.reduce((sum, m) => sum + m.content.length, 0);
      return { text, promptTokens: Math.ceil(promptChars / 4), completionTokens: Math.ceil(text.length / 4) };
    });
  }
}
