import { ApiProperty } from '@nestjs/swagger';
import type { DatabaseStatus, HealthResponse, HealthStatus } from '@bricomission/shared-types';

/** OpenAPI schema for the `GET /health` body. */
export class HealthDto implements HealthResponse {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database!: DatabaseStatus;
}
