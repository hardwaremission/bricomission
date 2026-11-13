import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSampleCatalog, SAMPLE_CATALOG_FILE_NAME, SAMPLE_CATALOG_TITLE } from '../../scripts/generate-sample-catalog.js';
import {
  CatalogEmbedderError,
  CatalogIngestionService,
  CatalogUsageError,
  listPdfFiles,
} from '../../src/catalog/catalog-ingestion.service.js';
import { EMBEDDER_HINT, runIngestCli } from '../../src/catalog/cli/ingest.js';
import { type Embedder, EmbeddingUnavailableError } from '../../src/catalog/embedding/embedder.js';
import { FakeEmbedder } from '../../src/catalog/embedding/fake.embedder.js';
import { InMemoryCatalogRepository, encryptedPdf, shapesOnlyPdf, tempDir } from './helpers.js';

class DownEmbedder extends FakeEmbedder {
  override embedDocuments(): Promise<number[][]> {
    return Promise.reject(new EmbeddingUnavailableError('embedding endpoint unreachable (TypeError)'));
  }
  override embedQuery(): Promise<number[]> {
    return Promise.reject(new EmbeddingUnavailableError('embedding endpoint unreachable (TypeError)'));
  }
}

class OtherModelEmbedder extends FakeEmbedder {
  override readonly model: string = 'another-model';
}

describe('CatalogIngestionService', () => {
  let dir: string;
  let repo: InMemoryCatalogRepository;
  let service: CatalogIngestionService;

  beforeEach(async () => {
    dir = await tempDir();
    await writeFile(join(dir, SAMPLE_CATALOG_FILE_NAME), await buildSampleCatalog());
    await writeFile(join(dir, 'notes.txt'), 'not a pdf');
    repo = new InMemoryCatalogRepository();
    service = new CatalogIngestionService(repo, new FakeEmbedder());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('ingests a directory: page 5 skipped with a warning, non-PDF files ignored', async () => {
    const report = await service.ingestDirectory(dir);
    expect(report.documents).toHaveLength(1);
    const [doc] = report.documents;
    expect(doc).toMatchObject({ fileName: SAMPLE_CATALOG_FILE_NAME, status: 'ingested', pageCount: 5, skippedPages: [5] });
    expect(doc.warnings).toEqual(['page 5: no text layer']);
    expect(doc.chunkCount).toBeGreaterThanOrEqual(4);
    expect(report.totals).toEqual({ documents: 1, chunks: doc.chunkCount, warnings: 1, failed: 0 });
    const stored = await repo.findDocumentBySourceName(SAMPLE_CATALOG_FILE_NAME);
    expect(stored).toMatchObject({ catalogName: SAMPLE_CATALOG_TITLE, status: 'indexed', embeddingModel: 'fake-token-hash-1024' });
    const page3 = repo.allChunks().filter((chunk) => chunk.pageNumber === 3);
    expect(page3.some((chunk) => chunk.text.includes('BM-SYN-WTP-300') && chunk.text.includes('189.90'))).toBe(true);
    expect(repo.allChunks().some((chunk) => chunk.pageNumber === 5)).toBe(false);
  });

  it('re-ingesting the same file is unchanged and writes nothing', async () => {
    await service.ingestDirectory(dir);
    const ids = repo.allChunks().map((chunk) => chunk.id);
    const report = await service.ingestDirectory(dir);
    expect(report.documents[0]).toMatchObject({ status: 'unchanged', skippedPages: [5], chunkCount: ids.length });
    expect(repo.writes).toBe(1);
    expect(repo.allChunks().map((chunk) => chunk.id)).toEqual(ids);
  });

  it('--force re-embeds with the same counts and no duplicates', async () => {
    await service.ingestDirectory(dir);
    const before = repo.allChunks();
    const report = await service.ingestDirectory(dir, { force: true });
    expect(report.documents[0].status).toBe('replaced');
    expect(repo.writes).toBe(2);
    expect(repo.documents.size).toBe(1);
    expect(repo.allChunks()).toHaveLength(before.length);
  });

  it('a changed embedding model re-embeds the document', async () => {
    await service.ingestDirectory(dir);
    const other = new CatalogIngestionService(repo, new OtherModelEmbedder());
    expect((await other.ingestDirectory(dir)).documents[0].status).toBe('replaced');
  });

  it('changed content under the same name is replaced (edition 2 price)', async () => {
    await service.ingestDirectory(dir);
    await writeFile(join(dir, SAMPLE_CATALOG_FILE_NAME), await buildSampleCatalog(2));
    const report = await service.ingestDirectory(dir);
    expect(report.documents[0].status).toBe('replaced');
    const texts = repo.allChunks().map((chunk) => chunk.text).join('\n');
    expect(texts).toContain('199.90 EUR');
    expect(texts).not.toContain('189.90');
  });

  it('a corrupt file under the same name fails and keeps the previous chunks; others still ingest', async () => {
    await service.ingestDirectory(dir);
    const ids = repo.allChunks().map((chunk) => chunk.id);
    await writeFile(join(dir, SAMPLE_CATALOG_FILE_NAME), 'garbage, not a PDF');
    await writeFile(join(dir, 'other.pdf'), await buildSampleCatalog());
    const report = await service.ingestDirectory(dir);
    const byName = Object.fromEntries(report.documents.map((doc) => [doc.fileName, doc]));
    expect(byName[SAMPLE_CATALOG_FILE_NAME]).toMatchObject({ status: 'failed' });
    expect(byName[SAMPLE_CATALOG_FILE_NAME].reason).toMatch(/unreadable PDF/);
    expect(byName['other.pdf'].status).toBe('ingested');
    expect(report.totals.failed).toBe(1);
    const kept = repo.documents.get(SAMPLE_CATALOG_FILE_NAME)?.chunks.map((chunk) => chunk.id);
    expect(kept).toEqual(ids);
  });

  it('an encrypted PDF fails with an encrypted reason', async () => {
    await writeFile(join(dir, 'locked.pdf'), await encryptedPdf());
    const report = await service.ingestDirectory(dir);
    expect(report.documents.find((doc) => doc.fileName === 'locked.pdf')).toMatchObject({
      status: 'failed',
      reason: 'encrypted PDF (password required)',
    });
  });

  it('a PDF with no text layer at all is skipped (no_text_layer) with 0 chunks and a warning', async () => {
    await writeFile(join(dir, 'scan.pdf'), await shapesOnlyPdf());
    const report = await service.ingestDirectory(dir);
    const scan = report.documents.find((doc) => doc.fileName === 'scan.pdf');
    expect(scan).toMatchObject({ status: 'skipped', reason: 'no_text_layer', chunkCount: 0, skippedPages: [1] });
    expect(scan?.warnings[0]).toMatch(/no text layer/);
    expect(report.totals.failed).toBe(0);
    expect((await repo.findDocumentBySourceName('scan.pdf'))?.status).toBe('no_text_layer');
  });

  it('embedder failure aborts the run before writing the document', async () => {
    const down = new CatalogIngestionService(repo, new DownEmbedder());
    await expect(down.ingestDirectory(dir)).rejects.toBeInstanceOf(CatalogEmbedderError);
    expect(repo.writes).toBe(0);
    expect(repo.documents.size).toBe(0);
  });

  it('a failed database write leaves the previous document intact', async () => {
    await service.ingestDirectory(dir);
    const ids = repo.allChunks().map((chunk) => chunk.id);
    repo.failNextWrite = true;
    await expect(service.ingestDirectory(dir, { force: true })).rejects.toThrow('simulated database failure');
    expect(repo.allChunks().map((chunk) => chunk.id)).toEqual(ids);
  });
});

describe('listPdfFiles', () => {
  it('rejects a missing directory and a directory without PDFs', async () => {
    await expect(listPdfFiles('/nonexistent/catalogs')).rejects.toBeInstanceOf(CatalogUsageError);
    const empty = await tempDir();
    await writeFile(join(empty, 'readme.md'), '# no pdf');
    await expect(listPdfFiles(empty)).rejects.toThrow(/no \*\.pdf files/);
    await mkdir(join(empty, 'nested.pdf'));
    await expect(listPdfFiles(empty)).rejects.toBeInstanceOf(CatalogUsageError);
    await rm(empty, { recursive: true, force: true });
  });
});

describe('ingest CLI', () => {
  let dir: string;
  let out: string[];
  let err: string[];
  const io = { out: (line: string) => out.push(line), err: (line: string) => err.push(line) };
  const run = (argv: string[], embedder: Embedder = new FakeEmbedder(), repo = new InMemoryCatalogRepository()) =>
    runIngestCli(argv, { service: new CatalogIngestionService(repo, embedder), embedder }, io);

  beforeEach(async () => {
    dir = await tempDir();
    await writeFile(join(dir, SAMPLE_CATALOG_FILE_NAME), await buildSampleCatalog());
    out = [];
    err = [];
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('exit 0 with a per-document report and a summary line', async () => {
    expect(await run([dir])).toBe(0);
    expect(out[0]).toMatch(/^\[ingested\] bricomission-sample-catalog\.pdf: pages 5, chunks \d+, skipped pages 1$/);
    expect(out).toContain('  warning: page 5: no text layer');
    expect(out.at(-1)).toMatch(/^summary: documents 1, chunks \d+, warnings 1, failed 0$/);
  });

  it('exit 2 with usage for a missing directory, an empty directory or no arguments', async () => {
    expect(await run(['/nonexistent/dir'])).toBe(2);
    expect(err.join('\n')).toContain('usage: ingest <catalog-dir> [--force]');
    const empty = await tempDir();
    expect(await run([empty])).toBe(2);
    expect(await run([])).toBe(2);
    await rm(empty, { recursive: true, force: true });
  });

  it('exit 1 when a document fails', async () => {
    await writeFile(join(dir, 'bad.pdf'), 'not a pdf');
    expect(await run([dir])).toBe(1);
    expect(out.some((line) => line.startsWith('[failed] bad.pdf: unreadable PDF'))).toBe(true);
  });

  it('exit 1 with the --profile rag hint when the embedder is unreachable, no writes', async () => {
    const repo = new InMemoryCatalogRepository();
    expect(await run([dir, '--force'], new DownEmbedder(), repo)).toBe(1);
    expect(err).toContain(EMBEDDER_HINT);
    expect(repo.writes).toBe(0);
  });
});
