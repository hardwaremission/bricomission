import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { StyleGalleryImageView, StyleGalleryView } from '@bricomission/shared-types';

/**
 * The curated, offline Style Gallery (feature moodboard-selection). The images are committed
 * JPEGs under `assets/style-gallery/<imageId>/{full,thumb}.jpg` with a `manifest.json`; they
 * were generated once at development time (see SOURCE.md there) and are never generated at
 * runtime. The manifest is loaded and validated once; a missing or invalid manifest is logged
 * and gives an empty gallery, so the API still boots. Files are looked up by manifest id only:
 * no path is ever built from request input.
 */
export const GALLERY_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
export const STYLE_GALLERY_DIR = Symbol('STYLE_GALLERY_DIR');
export type GalleryVariant = 'thumb' | 'full';

/** Default asset directory: `<api root>/assets/style-gallery`, both from `src/` and from `dist/`. */
export function defaultStyleGalleryDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/style-gallery');
}

export interface StyleGalleryImage {
  id: string;
  styleId: string;
  width: number;
  height: number;
}

interface LoadedImage extends StyleGalleryImage {
  files: Record<GalleryVariant, string>;
  /** Generation prompt from the manifest; internal (controlnet-render), never returned by a route. */
  prompt: string | null;
}

export class InvalidStyleGalleryManifestError extends Error {
  override readonly name = 'InvalidStyleGalleryManifestError';
}

const CONTENT_BASE = '/style-gallery/images';

export function galleryImageUrls(id: string): { thumbUrl: string; fullUrl: string } {
  return { thumbUrl: `${CONTENT_BASE}/${id}/content?variant=thumb`, fullUrl: `${CONTENT_BASE}/${id}/content?variant=full` };
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Parses and validates a manifest; throws InvalidStyleGalleryManifestError. Exported for tests. */
export function loadStyleGallery(dir: string): { styles: string[]; images: LoadedImage[] } {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new InvalidStyleGalleryManifestError('manifest missing');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new InvalidStyleGalleryManifestError('manifest is not JSON');
  }
  const manifest = raw as { version?: unknown; styles?: unknown; images?: unknown };
  if (manifest.version !== 1 || !Array.isArray(manifest.styles) || !Array.isArray(manifest.images)) {
    throw new InvalidStyleGalleryManifestError('bad manifest shape');
  }
  const styles: string[] = [];
  for (const style of manifest.styles) {
    if (typeof style !== 'string' || !GALLERY_ID_PATTERN.test(style) || styles.includes(style)) {
      throw new InvalidStyleGalleryManifestError('bad style id');
    }
    styles.push(style);
  }
  const images: LoadedImage[] = [];
  const seen = new Set<string>();
  for (const entry of manifest.images as Array<Record<string, unknown>>) {
    const { id, styleId, width, height, prompt } = entry ?? {};
    if (typeof id !== 'string' || !GALLERY_ID_PATTERN.test(id) || seen.has(id)) throw new InvalidStyleGalleryManifestError('bad image id');
    if (typeof styleId !== 'string' || !styles.includes(styleId)) throw new InvalidStyleGalleryManifestError('unknown style');
    if (!isPositiveInt(width) || !isPositiveInt(height)) throw new InvalidStyleGalleryManifestError('bad dimensions');
    const files = { thumb: join(dir, id, 'thumb.jpg'), full: join(dir, id, 'full.jpg') };
    if (!existsSync(files.thumb) || !existsSync(files.full)) throw new InvalidStyleGalleryManifestError('missing image file');
    seen.add(id);
    images.push({ id, styleId, width, height, files, prompt: typeof prompt === 'string' && prompt.trim() !== '' ? prompt : null });
  }
  return { styles, images };
}

@Injectable()
export class StyleGalleryService {
  private readonly logger = new Logger(StyleGalleryService.name);
  private readonly styles: string[];
  private readonly images = new Map<string, LoadedImage>();

  constructor(@Optional() @Inject(STYLE_GALLERY_DIR) dir?: string) {
    const directory = dir ?? process.env.STYLE_GALLERY_DIR ?? defaultStyleGalleryDir();
    let loaded: { styles: string[]; images: LoadedImage[] } = { styles: [], images: [] };
    try {
      loaded = loadStyleGallery(directory);
    } catch (error) {
      // Never crash boot: an empty gallery still lets visitors upload their own references.
      this.logger.warn(`Style Gallery unavailable (${error instanceof Error ? error.name : 'unknown'})`);
    }
    this.styles = loaded.styles;
    for (const image of loaded.images) this.images.set(image.id, image);
  }

  /** The gallery grouped by style, styles and images in manifest order. */
  view(): StyleGalleryView {
    const all = [...this.images.values()];
    return {
      styles: this.styles.map((styleId) => ({
        id: styleId,
        images: all.filter((image) => image.styleId === styleId).map((image): StyleGalleryImageView => ({
          id: image.id,
          width: image.width,
          height: image.height,
          ...galleryImageUrls(image.id),
        })),
      })),
    };
  }

  find(id: string): StyleGalleryImage | null {
    const image = this.images.get(id);
    return image ? { id: image.id, styleId: image.styleId, width: image.width, height: image.height } : null;
  }

  /** Internal manifest prompt of an image (Render prompt building); null when unknown or absent. */
  promptFor(id: string): string | null {
    return this.images.get(id)?.prompt ?? null;
  }

  /** JPEG bytes of a manifest image; null for unknown ids. */
  async content(id: string, variant: GalleryVariant): Promise<Buffer | null> {
    const image = this.images.get(id);
    if (!image) return null;
    return readFile(image.files[variant]);
  }
}
