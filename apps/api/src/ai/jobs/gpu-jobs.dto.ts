import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  GpuJobErrorCode,
  GpuJobEvent,
  GpuJobKind,
  GpuJobStatus,
  GpuJobView,
} from '@bricomission/shared-types';

const KINDS = ['image', 'llm'];
const STATUSES = ['queued', 'running', 'done', 'failed'];
const ERROR_CODES = ['adapter_error', 'timeout'];

/** OpenAPI schema for `GET /ai/jobs/:id`. */
export class GpuJobViewDto implements GpuJobView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: KINDS })
  kind!: GpuJobKind;

  @ApiProperty({ enum: STATUSES })
  status!: GpuJobStatus;

  @ApiProperty({ type: Number, nullable: true, description: '1-based queue position while queued' })
  position!: number | null;

  @ApiProperty({ enum: KINDS, nullable: true, description: 'Kind of work the job waits behind while queued' })
  waitingFor!: GpuJobKind | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ enum: ERROR_CODES, nullable: true })
  errorCode!: GpuJobErrorCode | null;
}

/** OpenAPI schema for the JSON `data` of each SSE event (`id` = `seq`, `event` = `status`). */
export class GpuJobEventDto implements GpuJobEvent {
  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ description: 'Per-job strictly increasing sequence, also the SSE id' })
  seq!: number;

  @ApiProperty({ enum: STATUSES })
  status!: GpuJobStatus;

  @ApiProperty({ type: Number, nullable: true })
  position!: number | null;

  @ApiProperty({ enum: KINDS, nullable: true })
  waitingFor!: GpuJobKind | null;

  @ApiProperty({ format: 'date-time' })
  at!: string;

  @ApiProperty({ enum: ERROR_CODES, nullable: true })
  errorCode!: GpuJobErrorCode | null;
}

/** Body of the debug `POST /ai/jobs`. */
export class CreateGpuJobDto {
  @ApiProperty({ enum: KINDS })
  kind!: GpuJobKind;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Prompt passed to the adapter' })
  prompt?: string;
}
