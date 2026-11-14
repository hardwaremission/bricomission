import {
  applyDecorators,
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { DRAFT_TOKEN_HEADER } from './draft-token.js';
import { KitchenDraftErrorDto } from './kitchen-drafts.dto.js';
import type { KitchenProjectRecord } from './kitchen-drafts.repository.js';
import type { PhotoVariant } from './kitchen-drafts.service.js';
import { ClaimKitchenDraftResponseDto, KitchenProjectErrorDto, KitchenProjectViewDto } from './kitchen-projects.dto.js';
import { KitchenProjectsService } from './kitchen-projects.service.js';
import { CurrentProject, OwnedProjectGuard } from './owned-project.guard.js';

const NOT_OWNED = 'Unknown project, still a draft, or owned by another Account (same generic body)';

/** Bearer auth and the 401/403 responses shared by every route of this controller. */
const Homeowner = () =>
  applyDecorators(
    ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token' }),
    ApiForbiddenResponse({ description: 'Caller lacks the user (Homeowner) realm role' }),
  );

/** Owner routes: OwnedProjectGuard after the global guards. */
const Owned = () =>
  applyDecorators(
    UseGuards(OwnedProjectGuard),
    ApiParam({ name: 'projectId', schema: { type: 'string', format: 'uuid' }, description: 'Id of a Kitchen Project the caller owns' }),
    ApiBearerAuth(),
    Homeowner(),
    ApiBadRequestResponse({ description: 'Malformed project id' }),
    ApiNotFoundResponse({ description: NOT_OWNED }),
    ApiServiceUnavailableResponse({ description: 'Database unreachable' }),
  );

const Content = () =>
  applyDecorators(
    Header('Cache-Control', 'private, max-age=3600'),
    ApiQuery({ name: 'variant', required: true, enum: ['thumb', 'full'] }),
    ApiProduces('image/jpeg'),
    ApiOkResponse({ description: 'JPEG bytes', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } }),
    ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`, or database unreachable' }),
  );

const Costly = (summary: string, feature: string) =>
  applyDecorators(
    Owned(),
    HttpCode(501),
    ApiOperation({
      summary,
      description: `Placeholder until ${feature}: it never calls the GPU job broker or an AI adapter. That feature keeps the path, the guards and the 409 rule.`,
    }),
    ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`project_incomplete`: needs a photo, all three measurements and a Moodboard Item' }),
    ApiResponse({ status: 501, type: KitchenProjectErrorDto, description: '`not_available_yet`' }),
  );

/**
 * Claimed Kitchen Projects (feature login-gate-claim). Default-deny: no `@Public()` here (it
 * would beat `@Roles()`). Every route needs a Bearer token of a Homeowner (realm role `user`);
 * Professionals and Administrators get 403. The claim also needs the draft's X-Draft-Token.
 */
@ApiTags('kitchen-projects')
@Roles('user')
@Controller('kitchen-projects')
export class KitchenProjectsController {
  constructor(private readonly projects: KitchenProjectsService) {}

  @Post('drafts/current/claim')
  @HttpCode(200)
  @ApiSecurity({ bearer: [], draftToken: [] })
  @Homeowner()
  @ApiOperation({
    summary: "Claim the X-Draft-Token's draft for the caller (Login Gate)",
    description:
      'The same row becomes `claimed`: owner = token `sub`, `claimedAt` set, no expiry; id, photos, measurements and Moodboard are kept. Repeating the claim with the same Account returns the same body. The draft routes no longer accept the token afterwards.',
  })
  @ApiOkResponse({ type: ClaimKitchenDraftResponseDto })
  @ApiNotFoundResponse({ description: 'Missing, malformed, unknown or expired draft token, or a project claimed by another Account' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  claim(@Headers(DRAFT_TOKEN_HEADER) draftToken: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<ClaimKitchenDraftResponseDto> {
    return this.projects.claim(draftToken, user.sub);
  }

  @Get(':projectId')
  @Owned()
  @ApiOperation({ summary: 'A claimed Kitchen Project of the caller (read-only)' })
  @ApiOkResponse({ type: KitchenProjectViewDto })
  get(@CurrentProject() project: KitchenProjectRecord): KitchenProjectViewDto {
    return this.projects.view(project);
  }

  @Get(':projectId/photos/:photoId/content')
  @Owned()
  @Content()
  @ApiOperation({ summary: 'A stored kitchen photo of an owned project (metadata-free JPEG)' })
  async photoContent(
    @CurrentProject() project: KitchenProjectRecord,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @Query('variant') variant: unknown,
  ): Promise<StreamableFile> {
    if (variant !== 'thumb' && variant !== 'full') throw new BadRequestException();
    return new StreamableFile(await this.projects.photoContent(project, photoId, variant as PhotoVariant), { type: 'image/jpeg' });
  }

  @Get(':projectId/moodboard/items/:itemId/content')
  @Owned()
  @Content()
  @ApiOperation({ summary: 'A Moodboard reference upload of an owned project (gallery items use the public gallery route)' })
  async moodboardContent(
    @CurrentProject() project: KitchenProjectRecord,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Query('variant') variant: unknown,
  ): Promise<StreamableFile> {
    if (variant !== 'thumb' && variant !== 'full') throw new BadRequestException();
    return new StreamableFile(await this.projects.moodboardContent(project, itemId, variant as PhotoVariant), { type: 'image/jpeg' });
  }

  @Post(':projectId/renders')
  @Costly('Generate a Render of the kitchen (costly; placeholder)', 'controlnet-render')
  requestRender(@CurrentProject() project: KitchenProjectRecord): void {
    this.projects.requestCostlyAction(project, 'render');
  }

  @Post(':projectId/budget')
  @Costly('Compute the Budget of the kitchen (costly; placeholder)', 'budget-tier-computation')
  requestBudget(@CurrentProject() project: KitchenProjectRecord): void {
    this.projects.requestCostlyAction(project, 'budget');
  }
}
