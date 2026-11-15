import sharp from 'sharp';
import { asThumbnail, MAX_THUMB_BYTES, MAX_THUMB_PX, type Thumbnail } from './redact.js';

/** At most this many thumbnails per event. */
export const MAX_THUMBS_PER_EVENT = 8;

const QUALITIES = [50, 40, 30, 22];

/**
 * Builds the dashboard thumbnail of an image: a JPEG of at most {@link MAX_THUMB_PX} px and
 * {@link MAX_THUMB_BYTES} bytes, registered through `asThumbnail` (the only way a `data:` URI passes
 * `redact`). Call it only when diagnostics are enabled. Returns undefined when the bytes are not an
 * image or no quality fits the budget; never throws.
 */
export async function makeThumb(image: Buffer, originalBytes: number = image.length): Promise<Thumbnail | undefined> {
  try {
    for (const quality of QUALITIES) {
      const { data, info } = await sharp(image, { failOn: 'none' })
        .rotate()
        .resize({ width: MAX_THUMB_PX, height: MAX_THUMB_PX, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= MAX_THUMB_BYTES) return asThumbnail(`data:image/jpeg;base64,${data.toString('base64')}`, info.width, info.height, originalBytes);
    }
  } catch {
    // Not an image: the event carries sizes only.
  }
  return undefined;
}

/** Thumbnails of several images, capped at {@link MAX_THUMBS_PER_EVENT}; failed ones are skipped. */
export async function makeThumbs(images: readonly Buffer[]): Promise<Thumbnail[]> {
  const out: Thumbnail[] = [];
  for (const image of images.slice(0, MAX_THUMBS_PER_EVENT)) {
    const thumb = await makeThumb(image);
    if (thumb) out.push(thumb);
  }
  return out;
}
