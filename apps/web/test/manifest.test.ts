import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../src/app/manifest';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

/** Width and height from a PNG IHDR chunk. */
function pngSize(path: string): [number, number] {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('web app manifest', () => {
  const m = manifest();

  it('has the installability fields', () => {
    expect(m).toMatchObject({
      name: 'BricoMission',
      short_name: 'BricoMission',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#1F4E79',
      background_color: '#FAFAF8',
    });
  });

  it('lists 192, 512 and 512 maskable PNG icons that exist with those sizes', () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const icon of icons) {
      const [w, h] = pngSize(`${PUBLIC}${icon.src}`);
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });

  it('ships a 180x180 apple-touch icon', () => {
    const path = `${PUBLIC}/icons/apple-touch-icon.png`;
    expect(existsSync(path)).toBe(true);
    expect(pngSize(path)).toEqual([180, 180]);
  });

  it('service worker never intercepts /api or non-GET requests', () => {
    const sw = readFileSync(`${PUBLIC}/sw.js`, 'utf8');
    expect(sw).toContain("request.method !== 'GET'");
    expect(sw).toContain("startsWith('/api/')");
    expect(sw).toContain('clients.claim()');
  });
});
