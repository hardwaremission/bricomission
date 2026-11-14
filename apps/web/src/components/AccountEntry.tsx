'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut, UserRound, X } from 'lucide-react';

type SessionState = { signedIn: false } | { signedIn: true; user: { username: string; displayName: string } };

function initialOf(user: { username: string; displayName: string }): string {
  const source = user.displayName.trim() || user.username;
  return (Array.from(source)[0] ?? '?').toLocaleUpperCase();
}

/**
 * Account entry of the Home header (design: docs/design/homeowner-password-login.md).
 * The server HTML is the same for everyone (cacheable); the signed-in state hydrates from
 * GET /auth/session (no-store). Until it is known, and on any error, the anonymous
 * "Sign in" entry shows (same 44x44 footprint, so no layout shift). Sign-in is never forced.
 */
export function AccountEntry() {
  const t = useTranslations('auth');
  const pathname = usePathname() || '/';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<SessionState>({ signedIn: false });

  useEffect(() => {
    let active = true;
    fetch('/auth/session', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? (res.json() as Promise<SessionState>) : { signedIn: false as const }))
      .catch(() => ({ signedIn: false as const }))
      .then((next) => {
        if (active) setState(next.signedIn && next.user ? next : { signedIn: false });
      });
    return () => {
      active = false;
    };
  }, []);

  if (!state.signedIn) {
    return (
      <a
        href={`/auth/login?returnTo=${encodeURIComponent(pathname)}`}
        data-testid="account-signin"
        aria-label={t('signIn')}
        className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-text"
      >
        <UserRound size={20} aria-hidden="true" />
      </a>
    );
  }

  const { user } = state;
  const close = () => dialogRef.current?.close();
  return (
    <>
      <button
        type="button"
        data-testid="account-button"
        aria-haspopup="dialog"
        aria-label={t('accountLabel', { name: user.displayName })}
        onClick={() => dialogRef.current?.showModal()}
        className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary text-body font-semibold text-white"
      >
        <span aria-hidden="true">{initialOf(user)}</span>
      </button>

      <dialog
        ref={dialogRef}
        data-testid="account-sheet"
        aria-labelledby="account-sheet-title"
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes the sheet.
          if (event.target === event.currentTarget) close();
        }}
        className="m-0 mt-auto max-h-dvh w-full max-w-none overflow-y-auto rounded-t-lg bg-surface p-0 text-text shadow-sheet backdrop:bg-[#18223166]"
      >
        <div className="flex flex-col gap-md px-md pt-sm pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))]">
          <div className="flex h-[52px] items-center justify-between">
            <h2 id="account-sheet-title" className="text-[18px] leading-6 font-semibold">
              {t('sheetTitle')}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t('close')}
              className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-text"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-md">
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-primary text-[22px] leading-7 font-semibold text-white"
            >
              {initialOf(user)}
            </span>
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <p data-testid="account-display-name" className="text-[18px] leading-6 font-semibold break-words text-text">
                {user.displayName}
              </p>
              <p data-testid="account-username" className="text-small leading-5 break-words text-text-muted">
                {user.username}
              </p>
            </div>
          </div>

          <form method="post" action="/auth/logout">
            <button
              type="submit"
              data-testid="account-signout"
              className="flex min-h-[52px] w-full items-center justify-center gap-sm rounded-pill border border-border bg-surface px-md py-[13px] text-body font-semibold text-primary"
            >
              <LogOut size={20} aria-hidden="true" className="shrink-0" />
              <span>{t('signOut')}</span>
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
