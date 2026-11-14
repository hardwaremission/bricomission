import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cropBefore, encodeRender, renderBucket } from '../../src/kitchen-projects/renders/render-geometry.js';
import { makeImage } from '../support/images.js';

describe('renderBucket (controlnet-render OQ-5)', () => {
  it.each([
    [4000, 3000, 1216, 832],
    [1200, 1000, 1216, 832], // exactly 1.2
    [1190, 1000, 1024, 1024],
    [1000, 1000, 1024, 1024],
    [840, 1000, 1024, 1024],
    [830, 1000, 832, 1216], // exactly 0.83
    [3000, 4000, 832, 1216],
  ])('%ix%i -> %ix%i', (w, h, width, height) => {
    expect(renderBucket(w, h)).toEqual({ width, height });
  });
});

describe('cropBefore / encodeRender', () => {
  it('centre-crops to the exact bucket and writes no metadata (EXIF/ICC/XMP dropped)', async () => {
    const tagged = await sharp(await makeImage(1600, 1000, 'jpeg'))
      .withMetadata({ orientation: 1 })
      .withExif({ IFD0: { Copyright: 'secret owner', ImageDescription: 'GPS here' } })
      .withIccProfile('p3')
      .jpeg()
      .toBuffer();
    expect((await sharp(tagged).metadata()).exif).toBeDefined();
    const before = await cropBefore(tagged, { width: 1216, height: 832 });
    const meta = await sharp(before).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 1216, height: 832 });
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it('re-encodes a PNG result to a full JPEG of the same size and a 512 px thumb, metadata-free', async () => {
    const png = await sharp(await makeImage(1216, 832, 'png')).withExif({ IFD0: { Software: 'ComfyUI' } }).png().toBuffer();
    const { full, thumb } = await encodeRender(png, { width: 1216, height: 832 });
    for (const [image, width, height] of [[full, 1216, 832], [thumb, 512, 350]] as const) {
      const meta = await sharp(image).metadata();
      expect(meta).toMatchObject({ format: 'jpeg', width, height });
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.comments).toBeUndefined();
    }
  });
});
