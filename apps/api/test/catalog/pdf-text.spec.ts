import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSampleCatalog,
  SAMPLE_CATALOG_BANNER,
  SAMPLE_CATALOG_FILE_NAME,
  SAMPLE_CATALOG_TITLE,
} from '../../scripts/generate-sample-catalog.js';
import { extractPdfText, PdfReadError, rebuildLines } from '../../src/catalog/pdf/pdf-text.js';
import { encryptedPdf, shapesOnlyPdf } from './helpers.js';

const committedSample = join(import.meta.dirname, '../../../../infra/catalog/samples', SAMPLE_CATALOG_FILE_NAME);

describe('sample Catalog generator', () => {
  it('is byte-identical across runs and matches the committed sample', async () => {
    const first = await buildSampleCatalog();
    const second = await buildSampleCatalog();
    expect(first.equals(second)).toBe(true);
    expect(first.equals(await readFile(committedSample))).toBe(true);
    expect(first.length).toBeLessThan(50 * 1024);
  });

  it('edition 2 changes only the BM-SYN-WTP-300 price', async () => {
    const one = await extractPdfText(await buildSampleCatalog(1));
    const two = await extractPdfText(await buildSampleCatalog(2));
    const linesOne = one.pages.flatMap((page) => page.lines);
    const linesTwo = two.pages.flatMap((page) => page.lines);
    const changed = linesOne.filter((line, index) => line !== linesTwo[index]);
    expect(linesOne).toHaveLength(linesTwo.length);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('BM-SYN-WTP-300');
    expect(changed[0]).toContain('189.90 EUR');
    expect(linesTwo.find((line) => line.includes('BM-SYN-WTP-300'))).toContain('199.90 EUR');
  });
});

describe('extractPdfText', () => {
  it('extracts the generated fixture page by page and flags page 5 as having no text layer', async () => {
    const text = await extractPdfText(await buildSampleCatalog());
    expect(text.title).toBe(SAMPLE_CATALOG_TITLE);
    expect(text.pages).toHaveLength(5);
    expect(text.pages.map((page) => page.hasTextLayer)).toEqual([true, true, true, true, false]);
    expect(text.pages[0].lines.join('\n')).toContain(SAMPLE_CATALOG_BANNER);
    const page3 = text.pages[2];
    expect(page3.pageNumber).toBe(3);
    expect(page3.lines).toContain(
      'BM-SYN-WTP-300 | Oak laminate worktop 300 cm / Encimera laminada roble 300 cm | unit | 189.90 EUR',
    );
    expect(text.pages[4].lines).toEqual([]);
  });

  it('flags a shapes-only PDF as having no text layer on any page', async () => {
    const text = await extractPdfText(await shapesOnlyPdf());
    expect(text.pages).toHaveLength(1);
    expect(text.pages[0].hasTextLayer).toBe(false);
  });

  it('rejects corrupt bytes with PdfReadError', async () => {
    await expect(extractPdfText(new TextEncoder().encode('%PDF-1.4 not really a pdf'))).rejects.toBeInstanceOf(PdfReadError);
  });

  it('rejects a password-protected PDF as encrypted', async () => {
    await expect(extractPdfText(await encryptedPdf())).rejects.toThrow(/encrypted PDF/);
  });
});

describe('rebuildLines', () => {
  it('groups items by y, sorts by x and marks wide gaps as column breaks', () => {
    const lines = rebuildLines([
      { str: '9.95 EUR', x: 500, y: 700, width: 30, fontSize: 8 },
      { str: 'SKU-1', x: 40, y: 700.5, width: 25, fontSize: 8 },
      { str: 'Tap', x: 130, y: 700, width: 12, fontSize: 8 },
      { str: 'chrome', x: 144, y: 700, width: 25, fontSize: 8 },
      { str: '  ', x: 300, y: 700, width: 5, fontSize: 8 },
      { str: 'Heading', x: 40, y: 760, width: 60, fontSize: 14 },
    ]);
    expect(lines).toEqual(['Heading', 'SKU-1 | Tap chrome | 9.95 EUR']);
  });
});
