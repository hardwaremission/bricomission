import { ApiProperty } from '@nestjs/swagger';
import type { AdminPingResponse } from '@bricomission/shared-types';

/** OpenAPI schema for the `GET /admin/ping` body. */
export class AdminPingDto implements AdminPingResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';
}
