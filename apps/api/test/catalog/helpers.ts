import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type {
  CatalogChunkHit,
  CatalogRepository,
  NewCatalogChunk,
  NewCatalogDocument,
  StoredCatalogDocument,
} from '../../src/catalog/catalog.repository.js';

interface MemoryDocument extends Omit<StoredCatalogDocument, 'chunkCount'> {
  chunks: (NewCatalogChunk & { id: string })[];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** In-memory CatalogRepository with the same contract as the Prisma one (atomic replace). */
export class InMemoryCatalogRepository implements CatalogRepository {
  documents = new Map<string, MemoryDocument>();
  writes = 0;
  failNextWrite = false;

  findDocumentBySourceName(sourceName: string): Promise<StoredCatalogDocument | null> {
    const doc = this.documents.get(sourceName);
    if (!doc) return Promise.resolve(null);
    const { chunks, ...rest } = doc;
    return Promise.resolve({ ...rest, skippedPages: [...rest.skippedPages], chunkCount: chunks.length });
  }

  replaceDocument(document: NewCatalogDocument, chunks: NewCatalogChunk[]): Promise<{ documentId: string }> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return Promise.reject(new Error('simulated database failure'));
    }
    this.writes += 1;
    const id = randomUUID();
    this.documents.set(document.sourceName, {
      ...document,
      id,
      chunks: chunks.map((chunk) => ({ ...chunk, id: randomUUID() })),
    });
    return Promise.resolve({ documentId: id });
  }

  private hits(vector: number[], model: string, filter: (text: string) => boolean): CatalogChunkHit[] {
    const hits: CatalogChunkHit[] = [];
    for (const doc of this.documents.values()) {
      if (doc.embeddingModel !== model) continue;
      for (const chunk of doc.chunks) {
        if (!filter(chunk.text)) continue;
        hits.push({
          chunkId: chunk.id,
          documentId: doc.id,
          catalogName: doc.catalogName,
          fileName: doc.sourceName,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
          score: cosine(vector, chunk.embedding),
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
  }

  searchByVector(vector: number[], embeddingModel: string, limit: number): Promise<CatalogChunkHit[]> {
    return Promise.resolve(this.hits(vector, embeddingModel, () => true).slice(0, limit));
  }

  searchByTerms(terms: string[], vector: number[], embeddingModel: string, limit: number): Promise<CatalogChunkHit[]> {
    if (terms.length === 0) return Promise.resolve([]);
    const lowered = terms.map((term) => term.toLowerCase());
    return Promise.resolve(
      this.hits(vector, embeddingModel, (text) => lowered.some((term) => text.toLowerCase().includes(term))).slice(0, limit),
    );
  }

  allChunks(): { id: string; text: string; pageNumber: number }[] {
    return [...this.documents.values()].flatMap((doc) => doc.chunks);
  }
}

function render(build: (doc: PDFKit.PDFDocument) => void, options: PDFKit.PDFDocumentOptions = {}): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, ...options });
  const parts: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (part: Buffer) => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.on('error', reject);
  });
  build(doc);
  doc.end();
  return done;
}

/** A PDF whose single page is drawn with shapes only (no text layer). */
export function shapesOnlyPdf(): Promise<Buffer> {
  return render((doc) => {
    doc.addPage();
    doc.rect(50, 50, 200, 100).stroke();
    doc.circle(300, 300, 40).fill('#888888');
  });
}

/** A password-protected PDF (user password required to open). */
export function encryptedPdf(): Promise<Buffer> {
  return render(
    (doc) => {
      doc.addPage();
      doc.text('BM-SYN-ENC-001 | Secret product | unit | 1.00 EUR', 50, 50);
    },
    { userPassword: 'secret', ownerPassword: 'owner', pdfVersion: '1.7' },
  );
}

export function tempDir(prefix = 'catalog-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}
