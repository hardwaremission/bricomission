// Builds the committed Style Gallery assets from the generated PNGs (feature moodboard-selection).
// Runs with Node's native type stripping (erasable syntax only, no relative imports):
//   node apps/api/scripts/build-style-gallery.ts [--contact-sheet <png path>]
// Input: .style-gallery-work/png/<id>.png from scripts/style-gallery/generate.sh (override the
// work dir with STYLE_GALLERY_WORK_DIR). For every manifest image it writes
// apps/api/assets/style-gallery/<id>/full.jpg (longest edge <= 1280, q82) and thumb.jpg (<= 512,
// q80), sRGB, with no metadata: ComfyUI PNGs embed the prompt and workflow in text chunks and
// sharp writes no EXIF/XMP/ICC/text unless asked, so re-encoding drops them. The manifest gets
// the `full` dimensions. With --contact-sheet it also renders a labelled grid of all thumbs for
// the developer's approval.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type OverlayOptions } from 'sharp';

interface ManifestImage {
  id: string;
  styleId: string;
  width: number;
  height: number;
  prompt: string;
  seed: number;
}

interface Manifest {
  version: number;
  styles: string[];
  images: ManifestImage[];
}

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(apiRoot, '../..');
const galleryDir = join(apiRoot, 'assets/style-gallery');
const manifestPath = join(galleryDir, 'manifest.json');
const workDir = process.env.STYLE_GALLERY_WORK_DIR ?? join(repoRoot, '.style-gallery-work');

const FULL_MAX_EDGE = 1280;
const THUMB_MAX_EDGE = 512;

const args = process.argv.slice(2);
const sheetIndex = args.indexOf('--contact-sheet');
const contactSheet = sheetIndex >= 0 ? resolve(args[sheetIndex + 1] ?? '') : null;

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;

for (const image of manifest.images) {
  const source = join(workDir, 'png', `${image.id}.png`);
  if (!existsSync(source)) throw new Error(`missing generated image: ${source}`);
  const outDir = join(galleryDir, image.id);
  mkdirSync(outDir, { recursive: true });
  const full = await sharp(source)
    .toColourspace('srgb')
    .resize({ width: FULL_MAX_EDGE, height: FULL_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(source)
    .toColourspace('srgb')
    .resize({ width: THUMB_MAX_EDGE, height: THUMB_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  writeFileSync(join(outDir, 'full.jpg'), full.data);
  writeFileSync(join(outDir, 'thumb.jpg'), thumb);
  image.width = full.info.width;
  image.height = full.info.height;
  console.log(`${image.id}: full ${full.info.width}x${full.info.height} ${full.data.length} B, thumb ${thumb.length} B`);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (contactSheet) {
  const columns = 6;
  const cellWidth = 320;
  const cellHeight = 219;
  const labelHeight = 28;
  const gap = 8;
  const rows = Math.ceil(manifest.images.length / columns);
  const width = columns * cellWidth + (columns + 1) * gap;
  const height = rows * (cellHeight + labelHeight) + (rows + 1) * gap;
  const composites: OverlayOptions[] = [];
  for (const [index, image] of manifest.images.entries()) {
    const x = gap + (index % columns) * (cellWidth + gap);
    const y = gap + Math.floor(index / columns) * (cellHeight + labelHeight + gap);
    const tile = await sharp(join(galleryDir, image.id, 'thumb.jpg')).resize(cellWidth, cellHeight, { fit: 'cover' }).toBuffer();
    composites.push({ input: tile, left: x, top: y });
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth}" height="${labelHeight}">` +
        `<text x="4" y="20" font-family="sans-serif" font-size="16" font-weight="bold" fill="#182231">${image.id}</text></svg>`,
    );
    composites.push({ input: label, left: x, top: y + cellHeight });
  }
  mkdirSync(dirname(contactSheet), { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: '#FAFAF8' } }).composite(composites).png().toFile(contactSheet);
  console.log(`contact sheet: ${contactSheet}`);
}
