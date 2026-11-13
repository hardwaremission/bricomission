import { ApiProperty } from '@nestjs/swagger';
import type { MeResponse, RealmRole } from '@bricomission/shared-types';

/** OpenAPI schema for the `GET /me` body. */
export class MeDto implements MeResponse {
  @ApiProperty({ description: 'Keycloak user id (sub)', example: 'a3cea832-338d-44bb-8bd6-d71f603f4d3a' })
  sub!: string;

  @ApiProperty({ description: 'Keycloak preferred_username', example: 'bm-homeowner' })
  username!: string;

  @ApiProperty({ type: String, nullable: true, example: 'homeowner@bricomission.local' })
  email!: string | null;

  @ApiProperty({ enum: ['user', 'professional', 'admin'], isArray: true, example: ['user'] })
  roles!: RealmRole[];
}
