import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiQuery,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../auth/auth.decorators.js';
import { CurrentDraft, DraftTokenGuard } from '../draft-token.guard.js';
import { AddGalleryItemRequestDto, KitchenDraftErrorDto, MoodboardItemViewDto } from '../kitchen-drafts.dto.js';
import type { KitchenDraftRecord } from '../kitchen-drafts.repository.js';
import { PhotoUploadInterceptor } from '../photo-upload.interceptor.js';
import { MoodboardService } from './moodboard.service.js';

const NOT_FOUND = 'No draft for this token (missing, malformed, unknown or expired token), or the item is not in it';

/**
 * The Moodboard of the anonymous draft (feature moodboard-selection). Same access model as the
 * other draft routes: `@Public()` for the JWT guard, authorized by the DraftTokenGuard
 * (`X-Draft-Token`), item ids checked against the resolved draft (no IDOR).
 */
@ApiTags('kitchen-projects')
@Public()
@UseGuards(DraftTokenGuard)
@ApiSecurity('draftToken')
@Controller('kitchen-projects/drafts/current/moodboard')
export class MoodboardController {
  constructor(private readonly moodboard: MoodboardService) {}

  @Post('gallery-items')
  @ApiOperation({
    summary: 'Add a Style Gallery image to the Moodboard (idempotent: an image already in it returns its item with 200)',
  })
  @ApiBody({ type: AddGalleryItemRequestDto })
  @ApiCreatedResponse({ type: MoodboardItemViewDto, description: 'Added' })
  @ApiOkResponse({ type: MoodboardItemViewDto, description: 'Already in the Moodboard; nothing changed' })
  @ApiBadRequestResponse({ type: KitchenDraftErrorDto, description: '`gallery_image_unknown`, or a malformed body' })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ type: KitchenDraftErrorDto, description: '`moodboard_limit_reached` (12 items)' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  async addGalleryItem(
    @CurrentDraft() draft: KitchenDraftRecord,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MoodboardItemViewDto> {
    const { item, created } = await this.moodboard.addGalleryItem(draft, body);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return item;
  }

  @Post('uploads')
  @UseInterceptors(PhotoUploadInterceptor)
  @ApiOperation({
    summary: 'Upload an own reference photo (same rules as kitchen photos: JPEG, PNG, WebP or HEIC/HEIF; <= 15 MB; shortest edge >= 480 px; <= 50 MP)',
    description: 'Stored as metadata-free JPEG full (<= 2560 px) and thumbnail (<= 512 px); the original is never stored. Counts toward the 12 Moodboard Items.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['photo'], properties: { photo: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ type: MoodboardItemViewDto })
  @ApiBadRequestResponse({ type: KitchenDraftErrorDto, description: 'Malformed multipart body or `photo_missing`' })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ type: KitchenDraftErrorDto, description: '`moodboard_limit_reached` (12 items)' })
  @ApiPayloadTooLargeResponse({ type: KitchenDraftErrorDto, description: '`photo_too_large`' })
  @ApiUnsupportedMediaTypeResponse({ type: KitchenDraftErrorDto, description: '`photo_unsupported_type` (also for files that do not decode)' })
  @ApiUnprocessableEntityResponse({ type: KitchenDraftErrorDto, description: '`photo_too_small`' })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`, or database unreachable' })
  addUpload(@CurrentDraft() draft: KitchenDraftRecord, @Req() request: Request): Promise<MoodboardItemViewDto> {
    // PhotoUploadInterceptor guarantees the file.
    return this.moodboard.addUpload(draft, (request.file as Express.Multer.File).buffer);
  }

  @Get('items/:itemId/content')
  @Header('Cache-Control', 'private, max-age=3600')
  @ApiOperation({ summary: 'A stored reference photo (metadata-free JPEG). Upload items only; gallery items use their gallery URLs.' })
  @ApiQuery({ name: 'variant', required: true, enum: ['thumb', 'full'] })
  @ApiProduces('image/jpeg')
  @ApiOkResponse({ description: 'JPEG bytes', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } })
  @ApiBadRequestResponse({ description: 'Malformed item id or variant' })
  @ApiNotFoundResponse({ description: `${NOT_FOUND}, or it is a gallery item` })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`' })
  async content(
    @CurrentDraft() draft: KitchenDraftRecord,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Query('variant') variant: unknown,
  ): Promise<StreamableFile> {
    if (variant !== 'thumb' && variant !== 'full') throw new BadRequestException();
    const body = await this.moodboard.content(draft, itemId, variant);
    return new StreamableFile(body, { type: 'image/jpeg' });
  }

  @Delete('items/:itemId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a Moodboard Item (an upload loses both objects); later items move up one position' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiBadRequestResponse({ description: 'Malformed item id' })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`, or database unreachable' })
  async remove(@CurrentDraft() draft: KitchenDraftRecord, @Param('itemId', new ParseUUIDPipe()) itemId: string): Promise<void> {
    await this.moodboard.remove(draft, itemId);
  }
}
