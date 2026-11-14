import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PHOTO_LIMITS, PhotoRejectedError, processPhoto, sniffImageType } from '../../src/kitchen-projects/photo-processor.js';
import { fixture, makeImage } from '../support/images.js';

async function expectRejected(input: Promise<unknown>, code: string) {
  await expect(input).rejects.toBeInstanceOf(PhotoRejectedError);
  await expect(input).rejects.toMatchObject({ code });
}

/** Asserts a stored JPEG carries no metadata at all and returns its size. */
async function expectClean(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  expect(meta.format).toBe('jpeg');
  expect(meta.exif).toBeUndefined();
  expect(meta.xmp).toBeUndefined();
  expect(meta.iptc).toBeUndefined();
  expect(meta.icc).toBeUndefined();
  expect(meta.orientation).toBeUndefined();
  return { width: meta.width, height: meta.height };
}

describe('sniffImageType (magic bytes, never the name or MIME type)', () => {
  it('detects the supported and rejected formats', async () => {
    expect(sniffImageType(await makeImage(8, 8, 'jpeg'))).toBe('jpeg');
    expect(sniffImageType(await makeImage(8, 8, 'png'))).toBe('png');
    expect(sniffImageType(await makeImage(8, 8, 'webp'))).toBe('webp');
    expect(sniffImageType(fixture('kitchen-gps.heic'))).toBe('heic');
    expect(sniffImageType(await makeImage(64, 64, 'avif'))).toBe('avif');
    expect(sniffImageType(await makeImage(8, 8, 'gif'))).toBe('unknown');
    expect(sniffImageType(Buffer.from('just some text, renamed to photo.jpg'))).toBe('unknown');
    expect(sniffImageType(Buffer.alloc(0))).toBe('unknown');
  });
});

describe('processPhoto', () => {
  it('JPEG with EXIF GPS and orientation 6: rotated once, metadata-free full and thumb', async () => {
    const input = fixture('kitchen-gps-orient6.jpg');
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.orientation).toBe(6);
    expect(inputMeta.exif?.includes(Buffer.from('GPS-Test'))).toBe(true);
    expect([inputMeta.width, inputMeta.height]).toEqual([768, 1024]);

    const out = await processPhoto(input);
    // Orientation applied: the stored portrait 768x1024 becomes landscape 1024x768.
    expect(await expectClean(out.full)).toEqual({ width: 1024, height: 768 });
    expect([out.width, out.height]).toEqual([1024, 768]);
    expect(await expectClean(out.thumb)).toEqual({ width: 512, height: 384 });
    expect(out.full.includes(Buffer.from('GPS-Test'))).toBe(false);
  });

  it('caps full at 2560 and thumb at 512 on the longest edge', async () => {
    const out = await processPhoto(await makeImage(3200, 1800, 'png'));
    expect(await expectClean(out.full)).toEqual({ width: 2560, height: 1440 });
    expect(await expectClean(out.thumb)).toEqual({ width: 512, height: 288 });
  });

  it('accepts WebP', async () => {
    const out = await processPhoto(await makeImage(800, 600, 'webp'));
    expect(await expectClean(out.full)).toEqual({ width: 800, height: 600 });
  });

  it('rejects images whose shortest edge is under 480 px (422)', async () => {
    await expectRejected(processPhoto(await makeImage(300, 200, 'jpeg')), 'photo_too_small');
  });

  it('rejects GIF, text and AVIF (415)', async () => {
    await expectRejected(processPhoto(await makeImage(600, 600, 'gif')), 'photo_unsupported_type');
    await expectRejected(processPhoto(Buffer.from('not an image at all')), 'photo_unsupported_type');
    await expectRejected(processPhoto(await makeImage(640, 640, 'avif')), 'photo_unsupported_type');
  });

  it('rejects a truncated JPEG (415)', async () => {
    const jpeg = await makeImage(800, 600, 'jpeg');
    await expectRejected(processPhoto(jpeg.subarray(0, 200)), 'photo_unsupported_type');
  });

  it('rejects more than 15 MB (413) and more than 50 MP (413)', async () => {
    await expectRejected(processPhoto(Buffer.alloc(PHOTO_LIMITS.maxBytes + 1, 0xff)), 'photo_too_large');
    // 8000x7000 = 56 MP; a flat PNG compresses to a few kB.
    const huge = await sharp({ create: { width: 8000, height: 7000, channels: 3, background: '#808080' } }).png().toBuffer();
    await expectRejected(processPhoto(huge), 'photo_too_large');
  });

  describe('HEIC (heic-decode / libheif-js)', () => {
    it('HEIC with EXIF GPS: metadata-free JPEG full and thumb', async () => {
      const input = fixture('kitchen-gps.heic');
      expect(input.includes(Buffer.from('GPS-Test'))).toBe(true);
      const out = await processPhoto(input);
      expect(await expectClean(out.full)).toEqual({ width: 1024, height: 768 });
      expect(await expectClean(out.thumb)).toEqual({ width: 512, height: 384 });
      expect(out.full.includes(Buffer.from('GPS-Test'))).toBe(false);
    });

    it('irot fixture is rotated exactly once (EXIF orientation 6 inside the HEIC is ignored)', async () => {
      // Coded 720x960 with irot (90 degrees); EXIF also says orientation 6. Upright = 960x720.
      const out = await processPhoto(fixture('kitchen-irot90.heic'));
      expect(await expectClean(out.full)).toEqual({ width: 960, height: 720 });
      expect([out.width, out.height]).toEqual([960, 720]);
    });

    it('HEIC with a shortest edge under 480 px gives photo_too_small', async () => {
      await expectRejected(processPhoto(fixture('kitchen-small.heic')), 'photo_too_small');
    });

    it('corrupt HEIC gives photo_unsupported_type', async () => {
      await expectRejected(processPhoto(fixture('not-heic.heic')), 'photo_unsupported_type');
    });

    it('a JPEG renamed to .heic is processed as JPEG (sniffing, not the extension)', async () => {
      // processPhoto never sees a file name; the bytes decide.
      const out = await processPhoto(fixture('kitchen-gps-orient6.jpg'));
      expect([out.width, out.height]).toEqual([1024, 768]);
    });

    it('decodes HEIC uploads one at a time and stays usable after a failure', async () => {
      const results = await Promise.allSettled([
        processPhoto(fixture('kitchen-gps.heic')),
        processPhoto(fixture('not-heic.heic')),
        processPhoto(fixture('kitchen-irot90.heic')),
      ]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    });
  });
});
