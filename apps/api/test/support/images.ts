import { readFileSync } from 'node:fs';
import sharp from 'sharp';

export const FIXTURES = new URL('../fixtures/heic/', import.meta.url);

export function fixture(name: string): Buffer {
  return readFileSync(new URL(name, FIXTURES));
}

/** A plain test image with some structure (not a flat colour), in the requested format. */
export function makeImage(width: number, height: number, format: 'jpeg' | 'png' | 'webp' | 'gif' | 'avif' = 'jpeg'): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = x < width / 2 ? 40 : 200;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).toFormat(format).toBuffer();
}
