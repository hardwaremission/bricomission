'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  formatMeasurement,
  MEASUREMENT_FIELDS,
  MEASUREMENT_LIMITS_CM,
  type MeasurementField,
  type Measurements,
  type MeasurementUnit,
} from '../../lib/kitchen-draft/measurements';

const TEST_IDS: Record<MeasurementField, string> = { lengthCm: 'capture-length', widthCm: 'capture-width', heightCm: 'capture-height' };

export interface MeasurementsSectionProps {
  values: Measurements;
  unit: MeasurementUnit;
  onUnitChange: (unit: MeasurementUnit) => void;
  /** Opens the measurement keypad on a field. */
  onOpen: (field: MeasurementField) => void;
  activeField: MeasurementField | null;
  disabled: boolean;
}

/**
 * Measurements section (design frames 1-2): m/cm toggle, three fields and the range hint.
 * The fields are buttons that open the keypad sheet: they are never text inputs, so the
 * phone's on-screen keyboard never opens. They only ever show committed (valid) values.
 */
export function MeasurementsSection({ values, unit, onUnitChange, onOpen, activeField, disabled }: MeasurementsSectionProps) {
  const t = useTranslations('capture');
  const locale = useLocale();
  const unitLabel = t(`units.${unit}`);
  const bound = (cm: number) => formatMeasurement(cm, unit, locale);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="capture-measurements-title">
      <div className="flex items-center justify-between gap-sm">
        <h2 id="capture-measurements-title" className="text-[18px] leading-6 font-semibold text-text">
          {t('measurements.title')}
        </h2>
        <div role="radiogroup" aria-label={t('measurements.unit')} data-testid="capture-unit-toggle" className="flex shrink-0 rounded-pill bg-surface-muted">
          {(['m', 'cm'] as const).map((option) => {
            const selected = option === unit;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                data-testid={`capture-unit-${option}`}
                onClick={() => onUnitChange(option)}
                className={`flex h-11 w-12 items-center justify-center rounded-pill text-small leading-5 font-semibold disabled:opacity-60 ${
                  selected ? 'bg-primary text-white' : 'text-text'
                }`}
              >
                {t(`units.${option}`)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {MEASUREMENT_FIELDS.map((field) => {
          const value = values[field];
          const labelId = `capture-${field}-label`;
          const valueId = `capture-${field}-value`;
          return (
            <div key={field} className="flex min-w-0 flex-col gap-2">
              <span id={labelId} className="text-small leading-5 font-semibold text-text">
                {t(`measurements.fields.${field}`)}
              </span>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-labelledby={`${labelId} ${valueId}`}
                disabled={disabled}
                data-testid={TEST_IDS[field]}
                data-value-cm={value ?? ''}
                onClick={() => onOpen(field)}
                className={`flex h-[52px] w-full min-w-0 items-center justify-between gap-1 rounded-md border border-border bg-surface-muted px-3 text-left disabled:opacity-60 ${
                  activeField === field ? 'outline-2 outline-offset-2 outline-focus' : ''
                }`}
              >
                <span id={valueId} className={`truncate text-body tabular-nums ${value === null ? 'text-text-muted' : 'text-text'}`}>
                  {value === null ? bound(0) : bound(value)}
                </span>
                <span className="shrink-0 text-small leading-5 text-text-muted">{unitLabel}</span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-small leading-5 text-text-muted" data-testid="capture-range-hint">
        {t('measurements.rangeHint', {
          lwMin: bound(MEASUREMENT_LIMITS_CM.lengthCm.min),
          lwMax: bound(MEASUREMENT_LIMITS_CM.lengthCm.max),
          hMin: bound(MEASUREMENT_LIMITS_CM.heightCm.min),
          hMax: bound(MEASUREMENT_LIMITS_CM.heightCm.max),
          unit: unitLabel,
        })}
      </p>
    </section>
  );
}
