import sharp from 'sharp';

/** An SDXL resolution bucket (about one megapixel). */
export interface RenderSize {
  width: number;
  height: number;
}

export const LANDSCAPE_BUCKET: RenderSize = { width: 1216, height: 832 };
export const PORTRAIT_BUCKET: RenderSize = { width: 832, height: 1216 };
export const SQUARE_BUCKET: RenderSize = { width: 1024, height: 1024 };

/**
 * The SDXL bucket nearest the photo aspect (feature controlnet-render, OQ-5): ratio >= 1.2 gives
 * 1216x832, <= 0.83 gives 832x1216, anything between gives 1024x1024.
 */
export function renderBucket(width: number, height: number): RenderSize {
  const ratio = width / height;
  if (ratio >= 1.2) return { ...LANDSCAPE_BUCKET };
  if (ratio <= 0.83) return { ...PORTRAIT_BUCKET };
  return { ...SQUARE_BUCKET };
}

/**
 * The "before" image: the stored `full` Photo centre-cropped and resized to exactly `size`
 * (JPEG q90, sRGB, no metadata: sharp writes none by default). It is also the model input, so
 * the Render aligns with it pixel for pixel.
 */
export function cropBefore(photo: Buffer, size: RenderSize): Promise<Buffer> {
  return sharp(photo)
    .resize({ width: size.width, height: size.height, fit: 'cover', position: 'centre' })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Re-encodes the model output (PNG or JPEG) into the stored `full` (exactly `size`, q88) and
 * `thumb` (longest edge 512, q80). Both are metadata-free JPEGs: PNG text chunks and any
 * EXIF/XMP/ICC are dropped by the re-encode.
 */
export async function encodeRender(image: Buffer, size: RenderSize): Promise<{ full: Buffer; thumb: Buffer }> {
  const full = await sharp(image)
    .resize({ width: size.width, height: size.height, fit: 'cover', position: 'centre' })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .jpeg({ quality: 88 })
    .toBuffer();
  const thumb = await sharp(full).resize({ width: 512, height: 512, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  return { full, thumb };
}
