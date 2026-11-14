import { describe, expect, it } from 'vitest';
import type { BudgetTierRecord } from '../../src/kitchen-projects/budget/budget.repository.js';
import { buildOrderFeedback, isStrictlyOrdered, relabelByTotal } from '../../src/kitchen-projects/budget/budget-engine/tier-order.js';

const tier = (name: BudgetTierRecord['tier'], total: number): BudgetTierRecord => ({
  tier: name,
  subtotalCents: BigInt(Math.round(total / 1.21)),
  vatCents: BigInt(total - Math.round(total / 1.21)),
  totalCents: BigInt(total),
  items: [
    {
      position: 0,
      productName: `item ${name}`,
      sku: `SKU-${name}`,
      catalogName: 'C',
      pageNumber: 1,
      sourceQuote: 'q',
      quotedPrice: '1.00',
      unitPriceCents: BigInt(total),
      quantity: '1',
      quantityHundredths: 100,
      unit: 'unit',
      subtotalCents: BigInt(total),
    },
  ],
});
const four = (lux: number, high: number, medium: number, low: number) => [tier('luxury', lux), tier('high', high), tier('medium', medium), tier('low', low)];

// Developer decision OQ-5 (2026-11-14): Luxury > High > Medium > Low on totalCents, relabel by rank as the last resort.
describe('isStrictlyOrdered', () => {
  it('accepts luxury > high > medium > low', () => {
    expect(isStrictlyOrdered(four(400, 300, 200, 100))).toBe(true);
  });

  it('rejects any inversion, including the High 500 vs Medium 1476 case', () => {
    expect(isStrictlyOrdered(four(2000, 500, 1476, 100))).toBe(false);
    expect(isStrictlyOrdered(four(100, 200, 300, 400))).toBe(false);
    expect(isStrictlyOrdered(four(400, 300, 100, 200))).toBe(false);
  });

  it('rejects equal totals (strict) and a missing tier', () => {
    expect(isStrictlyOrdered(four(400, 300, 300, 100))).toBe(false);
    expect(isStrictlyOrdered(four(100, 100, 100, 100))).toBe(false);
    expect(isStrictlyOrdered(four(400, 300, 200, 100).slice(0, 3))).toBe(false);
  });

  it('does not depend on the order of the array', () => {
    expect(isStrictlyOrdered([...four(400, 300, 200, 100)].reverse())).toBe(true);
  });
});

describe('relabelByTotal', () => {
  it('ranks by total descending and gives the names luxury, high, medium, low (names only)', () => {
    const input = four(189_00, 649_00, 129_00, 96_50); // high is the most expensive
    const result = relabelByTotal(input);
    expect(result).not.toBeNull();
    expect(result?.map((t) => t.tier)).toEqual(['luxury', 'high', 'medium', 'low']);
    expect(result?.map((t) => t.totalCents)).toEqual([649_00n, 189_00n, 129_00n, 96_50n]);
    expect(isStrictlyOrdered(result ?? [])).toBe(true);
  });

  it('never changes an amount, price, SKU or Line Item: every row keeps its own contents', () => {
    const input = four(1000, 3000, 2000, 500);
    const before = JSON.stringify(input, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const result = relabelByTotal(input) as BudgetTierRecord[];
    expect(JSON.stringify(input, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(before); // input untouched
    for (const row of result) {
      const origin = input.find((candidate) => candidate.totalCents === row.totalCents) as BudgetTierRecord;
      expect({ ...row, tier: 'same' }).toEqual({ ...origin, tier: 'same' });
    }
    expect(result.map((row) => row.items[0]?.sku)).toEqual(['SKU-high', 'SKU-medium', 'SKU-luxury', 'SKU-low']);
  });

  it('returns null when two totals are equal even after ranking, or a tier is missing', () => {
    expect(relabelByTotal(four(300, 300, 200, 100))).toBeNull();
    expect(relabelByTotal(four(100, 100, 100, 100))).toBeNull();
    expect(relabelByTotal(four(400, 300, 200, 100).slice(0, 3))).toBeNull();
  });

  it('leaves an already ordered Budget with the same names', () => {
    expect(relabelByTotal(four(400, 300, 200, 100))?.map((t) => t.tier)).toEqual(['luxury', 'high', 'medium', 'low']);
  });
});

describe('buildOrderFeedback', () => {
  it('names the four totals in euros and the rule', () => {
    const text = buildOrderFeedback(four(18990, 64900, 12900, 9650));
    expect(text).toContain('luxury 189.90 EUR, high 649.00 EUR, medium 129.00 EUR, low 96.50 EUR');
    expect(text).toContain('luxury > high > medium > low');
    expect(text).toContain('premium band');
  });

  it('pads cents and reports a missing tier', () => {
    expect(buildOrderFeedback([tier('luxury', 1005)])).toContain('luxury 10.05 EUR, high missing EUR');
  });
});
