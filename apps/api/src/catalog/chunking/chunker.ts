/** Target chunk size in characters (a chunk may exceed it by at most one line). */
export const CHUNK_TARGET_CHARS = 800;

export interface PageLines {
  pageNumber: number;
  lines: string[];
}

export interface PageChunk {
  pageNumber: number;
  /** 0-based index within the page. */
  chunkIndex: number;
  text: string;
}

/**
 * Pure, deterministic, page-bounded chunker. Chunks never cross pages and never
 * split a line; line order is kept and whitespace is normalized. Lines are added
 * until the chunk reaches about {@link CHUNK_TARGET_CHARS} characters; the next
 * chunk repeats the previous chunk's last line as overlap (only when that chunk
 * had more than one line, so progress is guaranteed).
 */
export function chunkPage(page: PageLines, targetChars = CHUNK_TARGET_CHARS): PageChunk[] {
  const lines = page.lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '');
  const chunks: PageChunk[] = [];
  let current: string[] = [];
  let length = 0;
  const flush = (): void => {
    chunks.push({ pageNumber: page.pageNumber, chunkIndex: chunks.length, text: current.join('\n') });
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const added = current.length === 0 ? line.length : length + 1 + line.length;
    if (current.length > 0 && added > targetChars) {
      flush();
      const overlap = current.length > 1 ? current[current.length - 1] : undefined;
      current = overlap !== undefined ? [overlap] : [];
      length = overlap !== undefined ? overlap.length : 0;
      i -= 1; // re-evaluate this line against the new chunk
      if (overlap !== undefined && overlap.length + 1 + line.length > targetChars) {
        // The overlap alone would push this line out again: drop it to guarantee progress.
        current = [];
        length = 0;
      }
      continue;
    }
    current.push(line);
    length = added;
  }
  if (current.length > 0) flush();
  return chunks;
}

/** Chunks every page in order. */
export function chunkPages(pages: PageLines[], targetChars = CHUNK_TARGET_CHARS): PageChunk[] {
  return pages.flatMap((page) => chunkPage(page, targetChars));
}
