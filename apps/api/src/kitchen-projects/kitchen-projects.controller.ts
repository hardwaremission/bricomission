import {
  applyDecorators,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { DRAFT_TOKEN_HEADER } from './draft-token.js';
import {
  AddGalleryItemRequestDto,
  InvalidMeasurementsErrorDto,
  KitchenDraftErrorDto,
  KitchenMeasurementsDto,
  KitchenPhotoViewDto,
  MoodboardItemViewDto,
} from './kitchen-drafts.dto.js';
import type { KitchenProjectRecord } from './kitchen-drafts.repository.js';
import type { PhotoVariant } from './kitchen-drafts.service.js';
import { ClaimKitchenDraftResponseDto, KitchenProjectErrorDto, KitchenProjectViewDto } from './kitchen-projects.dto.js';
import { KitchenProjectsService } from './kitchen-projects.service.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';
import { ProjectEditsService } from './project-edits.service.js';
import { CurrentProject, OwnedProjectGuard } from './owned-project.guard.js';
import { BudgetListResponseDto, BudgetViewDto, CreateBudgetResponseDto } from './budget/budget.dto.js';
import { BudgetService } from './budget/budget.service.js';
import { RenderViewDto } from './renders/renders.dto.js';
import { RENDER_VARIANTS, RendersService, type RenderVariant } from './renders/renders.service.js';
import {
  CreateSimulationResponseDto,
  SelectSimulationRequestDto,
  SelectSimulationResponseDto,
  SimulationListResponseDto,
  SimulationViewDto,
} from './simulations/simulations.dto.js';
import { SimulationsService } from './simulations/simulations.service.js';

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

const Content = (variants: readonly string[] = ['thumb', 'full']) =>
  applyDecorators(
    Header('Cache-Control', 'private, max-age=3600'),
    ApiQuery({ name: 'variant', required: true, enum: [...variants] }),
    ApiProduces('image/jpeg'),
    ApiOkResponse({ description: 'JPEG bytes', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } }),
    ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`, or database unreachable' }),
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
  constructor(
    private readonly projects: KitchenProjectsService,
    private readonly edits: ProjectEditsService,
    private readonly renders: RendersService,
    private readonly simulations: SimulationsService,
    private readonly budgets: BudgetService,
  ) {}

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
  @ApiOperation({ summary: 'A claimed Kitchen Project of the caller' })
  @ApiOkResponse({ type: KitchenProjectViewDto })
  get(@CurrentProject() project: KitchenProjectRecord): KitchenProjectViewDto {
    return this.projects.view(project);
  }

  @Put(':projectId/measurements')
  @ApiOperation({
    summary: 'Replace the room measurements of an owned project (whole centimetres, null = not entered)',
    description: 'Same body and validation as the draft route. Refused while a Simulation or a Budget of the project is queued or running.',
  })
  @ApiBody({ type: KitchenMeasurementsDto })
  @ApiOkResponse({ type: KitchenProjectViewDto })
  @ApiBadRequestResponse({ type: InvalidMeasurementsErrorDto, description: '`invalid_measurements` with per-field reasons' })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`simulation_in_progress` or `budget_in_progress`' })
  @Owned()
  updateMeasurements(@CurrentProject() project: KitchenProjectRecord, @Body() body: unknown): Promise<KitchenProjectViewDto> {
    return this.edits.updateMeasurements(project, body);
  }

  @Post(':projectId/photos')
  @UseInterceptors(PhotoUploadInterceptor)
  @ApiOperation({
    summary: 'Add one photo to an owned project (JPEG, PNG, WebP or HEIC/HEIF; <= 15 MB; shortest edge >= 480 px; <= 50 MP; <= 8 per project)',
    description: 'Same pipeline as the draft route: metadata-free JPEG full (<= 2560 px) and thumbnail (<= 512 px), the original is never stored. Refused while a Simulation or a Budget of the project is queued or running. Existing Simulations are not changed.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['photo'], properties: { photo: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ type: KitchenPhotoViewDto })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`photo_limit_reached`, `simulation_in_progress` or `budget_in_progress`' })
  @ApiPayloadTooLargeResponse({ type: KitchenDraftErrorDto, description: '`photo_too_large`' })
  @ApiUnsupportedMediaTypeResponse({ type: KitchenDraftErrorDto, description: '`photo_unsupported_type` (also for files that do not decode)' })
  @ApiUnprocessableEntityResponse({ type: KitchenDraftErrorDto, description: '`photo_too_small`' })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`, or database unreachable' })
  // Applied first, so the storage-specific 503 description above wins in the OpenAPI document.
  @Owned()
  addPhoto(@CurrentProject() project: KitchenProjectRecord, @Req() request: Request): Promise<KitchenPhotoViewDto> {
    // PhotoUploadInterceptor guarantees the file.
    return this.edits.addPhoto(project, (request.file as Express.Multer.File).buffer);
  }

  @Delete(':projectId/photos/:photoId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a photo of an owned project (both objects); later photos move up one position',
    description: 'Allowed down to zero photos (the project then answers 409 `project_incomplete` on Generate, as for a draft). Existing Simulations keep their Renders and `before` images.',
  })
  @ApiParam({ name: 'photoId', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`simulation_in_progress` or `budget_in_progress`' })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable` (nothing was deleted), or database unreachable' })
  @Owned()
  async deletePhoto(@CurrentProject() project: KitchenProjectRecord, @Param('photoId', new ParseUUIDPipe()) photoId: string): Promise<void> {
    await this.edits.deletePhoto(project, photoId);
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

  @Post(':projectId/moodboard/gallery-items')
  @ApiOperation({
    summary: 'Add a Style Gallery image to the Moodboard of an owned project (idempotent: an image already in it returns its item with 200)',
    description: 'Refused while a Simulation or a Budget of the project is queued or running.',
  })
  @ApiBody({ type: AddGalleryItemRequestDto })
  @ApiCreatedResponse({ type: MoodboardItemViewDto, description: 'Added' })
  @ApiOkResponse({ type: MoodboardItemViewDto, description: 'Already in the Moodboard; nothing changed' })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`moodboard_limit_reached` (12 items), `simulation_in_progress` or `budget_in_progress`' })
  @Owned()
  async addGalleryItem(
    @CurrentProject() project: KitchenProjectRecord,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MoodboardItemViewDto> {
    const { item, created } = await this.edits.addGalleryItem(project, body);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return item;
  }

  @Post(':projectId/moodboard/uploads')
  @UseInterceptors(PhotoUploadInterceptor)
  @ApiOperation({
    summary: 'Upload an own reference photo to the Moodboard of an owned project (same rules as kitchen photos; counts toward the 12 items)',
    description: 'Refused while a Simulation or a Budget of the project is queued or running.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['photo'], properties: { photo: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ type: MoodboardItemViewDto })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`moodboard_limit_reached`, `simulation_in_progress` or `budget_in_progress`' })
  @ApiPayloadTooLargeResponse({ type: KitchenDraftErrorDto, description: '`photo_too_large`' })
  @ApiUnsupportedMediaTypeResponse({ type: KitchenDraftErrorDto, description: '`photo_unsupported_type` (also for files that do not decode)' })
  @ApiUnprocessableEntityResponse({ type: KitchenDraftErrorDto, description: '`photo_too_small`' })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable`, or database unreachable' })
  // Applied first, so the storage-specific 503 description above wins in the OpenAPI document.
  @Owned()
  addMoodboardUpload(@CurrentProject() project: KitchenProjectRecord, @Req() request: Request): Promise<MoodboardItemViewDto> {
    // PhotoUploadInterceptor guarantees the file.
    return this.edits.addUpload(project, (request.file as Express.Multer.File).buffer);
  }

  @Delete(':projectId/moodboard/items/:itemId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a Moodboard Item of an owned project (an upload loses both objects); later items move up one position' })
  @ApiParam({ name: 'itemId', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`simulation_in_progress` or `budget_in_progress`' })
  @ApiServiceUnavailableResponse({ type: KitchenDraftErrorDto, description: '`storage_unavailable` (nothing was deleted), or database unreachable' })
  @Owned()
  async removeMoodboardItem(@CurrentProject() project: KitchenProjectRecord, @Param('itemId', new ParseUUIDPipe()) itemId: string): Promise<void> {
    await this.edits.removeItem(project, itemId);
  }

  @Post(':projectId/simulations')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Generate a Simulation: one Render per Photo from one calculated style (costly; queued on the GPU)',
    description:
      'Blends every Moodboard reference with weights (equal for the first Simulation of a project, new seeded random weights after that) into one style, creates one queued Render per Photo (up to 8) and runs them one after the other on the GPU. Answers 202 with the Simulation; poll `GET .../simulations/{simulationId}` for `stage` (`describing`, `rendering`, `finished`) and `progress` ("n of N"). One active Simulation per project; there is no other limit.',
  })
  @ApiAcceptedResponse({ type: CreateSimulationResponseDto })
  @ApiConflictResponse({
    type: KitchenProjectErrorDto,
    description: '`project_incomplete` (needs a photo, all three measurements and a Moodboard Item) or `simulation_in_progress`',
  })
  @ApiTooManyRequestsResponse({ type: KitchenProjectErrorDto, description: '`gpu_queue_full`: no Simulation was created' })
  @ApiServiceUnavailableResponse({ type: KitchenProjectErrorDto, description: '`storage_unavailable`, or database unreachable' })
  // Applied first, so the simulation-specific 503 description above wins in the OpenAPI document.
  @Owned()
  createSimulation(@CurrentProject() project: KitchenProjectRecord, @CurrentUser() user: AuthenticatedUser): Promise<CreateSimulationResponseDto> {
    return this.simulations.create(project, user.sub);
  }

  @Get(':projectId/simulations')
  @Owned()
  @ApiOperation({ summary: 'The Simulations of an owned project with their Renders, newest first' })
  @ApiOkResponse({ type: SimulationListResponseDto })
  listSimulations(@CurrentProject() project: KitchenProjectRecord): Promise<SimulationListResponseDto> {
    return this.simulations.list(project);
  }

  @Get(':projectId/simulations/:simulationId')
  @Owned()
  @ApiOperation({ summary: 'One Simulation of an owned project (stage, progress, style summary, Renders, Budget)' })
  @ApiParam({ name: 'simulationId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: SimulationViewDto })
  getSimulation(@CurrentProject() project: KitchenProjectRecord, @Param('simulationId', new ParseUUIDPipe()) simulationId: string): Promise<SimulationViewDto> {
    return this.simulations.get(project, simulationId);
  }

  @Delete(':projectId/simulations/:simulationId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a Simulation with its Renders, their stored images and its Budget',
    description: 'Objects are removed first (a storage failure keeps every row), then the rows. Clears the selection when it was selected.',
  })
  @ApiParam({ name: 'simulationId', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`simulation_in_progress`: it is still queued or running' })
  @ApiServiceUnavailableResponse({ type: KitchenProjectErrorDto, description: '`storage_unavailable` (nothing was deleted), or database unreachable' })
  @Owned()
  async deleteSimulation(@CurrentProject() project: KitchenProjectRecord, @Param('simulationId', new ParseUUIDPipe()) simulationId: string): Promise<void> {
    await this.simulations.delete(project, simulationId);
  }

  @Put(':projectId/selected-simulation')
  @ApiOperation({
    summary: 'Select the Simulation a Budget is computed for (or clear the selection with null)',
    description: 'Only a finished Simulation with every Render succeeded can be selected. At most one is selected per project.',
  })
  @ApiBody({ type: SelectSimulationRequestDto })
  @ApiOkResponse({ type: SelectSimulationResponseDto })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`simulation_not_ready`: not finished, or a Render failed' })
  @Owned()
  selectSimulation(@CurrentProject() project: KitchenProjectRecord, @Body() body: unknown): Promise<SelectSimulationResponseDto> {
    return this.simulations.select(project, body);
  }

  @Post(':projectId/renders/:renderId/retry')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Retry one failed Render (same row, prompt, style and seed; attempts + 1)',
    description: 'Answers 202 with the Simulation, which is `rendering` again. Counts as one Render for quotas.',
  })
  @ApiParam({ name: 'renderId', schema: { type: 'string', format: 'uuid' } })
  @ApiAcceptedResponse({ type: CreateSimulationResponseDto })
  @ApiConflictResponse({ type: KitchenProjectErrorDto, description: '`render_not_failed` or `simulation_in_progress`' })
  @ApiTooManyRequestsResponse({ type: KitchenProjectErrorDto, description: '`gpu_queue_full`' })
  @ApiServiceUnavailableResponse({ type: KitchenProjectErrorDto, description: 'Database unreachable' })
  @Owned()
  retryRender(
    @CurrentProject() project: KitchenProjectRecord,
    @Param('renderId', new ParseUUIDPipe()) renderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreateSimulationResponseDto> {
    return this.simulations.retry(project, renderId, user.sub);
  }

  @Get(':projectId/renders/:renderId')
  @Owned()
  @ApiOperation({ summary: 'One Render of an owned project (status, queue position, content URLs)' })
  @ApiParam({ name: 'renderId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: RenderViewDto })
  getRender(@CurrentProject() project: KitchenProjectRecord, @Param('renderId', new ParseUUIDPipe()) renderId: string): Promise<RenderViewDto> {
    return this.renders.get(project, renderId);
  }

  @Get(':projectId/renders/:renderId/content')
  @Owned()
  @Content(RENDER_VARIANTS)
  @ApiParam({ name: 'renderId', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({ summary: 'A Render image (metadata-free JPEG): `before` always, `full`/`thumb` once succeeded (404 before)' })
  async renderContent(
    @CurrentProject() project: KitchenProjectRecord,
    @Param('renderId', new ParseUUIDPipe()) renderId: string,
    @Query('variant') variant: unknown,
  ): Promise<StreamableFile> {
    if (typeof variant !== 'string' || !(RENDER_VARIANTS as readonly string[]).includes(variant)) throw new BadRequestException();
    return new StreamableFile(await this.renders.content(project, renderId, variant as RenderVariant), { type: 'image/jpeg' });
  }

  @Post(':projectId/budget')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Compute the Budget of the kitchen (costly; queued on the GPU)',
    description:
      'Retrieves Catalog chunks, asks the LLM for four tiers (Luxury, High, Medium, Low) whose Line Items cite a Catalog chunk, verifies every quoted price against that chunk and computes all amounts in code (integer cents). Computes for the selected Simulation. Answers 202 with the `queued` Budget; poll `GET .../budgets/{budgetId}`. One active Budget per project and one current Budget per Simulation: a recompute keeps the old Budget until the new one succeeds, then replaces it.',
  })
  @ApiAcceptedResponse({ type: CreateBudgetResponseDto })
  @ApiConflictResponse({
    type: KitchenProjectErrorDto,
    description: '`project_incomplete` (needs a photo, all three measurements and a Moodboard Item), `no_simulation_selected`, `simulation_not_ready`, `catalog_empty`, or `budget_in_progress`',
  })
  @ApiTooManyRequestsResponse({ type: KitchenProjectErrorDto, description: '`gpu_queue_full`: no Budget was created' })
  @ApiServiceUnavailableResponse({ type: KitchenProjectErrorDto, description: '`embedding_unavailable` (the Catalog search is down), or database unreachable' })
  // Applied first, so the budget-specific 503 description above wins in the OpenAPI document.
  @Owned()
  requestBudget(@CurrentProject() project: KitchenProjectRecord, @CurrentUser() user: AuthenticatedUser): Promise<CreateBudgetResponseDto> {
    return this.budgets.create(project, user.sub);
  }

  @Get(':projectId/budgets')
  @Owned()
  @ApiOperation({ summary: 'The Budgets of the selected Simulation (current plus an active or failed recompute), newest first; empty without a selection' })
  @ApiOkResponse({ type: BudgetListResponseDto })
  listBudgets(@CurrentProject() project: KitchenProjectRecord): Promise<BudgetListResponseDto> {
    return this.budgets.list(project);
  }

  @Get(':projectId/budgets/:budgetId')
  @Owned()
  @ApiOperation({ summary: 'One Budget of an owned project (status, queue position, tiers with verified Line Items)' })
  @ApiParam({ name: 'budgetId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: BudgetViewDto })
  getBudget(@CurrentProject() project: KitchenProjectRecord, @Param('budgetId', new ParseUUIDPipe()) budgetId: string): Promise<BudgetViewDto> {
    return this.budgets.get(project, budgetId);
  }
}
