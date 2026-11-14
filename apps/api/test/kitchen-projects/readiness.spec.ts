import { describe, expect, it } from 'vitest';
import { isReadyForGeneration } from '../../src/kitchen-projects/readiness.js';

const full = { lengthCm: 420, widthCm: 310, heightCm: 260 };

describe('isReadyForGeneration (login-gate-claim Decision 8)', () => {
  it('needs at least one photo, all three measurements and at least one Moodboard Item', () => {
    expect(isReadyForGeneration({ measurements: full, photos: [1], moodboard: [1] })).toBe(true);
    expect(isReadyForGeneration({ measurements: full, photos: [1, 2, 3], moodboard: new Array(12).fill(0) })).toBe(true);
  });

  it('is false at each boundary', () => {
    expect(isReadyForGeneration({ measurements: full, photos: [], moodboard: [1] })).toBe(false);
    expect(isReadyForGeneration({ measurements: full, photos: [1], moodboard: [] })).toBe(false);
    for (const field of ['lengthCm', 'widthCm', 'heightCm'] as const) {
      expect(isReadyForGeneration({ measurements: { ...full, [field]: null }, photos: [1], moodboard: [1] })).toBe(false);
    }
    expect(isReadyForGeneration({ measurements: { lengthCm: null, widthCm: null, heightCm: null }, photos: [], moodboard: [] })).toBe(false);
  });
});
