import { ApiProperty } from '@nestjs/swagger';
import type { ClaimKitchenDraftResponse, KitchenDraftErrorCode, KitchenProjectErrorCode, KitchenProjectView } from '@bricomission/shared-types';
import { KitchenMeasurementsDto, KitchenPhotoViewDto, MoodboardItemViewDto } from './kitchen-drafts.dto.js';

/** A claimed Kitchen Project as its owner sees it (feature login-gate-claim). */
export class KitchenProjectViewDto implements KitchenProjectView {
  @ApiProperty({ format: 'uuid', description: 'Same id as the draft it was claimed from' })
  id!: string;

  @ApiProperty({ enum: ['claimed'] })
  status!: 'claimed';

  @ApiProperty({ type: KitchenMeasurementsDto })
  measurements!: KitchenMeasurementsDto;

  @ApiProperty({
    type: [KitchenPhotoViewDto],
    description: 'Ordered by position; URLs point at GET /kitchen-projects/{projectId}/photos/{photoId}/content',
  })
  photos!: KitchenPhotoViewDto[];

  @ApiProperty({
    type: [MoodboardItemViewDto],
    description: 'Ordered by position; upload URLs point at GET /kitchen-projects/{projectId}/moodboard/items/{itemId}/content, gallery URLs at the public gallery route',
  })
  moodboard!: MoodboardItemViewDto[];

  @ApiProperty({ format: 'date-time', description: 'Time of the claim; a repeated claim does not change it' })
  claimedAt!: string;
}

export class ClaimKitchenDraftResponseDto implements ClaimKitchenDraftResponse {
  @ApiProperty({ type: KitchenProjectViewDto })
  project!: KitchenProjectViewDto;
}

/** Owner edit routes (Decision 14) also answer the draft limit codes. */
const PROJECT_ERROR_CODES: Array<KitchenProjectErrorCode | KitchenDraftErrorCode> = [
  'photo_limit_reached',
  'moodboard_limit_reached',
  'project_incomplete',
  'storage_unavailable',
  'simulation_in_progress',
  'simulation_not_ready',
  'no_simulation_selected',
  'render_not_failed',
  'gpu_queue_full',
  'budget_in_progress',
  'catalog_empty',
  'embedding_unavailable',
];

export class KitchenProjectErrorDto {
  @ApiProperty({ type: 'integer' })
  statusCode!: number;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: PROJECT_ERROR_CODES })
  code!: KitchenProjectErrorCode | KitchenDraftErrorCode;
}
