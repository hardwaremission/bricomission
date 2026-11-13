// Catalog ingestion CLI (feature catalog-rag-ingestion). Compiled to dist/catalog/cli/ingest.js.
// Usage: node dist/catalog/cli/ingest.js <dir> [--force]
// Normally run through scripts/catalog/ingest.sh, inside the api image, with DATABASE_URL
// and EMBEDDING_URL from compose. Exit codes: 0 ok (warnings allowed), 1 a document
// failed or the embedder is unreachable, 2 usage (missing directory, no *.pdf).
import 'reflect-metadata';
import { resolve } from 'node:path';
import { createEmbedderFromEnv } from '../catalog.config.js';
import { PrismaCatalogRepository } from '../catalog.repository.js';
import {
  CatalogEmbedderError,
  CatalogIngestionService,
  CatalogUsageError,
  type DocumentIngestionReport,
  type IngestionReport,
  listPdfFiles,
} from '../catalog-ingestion.service.js';
import { EmbeddingDimensionError, EmbeddingUnavailableError } from '../embedding/embedder.js';
import type { Embedder } from '../embedding/embedder.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export const USAGE = 'usage: ingest <catalog-dir> [--force]';
export const EMBEDDER_HINT =
  'Start the CPU embedder first: docker compose --profile rag-fetch run --rm embedder-fetch (once), then docker compose --profile rag up -d --wait embedder';

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

export function parseArgs(argv: string[]): { directory: string; force: boolean } {
  let directory: string | undefined;
  let force = false;
  for (const arg of argv) {
    if (arg === '--force') force = true;
    else if (arg.startsWith('-')) throw new CatalogUsageError(`unknown option: ${arg}`);
    else if (directory === undefined) directory = arg;
    else throw new CatalogUsageError('only one directory may be given');
  }
  if (directory === undefined) throw new CatalogUsageError('missing catalog directory');
  return { directory, force };
}

export function formatDocument(doc: DocumentIngestionReport): string[] {
  const status = doc.reason && doc.status !== 'failed' ? `${doc.status} (${doc.reason})` : doc.status;
  const lines = [
    doc.status === 'failed'
      ? `[${status}] ${doc.fileName}: ${doc.reason ?? 'unknown error'}`
      : `[${status}] ${doc.fileName}: pages ${doc.pageCount}, chunks ${doc.chunkCount}, skipped pages ${doc.skippedPages.length}`,
  ];
  for (const warning of doc.warnings) lines.push(`  warning: ${warning}`);
  return lines;
}

export function formatSummary(report: IngestionReport): string {
  const { documents, chunks, warnings, failed } = report.totals;
  return `summary: documents ${documents}, chunks ${chunks}, warnings ${warnings}, failed ${failed}`;
}

/** Runs the ingestion and returns the process exit code. Dependencies are injectable for tests. */
export async function runIngestCli(
  argv: string[],
  deps: { service: CatalogIngestionService; embedder: Embedder },
  io: CliIo,
): Promise<number> {
  let args: { directory: string; force: boolean };
  try {
    args = parseArgs(argv);
    await listPdfFiles(resolve(args.directory));
  } catch (error) {
    if (error instanceof CatalogUsageError) {
      io.err(`ERROR: ${error.message}`);
      io.err(USAGE);
      return 2;
    }
    throw error;
  }
  // Fail fast before touching the database when the embedder is down.
  try {
    await deps.embedder.embedQuery('health check');
  } catch (error) {
    if (error instanceof EmbeddingUnavailableError || error instanceof EmbeddingDimensionError) {
      io.err(`ERROR: embedder unavailable: ${error.message}`);
      io.err(EMBEDDER_HINT);
      return 1;
    }
    throw error;
  }
  let report: IngestionReport;
  try {
    report = await deps.service.ingestDirectory(resolve(args.directory), { force: args.force });
  } catch (error) {
    if (error instanceof CatalogEmbedderError) {
      io.err(`ERROR: embedder failed during ingestion: ${error.message}`);
      io.err(EMBEDDER_HINT);
      return 1;
    }
    throw error;
  }
  for (const doc of report.documents) {
    for (const line of formatDocument(doc)) io.out(line);
  }
  io.out(formatSummary(report));
  return report.totals.failed > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const io: CliIo = { out: (line) => console.log(line), err: (line) => console.error(line) };
  const prisma = new PrismaService();
  const embedder = createEmbedderFromEnv();
  const service = new CatalogIngestionService(new PrismaCatalogRepository(prisma), embedder);
  try {
    process.exitCode = await runIngestCli(process.argv.slice(2), { service, embedder }, io);
  } catch (error) {
    // Unexpected (usually the database): print the class and message, never the stack.
    io.err(`ERROR: ingestion failed (${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'})`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (import.meta.main) {
  await main();
}
