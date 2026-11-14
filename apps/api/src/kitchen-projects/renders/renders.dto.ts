import { ApiProperty } from '@nestjs/swagger';
import type {
  GpuJobKind,
  RenderErrorCode,
  RenderMode,
  RenderStatus,
  RenderView,
} from '@bricomission/shared-types';

const STATUSES: RenderStatus[] = ['queued', 'running', 'succeeded', 'failed'];
const MODES: RenderMode[] = ['canny', 'depth'];
const KINDS: GpuJobKind[] = ['image', 'llm'];
const ERROR_CODES: RenderErrorCode[] = ['adapter_error', 'timeout', 'interrupted', 'storage_unavailable'];

/** A Render of an owned Kitchen Project (features controlnet-render, simulations-ux-overhaul). No seed, prompt or job id. */
export class RenderViewDto implements RenderView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The Simulation this Render belongs to' })
  simulationId!: string;

  @ApiProperty({ enum: STATUSES })
  status!: RenderStatus;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Source Photo; null if it was deleted later' })
  photoId!: string | null;

  @ApiProperty({ type: 'integer', example: 0, description: '0-based position of the source Photo when the Simulation was created' })
  photoPosition!: number;

  @ApiProperty({ type: 'integer', example: 1, description: '1 for the first run, +1 per Retry' })
  attempts!: number;

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
