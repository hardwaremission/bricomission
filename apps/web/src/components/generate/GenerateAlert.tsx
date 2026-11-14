'use client';

import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

const TONES = {
  warning: { border: 'border-warning', icon: CircleAlert, color: 'text-warning', role: 'alert' },
  danger: { border: 'border-danger', icon: CircleAlert, color: 'text-danger', role: 'alert' },
  info: { border: 'border-primary', icon: Info, color: 'text-primary', role: 'status' },
  success: { border: 'border-success', icon: CircleCheck, color: 'text-success', role: 'status' },
} as const;

/**
 * Page alert of the Generate and owned project screens (docs/design/login-gate-claim.md, panel
 * 6): the Capture alert component (1 px tone stroke, 20 px icon, 14/20 text) with an optional
 * action below the text (Sign out, Try again, Start) and an optional Close button.
 */
export function GenerateAlert({
  tone,
  message,
  action,
  onDismiss,
  dismissLabel,
  testId,
}: {
  tone: keyof typeof TONES;
  message: string;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  testId: string;
}) {
  const { border, icon: Icon, color, role } = TONES[tone];
  return (
    <div role={role} data-testid={testId} className={`flex flex-col gap-sm rounded-md border bg-surface p-md ${border}`}>
      <div className="flex items-start gap-3">
        <Icon size={20} aria-hidden="true" className={`shrink-0 ${color}`} />
        <p className="min-w-0 grow text-small leading-5 text-text">{message}</p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            data-testid={`${testId}-dismiss`}
            className="-my-3 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-pill text-text"
          >
            <X size={20} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {action ? <div className="flex">{action}</div> : null}
    </div>
  );
}

/** Secondary 44 px pill used as an alert action (Sign out, Try again). */
export const ALERT_ACTION_CLASS =
  'flex h-11 items-center gap-1.5 rounded-pill border border-border bg-surface px-md text-small leading-5 font-semibold text-primary';
