import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { CatalogRepository, NewCatalogChunk } from './catalog.repository.js';
import { chunkPages } from './chunking/chunker.js';
import type { Embedder } from './embedding/embedder.js';
import { EmbeddingDimensionError, EmbeddingUnavailableError } from './embedding/embedder.js';
import { extractPdfText, type PdfText, PdfReadError } from './pdf/pdf-text.js';

export type DocumentIngestionStatus = 'ingested' | 'replaced' | 'unchanged' | 'skipped' | 'failed';

export interface DocumentIngestionReport {
  fileName: string;
  status: DocumentIngestionStatus;
  /** Set for `skipped` (`no_text_layer`) and `failed` (human-readable reason). */
  reason?: string;
  pageCount: number;
  /** 1-based page numbers without a text layer. */
  skippedPages: number[];
  chunkCount: number;
  warnings: string[];
}

export interface IngestionReport {
  documents: DocumentIngestionReport[];
  totals: { documents: number; chunks: number; warnings: number; failed: number };
}

export interface IngestOptions {
  force?: boolean;
}

/** Bad invocation: missing directory or no PDF in it (CLI exit code 2). */
export class CatalogUsageError extends Error {
  override readonly name = 'CatalogUsageError';
}

/** The embedder failed: the whole run stops (CLI exit code 1). */
export class CatalogEmbedderError extends Error {
  override readonly name = 'CatalogEmbedderError';
}

export type ExtractText = (bytes: Uint8Array) => Promise<PdfText>;

/** Lists `*.pdf` files (case-insensitive, not recursive), sorted by name. Non-PDF files are ignored. */
export async function listPdfFiles(directory: string): Promise<string[]> {
  let info;
  try {
    info = await stat(directory);
  } catch {
    throw new CatalogUsageError(`directory not found: ${directory}`);
  }
  if (!info.isDirectory()) throw new CatalogUsageError(`not a directory: ${directory}`);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) throw new CatalogUsageError(`no *.pdf files in ${directory}`);
  return files.map((name) => join(directory, name));
}

const skippedWarnings = (pages: number[]): string[] => pages.map((page) => `page ${page}: no text layer`);

/**
 * Indexes Catalog PDFs. Per file: hash the bytes; if a document with the same name,
 * hash and embedding model exists and `force` is off, it is `unchanged`. Otherwise
 * extract, chunk and embed everything first, then write the document and its chunks
 * in one transaction (`ingested` when new, `replaced` when it existed). A corrupt or
 * encrypted file is `failed` and its previous chunks are kept. An embedder failure
 * aborts the run with {@link CatalogEmbedderError} before anything is written for
 * the current file.
 */
export class CatalogIngestionService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly embedder: Embedder,
    private readonly extract: ExtractText = extractPdfText,
  ) {}

  async ingestDirectory(directory: string, options: IngestOptions = {}): Promise<IngestionReport> {
    const files = await listPdfFiles(directory);
    const documents: DocumentIngestionReport[] = [];
    for (const file of files) {
      documents.push(await this.ingestFile(file, options));
    }
    return {
      documents,
      totals: {
        documents: documents.length,
        chunks: documents.reduce((sum, doc) => sum + doc.chunkCount, 0),
        warnings: documents.reduce((sum, doc) => sum + doc.warnings.length, 0),
        failed: documents.filter((doc) => doc.status === 'failed').length,
      },
    };
  }

  async ingestFile(path: string, options: IngestOptions = {}): Promise<DocumentIngestionReport> {
    const fileName = basename(path);
    const failed = (reason: string): DocumentIngestionReport => ({
      fileName,
      status: 'failed',
      reason,
      pageCount: 0,
      skippedPages: [],
      chunkCount: 0,
      warnings: [],
    });

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(path));
    } catch (error) {
      return failed(`cannot read file (${error instanceof Error ? error.name : 'unknown'})`);
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const existing = await this.repository.findDocumentBySourceName(fileName);

    if (
      existing &&
      !options.force &&
      existing.contentSha256 === sha256 &&
      existing.embeddingModel === this.embedder.model
    ) {
      return {
        fileName,
        status: 'unchanged',
        ...(existing.status === 'no_text_layer' ? { reason: 'no_text_layer' } : {}),
        pageCount: existing.pageCount,
        skippedPages: existing.skippedPages,
        chunkCount: existing.chunkCount,
        warnings: skippedWarnings(existing.skippedPages),
      };
    }

    let text: PdfText;
    try {
      text = await this.extract(bytes);
    } catch (error) {
      if (error instanceof PdfReadError) return failed(error.message);
      return failed(`unreadable PDF (${error instanceof Error ? error.name : 'unknown'})`);
    }

    const textPages = text.pages.filter((page) => page.hasTextLayer);
    const skippedPages = text.pages.filter((page) => !page.hasTextLayer).map((page) => page.pageNumber);
    const catalogName = text.title ?? fileName.replace(/\.pdf$/i, '');
    const base = {
      sourceName: fileName,
      catalogName,
      contentSha256: sha256,
      embeddingModel: this.embedder.model,
      pageCount: text.pages.length,
      skippedPages,
    };

    if (textPages.length === 0) {
      await this.repository.replaceDocument({ ...base, status: 'no_text_layer' }, []);
      return {
        fileName,
        status: 'skipped',
        reason: 'no_text_layer',
        pageCount: text.pages.length,
        skippedPages,
        chunkCount: 0,
        warnings: [`${fileName}: no text layer on any page (OCR is not supported)`],
      };
    }

    const pieces = chunkPages(textPages.map((page) => ({ pageNumber: page.pageNumber, lines: page.lines })));
    let embeddings: number[][];
    try {
      embeddings = await this.embedder.embedDocuments(pieces.map((piece) => piece.text));
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError || error instanceof EmbeddingDimensionError) {
        throw new CatalogEmbedderError(`${fileName}: ${error.message}`);
      }
      throw error;
    }
    const chunks: NewCatalogChunk[] = pieces.map((piece, index) => ({ ...piece, embedding: embeddings[index] }));
    await this.repository.replaceDocument({ ...base, status: 'indexed' }, chunks);
    return {
      fileName,
      status: existing ? 'replaced' : 'ingested',
      pageCount: text.pages.length,
      skippedPages,
      chunkCount: chunks.length,
      warnings: skippedWarnings(skippedPages),
    };
  }
}
