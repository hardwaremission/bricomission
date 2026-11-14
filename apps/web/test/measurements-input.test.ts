import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appendDigit, appendSeparator, backspace, keypadValue, stepText } from '../src/lib/kitchen-draft/keypad';
import {
  cmToKeypadText,
  decimalSeparator,
  formatMeasurement,
  MEASUREMENT_FIELDS,
  MEASUREMENT_LIMITS_CM,
  parseMeasurement,
} from '../src/lib/kitchen-draft/measurements';
import { LOCALES } from '../src/i18n/locales';

describe('measurement limits', () => {
  it('equal the API contract (openapi.json KitchenMeasurementsDto min/max)', () => {
    const doc = JSON.parse(readFileSync(fileURLToPath(new URL('../../../packages/api-client/openapi.json', import.meta.url)), 'utf8')) as {
      components: { schemas: Record<string, { properties: Record<string, { minimum: number; maximum: number }> }> };
    };
    const props = doc.components.schemas.KitchenMeasurementsDto?.properties ?? {};
    for (const field of MEASUREMENT_FIELDS) {
      expect({ min: props[field]?.minimum, max: props[field]?.maximum }, field).toEqual(MEASUREMENT_LIMITS_CM[field]);
    }
  });
});

describe('parseMeasurement', () => {
  it.each([
    ['3,20', 'm', { kind: 'value', cm: 320 }],
    ['3.20', 'm', { kind: 'value', cm: 320 }],
    ['3.2', 'm', { kind: 'value', cm: 320 }],
    ['3,05', 'm', { kind: 'value', cm: 305 }],
    ['4', 'm', { kind: 'value', cm: 400 }],
    ['4.', 'm', { kind: 'value', cm: 400 }],
    [' 2,60 ', 'm', { kind: 'value', cm: 260 }],
    ['', 'm', { kind: 'empty' }],
    ['abc', 'm', { kind: 'invalid' }],
    ['1.234,5', 'm', { kind: 'invalid' }],
    ['1,234.5', 'm', { kind: 'invalid' }],
    ['3,205', 'm', { kind: 'invalid' }],
    ['-3', 'm', { kind: 'invalid' }],
    ['+3', 'm', { kind: 'invalid' }],
    ['3e2', 'm', { kind: 'invalid' }],
    ['320', 'cm', { kind: 'value', cm: 320 }],
    ['320,5', 'cm', { kind: 'invalid' }],
    ['320.5', 'cm', { kind: 'invalid' }],
  ] as const)('%j in %s', (text, unit, expected) => {
    expect(parseMeasurement(text, unit)).toEqual(expected);
  });
});

describe('formatMeasurement', () => {
  it('uses the locale separator, 2 decimals in m, no grouping', () => {
    expect(formatMeasurement(320, 'm', 'es')).toBe('3,20');
    expect(formatMeasurement(320, 'm', 'en')).toBe('3.20');
    expect(formatMeasurement(2000, 'm', 'de')).toBe('20,00');
    expect(formatMeasurement(2000, 'cm', 'de')).toBe('2000');
    expect(formatMeasurement(180, 'cm', 'fi')).toBe('180');
  });

  it('every locale has a one-character decimal separator', () => {
    for (const locale of LOCALES) expect(['.', ',']).toContain(decimalSeparator(locale));
    expect(decimalSeparator('en')).toBe('.');
    expect(decimalSeparator('es')).toBe(',');
  });

  it('keypad text of committed values is minimal', () => {
    expect(cmToKeypadText(420, 'm')).toBe('4.2');
    expect(cmToKeypadText(400, 'm')).toBe('4');
    expect(cmToKeypadText(425, 'm')).toBe('4.25');
    expect(cmToKeypadText(405, 'm')).toBe('4.05');
    expect(cmToKeypadText(420, 'cm')).toBe('420');
    expect(cmToKeypadText(null, 'm')).toBe('');
  });
});

describe('measurement keypad rules', () => {
  const type = (keys: string, unit: 'm' | 'cm') =>
    [...keys].reduce((text, key) => (key === '.' ? appendSeparator(text, unit) : key === '<' ? backspace(text) : appendDigit(text, key, unit)), '');

  it('digits append; the separator works once; at most 2 decimals in m', () => {
    expect(type('42', 'm')).toBe('42');
    expect(type('4.2.5', 'm')).toBe('4.25');
    expect(type('4.256', 'm')).toBe('4.25');
    expect(type('.5', 'm')).toBe('0.5');
    expect(type('005', 'm')).toBe('5');
    expect(type('123', 'm')).toBe('12');
  });

  it('cm: whole numbers only, separator ignored, at most 4 digits', () => {
    expect(type('32.0', 'cm')).toBe('320');
    expect(type('12345', 'cm')).toBe('1234');
  });

  it('backspace deletes the last character', () => {
    expect(type('4.25<<', 'm')).toBe('4.');
    expect(type('4<<', 'm')).toBe('');
  });

  it('live validation: empty and out of range are not valid', () => {
    expect(keypadValue('', 'lengthCm', 'm')).toEqual({ state: 'empty' });
    expect(keypadValue('0.5', 'lengthCm', 'm')).toEqual({ state: 'out_of_range', cm: 50 });
    expect(keypadValue('25', 'lengthCm', 'm')).toEqual({ state: 'out_of_range', cm: 2500 });
    expect(keypadValue('4.2', 'lengthCm', 'm')).toEqual({ state: 'valid', cm: 420 });
    expect(keypadValue('1.79', 'heightCm', 'm')).toEqual({ state: 'out_of_range', cm: 179 });
    expect(keypadValue('180', 'heightCm', 'cm')).toEqual({ state: 'valid', cm: 180 });
  });

  it('−/+ step 1 cm and clamp to the range', () => {
    expect(stepText('4.2', 1, 'lengthCm', 'm')).toBe('4.21');
    expect(stepText('4.2', -1, 'lengthCm', 'm')).toBe('4.19');
    expect(stepText('20', 1, 'lengthCm', 'm')).toBe('20');
    expect(stepText('1', -1, 'lengthCm', 'm')).toBe('1');
    expect(stepText('', 1, 'heightCm', 'm')).toBe('1.8');
    expect(stepText('25', -1, 'lengthCm', 'm')).toBe('20');
    expect(stepText('600', 1, 'heightCm', 'cm')).toBe('600');
  });
});
