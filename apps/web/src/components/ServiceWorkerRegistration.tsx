'use client';

import { useEffect } from 'react';

/** Registers /sw.js in production builds only (dev servers must never be cached). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installability degrades gracefully; nothing to show the visitor.
    });
  }, []);
  return null;
}
