import { describe, expect, it } from 'vitest';
import { isCaptureComplete, isReadyForGeneration, readinessHint } from '../src/lib/kitchen-draft/readiness';

const full = { lengthCm: 420, widthCm: 310, heightCm: 260 };

describe('readiness (mirrors the API isReadyForGeneration)', () => {
  it('ready with a photo, three measurements and a Moodboard Item', () => {
    expect(isReadyForGeneration({ measurements: full, photos: [1], moodboard: [1] })).toBe(true);
    expect(readinessHint({ measurements: full, photos: [1], moodboard: [1] })).toBeNull();
  });

  it('boundaries; the Capture hint wins when several parts are missing', () => {
    expect(readinessHint({ measurements: full, photos: [], moodboard: [1] })).toBe('capture');
    for (const field of ['lengthCm', 'widthCm', 'heightCm'] as const) {
      expect(isCaptureComplete({ measurements: { ...full, [field]: null }, photos: [1], moodboard: [1] })).toBe(false);
    }
    expect(readinessHint({ measurements: full, photos: [1], moodboard: [] })).toBe('items');
    expect(readinessHint({ measurements: { ...full, heightCm: null }, photos: [], moodboard: [] })).toBe('capture');
    expect(isReadyForGeneration({ measurements: full, photos: [1], moodboard: [] })).toBe(false);
  });
});
