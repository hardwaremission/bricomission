import type { BudgetTier } from '@bricomission/shared-types';
import type { BudgetTierRecord } from '../budget.repository.js';

/** Display order of the tiers, highest first: the order the totals must follow (OQ-5, ADR 0002 stays intact). */
export const TIER_ORDER: readonly BudgetTier[] = ['luxury', 'high', 'medium', 'low'];

/** True when `luxury > high > medium > low` on `totalCents`; equal totals fail. Pure, no amounts are produced. */
export function isStrictlyOrdered(tiers: readonly Pick<BudgetTierRecord, 'tier' | 'totalCents'>[]): boolean {
  const byTier = new Map(tiers.map((tier) => [tier.tier, tier.totalCents]));
  const totals = TIER_ORDER.map((tier) => byTier.get(tier));
  if (totals.some((total) => total === undefined)) return false;
  return totals.every((total, index) => index === 0 || (totals[index - 1] as bigint) > (total as bigint));
}

/** `1234` -> `12.34` for the retry feedback (text only, never stored). */
function euros(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** The retry message of an out-of-order attempt: names the totals and the rule. */
export function buildOrderFeedback(tiers: readonly Pick<BudgetTierRecord, 'tier' | 'totalCents'>[]): string {
  const totals = TIER_ORDER.map((name) => {
    const found = tiers.find((tier) => tier.tier === name);
    return `${name} ${found ? euros(found.totalCents) : 'missing'} EUR`;
  }).join(', ');
  return [
    `Your previous answer was rejected: the tier totals were ${totals}.`,
    'The rule is luxury > high > medium > low, strictly: every tier must cost less than the one above it.',
    'Take luxury from the premium band, low from the basic band (and keep quantities in step). Answer again with the complete JSON.',
  ].join('\n');
}

/**
 * Last resort after the final attempt (developer decision OQ-5): ranks the four verified tiers by
 * `totalCents` descending and gives them the names luxury, high, medium, low in that order. Only the
 * names change: every amount, price and Line Item stays with its tier row. Returns null when two
 * totals are equal (ranking cannot fix that) or a tier is missing. The input is not modified.
 */
export function relabelByTotal(tiers: readonly BudgetTierRecord[]): BudgetTierRecord[] | null {
  if (tiers.length !== TIER_ORDER.length) return null;
  const ranked = [...tiers].sort((a, b) => (a.totalCents === b.totalCents ? 0 : a.totalCents > b.totalCents ? -1 : 1));
  for (let i = 1; i < ranked.length; i++) if ((ranked[i - 1] as BudgetTierRecord).totalCents === (ranked[i] as BudgetTierRecord).totalCents) return null;
  return ranked.map((tier, index) => ({ ...tier, tier: TIER_ORDER[index] as BudgetTier }));
}
