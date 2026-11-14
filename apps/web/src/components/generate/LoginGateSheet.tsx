'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader, ShieldCheck, X } from 'lucide-react';
import { type Intent, loginUrl } from '../../lib/kitchen-draft/generate-state';

/**
 * Login Gate bottom sheet (docs/design/login-gate-claim.md, frame 3) and the claiming state
 * (panel 4) in one native modal `<dialog>` (focus trapped, Escape and the backdrop close the
 * gate; the claiming state cannot be dismissed). "Sign in" and "Create account" go to
 * `/auth/login` with a returnTo of Generate plus the intent.
 */
export function LoginGateSheet({ mode, intent, onClose }: { mode: 'none' | 'gate' | 'claiming'; intent: Intent; onClose: () => void }) {
  const t = useTranslations('generate');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mode !== 'none' && !dialog.open) dialog.showModal();
    if (mode === 'none' && dialog.open) dialog.close();
  }, [mode]);

  return (
    <dialog
      ref={dialogRef}
      data-testid={mode === 'claiming' ? 'generate-claiming' : 'login-gate'}
      aria-labelledby={mode === 'claiming' ? 'generate-claiming-text' : 'login-gate-title'}
      aria-busy={mode === 'claiming' ? true : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (mode === 'gate') onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes the gate.
        if (event.target === event.currentTarget && mode === 'gate') onClose();
      }}
      className="m-0 mt-auto max-h-dvh w-full max-w-none overflow-y-auto rounded-t-lg bg-surface p-0 text-text shadow-sheet backdrop:bg-[#18223166]"
    >
      {mode === 'claiming' ? (
        <div className="flex flex-col items-center gap-3 px-md pt-lg pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))]">
          <Loader size={24} aria-hidden="true" className="animate-spin text-primary" />
          <p id="generate-claiming-text" role="status" className="text-center text-body font-semibold text-text">
            {t('claiming')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-md px-md pt-sm pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))]">
          <div className="flex h-[52px] items-center justify-between gap-sm">
            <h2 id="login-gate-title" className="text-[18px] leading-6 font-semibold">
              {t('gate.title')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('gate.close')}
              data-testid="login-gate-close"
              className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-text"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="flex gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-secondary" aria-hidden="true">
              <ShieldCheck size={22} className="text-primary" />
            </span>
            <p className="min-w-0 grow text-body text-text">{t('gate.body')}</p>
          </div>
          <a
            href={loginUrl(intent)}
            data-testid="login-gate-sign-in"
            className="flex min-h-[52px] w-full items-center justify-center rounded-pill bg-primary px-md py-[14px] text-center text-body font-semibold text-white hover:bg-primary-hover"
          >
            {t('gate.signIn')}
          </a>
          <a
            href={loginUrl(intent, true)}
            data-testid="login-gate-register"
            className="flex min-h-[52px] w-full items-center justify-center rounded-pill border border-border bg-surface px-md py-[13px] text-center text-body font-semibold text-primary"
          >
            {t('gate.register')}
          </a>
          <p className="text-center text-small leading-5 text-text-muted">{t('gate.footnote')}</p>
        </div>
      )}
    </dialog>
  );
}
