import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import {
  defaultStyleGalleryDir,
  InvalidStyleGalleryManifestError,
  loadStyleGallery,
  StyleGalleryService,
} from '../../src/style-gallery/style-gallery.service.js';

const dir = defaultStyleGalleryDir();
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
  version: number;
  styles: string[];
  images: Array<{ id: string; styleId: string; width: number; height: number; prompt: string; seed: number }>;
};

/**
 * Committed ids are stable and are never removed or reused (the Moodboard stores them).
 * New images may be added; never delete an entry from this list.
 */
const COMMITTED_IDS = [
  'modern-01', 'modern-02', 'modern-03',
  'scandinavian-01', 'scandinavian-02', 'scandinavian-03',
  'industrial-01', 'industrial-02', 'industrial-03',
  'farmhouse-01', 'farmhouse-02', 'farmhouse-03',
  'classic-01', 'classic-02', 'classic-03',
  'mediterranean-01', 'mediterranean-02', 'mediterranean-03',
  'minimalist-01', 'minimalist-02', 'minimalist-03',
  'japandi-01', 'japandi-02', 'japandi-03',
];

describe('Style Gallery assets (committed)', () => {
  it('has 8 styles x 3 images with unique, well-formed ids and provenance', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.styles).toEqual(['modern', 'scandinavian', 'industrial', 'farmhouse', 'classic', 'mediterranean', 'minimalist', 'japandi']);
    expect(manifest.images).toHaveLength(24);
    const ids = manifest.images.map((image) => image.id);
    expect(new Set(ids).size).toBe(24);
    for (const image of manifest.images) {
      expect(image.id).toMatch(/^[a-z0-9-]{1,64}$/);
      expect(manifest.styles).toContain(image.styleId);
      expect(image.prompt.length).toBeGreaterThan(20);
      expect(Number.isSafeInteger(image.seed)).toBe(true);
    }
    for (const style of manifest.styles) expect(manifest.images.filter((image) => image.styleId === style)).toHaveLength(3);
  });

  it('never removes a committed id', () => {
    const ids = new Set(manifest.images.map((image) => image.id));
    for (const id of COMMITTED_IDS) expect(ids.has(id), id).toBe(true);
  });

  it('files exist, match the manifest size, respect the edge limits and carry no metadata', async () => {
    for (const image of manifest.images) {
      for (const variant of ['full', 'thumb'] as const) {
        const bytes = readFileSync(join(dir, image.id, `${variant}.jpg`));
        const meta = await sharp(bytes).metadata();
        expect(meta.format).toBe('jpeg');
        expect(meta.exif, `${image.id} ${variant} exif`).toBeUndefined();
        expect(meta.xmp, `${image.id} ${variant} xmp`).toBeUndefined();
        expect(meta.icc, `${image.id} ${variant} icc`).toBeUndefined();
        expect(meta.iptc, `${image.id} ${variant} iptc`).toBeUndefined();
        expect(meta.comments ?? []).toEqual([]);
        const text = bytes.toString('latin1');
        expect(text).not.toContain('Exif\0');
        expect(text).not.toContain('http://ns.adobe.com/xap');
        expect(text).not.toContain('ICC_PROFILE');
        expect(text).not.toContain('KSampler');
        const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
        if (variant === 'full') {
          expect({ width: meta.width, height: meta.height }).toEqual({ width: image.width, height: image.height });
          expect(longest).toBeLessThanOrEqual(1280);
        } else {
          expect(longest).toBeLessThanOrEqual(512);
        }
      }
    }
  });

  it('the service loads all of it in manifest order', () => {
    const view = new StyleGalleryService(dir).view();
    expect(view.styles.map((style) => style.id)).toEqual(manifest.styles);
    expect(view.styles.flatMap((style) => style.images.map((image) => image.id))).toEqual(manifest.images.map((image) => image.id));
  });
});

describe('Style Gallery manifest validation', () => {
  const temp = mkdtempSync(join(tmpdir(), 'style-gallery-'));
  afterAll(() => rmSync(temp, { recursive: true, force: true }));

  function fixtureDir(name: string, content: unknown, withFiles = true): string {
    const target = join(temp, name);
    mkdirSync(join(target, 'modern-01'), { recursive: true });
    writeFileSync(join(target, 'manifest.json'), typeof content === 'string' ? content : JSON.stringify(content));
    if (withFiles) {
      copyFileSync(join(dir, 'modern-01/full.jpg'), join(target, 'modern-01/full.jpg'));
      copyFileSync(join(dir, 'modern-01/thumb.jpg'), join(target, 'modern-01/thumb.jpg'));
    }
    return target;
  }
  const valid = { version: 1, styles: ['modern'], images: [{ id: 'modern-01', styleId: 'modern', width: 1216, height: 832, prompt: 'p', seed: 1 }] };

  it('accepts a valid manifest', () => {
    expect(loadStyleGallery(fixtureDir('valid', valid)).images.map((image) => image.id)).toEqual(['modern-01']);
  });

  it.each([
    ['not-json', '{'],
    ['bad-version', { ...valid, version: 2 }],
    ['bad-style', { ...valid, styles: ['Modern'] }],
    ['unknown-style', { ...valid, images: [{ ...valid.images[0], styleId: 'rustic' }] }],
    ['bad-id', { ...valid, images: [{ ...valid.images[0], id: '../etc' }] }],
    ['duplicate-id', { ...valid, images: [valid.images[0], valid.images[0]] }],
    ['bad-size', { ...valid, images: [{ ...valid.images[0], width: 0 }] }],
  ])('rejects %s', (name, content) => {
    expect(() => loadStyleGallery(fixtureDir(name, content))).toThrow(InvalidStyleGalleryManifestError);
  });

  it('rejects missing image files and a missing manifest', () => {
    expect(() => loadStyleGallery(fixtureDir('no-files', valid, false))).toThrow(InvalidStyleGalleryManifestError);
    expect(() => loadStyleGallery(join(temp, 'nothing-here'))).toThrow(InvalidStyleGalleryManifestError);
  });

  it('an invalid manifest gives an empty gallery instead of crashing', async () => {
    const service = new StyleGalleryService(join(temp, 'nothing-here'));
    expect(service.view()).toEqual({ styles: [] });
    expect(service.find('modern-01')).toBeNull();
    expect(await service.content('modern-01', 'thumb')).toBeNull();
  });
});
