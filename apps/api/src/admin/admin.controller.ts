import { BadRequestException, Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { isStyleBlendMode, PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { AdminPingDto } from './admin-ping.dto.js';
import { StyleBlendSettingDto } from './style-blend.dto.js';

/** Administrator back-office routes. Later admin features extend this controller's module. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Admin-only liveness probe' })
  @ApiOkResponse({ type: AdminPingDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Caller lacks the admin realm role' })
  @ApiServiceUnavailableResponse({ description: 'Keycloak signing keys unreachable' })
  ping(): AdminPingDto {
    return { status: 'ok' };
  }

  @Get('settings/style-blend')
  @ApiOperation({ summary: 'The platform style blend mode (default `both` when unset)' })
  @ApiOkResponse({ type: StyleBlendSettingDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Caller lacks the admin realm role' })
  async getStyleBlend(): Promise<StyleBlendSettingDto> {
    return { mode: await this.settings.getStyleBlendMode() };
  }

  @Put('settings/style-blend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set the platform style blend mode (applies to Simulations created afterwards)' })
  @ApiBody({ type: StyleBlendSettingDto })
  @ApiOkResponse({ type: StyleBlendSettingDto })
  @ApiBadRequestResponse({ description: '`mode` is not one of ip_adapter, vlm_text, both' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Caller lacks the admin realm role' })
  async putStyleBlend(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser): Promise<StyleBlendSettingDto> {
    const mode = (body as { mode?: unknown } | null | undefined)?.mode;
    if (!isStyleBlendMode(mode)) throw new BadRequestException();
    await this.settings.setStyleBlendMode(mode, user.sub);
    return { mode };
  }
}
