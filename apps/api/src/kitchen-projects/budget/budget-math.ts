/**
 * Exact Budget arithmetic (ADR 0002). Every amount is an integer number of minor units (euro
 * cents) held in a BigInt; there is no float and no decimal library. The LLM never produces an
 * amount: only a verified quoted price and a quantity enter here, and every subtotal and tier
 * total comes from these functions.
 */

/** Largest unit price accepted (cents): 10 million euro. A guard against absurd model output. */
export const MAX_PRICE_CENTS = 1_000_000_000n;
/** Largest quantity accepted (hundredths): 10 000 units. */
export const MAX_QUANTITY_HUNDREDTHS = 1_000_000n;

const DECIMAL = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;

/** `189.90` / `189,9` / `12` -> cents (18990n); null when not a plain non-negative decimal with at most two decimals. */
export function parsePriceCents(text: string): bigint | null {
  const match = DECIMAL.exec(text.trim());
  if (!match) return null;
  const cents = BigInt(match[1] as string) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return cents > MAX_PRICE_CENTS ? null : cents;
}

/** `2.5` / `3` / `0,75` -> hundredths (250n); strictly positive, null otherwise. */
export function parseQuantityHundredths(text: string): bigint | null {
  const match = DECIMAL.exec(text.trim());
  if (!match) return null;
  const hundredths = BigInt(match[1] as string) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return hundredths > 0n && hundredths <= MAX_QUANTITY_HUNDREDTHS ? hundredths : null;
}

/** Integer division of non-negative values, rounding half up. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** `round_half_up(unitPriceCents * quantityHundredths / 100)`. */
export function lineSubtotalCents(unitPriceCents: bigint, quantityHundredths: bigint): bigint {
  return divRoundHalfUp(unitPriceCents * quantityHundredths, 100n);
}

export interface TierTotals {
  /** The part before VAT (`total - vat`). */
  subtotalCents: bigint;
  /** The VAT part of the total. */
  vatCents: bigint;
  /** Sum of the Line Item subtotals; what the Homeowner pays (catalog prices are VAT-inclusive). */
  totalCents: bigint;
}

/**
 * Tier totals from the Line Item subtotals and the VAT rate in basis points (21 % = 2100).
 * Prices are VAT-inclusive: `total = sum of the items` (order independent),
 * `subtotal = round_half_up(total * 10000 / (10000 + bps))`, `vat = total - subtotal`, so
 * `subtotal + vat = total` always holds.
 */
export function tierTotals(itemSubtotalsCents: readonly bigint[], vatBps: number): TierTotals {
  const total = itemSubtotalsCents.reduce((sum, value) => sum + value, 0n);
  const subtotal = divRoundHalfUp(total * 10_000n, 10_000n + BigInt(vatBps));
  return { subtotalCents: subtotal, vatCents: total - subtotal, totalCents: total };
}

/** An amount as a JSON-safe number (throws above 2^53 - 1, which the input caps make unreachable). */
export function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('amount too large');
  return Number(value);
}

/** Hundredths as the canonical quantity string (`250n` -> `2.5`, `300n` -> `3`). */
export function formatHundredths(hundredths: bigint): string {
  const whole = hundredths / 100n;
  const frac = (hundredths % 100n).toString().padStart(2, '0').replace(/0$/, '');
  return frac === '' || frac === '0' ? whole.toString() : `${whole}.${frac}`;
}
