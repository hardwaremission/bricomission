'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, CircleAlert, Delete, Minus, Plus, X } from 'lucide-react';
import { appendDigit, appendSeparator, backspace, keypadValue, stepText } from '../../lib/kitchen-draft/keypad';
import {
  cmToKeypadText,
  decimalSeparator,
  formatMeasurement,
  MEASUREMENT_FIELDS,
  MEASUREMENT_LIMITS_CM,
  type MeasurementField,
  type Measurements,
  type MeasurementUnit,
} from '../../lib/kitchen-draft/measurements';

const LONG_PRESS_MS = 600;
const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 80;

type Texts = Record<MeasurementField, string>;

function textsFrom(values: Measurements, unit: MeasurementUnit): Texts {
  return { lengthCm: cmToKeypadText(values.lengthCm, unit), widthCm: cmToKeypadText(values.widthCm, unit), heightCm: cmToKeypadText(values.heightCm, unit) };
}

export interface MeasurementKeypadProps {
  /** Field to open on; null keeps the sheet closed. */
  openField: MeasurementField | null;
  unit: MeasurementUnit;
  values: Measurements;
  onCommit: (field: MeasurementField, cm: number) => void;
  onActiveFieldChange: (field: MeasurementField) => void;
  onClose: () => void;
}

/**
 * Measurement keypad bottom sheet (design frames 3 and 5). The only measurement validator:
 * digits and one locale separator, max 2 decimals in m and none in cm, live range check;
 * Next/Done commit valid values only. Close (button, Escape or backdrop) commits the valid
 * edits and discards invalid ones. A physical keyboard types digits, the separator,
 * Backspace, Enter (Next/Done) and Escape (Close).
 */
export function MeasurementKeypad({ openField, unit, values, onCommit, onActiveFieldChange, onClose }: MeasurementKeypadProps) {
  const t = useTranslations('capture');
  const locale = useLocale();
  const separator = decimalSeparator(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<MeasurementField>('lengthCm');
  const [texts, setTexts] = useState<Texts>(() => textsFrom(values, unit));
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const repeat = useRef<{ timer: ReturnType<typeof setTimeout> | null; stepped: boolean }>({ timer: null, stepped: false });
  // Latest state for the pointer timers.
  const live = useRef({ active, texts });
  live.current = { active, texts };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openField && !dialog.open) {
      setTexts(textsFrom(values, unit));
      setActive(openField);
      dialog.showModal();
    } else if (!openField && dialog.open) {
      dialog.close();
    }
    // Only the open/close transition matters: values are re-read on every open.
  }, [openField]);

  const unitLabel = t(`units.${unit}`);
  const current = keypadValue(texts[active], active, unit);
  const valid = current.state === 'valid';
  const fieldIndex = MEASUREMENT_FIELDS.indexOf(active);
  const nextField = MEASUREMENT_FIELDS[fieldIndex + 1];
  const { min, max } = MEASUREMENT_LIMITS_CM[active];
  const bound = (cm: number) => formatMeasurement(cm, unit, locale);
  const show = (text: string) => text.replace('.', separator);

  const edit = (update: (text: string) => string) => {
    const field = live.current.active;
    setTexts((previous) => ({ ...previous, [field]: update(previous[field]) }));
  };
  const selectField = (field: MeasurementField) => {
    setActive(field);
    onActiveFieldChange(field);
  };

  const commitValid = (snapshot: Texts) => {
    for (const field of MEASUREMENT_FIELDS) {
      const value = keypadValue(snapshot[field], field, unit);
      if (value.state === 'valid' && value.cm !== values[field]) onCommit(field, value.cm);
    }
  };
  const close = () => {
    commitValid(live.current.texts);
    dialogRef.current?.close();
    onClose();
  };
  const next = () => {
    if (current.state !== 'valid') return;
    if (nextField) {
      if (current.cm !== values[active]) onCommit(active, current.cm);
      selectField(nextField);
    } else {
      close();
    }
  };

  const stopRepeat = () => {
    if (repeat.current.timer) clearTimeout(repeat.current.timer);
    repeat.current.timer = null;
  };
  const startRepeat = (delta: 1 | -1) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    repeat.current.stepped = true;
    edit((text) => stepText(text, delta, live.current.active, unit));
    const tick = (delay: number) => {
      repeat.current.timer = setTimeout(() => {
        edit((text) => stepText(text, delta, live.current.active, unit));
        tick(REPEAT_EVERY_MS);
      }, delay);
    };
    stopRepeat();
    tick(REPEAT_DELAY_MS);
  };
  const stepClick = (delta: 1 | -1) => () => {
    // Pointer presses already stepped on pointerdown; keyboard activation steps here.
    if (repeat.current.stepped) {
      repeat.current.stepped = false;
      return;
    }
    edit((text) => stepText(text, delta, live.current.active, unit));
  };

  const backspaceDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    longPress.current.fired = false;
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      edit(() => '');
    }, LONG_PRESS_MS);
  };
  const backspaceUp = () => {
    if (longPress.current.timer) clearTimeout(longPress.current.timer);
    longPress.current.timer = null;
  };
  const backspaceClick = () => {
    if (longPress.current.fired) {
      longPress.current.fired = false;
      return;
    }
    edit(backspace);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      edit((text) => appendDigit(text, event.key, unit));
    } else if (event.key === '.' || event.key === ',') {
      event.preventDefault();
      edit((text) => appendSeparator(text, unit));
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      edit(backspace);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      next();
    }
  };

  const keyClass = 'flex h-14 items-center justify-center rounded-md border border-border text-[24px] leading-8 font-semibold text-text';
  const digit = (d: string) => (
    <button key={d} type="button" data-testid={`keypad-key-${d}`} onClick={() => edit((text) => appendDigit(text, d, unit))} className={`${keyClass} bg-surface`}>
      {d}
    </button>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-label={t('keypad.label')}
      data-testid="keypad-sheet"
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-0 mt-auto max-h-dvh w-full max-w-none overflow-y-auto rounded-t-lg bg-surface p-0 text-text shadow-sheet backdrop:bg-[#1C1C1E66]"
    >
      <div className="flex flex-col gap-md px-md pt-sm pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))]">
        <div className="flex h-[52px] items-center justify-between">
          <h2 className="text-[18px] leading-6 font-semibold">{t('keypad.title')}</h2>
          <button
            type="button"
            onClick={close}
            aria-label={t('keypad.close')}
            data-testid="keypad-close"
            className="flex size-11 items-center justify-center rounded-pill bg-surface-muted text-text"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div role="tablist" className="flex gap-1 rounded-[16px] bg-surface-muted p-1">
          {MEASUREMENT_FIELDS.map((field) => {
            const selected = field === active;
            const text = texts[field];
            return (
              <button
                key={field}
                type="button"
                role="tab"
                id={`keypad-tab-${field}`}
                aria-selected={selected}
                aria-controls="keypad-panel"
                data-testid={`keypad-tab-${field}`}
                onClick={() => selectField(field)}
                className={`flex h-[52px] min-w-0 grow basis-0 flex-col items-center justify-center rounded-md ${selected ? 'bg-surface shadow-[0_1px_2px_#0000001F]' : ''}`}
              >
                <span className={`text-small leading-5 text-text ${selected ? 'font-semibold' : 'font-medium'}`}>{t(`measurements.fields.${field}`)}</span>
                <span className={`max-w-full truncate text-[12px] leading-4 tabular-nums ${selected ? 'font-semibold text-primary' : 'text-text-muted'}`}>
                  {text === '' ? t('keypad.empty') : `${show(text)} ${unitLabel}`}
                </span>
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="keypad-panel" aria-labelledby={`keypad-tab-${active}`} className="flex flex-col gap-md">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label={t('keypad.decrease')}
              data-testid="keypad-decrease"
              onPointerDown={startRepeat(-1)}
              onPointerUp={stopRepeat}
              onPointerLeave={stopRepeat}
              onPointerCancel={stopRepeat}
              onClick={stepClick(-1)}
              className="flex size-11 items-center justify-center rounded-pill bg-surface-muted text-text"
            >
              <Minus size={20} aria-hidden="true" />
            </button>
            <output aria-live="polite" data-testid="keypad-display" className="flex min-w-0 items-end gap-1.5">
              <span className="text-[40px] leading-[48px] font-bold text-text tabular-nums" data-testid="keypad-value">
                {show(texts[active])}
              </span>
              <span aria-hidden="true" className="mb-1 h-10 w-0.5 bg-primary" />
              <span className="text-[20px] leading-8 font-semibold text-text-muted">{unitLabel}</span>
            </output>
            <button
              type="button"
              aria-label={t('keypad.increase')}
              data-testid="keypad-increase"
              onPointerDown={startRepeat(1)}
              onPointerUp={stopRepeat}
              onPointerLeave={stopRepeat}
              onPointerCancel={stopRepeat}
              onClick={stepClick(1)}
              className="flex size-11 items-center justify-center rounded-pill bg-surface-muted text-text"
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          </div>

          {valid ? (
            <p className="text-center text-small leading-5 text-text-muted" data-testid="keypad-hint" data-state="valid">
              {t('keypad.range', { min: bound(min), max: bound(max), unit: unitLabel })}
            </p>
          ) : (
            <p className="flex items-center justify-center gap-1.5 text-center text-small leading-5 text-danger" data-testid="keypad-hint" data-state="error">
              <CircleAlert size={16} aria-hidden="true" className="shrink-0" />
              <span>{t('keypad.rangeError', { min: bound(min), max: bound(max), unit: unitLabel })}</span>
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit)}
            <button
              type="button"
              aria-label={t('keypad.separator')}
              aria-disabled={unit === 'cm'}
              data-testid="keypad-key-separator"
              onClick={() => {
                if (unit !== 'cm') edit((text) => appendSeparator(text, unit));
              }}
              className={`${keyClass} bg-surface-muted ${unit === 'cm' ? 'text-text-muted opacity-50' : ''}`}
            >
              {separator}
            </button>
            {digit('0')}
            <button
              type="button"
              aria-label={t('keypad.backspace')}
              data-testid="keypad-key-backspace"
              onPointerDown={backspaceDown}
              onPointerUp={backspaceUp}
              onPointerLeave={backspaceUp}
              onPointerCancel={backspaceUp}
              onClick={backspaceClick}
              className={`${keyClass} bg-surface-muted`}
            >
              <Delete size={24} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            data-testid="keypad-clear"
            onClick={() => edit(() => '')}
            className="flex h-[52px] w-[120px] shrink-0 items-center justify-center rounded-pill border border-border bg-surface px-md text-body font-semibold text-primary"
          >
            {t('keypad.clear')}
          </button>
          <button
            type="button"
            data-testid="keypad-next"
            disabled={!valid}
            onClick={next}
            className="flex h-[52px] min-w-0 grow items-center justify-center gap-sm rounded-pill bg-primary px-md text-body font-semibold text-white disabled:border disabled:border-border disabled:bg-surface-muted disabled:text-text-muted"
          >
            <span className="truncate">{nextField ? t('keypad.next', { field: t(`measurements.fields.${nextField}`) }) : t('keypad.done')}</span>
            {valid ? <ArrowRight size={20} aria-hidden="true" className="shrink-0" /> : null}
          </button>
        </div>
      </div>
    </dialog>
  );
}
