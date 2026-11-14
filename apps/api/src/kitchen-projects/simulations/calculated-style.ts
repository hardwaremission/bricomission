import { createHash } from 'node:crypto';

/**
 * Calculated style (feature simulations-ux-overhaul, ADR 0005). Pure: no I/O, no clock, no
 * `Math.random`. Every Moodboard reference gets a blend weight; the first Simulation of a project
 * weighs them equally, "Generate again" draws new weights from a seeded PRNG so the same stored
 * `styleSeed` reproduces them.
 */

/** A style reference: a Style Gallery image id, or the id of an own Moodboard upload. */
export interface StyleReference {
  kind: 'gallery' | 'upload';
  refId: string;
}

export interface WeightedStyleReference extends StyleReference {
  /** Share of the blend; the weights of a Simulation sum to 1. */
  weight: number;
}

/** Raw draw range and the clamp after dividing by the mean: the weight ratio is at most 1.5 / 0.5 = 3. */
export const WEIGHT_MIN = 0.5;
export const WEIGHT_MAX = 1.5;
export const MAX_WEIGHT_RATIO = WEIGHT_MAX / WEIGHT_MIN;

/** mulberry32: a 32-bit seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `1/n` for each of `n` references. */
export function equalWeights(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n);
}

/**
 * Weights of "Generate again": `raw_i` uniform in [0.5, 1.5], divided by the mean, clamped to
 * [0.5, 1.5], normalized to sum 1. Same `styleSeed`, same weights; max/min <= 3.
 */
export function seededWeights(n: number, styleSeed: number): number[] {
  if (n <= 0) return [];
  const random = mulberry32(styleSeed);
  const raw = Array.from({ length: n }, () => WEIGHT_MIN + random() * (WEIGHT_MAX - WEIGHT_MIN));
  const mean = raw.reduce((sum, value) => sum + value, 0) / n;
  const clamped = raw.map((value) => Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, value / mean)));
  const total = clamped.reduce((sum, value) => sum + value, 0);
  return clamped.map((value) => value / total);
}

/** The weights of a new Simulation: equal for the first one of a project, seeded otherwise. */
export function calculateWeights(n: number, styleSeed: number, isFirst: boolean): number[] {
  return isFirst ? equalWeights(n) : seededWeights(n, styleSeed);
}

/** `hash(styleSeed, photoPosition)`: reproducible, differs per Photo; fits the sampler's non-negative int32 range. */
export function renderSeed(styleSeed: number, photoPosition: number): number {
  return createHash('sha256').update(`${styleSeed}:${photoPosition}`).digest().readUInt32BE(0) & 0x7fffffff;
}

/** IP-Adapter weight of one reference: `min(1, base * n * w_i)` (equal weights give `base`). Rounded to 3 decimals. */
export function ipAdapterWeight(base: number, count: number, weight: number): number {
  return Math.round(Math.min(1, base * count * weight) * 1000) / 1000;
}

/** Whole-percent shares that sum to exactly 100 (largest remainder), for the public view. */
export function weightPercents(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (weights.length === 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((value) => (value / total) * 100);
  const floors = exact.map(Math.floor);
  let rest = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const { index } of order) {
    if (rest <= 0) break;
    floors[index] = (floors[index] as number) + 1;
    rest -= 1;
  }
  return floors;
}

/** The references of a Moodboard, in position order: gallery picks by image id, uploads by item id. */
export function referencesFromMoodboard(
  items: readonly { position: number; source: 'gallery' | 'upload'; galleryImageId: string | null; id: string }[],
): StyleReference[] {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .flatMap((item): StyleReference[] =>
      item.source === 'gallery' && item.galleryImageId !== null ? [{ kind: 'gallery', refId: item.galleryImageId }] : item.source === 'upload' ? [{ kind: 'upload', refId: item.id }] : [],
    );
}
