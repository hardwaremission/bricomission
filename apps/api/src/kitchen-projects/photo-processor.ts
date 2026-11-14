import sharp, { type Metadata, type Sharp } from 'sharp';
import type HeicDecode from 'heic-decode';
import type { KitchenDraftErrorCode } from '@bricomission/shared-types';

/**
 * Photo normalization (feature kitchen-capture-draft, spec Decisions 4 and 4a).
 *
 * - The type comes from the file's magic bytes; the client MIME type and file name are ignored.
 * - JPEG/PNG/WebP decode with sharp. HEIC/HEIF decodes with heic-decode (libheif-js WASM,
 *   libde265 HEVC decoder): sharp's prebuilt libvips has libheif for AVIF only and cannot
 *   decode HEVC (probe recorded in the spec's Implementation Notes).
 * - Output: `full` (orientation applied, sRGB, longest edge <= 2560, JPEG q85) and `thumb`
 *   (longest edge <= 512, JPEG q80). sharp writes no metadata by default, so EXIF/GPS, XMP,
 *   IPTC and ICC are all dropped. The original bytes are never kept.
 */
export const PHOTO_LIMITS = {
  maxPhotos: 8,
  maxBytes: 15 * 1024 * 1024,
  minShortEdge: 480,
  maxPixels: 50_000_000,
  fullMaxEdge: 2560,
  thumbMaxEdge: 512,
} as const;

export type PhotoRejectionCode = Extract<KitchenDraftErrorCode, 'photo_too_large' | 'photo_unsupported_type' | 'photo_too_small'>;

export class PhotoRejectedError extends Error {
  override readonly name = 'PhotoRejectedError';
  constructor(readonly code: PhotoRejectionCode) {
    super(code);
  }
}

export interface ProcessedPhoto {
  full: Buffer;
  thumb: Buffer;
  /** Size of `full`. */
  width: number;
  height: number;
}

export type SniffedImageType = 'jpeg' | 'png' | 'webp' | 'heic' | 'avif' | 'unknown';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIF_GENERIC_BRANDS = new Set(['mif1', 'msf1']);

/** Detects the image type from magic bytes (ISO-BMFF `ftyp` brands for HEIF). */
export function sniffImageType(input: Uint8Array): SniffedImageType {
  const ascii = (start: number, end: number) => String.fromCharCode(...input.subarray(start, end));
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg';
  if (input.length >= 8 && ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (input.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (input.length >= 16 && ascii(4, 8) === 'ftyp') {
    const boxSize = Math.min(new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(0), input.length, 4096);
    const brands = [ascii(8, 12)];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(ascii(offset, offset + 4));
    if (brands.some((brand) => HEIC_BRANDS.has(brand))) return 'heic';
    if (brands.some((brand) => AVIF_BRANDS.has(brand))) return 'avif';
    // Generic HEIF: accepted as HEIC only if the HEVC decoder can decode its primary item.
    if (brands.some((brand) => HEIF_GENERIC_BRANDS.has(brand))) return 'heic';
  }
  return 'unknown';
}

/** Runs one task at a time (HEIC WASM decodes are memory-heavy: one per process). */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

type HeicDecoder = typeof HeicDecode;
let heicDecoder: Promise<HeicDecoder> | null = null;
/** heic-decode loads its WASM bundle on import: loaded on the first HEIC only. */
function loadHeicDecoder(): Promise<HeicDecoder> {
  heicDecoder ??= import('heic-decode').then((module) => module.default);
  return heicDecoder;
}
const heicQueue = new SerialQueue();

sharp.cache(false);

function checkDimensions(width: number, height: number): void {
  if (!(width > 0 && height > 0)) throw new PhotoRejectedError('photo_unsupported_type');
  if (width * height > PHOTO_LIMITS.maxPixels) throw new PhotoRejectedError('photo_too_large');
  if (Math.min(width, height) < PHOTO_LIMITS.minShortEdge) throw new PhotoRejectedError('photo_too_small');
}

async function encode(pipeline: Sharp): Promise<ProcessedPhoto> {
  const { data: full, info } = await pipeline
    .resize({ width: PHOTO_LIMITS.fullMaxEdge, height: PHOTO_LIMITS.fullMaxEdge, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(full)
    .resize({ width: PHOTO_LIMITS.thumbMaxEdge, height: PHOTO_LIMITS.thumbMaxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { full, thumb, width: info.width, height: info.height };
}

async function processWithSharp(input: Buffer, expected: 'jpeg' | 'png' | 'webp'): Promise<ProcessedPhoto> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new PhotoRejectedError('photo_unsupported_type');
  }
  if (meta.format !== expected || !meta.width || !meta.height) throw new PhotoRejectedError('photo_unsupported_type');
  // EXIF orientations 5-8 swap width and height once applied.
  const swapped = (meta.orientation ?? 1) >= 5;
  checkDimensions(swapped ? meta.height : meta.width, swapped ? meta.width : meta.height);
  try {
    return await encode(sharp(input, { limitInputPixels: PHOTO_LIMITS.maxPixels, failOn: 'error' }).rotate());
  } catch {
    throw new PhotoRejectedError('photo_unsupported_type');
  }
}

async function processHeic(input: Buffer): Promise<ProcessedPhoto> {
  const decoder = await loadHeicDecoder();
  return heicQueue.run(async () => {
    let images: Awaited<ReturnType<HeicDecoder['all']>>;
    try {
      images = await decoder.all({ buffer: input });
    } catch {
      throw new PhotoRejectedError('photo_unsupported_type');
    }
    try {
      const primary = images[0];
      if (!primary) throw new PhotoRejectedError('photo_unsupported_type');
      // Header dimensions (container transforms already applied) before decoding any pixels.
      checkDimensions(primary.width, primary.height);
      let pixels: { width: number; height: number; data: Uint8ClampedArray };
      try {
        pixels = await primary.decode();
      } catch {
        throw new PhotoRejectedError('photo_unsupported_type');
      }
      // libheif already applied irot/imir: no EXIF rotation here (raw pixels carry no EXIF).
      const raw = Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength);
      return await encode(sharp(raw, { raw: { width: pixels.width, height: pixels.height, channels: 4 }, limitInputPixels: PHOTO_LIMITS.maxPixels }));
    } finally {
      images.dispose();
    }
  });
}

/** Validates and normalizes one uploaded photo. Throws {@link PhotoRejectedError}. */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.length > PHOTO_LIMITS.maxBytes) throw new PhotoRejectedError('photo_too_large');
  const type = sniffImageType(input);
  switch (type) {
    case 'jpeg':
    case 'png':
    case 'webp':
      return processWithSharp(input, type);
    case 'heic':
      return processHeic(input);
    default:
      throw new PhotoRejectedError('photo_unsupported_type');
  }
}
