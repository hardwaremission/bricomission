import { Module } from '@nestjs/common';
import { createEmbedderFromEnv } from './catalog.config.js';
import { CATALOG_REPOSITORY, PrismaCatalogRepository } from './catalog.repository.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogSearchService } from './catalog-search.service.js';
import { EMBEDDER } from './embedding/embedder.js';

/**
 * Catalog RAG index (feature catalog-rag-ingestion). Exports CatalogSearchService
 * for in-process use by the budget engine. Ingestion runs from the CLI
 * (`dist/catalog/cli/ingest.js`), not from this module.
 */
@Module({
  controllers: [CatalogController],
  providers: [
    { provide: EMBEDDER, useFactory: () => createEmbedderFromEnv() },
    { provide: CATALOG_REPOSITORY, useClass: PrismaCatalogRepository },
    CatalogSearchService,
  ],
  exports: [CatalogSearchService],
})
export class CatalogModule {}
