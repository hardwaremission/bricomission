import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// WCAG 2.2 contrast of the DESIGN.md color tokens (feature brand-logo-animation, spec Decision 1).
// Text needs 4.5:1, graphics (icons, focus ring, status dots) 3:1.
const design = readFileSync(fileURLToPath(new URL('../../../DESIGN.md', import.meta.url)), 'utf8');
const frontMatter = design.split(/^---$/m)[1] ?? '';
const tokens = Object.fromEntries([...frontMatter.matchAll(/^ {2}(\w+): "(#[0-9A-Fa-f]{6})"/gm)].map(([, name = '', hex = '']) => [name, hex]));

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const color = (name: string): string => {
  const hex = name.startsWith('#') ? name : tokens[name];
  if (!hex) throw new Error(`unknown token ${name}`);
  return hex;
};

const TEXT = 4.5;
const GRAPHIC = 3;

// [foreground, background, minimum, why]
const PAIRS: ReadonlyArray<[string, string, number, string]> = [
  ['#FFFFFF', 'primary', TEXT, 'CTA label on primary'],
  ['#FFFFFF', 'primaryHover', TEXT, 'CTA label on primary hover'],
  ['primary', 'background', TEXT, 'links on the page'],
  ['primary', 'surface', TEXT, 'links on cards and sheets'],
  ['primary', 'surfaceMuted', GRAPHIC, 'icons and large text only (known limit 4.3:1)'],
  ['focus', 'background', GRAPHIC, 'focus ring'],
  ['focus', 'surface', GRAPHIC, 'focus ring on cards'],
  ['primary', 'secondary', GRAPHIC, 'step and badge icons'],
  ['danger', 'secondary', GRAPHIC, 'error badge icon'],
  ['text', 'secondary', TEXT, 'text on the tint'],
  ...(['background', 'surface', 'surfaceMuted'] as const).flatMap((bg): Array<[string, string, number, string]> => [
    ['text', bg, TEXT, 'body text'],
    ['textMuted', bg, TEXT, 'helper text'],
    ['danger', bg, TEXT, 'error text'],
    ['warning', bg, GRAPHIC, 'warning icon / stroke (never text alone)'],
    ['success', bg, GRAPHIC, 'status dot (never color alone)'],
  ]),
];

describe('DESIGN.md color contrast (WCAG 2.2 AA)', () => {
  it('uses the brand palette', () => {
    expect(tokens).toMatchObject({ primary: '#2968EC', primaryHover: '#1F55C8', text: '#182231', secondary: '#E6EEFD', focus: '#2968EC' });
  });

  it.each(PAIRS)('%s on %s >= %s:1 (%s)', (fg, bg, min) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(min);
  });

  it('matches the documented ratios', () => {
    expect(contrast('#FFFFFF', color('primary'))).toBeCloseTo(4.9, 1);
    expect(contrast(color('primary'), color('background'))).toBeCloseTo(4.7, 1);
    expect(contrast('#FFFFFF', color('primaryHover'))).toBeCloseTo(6.6, 1);
    expect(contrast(color('primary'), color('surfaceMuted'))).toBeCloseTo(4.3, 1);
  });
});
