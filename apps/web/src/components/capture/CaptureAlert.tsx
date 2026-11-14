'use client';

import { CloudOff, Info, X } from 'lucide-react';

/** Page alert (Keycloak theme alert pattern): offline warning or dismissible draft-expired info. */
export function CaptureAlert({ kind, message, onDismiss, dismissLabel }: { kind: 'offline' | 'expired'; message: string; onDismiss?: () => void; dismissLabel?: string }) {
  const offline = kind === 'offline';
  const Icon = offline ? CloudOff : Info;
  return (
    <div
      role={offline ? 'alert' : 'status'}
      data-testid={offline ? 'capture-offline' : 'capture-expired'}
      className={`flex items-start gap-3 rounded-md border bg-surface p-md ${offline ? 'border-warning' : 'border-primary'}`}
    >
      <Icon size={20} aria-hidden="true" className={`mt-0 shrink-0 ${offline ? 'text-warning' : 'text-primary'}`} />
      <p className="min-w-0 grow text-small leading-5 text-text">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          data-testid="capture-expired-dismiss"
          className="-my-3 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-pill text-text"
        >
          <X size={20} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
