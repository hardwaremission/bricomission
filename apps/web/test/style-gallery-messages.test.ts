import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const messagesDir = join(import.meta.dirname, '../messages');
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../../api/assets/style-gallery/manifest.json'), 'utf8')) as {
  styles: string[];
  images: Array<{ id: string; styleId: string }>;
};

// Style names and the gallery alt text come from the messages; the API only sends ids.
describe('Style Gallery messages', () => {
  const files = readdirSync(messagesDir).filter((name) => name.endsWith('.json'));

  it('every manifest style has a name in every locale', () => {
    expect(files).toHaveLength(11);
    for (const file of files) {
      const styles = JSON.parse(readFileSync(join(messagesDir, file), 'utf8')).moodboard.styles as Record<string, string>;
      expect(Object.keys(styles).sort(), file).toEqual([...manifest.styles].sort());
      for (const style of manifest.styles) expect(styles[style]?.trim(), `${file} ${style}`).toBeTruthy();
    }
  });

  it('every gallery image gets an accessible name from its style and number', () => {
    const en = JSON.parse(readFileSync(join(messagesDir, 'en.json'), 'utf8')).moodboard;
    expect(en.gallery.alt).toBe('{style} kitchen {n}');
    for (const image of manifest.images) {
      expect(manifest.styles).toContain(image.styleId);
      expect(image.id).toMatch(/-\d+$/);
    }
  });
});
