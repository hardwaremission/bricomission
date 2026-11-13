import { ApiProperty } from '@nestjs/swagger';
import type { CatalogSearchResponse, CatalogSearchResult } from '@bricomission/shared-types';

/** OpenAPI schema for one `GET /catalog/search` result. */
export class CatalogSearchResultDto implements CatalogSearchResult {
  @ApiProperty({ format: 'uuid' })
  chunkId!: string;

  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ example: 'BricoMission Sample Kitchen Catalog (synthetic)' })
  catalogName!: string;

  @ApiProperty({ example: 'bricomission-sample-catalog.pdf' })
  fileName!: string;

  @ApiProperty({ minimum: 1, example: 3, description: '1-based page number in the source PDF' })
  pageNumber!: number;

  @ApiProperty({ example: 'BM-SYN-WTP-300 | Oak laminate worktop 300 cm / Encimera laminada roble 300 cm | unit | 189.90 EUR' })
  text!: string;

  @ApiProperty({ example: 0.71, description: 'Cosine similarity between query and chunk (higher is closer)' })
  score!: number;

  @ApiProperty({ description: 'Chunk contains a SKU-like query token verbatim; such chunks rank first' })
  matchedSku!: boolean;
}

/** OpenAPI schema for the `GET /catalog/search` body. */
export class CatalogSearchResponseDto implements CatalogSearchResponse {
  @ApiProperty({ example: 'oak laminate worktop' })
  query!: string;

  @ApiProperty({ type: [CatalogSearchResultDto] })
  results!: CatalogSearchResultDto[];
}
