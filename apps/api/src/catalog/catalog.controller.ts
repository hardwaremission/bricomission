import { BadRequestException, Controller, Get, Logger, Query, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogSearchResponseDto } from './catalog.dto.js';
import {
  type CatalogSearchParams,
  CatalogSearchService,
  CatalogSearchValidationError,
  parseSearchParams,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  SEARCH_LIMIT_MIN,
  SEARCH_QUERY_MAX_CHARS,
} from './catalog-search.service.js';

/**
 * Thin internal/diagnostic HTTP surface over {@link CatalogSearchService}.
 * Unauthenticated until keycloak-realm-roles lands (see ARCHITECTURE.md follow-up):
 * public partner Catalog content only, API bound to 127.0.0.1.
 */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(private readonly search: CatalogSearchService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search Catalog chunks (RAG index) and return their document and page references' })
  @ApiQuery({ name: 'q', required: true, description: `Search text, 1-${SEARCH_QUERY_MAX_CHARS} characters, not blank` })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: SEARCH_LIMIT_MIN, maximum: SEARCH_LIMIT_MAX, default: SEARCH_LIMIT_DEFAULT },
  })
  @ApiOkResponse({ type: CatalogSearchResponseDto, description: 'Most relevant chunks (empty when the index is empty)' })
  @ApiBadRequestResponse({ description: 'q missing, blank or too long; limit outside 1-20' })
  @ApiServiceUnavailableResponse({ description: 'Embedding endpoint or database unreachable' })
  async searchCatalog(@Query('q') q: unknown, @Query('limit') limit: unknown): Promise<CatalogSearchResponseDto> {
    let params: CatalogSearchParams;
    try {
      params = parseSearchParams(q, limit);
    } catch (error) {
      if (error instanceof CatalogSearchValidationError) throw new BadRequestException(error.message);
      throw error;
    }
    try {
      return await this.search.search(params);
    } catch (error) {
      // Log the error class only: messages may embed hosts or connection details.
      this.logger.warn(`Catalog search failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException('Catalog search is temporarily unavailable');
    }
  }
}
