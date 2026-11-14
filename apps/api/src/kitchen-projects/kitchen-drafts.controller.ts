import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
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
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { CurrentDraft, DraftTokenGuard } from './draft-token.guard.js';
import {
  InvalidMeasurementsErrorDto,
  KitchenDraftErrorDto,
  KitchenDraftViewDto,
  KitchenMeasurementsDto,
  KitchenPhotoViewDto,
  StartKitchenDraftResponseDto,
} from './kitchen-drafts.dto.js';
import type { KitchenDraftRecord } from './kitchen-drafts.repository.js';
import { draftView, KitchenDraftsService, type PhotoVariant } from './kitchen-drafts.service.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';

const NOT_FOUND = 'No draft for this token (missing, malformed, unknown or expired token), or the photo is not in it';

/**
 * Anonymous kitchen drafts (feature kitchen-capture-draft). `@Public()` opts these routes out
 * of the default-deny JWT AuthGuard; every route except create is authorized by the
 * DraftTokenGuard (`X-Draft-Token`). URLs never carry a project id: they act on the draft
 * the token resolves to.
 */
@ApiTags('kitchen-projects')
@Public()
@Controller('kitchen-projects/drafts')
export class KitchenDraftsController {
  constructor(private readonly drafts: KitchenDraftsService) {}

  @Post()
  @ApiOperation({ summary: 'Start an anonymous kitchen draft and get its draft token (shown once)' })
  @ApiCreatedResponse({ type: StartKitchenDraftResponseDto })
  @ApiTooManyRequestsResponse({ type: KitchenDraftErrorDto, description: '`draft_capacity`: too many open drafts' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  start(): Promise<StartKitchenDraftResponseDto> {
    return this.drafts.start();
  }

  @Get('current')
  @UseGuards(DraftTokenGuard)
  @ApiSecurity('draftToken')
  @ApiOperation({ summary: 'The draft of the X-Draft-Token' })
  @ApiOkResponse({ type: KitchenDraftViewDto })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  current(@CurrentDraft() draft: KitchenDraftRecord): KitchenDraftViewDto {
    return draftView(draft);
  }

  @Put('current/measurements')
  @UseGuards(DraftTokenGuard)
  @ApiSecurity('draftToken')
  @ApiOperation({ summary: 'Replace the room measurements (whole centimetres, null = not entered)' })
  @ApiBody({ type: KitchenMeasurementsDto })
  @ApiOkResponse({ type: KitchenDraftViewDto })
  @ApiBadRequestResponse({ type: InvalidMeasurementsErrorDto, description: '`invalid_measurements` with per-field reasons' })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  updateMeasurements(@CurrentDraft() draft: KitchenDraftRecord, @Body() body: unknown): Promise<KitchenDraftViewDto> {
    return this.drafts.updateMeasurements(draft, body);
  }

  @Post('current/photos')
  @UseGuards(DraftTokenGuard)
  @UseInterceptors(PhotoUploadInterceptor)
  @ApiSecurity('draftToken')
  @ApiOperation({
    summary: 'Upload one photo (JPEG, PNG, WebP or HEIC/HEIF; <= 15 MB; shortest edge >= 480 px; <= 50 MP; <= 8 per draft)',
    description: 'The type is detected from the bytes. Stored as metadata-free JPEG full (<= 2560 px) and thumbnail (<= 512 px); the original is never stored.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['photo'], properties: { photo: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ type: KitchenPhotoViewDto })
  @ApiBadRequestResponse({ type: KitchenDraftErrorDto, description: 'Malformed multipart body or `photo_missing`' })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ type: KitchenDraftErrorDto, description: '`photo_limit_reached`' })
  @ApiPayloadTooLargeResponse({ type: KitchenDraftErrorDto, description: '`photo_too_large`' })
  @ApiUnsupportedMediaTypeResponse({ type: KitchenDraftErrorDto, description: '`photo_unsupported_type` (also for files that do not decode)' })
  @ApiUnprocessableEntityResponse({ type: KitchenDraftErrorDto, description: '`photo_too_small`' })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`, or database unreachable' })
  addPhoto(@CurrentDraft() draft: KitchenDraftRecord, @Req() request: Request): Promise<KitchenPhotoViewDto> {
    // PhotoUploadInterceptor guarantees the file.
    return this.drafts.addPhoto(draft, (request.file as Express.Multer.File).buffer);
  }

  @Get('current/photos/:photoId/content')
  @UseGuards(DraftTokenGuard)
  @ApiSecurity('draftToken')
  @Header('Cache-Control', 'private, max-age=3600')
  @ApiOperation({ summary: 'A stored photo (metadata-free JPEG)' })
  @ApiQuery({ name: 'variant', required: true, enum: ['thumb', 'full'] })
  @ApiProduces('image/jpeg')
  @ApiOkResponse({ description: 'JPEG bytes', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } })
  @ApiBadRequestResponse({ description: 'Malformed photo id or variant' })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`' })
  async photoContent(
    @CurrentDraft() draft: KitchenDraftRecord,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @Query('variant') variant: unknown,
  ): Promise<StreamableFile> {
    if (variant !== 'thumb' && variant !== 'full') throw new BadRequestException();
    const body = await this.drafts.photoContent(draft, photoId, variant as PhotoVariant);
    return new StreamableFile(body, { type: 'image/jpeg' });
  }

  @Delete('current/photos/:photoId')
  @UseGuards(DraftTokenGuard)
  @ApiSecurity('draftToken')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a photo (both objects); later photos move up one position' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiBadRequestResponse({ description: 'Malformed photo id' })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`, or database unreachable' })
  async deletePhoto(@CurrentDraft() draft: KitchenDraftRecord, @Param('photoId', new ParseUUIDPipe()) photoId: string): Promise<void> {
    await this.drafts.deletePhoto(draft, photoId);
  }
}
