/**
 * Locale-aware measurement helpers (feature kitchen-capture-draft). Values are whole
 * centimetres; the UI shows metres (2 decimals) or centimetres. The limits mirror the API's
 * MEASUREMENT_LIMITS_CM (test/measurements-input.test.ts compares them with openapi.json).
 */
export const MEASUREMENT_FIELDS = ['lengthCm', 'widthCm', 'heightCm'] as const;
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number];
export type MeasurementUnit = 'm' | 'cm';
/** Every new draft starts in cm (simulations-ux-overhaul S1); the toggle remembers the choice per draft screen. */
export const DEFAULT_MEASUREMENT_UNIT: MeasurementUnit = 'cm';
/** Empty-field hints in cm (S1: for example `400 cm`); never saved. */
export const MEASUREMENT_PLACEHOLDERS_CM: Readonly<Record<MeasurementField, number>> = { lengthCm: 400, widthCm: 300, heightCm: 250 };
export type Measurements = Record<MeasurementField, number | null>;

export const MEASUREMENT_LIMITS_CM: Readonly<Record<MeasurementField, { min: number; max: number }>> = {
  lengthCm: { min: 100, max: 2000 },
  widthCm: { min: 100, max: 2000 },
  heightCm: { min: 180, max: 600 },
};

export const EMPTY_MEASUREMENTS: Measurements = { lengthCm: null, widthCm: null, heightCm: null };

/** The locale's decimal symbol (`.` or `,`). */
export function decimalSeparator(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';
}

export type ParsedMeasurement = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'value'; cm: number };

/**
 * Parses typed or keypad text. One `,` or `.` decimal separator in any locale; no grouping,
 * signs or exponents; at most 2 decimals in m (a trailing separator is allowed while typing);
 * whole numbers in cm. Nothing is rounded: `3,205` m is invalid.
 */
export function parseMeasurement(text: string, unit: MeasurementUnit): ParsedMeasurement {
  const value = text.trim();
  if (value === '') return { kind: 'empty' };
  const match = unit === 'm' ? /^(\d{1,6})(?:[.,](\d{0,2}))?$/.exec(value) : /^(\d{1,6})$/.exec(value);
  if (!match) return { kind: 'invalid' };
  const whole = Number(match[1]);
  if (unit === 'cm') return { kind: 'value', cm: whole };
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return { kind: 'value', cm: whole * 100 + Number(fraction) };
}

export function inRange(field: MeasurementField, cm: number): boolean {
  const { min, max } = MEASUREMENT_LIMITS_CM[field];
  return Number.isInteger(cm) && cm >= min && cm <= max;
}

/** `4,20` (es) / `4.20` (en) in m; `420` in cm. No digit grouping. */
export function formatMeasurement(cm: number, unit: MeasurementUnit, locale: string): string {
  if (unit === 'cm') return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: false }).format(cm);
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cm / 100);
}

/** Minimal keypad text for a committed value: 420 -> `4.2` (m) or `420` (cm). Canonical `.`. */
export function cmToKeypadText(cm: number | null, unit: MeasurementUnit): string {
  if (cm === null) return '';
  if (unit === 'cm') return String(cm);
  const whole = Math.floor(cm / 100);
  const fraction = String(cm % 100).padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}
