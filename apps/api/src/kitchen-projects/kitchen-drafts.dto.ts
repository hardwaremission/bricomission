import { ApiProperty } from '@nestjs/swagger';
import type {
  KitchenDraftErrorCode,
  KitchenDraftLimits,
  KitchenDraftView,
  KitchenMeasurements,
  KitchenPhotoView,
  MoodboardItemSource,
  MoodboardItemView,
  AddGalleryItemRequest,
  StartKitchenDraftResponse,
} from '@bricomission/shared-types';
import { MEASUREMENT_LIMITS_CM } from './measurements.js';

const { lengthCm, widthCm, heightCm } = MEASUREMENT_LIMITS_CM;

/** Room measurements in whole centimetres (null = not entered). Request and response body. */
export class KitchenMeasurementsDto implements KitchenMeasurements {
  @ApiProperty({ type: 'integer', nullable: true, minimum: lengthCm.min, maximum: lengthCm.max, example: 420 })
  lengthCm!: number | null;

  @ApiProperty({ type: 'integer', nullable: true, minimum: widthCm.min, maximum: widthCm.max, example: 310 })
  widthCm!: number | null;

  @ApiProperty({ type: 'integer', nullable: true, minimum: heightCm.min, maximum: heightCm.max, example: 260 })
  heightCm!: number | null;
}

export class KitchenPhotoViewDto implements KitchenPhotoView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'integer', minimum: 0, description: '0-based, compacted on delete' })
  position!: number;

  @ApiProperty({ type: 'integer', description: 'Width of the stored full JPEG (orientation applied)' })
  width!: number;

  @ApiProperty({ type: 'integer', description: 'Height of the stored full JPEG (orientation applied)' })
  height!: number;

  @ApiProperty({ example: '/kitchen-projects/drafts/current/photos/0b6f.../content?variant=thumb', description: 'API-relative path' })
  thumbUrl!: string;

  @ApiProperty({ example: '/kitchen-projects/drafts/current/photos/0b6f.../content?variant=full', description: 'API-relative path' })
  fullUrl!: string;
}

export class KitchenDraftLimitsDto implements KitchenDraftLimits {
  @ApiProperty({ type: 'integer', example: 8 })
  maxPhotos!: number;

  @ApiProperty({ type: 'integer', example: 15728640 })
  maxPhotoBytes!: number;

  @ApiProperty({ type: 'integer', example: 12, description: 'Moodboard Items per draft, uploads and gallery picks together' })
  maxMoodboardItems!: number;
}

export class MoodboardItemViewDto implements MoodboardItemView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['gallery', 'upload'] })
  source!: MoodboardItemSource;

  @ApiProperty({ type: 'string', nullable: true, example: 'scandinavian-01', description: 'Style Gallery image id; null for uploads' })
  galleryImageId!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'scandinavian', description: 'Style of the gallery image; null for uploads' })
  styleId!: string | null;

  @ApiProperty({ type: 'integer', minimum: 0, description: '0-based, compacted on delete' })
  position!: number;

  @ApiProperty({ type: 'integer', description: 'Width of the full image' })
  width!: number;

  @ApiProperty({ type: 'integer', description: 'Height of the full image' })
  height!: number;

  @ApiProperty({
    example: '/style-gallery/images/scandinavian-01/content?variant=thumb',
    description: 'API-relative path: the gallery content route for gallery items, the draft item content route for uploads',
  })
  thumbUrl!: string;

  @ApiProperty({ example: '/kitchen-projects/drafts/current/moodboard/items/0b6f.../content?variant=full', description: 'API-relative path' })
  fullUrl!: string;
}

export class AddGalleryItemRequestDto implements AddGalleryItemRequest {
  @ApiProperty({ pattern: '^[a-z0-9-]{1,64}$', example: 'scandinavian-01', description: 'A Style Gallery image id (GET /style-gallery)' })
  galleryImageId!: string;
}

export class KitchenDraftViewDto implements KitchenDraftView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['draft'] })
  status!: 'draft';

  @ApiProperty({ type: KitchenMeasurementsDto })
  measurements!: KitchenMeasurementsDto;

  @ApiProperty({ type: [KitchenPhotoViewDto], description: 'Ordered by position' })
  photos!: KitchenPhotoViewDto[];

  @ApiProperty({ type: [MoodboardItemViewDto], description: 'Moodboard Items ordered by position' })
  moodboard!: MoodboardItemViewDto[];

  @ApiProperty({ type: KitchenDraftLimitsDto })
  limits!: KitchenDraftLimitsDto;

  @ApiProperty({ format: 'date-time', description: 'Slides 7 days ahead on every change' })
  expiresAt!: string;
}

export class StartKitchenDraftResponseDto implements StartKitchenDraftResponse {
  @ApiProperty({ type: KitchenDraftViewDto })
  draft!: KitchenDraftViewDto;

  @ApiProperty({ description: 'Opaque draft token (43 characters, base64url). Returned only here; send it as X-Draft-Token.' })
  draftToken!: string;
}

const ERROR_CODES: KitchenDraftErrorCode[] = [
  'draft_capacity',
  'invalid_measurements',
  'photo_missing',
  'photo_too_large',
  'photo_unsupported_type',
  'photo_too_small',
  'photo_limit_reached',
  'storage_unavailable',
  'moodboard_limit_reached',
  'gallery_image_unknown',
];

export class KitchenDraftErrorDto {
  @ApiProperty({ type: 'integer' })
  statusCode!: number;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: ERROR_CODES })
  code!: KitchenDraftErrorCode;
}

export class MeasurementFieldErrorsDto {
  @ApiProperty({ enum: ['not_integer', 'out_of_range'], required: false })
  lengthCm?: 'not_integer' | 'out_of_range';

  @ApiProperty({ enum: ['not_integer', 'out_of_range'], required: false })
  widthCm?: 'not_integer' | 'out_of_range';

  @ApiProperty({ enum: ['not_integer', 'out_of_range'], required: false })
  heightCm?: 'not_integer' | 'out_of_range';
}

export class InvalidMeasurementsErrorDto extends KitchenDraftErrorDto {
  @ApiProperty({ type: MeasurementFieldErrorsDto })
  fields!: MeasurementFieldErrorsDto;
}
