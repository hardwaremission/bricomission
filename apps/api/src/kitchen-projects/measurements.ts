import type { KitchenMeasurementFieldError, KitchenMeasurements } from '@bricomission/shared-types';

/**
 * Accepted room measurements in whole centimetres (developer decision 2026-11-13).
 * Mirrored by the DB CHECK constraints and, through openapi.json, by the web keypad.
 */
export const MEASUREMENT_LIMITS_CM = {
  lengthCm: { min: 100, max: 2000 },
  widthCm: { min: 100, max: 2000 },
  heightCm: { min: 180, max: 600 },
} as const satisfies Record<keyof KitchenMeasurements, { min: number; max: number }>;

export const MEASUREMENT_FIELDS = ['lengthCm', 'widthCm', 'heightCm'] as const;

export type MeasurementValidation =
  | { ok: true; value: KitchenMeasurements }
  | { ok: false; fields: Partial<Record<keyof KitchenMeasurements, KitchenMeasurementFieldError>> };

/** Each field must be present and be null or an integer within its range. */
export function validateMeasurements(body: unknown): MeasurementValidation {
  const input = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const value: KitchenMeasurements = { lengthCm: null, widthCm: null, heightCm: null };
  const fields: Partial<Record<keyof KitchenMeasurements, KitchenMeasurementFieldError>> = {};
  for (const field of MEASUREMENT_FIELDS) {
    const raw = input[field];
    if (raw === null) continue;
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
      fields[field] = 'not_integer';
      continue;
    }
    const { min, max } = MEASUREMENT_LIMITS_CM[field];
    if (raw < min || raw > max) {
      fields[field] = 'out_of_range';
      continue;
    }
    value[field] = raw;
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value };
}
