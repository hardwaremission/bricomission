import { BadRequestException, Controller, Get, Header, NotFoundException, Param, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators.js';
import { StyleGalleryViewDto } from './style-gallery.dto.js';
import { StyleGalleryService } from './style-gallery.service.js';

/**
 * The curated Style Gallery (feature moodboard-selection). Public, non-personal content served
 * from committed files: no database, storage, GPU or network is needed.
 */
@ApiTags('style-gallery')
@Public()
@Controller('style-gallery')
export class StyleGalleryController {
  constructor(private readonly gallery: StyleGalleryService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'The Style Gallery: styles and their images, in a fixed order' })
  @ApiOkResponse({ type: StyleGalleryViewDto })
  list(): StyleGalleryViewDto {
    return this.gallery.view();
  }

  @Get('images/:imageId/content')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'A Style Gallery image (metadata-free JPEG; thumb <= 512 px, full <= 1280 px)' })
  @ApiQuery({ name: 'variant', required: true, enum: ['thumb', 'full'] })
  @ApiProduces('image/jpeg')
  @ApiOkResponse({ description: 'JPEG bytes', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } })
  @ApiBadRequestResponse({ description: 'Bad variant' })
  @ApiNotFoundResponse({ description: 'Unknown image id' })
  async content(@Param('imageId') imageId: string, @Query('variant') variant: unknown): Promise<StreamableFile> {
    if (variant !== 'thumb' && variant !== 'full') throw new BadRequestException();
    const body = await this.gallery.content(imageId, variant);
    if (!body) throw new NotFoundException();
    return new StreamableFile(body, { type: 'image/jpeg' });
  }
}
