/**
 * Renders the PWA icons from the approved design export
 * (design/openpencil/web-pwa-shell/app-icon-512.png, read back via the open-pencil MCP)
 * into public/icons/, scaled with Playwright's Chromium. Run inside the pinned image:
 *   docker compose --profile e2e run --rm --user "$(id -u):$(id -g)" web-e2e node scripts/render-icons.ts
 * The PNG export is the source rather than app-icon-512.svg: a browser draws the SVG's
 * rx="999" accent bar as an ellipse (SVG clamps rx/ry per axis), unlike the approved pill.
 * The PNGs are committed; re-run only when the design icon changes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const png = readFileSync(here('../../../design/openpencil/web-pwa-shell/app-icon-512.png')).toString('base64');

// The design icon is full-bleed and keeps its content inside the maskable safe zone
// (inner 80 %), so "any" and "maskable" share the same artwork.
const OUTPUTS: ReadonlyArray<[file: string, size: number]> = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-512-maskable.png', 512],
  ['apple-touch-icon.png', 180],
];

const browser = await chromium.launch();
try {
  for (const [file, size] of OUTPUTS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0}img{display:block;width:${size}px;height:${size}px}</style>` +
        `<img src="data:image/png;base64,${png}" alt="">`,
    );
    await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    await page.screenshot({ path: here(`../public/icons/${file}`) });
    await page.close();
    console.log(`render-icons: public/icons/${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
