import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const design = readFileSync(fileURLToPath(new URL('../../../DESIGN.md', import.meta.url)), 'utf8');
const css = readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8');

const frontMatter = design.split(/^---$/m)[1] ?? '';
const colorsBlock = /^colors:\n((?: {2}.+\n)+)/m.exec(frontMatter)?.[1] ?? '';
const colors = [...colorsBlock.matchAll(/^ {2}(\w+): "(#[0-9A-Fa-f]{6})"/gm)].map(([, name = '', hex = '']) => ({
  name,
  variable: `--color-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
  hex,
}));

describe('DESIGN.md tokens in globals.css', () => {
  it('reads the DESIGN.md color tokens', () => {
    expect(colors.length).toBeGreaterThanOrEqual(13);
  });

  it('has no accent color any more (brand-logo-animation)', () => {
    expect(colors.map((c) => c.name)).not.toContain('accent');
    expect(css).not.toContain('--color-accent');
  });

  it.each(colors)('$name -> $variable = $hex', ({ variable, hex }) => {
    const match = new RegExp(`${variable}:\\s*(#[0-9A-Fa-f]{6});`).exec(css);
    expect(match?.[1]?.toUpperCase()).toBe(hex.toUpperCase());
  });

  it('declares radius, spacing, elevation and type-scale tokens', () => {
    for (const name of ['--radius-sm: 8px', '--radius-md: 12px', '--radius-lg: 20px', '--radius-pill: 999px',
      '--spacing-xs: 4px', '--spacing-sm: 8px', '--spacing-md: 16px', '--spacing-lg: 24px', '--spacing-xl: 40px', '--spacing-xxl: 64px',
      '--text-display: 34px', '--text-h1: 28px', '--text-h2: 22px', '--text-body: 16px', '--text-small: 14px',
      '--shadow-card:', '--shadow-sheet:']) {
      expect(css).toContain(name);
    }
  });

  it('self-hosts Inter (latin + latin-ext) and never loads Google Fonts', () => {
    expect(css).toContain('inter-latin-wght-normal.woff2');
    expect(css).toContain('inter-latin-ext-wght-normal.woff2');
    expect(css).not.toMatch(/fonts\.googleapis|gstatic/);
  });
});
