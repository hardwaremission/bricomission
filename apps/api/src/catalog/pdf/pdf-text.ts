import { extractTextItems, getDocumentProxy, getMeta } from 'unpdf';

/** A page with fewer non-whitespace characters than this has no usable text layer. */
export const MIN_TEXT_LAYER_CHARS = 20;

export interface PdfPageText {
  /** 1-based page number. */
  pageNumber: number;
  /** Lines in reading order (top to bottom), cells joined left to right. */
  lines: string[];
  hasTextLayer: boolean;
}

export interface PdfText {
  /** PDF Title metadata, if present and non-blank. */
  title?: string;
  pages: PdfPageText[];
}

/** The file is not a readable PDF (corrupt, truncated, encrypted). */
export class PdfReadError extends Error {
  override readonly name = 'PdfReadError';
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

/** Same-line tolerance on the y axis, in PDF points. */
const LINE_Y_TOLERANCE = 2;

/**
 * Rebuilds lines from positioned text items: groups by y (top to bottom), sorts
 * each line by x and joins cells. A horizontal gap wider than two font sizes is a
 * column break and becomes ` | `; smaller gaps become a single space.
 */
export function rebuildLines(items: TextItem[]): string[] {
  const visible = items.filter((item) => item.str.trim() !== '');
  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - item.y) <= LINE_Y_TOLERANCE) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }
  return rows
    .map((row) => {
      const cells = row.sort((a, b) => a.x - b.x);
      let line = '';
      let end = 0;
      cells.forEach((cell, index) => {
        if (index > 0) {
          const gap = cell.x - end;
          line += gap > 2 * Math.max(cell.fontSize, 1) ? ' | ' : ' ';
        }
        line += cell.str;
        end = cell.x + cell.width;
      });
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter((line) => line !== '');
}

export function countNonWhitespace(lines: string[]): number {
  return lines.join('').replace(/\s+/g, '').length;
}

/**
 * Extracts text page by page with the serverless PDF.js build bundled by `unpdf`
 * (pure JS, no network, no worker, no native canvas). Pages with fewer than
 * {@link MIN_TEXT_LAYER_CHARS} non-whitespace characters are flagged as having no
 * text layer (scanned or drawn pages; OCR is out of scope).
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // PDF.js may transfer the buffer: hand it a copy so the caller's bytes stay usable.
    pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    const reason = name === 'PasswordException' ? 'encrypted PDF (password required)' : `unreadable PDF (${name})`;
    throw new PdfReadError(reason);
  }
  try {
    const meta = await getMeta(pdf);
    const { items } = await extractTextItems(pdf);
    const pages = items.map((pageItems, index) => {
      const lines = rebuildLines(pageItems);
      return {
        pageNumber: index + 1,
        lines,
        hasTextLayer: countNonWhitespace(lines) >= MIN_TEXT_LAYER_CHARS,
      };
    });
    const title = typeof meta.info.Title === 'string' ? meta.info.Title.trim() : '';
    return { ...(title ? { title } : {}), pages };
  } catch (error) {
    if (error instanceof PdfReadError) throw error;
    throw new PdfReadError(`unreadable PDF (${error instanceof Error ? error.name : 'unknown'})`);
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
