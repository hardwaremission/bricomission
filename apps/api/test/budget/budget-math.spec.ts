import { describe, expect, it } from 'vitest';
import {
  divRoundHalfUp,
  formatHundredths,
  lineSubtotalCents,
  parsePriceCents,
  parseQuantityHundredths,
  tierTotals,
  toSafeNumber,
} from '../../src/kitchen-projects/budget/budget-math.js';

// Feature budget-tier-computation, Scenario 4 (ADR 0002): exact integer arithmetic.
describe('budget-math', () => {
  it('parses decimal strings to cents and hundredths, and rejects anything else', () => {
    expect(parsePriceCents('189.90')).toBe(18990n);
    expect(parsePriceCents('189,9')).toBe(18990n);
    expect(parsePriceCents('12')).toBe(1200n);
    expect(parsePriceCents('0.05')).toBe(5n);
    for (const bad of ['', '1.234', '-3', '1e3', 'abc', '1,299.00', '9999999999']) expect(parsePriceCents(bad)).toBeNull();
    expect(parseQuantityHundredths('2.5')).toBe(250n);
    expect(parseQuantityHundredths('3')).toBe(300n);
    expect(parseQuantityHundredths('0,75')).toBe(75n);
    expect(parseQuantityHundredths('0')).toBeNull();
    expect(parseQuantityHundredths('10001')).toBeNull();
  });

  it('computes subtotals with fractional quantities: 2.5 m of a 189.90 worktop is 474.75', () => {
    expect(lineSubtotalCents(18990n, 250n)).toBe(47475n);
  });

  it('rounds half up at the cent', () => {
    expect(lineSubtotalCents(1n, 50n)).toBe(1n); // 0.5 cent -> 1
    expect(lineSubtotalCents(1n, 49n)).toBe(0n);
    expect(lineSubtotalCents(333n, 150n)).toBe(500n); // 499.5 -> 500
    expect(lineSubtotalCents(1005n, 10n)).toBe(101n); // 100.5 -> 101
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(4n, 2n)).toBe(2n);
  });

  it('gives a VAT-inclusive breakdown at 21 % where subtotal + vat = total', () => {
    const totals = tierTotals([12100n], 2100);
    expect(totals).toEqual({ subtotalCents: 10000n, vatCents: 2100n, totalCents: 12100n });
    const odd = tierTotals([47475n, 12900n], 2100); // 60375 gross
    expect(odd.totalCents).toBe(60375n);
    expect(odd.subtotalCents + odd.vatCents).toBe(odd.totalCents);
    expect(odd.subtotalCents).toBe(49897n); // 60375 / 1.21 = 49896.69 -> 49897
    expect(tierTotals([], 2100)).toEqual({ subtotalCents: 0n, vatCents: 0n, totalCents: 0n });
    expect(tierTotals([1000n], 0)).toEqual({ subtotalCents: 1000n, vatCents: 0n, totalCents: 1000n });
  });

  it('does not depend on the order of the items and is byte-identical when repeated', () => {
    const subtotals = [47475n, 12900n, 9n, 100001n, 333n];
    const forward = tierTotals(subtotals, 2100);
    expect(tierTotals([...subtotals].reverse(), 2100)).toEqual(forward);
    expect(JSON.stringify(tierTotals(subtotals, 2100), (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).toBe(
      JSON.stringify(forward, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
    );
  });

  it('property: total is the exact sum and subtotal + vat = total for pseudo-random items', () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let run = 0; run < 200; run++) {
      const items = Array.from({ length: 1 + (next() % 8) }, () => lineSubtotalCents(BigInt(1 + (next() % 500000)), BigInt(1 + (next() % 1000))));
      const sum = items.reduce((a, b) => a + b, 0n);
      const totals = tierTotals(items, 2100);
      expect(totals.totalCents).toBe(sum);
      expect(totals.subtotalCents + totals.vatCents).toBe(sum);
      expect(totals.vatCents >= 0n).toBe(true);
    }
  });

  it('formats quantities canonically and guards unsafe numbers', () => {
    expect(formatHundredths(250n)).toBe('2.5');
    expect(formatHundredths(300n)).toBe('3');
    expect(formatHundredths(75n)).toBe('0.75');
    expect(formatHundredths(105n)).toBe('1.05');
    expect(toSafeNumber(18990n)).toBe(18990);
    expect(() => toSafeNumber(2n ** 60n)).toThrow(RangeError);
  });
});
