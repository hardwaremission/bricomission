import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LETTERMARK, WORDMARK, type LogoArtwork, type LogoShape } from '../src/components/brand/logo-paths';
import { SPLASH_SCRIPT } from '../src/components/splash/splash-script';
import { LETTERMARK_STAGE, WORDMARK_STAGE, type SplashStage } from '../src/components/splash/splash-stages';

// Feature brand-logo-animation: the shipped logo, splash geometry and generated assets stay equal
// to the design sources (design/logo/, design/openpencil/brand-logo-animation/).
const root = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const read = (path: string) => readFileSync(root(path), 'utf8');

const attrs = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k = '', v = '']) => [k, v]));

function shapes(block: string): LogoShape[] {
  return [...block.matchAll(/<(path|circle)\b([^>]*)\/>/g)].map(([, tag, rest = '']) => {
    const a = attrs(rest);
    return tag === 'path' ? { kind: 'path', d: a.d ?? '' } : { kind: 'circle', cx: a.cx ?? '', cy: a.cy ?? '', r: a.r ?? '' };
  });
}

const group = (svg: string, id: string) => new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`).exec(svg)?.[1] ?? '';

function artwork(path: string): Omit<LogoArtwork, 'viewBox'> {
  const svg = read(path);
  return { glyphs: shapes(group(svg, 'glyphs')), accents: shapes(group(svg, 'accent-blue')) };
}

function stage(path: string, id: string): SplashStage {
  const svg = new RegExp(`<svg id="${id}"[^>]*>([\\s\\S]*?)</svg>`).exec(read(path));
  const viewBox = /viewBox="([^"]+)"/.exec(svg?.[0] ?? '')?.[1] ?? '';
  const groups = [...(svg?.[1] ?? '').matchAll(/<g id="([\w-]+)"([^>]*)>([\s\S]*?)<\/g>/g)].map(([, gid = '', gattrs = '', body = '']) => {
    const { class: className = null, ...rest } = attrs(gattrs);
    return {
      id: gid,
      className,
      attrs: rest,
      elements: [...body.matchAll(/<(line|path|circle)\b([^>]*)\/>/g)].map(([, tag, raw = '']) => {
        const { class: cls = '', style = '', ...a } = attrs(raw);
        const vars = Object.fromEntries(style.split(';').filter((p) => p.trim()).map((p) => p.split(':').map((x) => x.trim()) as [string, string]));
        return { tag: tag as 'line' | 'path' | 'circle', className: cls, vars, attrs: a };
      }),
    };
  });
  return { viewBox, groups };
}

function pngSize(buf: Buffer): [number, number] {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('logo paths', () => {
  it.each([
    ['LETTERMARK', LETTERMARK, 'logo-lettermark.svg', 'design/logo/BM_lettermark.svg'],
    ['WORDMARK', WORDMARK, 'logo-wordmark.svg', 'design/logo/BricoMission_wordmark.svg'],
  ] as const)('%s equals the approved export and the logo source', (_name, logo, exportFile, source) => {
    const exported = read(`design/openpencil/brand-logo-animation/${exportFile}`);
    expect(logo.viewBox).toBe(/viewBox="([^"]+)"/.exec(exported)?.[1]);
    expect({ glyphs: logo.glyphs, accents: logo.accents }).toEqual(artwork(`design/openpencil/brand-logo-animation/${exportFile}`));
    expect({ glyphs: logo.glyphs, accents: logo.accents }).toEqual(artwork(source));
  });

  it('has the tight viewBoxes of the read-back (no dimension lines)', () => {
    expect(LETTERMARK.viewBox).toBe('771.14 433.85 1227.35 634.10');
    expect(WORDMARK.viewBox).toBe('166.98 545.36 2420.08 380.51');
    expect(WORDMARK.glyphs).toHaveLength(19);
    expect(LETTERMARK.glyphs).toHaveLength(6);
    expect(WORDMARK.accents).toHaveLength(2);
    expect(LETTERMARK.accents).toHaveLength(2);
  });

  it('Keycloak bm-logo.ftl draws the same wordmark', () => {
    const ftl = read('infra/keycloak/themes/bricomission/login/bm-logo.ftl');
    expect(ftl).toContain(`viewBox="${WORDMARK.viewBox}"`);
    expect(ftl).toContain('data-testid="wordmark"');
    expect(ftl).toContain('role="img"');
    expect(shapes(/class="bm-logo__ink"[^>]*>([\s\S]*?)<\/g>/.exec(ftl)?.[1] ?? '')).toEqual(WORDMARK.glyphs);
    expect(shapes(/class="bm-logo__accent"[^>]*>([\s\S]*?)<\/g>/.exec(ftl)?.[1] ?? '')).toEqual(WORDMARK.accents);
  });
});

describe('welcome splash', () => {
  it.each([
    ['lettermark', LETTERMARK_STAGE, 'design/logo/bricomission_lettermark_animation.html', 'bm-stage'],
    ['wordmark', WORDMARK_STAGE, 'design/logo/bricomission_wordmark_animation.html', 'wm-stage'],
  ] as const)('%s stage equals the HTML stage (d, classes, --d, --len)', (_name, shipped, html, id) => {
    const source = stage(html, id);
    expect(source.groups.length).toBeGreaterThanOrEqual(3);
    expect(shipped).toEqual(source);
  });

  it('timing: lettermark pieces end at 1.96 s, wordmark corners at 2.50 s', () => {
    const end = (s: SplashStage, durations: Record<string, number>) =>
      Math.max(...s.groups.flatMap((g) => g.elements).map((e) => {
        const role = e.className.split(' ').find((c) => c in durations);
        return role ? parseFloat(e.vars['--d'] ?? '0') + (durations[role] ?? 0) : 0;
      }));
    expect(end(LETTERMARK_STAGE, { 'anim-up': 0.65, 'anim-down': 0.65, 'anim-right': 0.72, 'anim-diag-down': 0.68, 'anim-diag-up': 0.68, 'anim-corner': 0.58 })).toBeCloseTo(1.96, 5);
    expect(end(WORDMARK_STAGE, { 'anim-rise': 0.56, 'anim-drop': 0.56, 'anim-slide': 0.64, 'anim-unfold': 0.58, 'anim-diag-down': 0.58, 'anim-diag-up': 0.58, 'anim-dot': 0.55, 'anim-corner': 0.55 })).toBeCloseTo(2.5, 5);
    const css = read('apps/web/src/components/splash/WelcomeSplash.module.css');
    expect(css).toContain('animation: splashExit 0.35s ease 2.26s forwards;');
    expect(css).toContain('animation-delay: 2.8s;');
    expect(css).toContain('animation: splashHide 0s linear 1s forwards;');
  });

  it('ships no remote URL and no preview scaffolding', () => {
    for (const file of files(root('apps/web/src/components/splash'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/https?:\/\//);
      expect(text, file).not.toMatch(/is-paused|mono-tag|control-bar|pulseBeacon|tailwindcss\.com|googleapis/);
    }
    expect(SPLASH_SCRIPT.length).toBeLessThan(1024);
  });
});

describe('generated brand assets', () => {
  const pub = (path: string) => readFileSync(root(`apps/web/public/${path}`));

  it.each([
    ['icons/icon-192.png', 192],
    ['icons/icon-512.png', 512],
    ['icons/icon-512-maskable.png', 512],
    ['icons/apple-touch-icon.png', 180],
  ] as const)('%s is a %sx%s PNG', (file, size) => {
    expect(pngSize(pub(file))).toEqual([size, size]);
  });

  it.each(['apps/web/public/favicon.ico', 'infra/keycloak/themes/bricomission/login/resources/img/favicon.ico'])('%s has PNG entries 16, 32, 48', (file) => {
    const ico = readFileSync(root(file));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    const sizes = [0, 1, 2].map((i) => {
      const entry = 6 + 16 * i;
      const png = ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8));
      expect(pngSize(png)).toEqual([ico[entry], ico[entry + 1]]);
      return ico[entry];
    });
    expect(sizes).toEqual([16, 32, 48]);
  });

  it.each(['apps/web/public/icons/favicon.svg', 'infra/keycloak/themes/bricomission/login/resources/img/favicon.svg'])('%s has both palettes and the lettermark', (file) => {
    const svg = read(file);
    expect(svg).toMatch(/\.i\{fill:#182231\}\.a\{fill:#2968EC\}/);
    expect(svg).toMatch(/@media \(prefers-color-scheme:dark\)\{\.i\{fill:#F8FAFC\}\.a\{fill:#3B82F6\}\}/);
    const [, , w, h] = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number) ?? [];
    expect(w).toBe(h);
    expect(shapes(svg)).toEqual([...LETTERMARK.glyphs, ...LETTERMARK.accents]);
  });

  it('the code email carries the logo as a data-URI PNG with alt text', () => {
    const ftl = read('infra/keycloak/themes/bricomission/email/html/code-email.ftl');
    const img = /<#-- bm-email-logo:begin --><img ([^>]*)><#-- bm-email-logo:end -->/.exec(ftl)?.[1] ?? '';
    const a = attrs(img);
    expect(a.alt).toBe('BricoMission');
    expect([a.width, a.height]).toEqual(['140', '22']);
    expect(a.src).toMatch(/^data:image\/png;base64,/);
    expect(pngSize(Buffer.from(a.src?.split(',')[1] ?? '', 'base64'))).toEqual([280, 44]);
    expect(a.style).toContain('font-size:22px;line-height:28px;font-weight:700;color:#182231');
    expect(ftl).not.toMatch(/https?:\/\//);
  });

  it('no old palette color remains in the web app or the Keycloak theme', () => {
    const old = /1f4e79|173b5c|e07a3f|e8dcc8|1c1c1e|2f80ed/i;
    const text = /\.(tsx?|css|js|json|ftl|svg|properties|webmanifest)$/;
    for (const dir of ['apps/web/src', 'apps/web/public', 'infra/keycloak/themes']) {
      for (const file of files(root(dir)).filter((f) => text.test(f))) {
        expect(readFileSync(file, 'utf8'), file).not.toMatch(old);
      }
    }
  });
});
