import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CreateRenderRequest,
  CreateRenderResponse,
  GpuJobKind,
  RenderErrorCode,
  RenderListResponse,
  RenderMode,
  RenderStatus,
  RenderView,
} from '@bricomission/shared-types';

const STATUSES: RenderStatus[] = ['queued', 'running', 'succeeded', 'failed'];
const MODES: RenderMode[] = ['canny', 'depth'];
const KINDS: GpuJobKind[] = ['image', 'llm'];
const ERROR_CODES: RenderErrorCode[] = ['adapter_error', 'timeout', 'interrupted', 'storage_unavailable'];

/** A Render of an owned Kitchen Project (feature controlnet-render). No seed, prompt or job id. */
export class RenderViewDto implements RenderView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: STATUSES })
  status!: RenderStatus;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Source Photo; null if it was deleted later' })
  photoId!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'scandinavian', description: 'Dominant Moodboard style; null for an uploads-only Moodboard' })
  styleId!: string | null;

  @ApiProperty({ enum: MODES })
  mode!: RenderMode;

  @ApiProperty({ type: 'integer', example: 1216 })
  width!: number;

  @ApiProperty({ type: 'integer', example: 832 })
  height!: number;

  @ApiProperty({ type: 'integer', nullable: true, description: '1-based GPU queue position while queued (when known)' })
  position!: number | null;

  @ApiProperty({ enum: KINDS, nullable: true, description: 'Kind of GPU work it waits behind while queued' })
  waitingFor!: GpuJobKind | null;

  @ApiProperty({ enum: ERROR_CODES, nullable: true })
  errorCode!: RenderErrorCode | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ description: 'Centre crop of the source Photo (the model input); same size as the Render' })
  beforeUrl!: string;

  @ApiProperty({ type: 'string', nullable: true, description: 'Set only when succeeded' })
  fullUrl!: string | null;

  @ApiProperty({ type: 'string', nullable: true, description: 'Set only when succeeded' })
  thumbUrl!: string | null;
}

export class CreateRenderRequestDto implements CreateRenderRequest {
  @ApiPropertyOptional({ format: 'uuid', description: 'Photo of this project to render; default: the Photo at position 0' })
  photoId?: string;
}

export class CreateRenderResponseDto implements CreateRenderResponse {
  @ApiProperty({ type: RenderViewDto })
  render!: RenderViewDto;
}

export class RenderListResponseDto implements RenderListResponse {
  @ApiProperty({ type: [RenderViewDto], description: 'Newest first' })
  renders!: RenderViewDto[];

  @ApiProperty({ type: 'integer', example: 10, description: 'Non-failed Renders allowed per project' })
  maxRenders!: number;
}
