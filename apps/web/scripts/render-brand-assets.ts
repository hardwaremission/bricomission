/**
 * Renders the committed brand assets (feature brand-logo-animation) from the approved
 * OpenPencil exports in design/openpencil/brand-logo-animation/ (logo-lettermark.svg and
 * logo-wordmark.svg; geometry from docs/design/brand-logo-animation.md) with Playwright's
 * Chromium. Run inside the pinned image (no host browser, no new dependency):
 *   docker compose --profile e2e run --rm --user "$(id -u):$(id -g)" web-e2e node scripts/render-brand-assets.ts
 * Outputs (re-running gives byte-identical files):
 * - public/icons/icon-192.png, icon-512.png, icon-512-maskable.png: white full-bleed square,
 *   lettermark 320x165 centered in 512 (inside the maskable safe circle), scaled for 192;
 * - public/icons/apple-touch-icon.png: 180 white square, lettermark 112x58 centered (iOS rounds);
 * - public/icons/favicon.svg: lettermark at ~94 % of a square viewBox, light/dark palettes;
 * - public/favicon.ico: PNG entries 16, 32, 48 (light palette, transparent background);
 * - Keycloak copies: infra/keycloak/themes/bricomission/login/resources/img/favicon.{svg,ico};
 * - the code email logo: wordmark PNG 280x44 on white, written as a data URI between the
 *   bm-email-logo markers of infra/keycloak/themes/bricomission/email/html/code-email.ftl.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const EXPORTS = '../../../design/openpencil/brand-logo-animation/';
const KEYCLOAK = '../../../infra/keycloak/themes/bricomission/';

const INK = '#182231';
const ACCENT = '#2968EC';
const INK_DARK = '#F8FAFC';
const ACCENT_DARK = '#3B82F6';

interface Logo {
  x: number;
  y: number;
  width: number;
  height: number;
  glyphs: string;
  accents: string;
}

/** viewBox and the inner markup of the glyph/accent groups of an export (colors dropped). */
function readLogo(file: string): Logo {
  const svg = readFileSync(here(EXPORTS + file), 'utf8');
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number) ?? [];
  const group = (id: string) => new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`).exec(svg)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const [x = 0, y = 0, width = 0, height = 0] = box;
  const logo = { x, y, width, height, glyphs: group('glyphs'), accents: group('accent-blue') };
  if (!logo.width || !logo.glyphs || !logo.accents) throw new Error(`render-brand-assets: cannot read ${file}`);
  return logo;
}

const round = (n: number) => Number(n.toFixed(2));

/** The logo placed in a box of the given width, centered at (cx, cy) of a parent viewport. */
function placed(logo: Logo, width: number, cx: number, cy: number): string {
  const height = (width * logo.height) / logo.width;
  return (
    `<svg x="${round(cx - width / 2)}" y="${round(cy - height / 2)}" width="${round(width)}" height="${round(height)}" viewBox="${logo.x} ${logo.y} ${logo.width} ${logo.height}">` +
    `<g fill="${INK}" fill-rule="evenodd">${logo.glyphs}</g><g fill="${ACCENT}">${logo.accents}</g></svg>`
  );
}

/** White full-bleed square icon with the lettermark at `logoWidth` (design units of `size`). */
function iconSvg(lettermark: Logo, size: number, logoWidth: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="#FFFFFF"/>${placed(lettermark, logoWidth, size / 2, size / 2)}</svg>`
  );
}

/** Favicon: lettermark at ~94 % of a square viewBox; palette follows prefers-color-scheme. */
function faviconSvg(lettermark: Logo): string {
  const side = round(lettermark.width / 0.94);
  const x = round(lettermark.x + lettermark.width / 2 - side / 2);
  const y = round(lettermark.y + lettermark.height / 2 - side / 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}">` +
    `<style>.i{fill:${INK}}.a{fill:${ACCENT}}@media (prefers-color-scheme:dark){.i{fill:${INK_DARK}}.a{fill:${ACCENT_DARK}}}</style>` +
    `<g class="i" fill-rule="evenodd">${lettermark.glyphs}</g><g class="a">${lettermark.accents}</g></svg>\n`
  );
}

async function screenshot(browser: Browser, svg: string, width: number, height: number, transparent = false): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'light' });
  try {
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:${width}px;height:${height}px}</style><img src="${src}" alt="">`,
    );
    await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    return await page.screenshot({ omitBackground: transparent });
  } finally {
    await page.close();
  }
}

/** ICO container with PNG payloads: 6-byte header, 16-byte entries, then the PNGs. */
function ico(images: ReadonlyArray<[size: number, png: Buffer]>): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([size, png], i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(([, png]) => png)]);
}

function write(relative: string, data: Buffer | string) {
  const path = here(relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`render-brand-assets: ${relative.replace(/^(\.\.\/)+/, '')}`);
}

const lettermark = readLogo('logo-lettermark.svg');
const wordmark = readLogo('logo-wordmark.svg');

const browser = await chromium.launch();
try {
  // App icons: the 512 design (lettermark 320 wide) scaled; "any" and "maskable" share it.
  const icon512 = iconSvg(lettermark, 512, 320);
  for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-512-maskable.png', 512]] as const) {
    write(`../public/icons/${file}`, await screenshot(browser, icon512, size, size));
  }
  write('../public/icons/apple-touch-icon.png', await screenshot(browser, iconSvg(lettermark, 180, 112), 180, 180));

  // Favicon pair (web and Keycloak).
  const favicon = faviconSvg(lettermark);
  const icoFile = ico(await Promise.all([16, 32, 48].map(async (size) => [size, await screenshot(browser, favicon, size, size, true)] as [number, Buffer])));
  write('../public/icons/favicon.svg', favicon);
  write('../public/favicon.ico', icoFile);
  write(`${KEYCLOAK}login/resources/img/favicon.svg`, favicon);
  write(`${KEYCLOAK}login/resources/img/favicon.ico`, icoFile);

  // Code email logo: wordmark 140x22 at 2x on an opaque white background.
  const emailSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="44" viewBox="0 0 280 44">` +
    `<rect width="280" height="44" fill="#FFFFFF"/>${placed(wordmark, 280, 140, 22)}</svg>`;
  const emailPng = (await screenshot(browser, emailSvg, 280, 44)).toString('base64');
  const emailFile = `${KEYCLOAK}email/html/code-email.ftl`;
  const template = readFileSync(here(emailFile), 'utf8');
  const marker = /(<#-- bm-email-logo:begin -->)[\s\S]*?(<#-- bm-email-logo:end -->)/;
  if (!marker.test(template)) throw new Error('render-brand-assets: bm-email-logo markers missing in code-email.ftl');
  const img =
    `<img src="data:image/png;base64,${emailPng}" alt="BricoMission" width="140" height="22" ` +
    'style="display:block;width:140px;height:22px;border:0;outline:none;text-decoration:none;font-family:${bmFont};font-size:22px;line-height:28px;font-weight:700;color:#182231;">';
  write(emailFile, template.replace(marker, (_m, begin: string, end: string) => `${begin}${img}${end}`));
} finally {
  await browser.close();
}
