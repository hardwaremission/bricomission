import { describe, expect, it, vi } from 'vitest';
import { SPLASH_OVERLAY_ID, SPLASH_SCRIPT, SPLASH_STORAGE_KEY } from '../src/components/splash/splash-script';

// The inline head script of the welcome splash, run against fake window/document objects.
type Listener = (event: { target?: { id?: string } }) => void;

function setup({ seen = false, reducedMotion = false, storageThrows = false } = {}) {
  const store = new Map<string, string>(seen ? [[SPLASH_STORAGE_KEY, '1']] : []);
  const attrs = new Map<string, string>();
  const winListeners = new Map<string, Listener>();
  const docListeners = new Map<string, Listener>();
  const timers: Array<{ ms: number; fn: () => void; cleared: boolean }> = [];
  const sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  const window = {
    get sessionStorage() {
      if (storageThrows) throw new Error('SecurityError');
      return sessionStorage;
    },
    matchMedia: vi.fn((q: string) => ({ matches: reducedMotion && q === '(prefers-reduced-motion: reduce)' })),
    setTimeout: (fn: () => void, ms: number) => timers.push({ ms, fn, cleared: false }),
    clearTimeout: (id: number) => {
      const timer = timers[id - 1];
      if (timer) timer.cleared = true;
    },
    addEventListener: (type: string, fn: Listener) => void winListeners.set(type, fn),
    removeEventListener: (type: string) => void winListeners.delete(type),
  };
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    },
    addEventListener: (type: string, fn: Listener) => void docListeners.set(type, fn),
    removeEventListener: (type: string) => void docListeners.delete(type),
  };
  new Function('window', 'document', SPLASH_SCRIPT)(window, document);
  return { store, attrs, winListeners, docListeners, timers };
}

describe('splash script', () => {
  it('first visit: plays, marks the tab as seen, 3.5 s fallback', () => {
    const s = setup();
    expect(s.attrs.get('data-splash')).toBe('play');
    expect(s.store.get(SPLASH_STORAGE_KEY)).toBe('1');
    expect(s.timers.map((t) => t.ms)).toEqual([3500]);
    expect([...s.winListeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);
    expect([...s.docListeners.keys()]).toEqual(['animationend']);
  });

  it('ends on the overlay exit animationend only, then removes its listeners', () => {
    const s = setup();
    s.docListeners.get('animationend')?.({ target: { id: 'some-piece' } });
    expect(s.attrs.get('data-splash')).toBe('play');
    s.docListeners.get('animationend')?.({ target: { id: SPLASH_OVERLAY_ID } });
    expect(s.attrs.has('data-splash')).toBe(false);
    expect(s.winListeners.size).toBe(0);
    expect(s.docListeners.size).toBe(0);
    expect(s.timers[0]?.cleared).toBe(true);
  });

  it('fallback timer removes the attribute', () => {
    const s = setup();
    s.timers[0]?.fn();
    expect(s.attrs.has('data-splash')).toBe(false);
  });

  it('tap or key: quick fade, then removed', () => {
    const s = setup();
    s.winListeners.get('pointerdown')?.({});
    expect(s.attrs.get('data-splash')).toBe('skip');
    expect(s.timers.at(-1)?.ms).toBe(250);
    s.timers.at(-1)?.fn();
    expect(s.attrs.has('data-splash')).toBe(false);
  });

  it('seen in this tab: no splash, nothing registered', () => {
    const s = setup({ seen: true });
    expect(s.attrs.size).toBe(0);
    expect(s.timers).toHaveLength(0);
    expect(s.winListeners.size).toBe(0);
  });

  it('reduced motion: still plays (static frame) with the 1.5 s fallback; a tap ends it at once', () => {
    const s = setup({ reducedMotion: true });
    expect(s.attrs.get('data-splash')).toBe('play');
    expect(s.timers.map((t) => t.ms)).toEqual([1500]);
    s.winListeners.get('keydown')?.({});
    expect(s.attrs.has('data-splash')).toBe(false);
  });

  it('storage that throws: no splash', () => {
    const s = setup({ storageThrows: true });
    expect(s.attrs.size).toBe(0);
    expect(s.timers).toHaveLength(0);
  });
});
