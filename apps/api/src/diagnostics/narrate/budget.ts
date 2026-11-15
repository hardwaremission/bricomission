import type { BudgetTier } from '@bricomission/shared-types';
import type { Diagnostics } from '../diagnostics.types.js';
import { makeThumb } from '../thumbnail.js';

interface Hit {
  catalogName: string;
  pageNumber: number;
  score?: number;
  sku?: string;
}

/** budget-engine -> catalog-search `step`: the queries sent. */
export function retrievalQueries(d: Diagnostics, queries: readonly string[], extra: boolean, limit: number): void {
  if (!d.enabled) return;
  d.emit({
    from: 'budget-engine',
    to: 'catalog-search',
    kind: 'step',
    summary: extra ? `+${queries.length} extra queries from the inventory x ${limit} hits` : `${queries.length} base queries x ${limit} hits`,
    payload: { queries, limit },
  });
}

/** catalog-search -> budget-engine: chunks and top score. */
export function retrievalResults(d: Diagnostics, hitsPerQuery: ReadonlyArray<readonly Hit[]>): void {
  if (!d.enabled) return;
  const all = hitsPerQuery.flat();
  const top = all.reduce((max, h) => Math.max(max, h.score ?? 0), 0);
  d.emit({
    from: 'catalog-search',
    to: 'budget-engine',
    kind: 'step',
    summary: `results: ${all.length} chunks, top score ${top.toFixed(3)}`,
    payload: { queries: hitsPerQuery.length, chunks: all.length, topScore: top },
  });
}

/** budget-engine `compute` (self): the merged inventory. */
export function inventoryMerged(d: Diagnostics, elements: ReadonlyArray<{ category: string; count: number; labels: readonly string[] }>): void {
  if (!d.enabled) return;
  d.emit({
    from: 'budget-engine',
    to: 'budget-engine',
    kind: 'compute',
    summary: `merged inventory: ${elements.map((e) => `${e.category} x${e.count}`).join(', ') || 'empty'}`,
    payload: { elements: elements.map((e) => ({ category: e.category, maxCount: e.count, labels: e.labels })) },
  });
}

/** budget-engine -> gpu-broker `queue` submit. */
export function submitJob(d: Diagnostics, summary: string, payload: Record<string, unknown> = {}): void {
  if (!d.enabled) return;
  d.emit({ from: 'budget-engine', to: 'gpu-broker', kind: 'queue', summary, payload });
}

/** The render thumbnail of an inventory read ("Reading image n of N"). */
export async function readingImage(d: Diagnostics, input: { index: number; total: number; image: Buffer }): Promise<void> {
  if (!d.enabled) return;
  d.emit({
    from: 'budget-engine',
    to: 'gpu-broker',
    kind: 'queue',
    summary: `Reading image ${input.index} of ${input.total}`,
    payload: { index: input.index, total: input.total, bytes: input.image.length, thumbnail: (await makeThumb(input.image)) ?? null },
  });
}

interface VerifiedTier {
  tier: BudgetTier;
  subtotalCents: bigint;
  vatCents: bigint;
  totalCents: bigint;
  items: ReadonlyArray<{ sku: string; productName: string; quotedPrice: string; quantity: string; unit: string; catalogName: string; pageNumber: number; subtotalCents: bigint }>;
}

/** budget-engine -> budget-math `compute`: accepted/rejected items and the tiers (ADR 0002: the model extracts, code computes). */
export function verifyAndCompute(
  d: Diagnostics,
  input: { attempt: number; maxAttempts: number; tiers: readonly VerifiedTier[] | null; rejected: ReadonlyArray<{ tier: string; index: number; sku: string; reason: string }>; ordered: boolean | null; relabeled?: boolean; wellFormed: boolean },
): void {
  if (!d.enabled) return;
  const accepted = input.tiers?.reduce((n, t) => n + t.items.length, 0) ?? 0;
  d.emit({
    from: 'budget-engine',
    to: 'budget-math',
    kind: 'compute',
    summary: `verify and compute attempt ${input.attempt} of ${input.maxAttempts}: ${accepted} accepted, ${input.rejected.length} rejected${input.ordered === null ? '' : input.ordered ? ', tiers strictly ordered' : ', tiers NOT ordered'}`,
    ok: input.wellFormed,
    payload: {
      attempt: input.attempt,
      wellFormed: input.wellFormed,
      accepted,
      rejected: input.rejected.map((r) => ({ tier: r.tier, index: r.index, sku: r.sku, reason: r.reason })),
      isStrictlyOrdered: input.ordered,
      relabeled: input.relabeled ?? false,
      tiers: (input.tiers ?? []).map((t) => ({
        tier: t.tier,
        subtotalCents: Number(t.subtotalCents),
        vatCents: Number(t.vatCents),
        totalCents: Number(t.totalCents),
        items: t.items.map((i) => ({ sku: i.sku, name: i.productName, quotedPrice: i.quotedPrice, quantity: i.quantity, unit: i.unit, source: `${i.catalogName} p.${i.pageNumber}`, subtotalCents: Number(i.subtotalCents) })),
      })),
    },
  });
}

/** budget-math -> budget-engine: the verified result. */
export function verifiedResult(d: Diagnostics, input: { tiers: readonly VerifiedTier[]; relabeled: boolean; attempts: number }): void {
  if (!d.enabled) return;
  d.emit({
    from: 'budget-math',
    to: 'budget-engine',
    kind: 'compute',
    summary: `verified tiers after ${input.attempts} attempt${input.attempts === 1 ? '' : 's'}${input.relabeled ? ' (relabelled by total)' : ''}: ${input.tiers.map((t) => `${t.tier} ${(Number(t.totalCents) / 100).toFixed(2)}`).join(' > ')}`,
    payload: { relabeled: input.relabeled, attempts: input.attempts, totals: Object.fromEntries(input.tiers.map((t) => [t.tier, Number(t.totalCents)])) },
  });
}
