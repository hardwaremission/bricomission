import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser } from './auth.decorators.js';
import type { AuthenticatedUser } from './auth.types.js';
import { MeDto } from './me.dto.js';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  @Get()
  @ApiOperation({ summary: 'The authenticated caller (any realm role)' })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token' })
  @ApiServiceUnavailableResponse({ description: 'Keycloak signing keys unreachable' })
  getMe(@CurrentUser() user: AuthenticatedUser): MeDto {
    return { sub: user.sub, username: user.username, email: user.email, roles: user.roles };
  }
}
