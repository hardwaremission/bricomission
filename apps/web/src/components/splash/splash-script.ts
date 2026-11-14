/**
 * Inline <head> script of the welcome splash (feature brand-logo-animation, spec Decisions 4-7).
 * It runs before first paint and decides whether the server-rendered splash (hidden by
 * default) plays:
 * - once per tab: sessionStorage `bm.splash.seen` is set as soon as the decision is made, so a
 *   reload during the animation does not replay it; storage that throws means no splash;
 * - it sets `<html data-splash="play">`; the CSS (WelcomeSplash.module.css) shows the overlay,
 *   picks the variant (768 px) and the palette (prefers-color-scheme), and ends it on its own;
 * - the attribute is removed on the overlay's own exit `animationend`, after a tap/click/key
 *   (quick fade: `data-splash="skip"`; at once under reduced motion), or by the fallback
 *   timer (3.5 s; 1.5 s under reduced motion), whichever comes first. Listeners are removed.
 * No imports, under 1 KB. The IIFE receives `window` and `document` as arguments, so
 * test/splash-script.test.ts can run the string with fakes (`new Function('window', 'document', …)`).
 */
export const SPLASH_STORAGE_KEY = 'bm.splash.seen';
export const SPLASH_OVERLAY_ID = 'bm-splash';

export const SPLASH_SCRIPT = `(function(w,d){var s,k='${SPLASH_STORAGE_KEY}';try{s=w.sessionStorage;if(s.getItem(k))return;s.setItem(k,'1')}catch(e){return}var h=d.documentElement,r=!!(w.matchMedia&&w.matchMedia('(prefers-reduced-motion: reduce)').matches),o=0,t,q;function end(){if(o)return;o=1;h.removeAttribute('data-splash');w.clearTimeout(t);w.clearTimeout(q);w.removeEventListener('pointerdown',skip,true);w.removeEventListener('keydown',skip,true);d.removeEventListener('animationend',fin,true)}function skip(){if(o)return;if(r)return end();h.setAttribute('data-splash','skip');q=w.setTimeout(end,250)}function fin(e){if(e.target&&e.target.id==='${SPLASH_OVERLAY_ID}')end()}h.setAttribute('data-splash','play');t=w.setTimeout(end,r?1500:3500);w.addEventListener('pointerdown',skip,true);w.addEventListener('keydown',skip,true);d.addEventListener('animationend',fin,true)})(window,document);`;
