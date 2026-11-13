import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators.js';
import { AdminPingDto } from './admin-ping.dto.js';

/** Administrator back-office routes. Later admin features extend this controller's module. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  @Get('ping')
  @ApiOperation({ summary: 'Admin-only liveness probe' })
  @ApiOkResponse({ type: AdminPingDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Caller lacks the admin realm role' })
  @ApiServiceUnavailableResponse({ description: 'Keycloak signing keys unreachable' })
  ping(): AdminPingDto {
    return { status: 'ok' };
  }
}
