import { describe, expect, it } from 'vitest';
import { CHUNK_TARGET_CHARS, chunkPage, chunkPages } from '../../src/catalog/chunking/chunker.js';

const line = (n: number, size = 90): string => `L${String(n).padStart(3, '0')} ${'x'.repeat(size - 5)}`;

describe('chunker', () => {
  it('is deterministic and keeps short pages in one chunk with normalized whitespace', () => {
    const page = { pageNumber: 3, lines: ['  SKU-1   |  Oak  ', '', 'SKU-2 | Pine'] };
    const first = chunkPage(page);
    expect(first).toEqual(chunkPage(page));
    expect(first).toEqual([{ pageNumber: 3, chunkIndex: 0, text: 'SKU-1 | Oak\nSKU-2 | Pine' }]);
  });

  it('never crosses pages, never splits a line and overlaps by one line', () => {
    const lines = Array.from({ length: 30 }, (_, i) => line(i));
    const chunks = chunkPages([
      { pageNumber: 1, lines },
      { pageNumber: 2, lines: ['only line on page 2'] },
    ]);
    const page1 = chunks.filter((chunk) => chunk.pageNumber === 1);
    expect(page1.length).toBeGreaterThan(2);
    expect(page1.map((chunk) => chunk.chunkIndex)).toEqual(page1.map((_, i) => i));
    for (const chunk of page1) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARS);
      for (const piece of chunk.text.split('\n')) expect(lines).toContain(piece);
    }
    for (let i = 1; i < page1.length; i += 1) {
      const previous = page1[i - 1].text.split('\n');
      expect(page1[i].text.split('\n')[0]).toBe(previous[previous.length - 1]);
    }
    // Every line is covered, in order.
    const covered = [...new Set(page1.flatMap((chunk) => chunk.text.split('\n')))];
    expect(covered).toEqual(lines);
    expect(chunks.at(-1)).toEqual({ pageNumber: 2, chunkIndex: 0, text: 'only line on page 2' });
  });

  it('keeps an over-long line whole in its own chunk', () => {
    const long = 'y'.repeat(CHUNK_TARGET_CHARS + 200);
    const chunks = chunkPage({ pageNumber: 1, lines: ['short a', long, 'short b'] });
    expect(chunks.map((chunk) => chunk.text)).toEqual(['short a', long, 'short b']);
  });

  it('returns no chunks for an empty page', () => {
    expect(chunkPage({ pageNumber: 1, lines: [' ', ''] })).toEqual([]);
  });
});
