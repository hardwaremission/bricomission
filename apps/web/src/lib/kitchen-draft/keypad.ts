import {
  cmToKeypadText,
  inRange,
  MEASUREMENT_LIMITS_CM,
  type MeasurementField,
  type MeasurementUnit,
  parseMeasurement,
} from './measurements';

/**
 * Pure editing rules of the measurement keypad (design: docs/design/kitchen-capture-draft.md,
 * panel 5). The text is canonical (`.` separator); the UI shows the locale's symbol. Only
 * digits and one separator can be entered, at most 2 decimals in m and none in cm, so the
 * text always parses; range errors are shown live and block committing.
 */
const MAX_WHOLE_DIGITS: Record<MeasurementUnit, number> = { m: 2, cm: 4 };

export function appendDigit(text: string, digit: string, unit: MeasurementUnit): string {
  if (!/^\d$/.test(digit)) return text;
  const [whole = '', fraction] = text.split('.');
  if (fraction !== undefined) return fraction.length >= 2 ? text : text + digit;
  if (whole === '0') return digit;
  if (whole.length >= MAX_WHOLE_DIGITS[unit]) return text;
  return text + digit;
}

export function appendSeparator(text: string, unit: MeasurementUnit): string {
  if (unit === 'cm' || text.includes('.')) return text;
  return text === '' ? '0.' : `${text}.`;
}

export function backspace(text: string): string {
  return text.slice(0, -1);
}

export type KeypadValue = { state: 'empty' } | { state: 'out_of_range'; cm: number } | { state: 'valid'; cm: number };

export function keypadValue(text: string, field: MeasurementField, unit: MeasurementUnit): KeypadValue {
  const parsed = parseMeasurement(text, unit);
  if (parsed.kind === 'empty') return { state: 'empty' };
  if (parsed.kind === 'invalid') return { state: 'out_of_range', cm: Number.NaN };
  return inRange(field, parsed.cm) ? { state: 'valid', cm: parsed.cm } : { state: 'out_of_range', cm: parsed.cm };
}

/** −/+ 1 cm, clamped to the field's range; an empty or out-of-range value jumps into range. */
export function stepText(text: string, delta: 1 | -1, field: MeasurementField, unit: MeasurementUnit): string {
  const { min, max } = MEASUREMENT_LIMITS_CM[field];
  const parsed = parseMeasurement(text, unit);
  const next = parsed.kind === 'value' ? Math.min(max, Math.max(min, parsed.cm + delta)) : min;
  return cmToKeypadText(next, unit);
}
