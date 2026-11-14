import type { MetadataRoute } from 'next';

/**
 * Web app manifest (design: docs/design/brand-logo-animation.md, "App icon and manifest").
 * Served at /manifest.webmanifest. Icons are rendered by scripts/render-brand-assets.ts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BricoMission',
    short_name: 'BricoMission',
    description: 'Design your new kitchen and know its price before you start.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#2968EC',
    background_color: '#FAFAF8',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
