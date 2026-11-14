import { describe, expect, it } from 'vitest';
import { MEASUREMENT_LIMITS_CM, validateMeasurements } from '../../src/kitchen-projects/measurements.js';

const valid = { lengthCm: 420, widthCm: 310, heightCm: 260 };

describe('validateMeasurements', () => {
  it('has the confirmed ranges', () => {
    expect(MEASUREMENT_LIMITS_CM).toEqual({
      lengthCm: { min: 100, max: 2000 },
      widthCm: { min: 100, max: 2000 },
      heightCm: { min: 180, max: 600 },
    });
  });

  it.each([
    ['lengthCm', 99, 'out_of_range'],
    ['lengthCm', 100, null],
    ['lengthCm', 2000, null],
    ['lengthCm', 2001, 'out_of_range'],
    ['widthCm', 99, 'out_of_range'],
    ['widthCm', 2000, null],
    ['widthCm', 2001, 'out_of_range'],
    ['heightCm', 179, 'out_of_range'],
    ['heightCm', 180, null],
    ['heightCm', 600, null],
    ['heightCm', 601, 'out_of_range'],
    ['heightCm', null, null],
    ['heightCm', 3.5, 'not_integer'],
    ['heightCm', '300', 'not_integer'],
    ['heightCm', true, 'not_integer'],
    ['heightCm', undefined, 'not_integer'],
    ['heightCm', Number.NaN, 'not_integer'],
  ] as const)('%s = %j -> %s', (field, value, expected) => {
    const result = validateMeasurements({ ...valid, [field]: value });
    if (expected === null) {
      expect(result).toEqual({ ok: true, value: { ...valid, [field]: value } });
    } else {
      expect(result).toEqual({ ok: false, fields: { [field]: expected } });
    }
  });

  it('allows all null', () => {
    expect(validateMeasurements({ lengthCm: null, widthCm: null, heightCm: null })).toEqual({
      ok: true,
      value: { lengthCm: null, widthCm: null, heightCm: null },
    });
  });

  it.each([null, [], 'x', 5])('rejects a non-object body %j on every field', (body) => {
    expect(validateMeasurements(body)).toEqual({
      ok: false,
      fields: { lengthCm: 'not_integer', widthCm: 'not_integer', heightCm: 'not_integer' },
    });
  });
});
