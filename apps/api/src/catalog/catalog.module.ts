import { Module } from '@nestjs/common';
import { DIAGNOSTICS, type Diagnostics } from '../diagnostics/diagnostics.types.js';
import { InstrumentedEmbedder } from '../diagnostics/instrument/embedder.js';
import { createEmbedderFromEnv } from './catalog.config.js';
import { CATALOG_REPOSITORY, PrismaCatalogRepository } from './catalog.repository.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogSearchService } from './catalog-search.service.js';
import { EMBEDDER, type Embedder } from './embedding/embedder.js';

/**
 * Catalog RAG index (feature catalog-rag-ingestion). Exports CatalogSearchService
 * for in-process use by the budget engine. Ingestion runs from the CLI
 * (`dist/catalog/cli/ingest.js`), not from this module.
 */
@Module({
  controllers: [CatalogController],
  providers: [
    {
      provide: EMBEDDER,
      inject: [{ token: DIAGNOSTICS, optional: true }],
      useFactory: (diagnostics?: Diagnostics): Embedder => {
        const embedder = createEmbedderFromEnv();
        return diagnostics?.enabled ? new InstrumentedEmbedder(embedder, diagnostics) : embedder;
      },
    },
    { provide: CATALOG_REPOSITORY, useClass: PrismaCatalogRepository },
    CatalogSearchService,
  ],
  exports: [CatalogSearchService],
})
export class CatalogModule {}
