'use client';

import { useEffect, useRef } from 'react';

/**
 * Delete confirmation (docs/design/simulations-ux-overhaul.md, S8): a modal `<dialog>` (the
 * browser traps focus and Escape closes it), p 16, gap 16, radius 20. `Delete simulation` is the
 * danger action (h 52), `Cancel` the outlined one.
 */
export function DeleteSimulationDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // The safe choice has the focus first.
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-simulation-title"
      aria-describedby="delete-simulation-message"
      data-testid="delete-simulation-dialog"
      // Escape fires `cancel` then `close`: both end in the parent's state (never leave it open).
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      // Focus trap: Tab and Shift+Tab cycle between the dialog's buttons (a modal dialog would otherwise hand focus to the browser UI).
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button'));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[358px] rounded-[20px] bg-surface p-md text-text shadow-[0_8px_32px_#0000001F] backdrop:bg-black/40"
    >
      {open ? (
        <div className="flex flex-col gap-md">
          <h2 id="delete-simulation-title" className="text-[18px] leading-6 font-semibold text-text">
            {title}
          </h2>
          <p id="delete-simulation-message" className="text-small leading-5 text-text-muted">
            {message}
          </p>
          <div className="flex flex-col gap-sm">
            <button
              type="button"
              data-testid="delete-simulation-confirm"
              aria-disabled={busy}
              onClick={() => !busy && onConfirm()}
              className="flex h-[52px] w-full items-center justify-center rounded-pill bg-danger px-md text-body font-semibold text-white"
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              ref={cancelRef}
              data-testid="delete-simulation-cancel"
              onClick={onCancel}
              className="flex h-[52px] w-full items-center justify-center rounded-pill border border-border bg-surface px-md text-body font-semibold text-primary"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
