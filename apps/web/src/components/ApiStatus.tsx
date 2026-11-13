'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@bricomission/api-client';
import { checkApiHealth, type ApiState } from '../lib/api-status';

const DOT_CLASS: Record<ApiState, string> = {
  checking: 'bg-text-muted',
  online: 'bg-success',
  degraded: 'bg-warning',
  offline: 'bg-danger',
};

/** ServiceStatus (design: 4 states, dot 8 px + 14/20 label; colour is never the only signal). */
export function ApiStatus() {
  const t = useTranslations('status');
  const [state, setState] = useState<ApiState>('checking');

  useEffect(() => {
    // Same-origin base URL: the src/app/api route handler proxies to the API (no CORS).
    const client = createApiClient(`${window.location.origin}/api`);
    let active = true;
    const check = () => {
      setState('checking');
      void checkApiHealth(client).then((next) => {
        if (active) setState(next);
      });
    };
    check();
    window.addEventListener('online', check);
    return () => {
      active = false;
      window.removeEventListener('online', check);
    };
  }, []);

  return (
    <div data-testid="api-status" data-state={state} className="flex w-full items-center justify-center gap-sm" aria-live="polite">
      <span className={`size-2 shrink-0 rounded-pill ${DOT_CLASS[state]}`} aria-hidden="true" />
      <span className="text-center text-small leading-5 text-text-muted">{t(state)}</span>
    </div>
  );
}
