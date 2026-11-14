import { describe, expect, it } from 'vitest';
import {
  calculateWeights,
  equalWeights,
  ipAdapterWeight,
  MAX_WEIGHT_RATIO,
  mulberry32,
  referencesFromMoodboard,
  renderSeed,
  seededWeights,
  weightPercents,
} from '../../src/kitchen-projects/simulations/calculated-style.js';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('calculated style (feature simulations-ux-overhaul, Decision 1)', () => {
  it('the first Simulation uses equal weights 1/n', () => {
    for (const n of [1, 2, 5, 12]) {
      const weights = calculateWeights(n, 12345, true);
      expect(weights).toEqual(equalWeights(n));
      expect(weights.every((w) => w === 1 / n)).toBe(true);
    }
  });

  it('"Generate again" weights sum to 1, stay within max/min <= 3 and are reproducible from the seed', () => {
    for (let seed = 0; seed < 500; seed++) {
      for (const n of [2, 3, 7, 12]) {
        const weights = seededWeights(n, seed * 7919);
        expect(weights).toHaveLength(n);
        expect(sum(weights)).toBeCloseTo(1, 10);
        expect(Math.max(...weights) / Math.min(...weights)).toBeLessThanOrEqual(MAX_WEIGHT_RATIO + 1e-9);
        expect(weights.every((w) => w > 0)).toBe(true);
        expect(seededWeights(n, seed * 7919)).toEqual(weights);
      }
    }
    expect(calculateWeights(4, 99, false)).toEqual(seededWeights(4, 99));
  });

  it('different seeds give different weights; one reference always weighs 1', () => {
    expect(seededWeights(4, 1)).not.toEqual(seededWeights(4, 2));
    expect(seededWeights(1, 5)).toEqual([1]);
    expect(seededWeights(0, 5)).toEqual([]);
  });

  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('the render seed is hash(styleSeed, photo position): stable, per photo, a non-negative int32', () => {
    expect(renderSeed(7, 0)).toBe(renderSeed(7, 0));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((p) => renderSeed(7, p))).size).toBe(8);
    expect(renderSeed(7, 0)).not.toBe(renderSeed(8, 0));
    for (let i = 0; i < 50; i++) {
      const seed = renderSeed(i * 1_000_003, i);
      expect(Number.isInteger(seed) && seed >= 0 && seed <= 0x7fffffff).toBe(true);
    }
  });

  it('IP-Adapter weight is min(1, base * n * w), so equal weights give the base', () => {
    expect(ipAdapterWeight(0.6, 4, 0.25)).toBe(0.6);
    expect(ipAdapterWeight(0.6, 4, 0.5)).toBe(1);
    expect(ipAdapterWeight(0.4, 2, 0.1)).toBe(0.08);
  });

  it('percent shares always sum to exactly 100', () => {
    expect(weightPercents([1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33]);
    expect(weightPercents([0.5, 0.5])).toEqual([50, 50]);
    for (let seed = 0; seed < 100; seed++) expect(sum(weightPercents(seededWeights(7, seed)))).toBe(100);
    expect(weightPercents([])).toEqual([]);
  });

  it('references follow the Moodboard order: gallery by image id, uploads by item id', () => {
    expect(
      referencesFromMoodboard([
        { position: 1, source: 'upload', galleryImageId: null, id: 'u1' },
        { position: 0, source: 'gallery', galleryImageId: 'modern-01', id: 'g1' },
      ]),
    ).toEqual([
      { kind: 'gallery', refId: 'modern-01' },
      { kind: 'upload', refId: 'u1' },
    ]);
  });
});
