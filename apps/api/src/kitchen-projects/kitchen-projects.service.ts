import type { Readable } from 'node:stream';
import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ClaimKitchenDraftResponse, KitchenProjectView } from '@bricomission/shared-types';
import { StyleGalleryService } from '../style-gallery/style-gallery.service.js';
import { hashDraftToken, isDraftTokenFormat } from './draft-token.js';
import { draftError } from './kitchen-draft.errors.js';
import { type Clock, KITCHEN_CLOCK } from './kitchen-projects.config.js';
import { KITCHEN_DRAFT_REPOSITORY, type KitchenDraftRepository, type KitchenProjectRecord } from './kitchen-drafts.repository.js';
import { KitchenDraftsService, type PhotoVariant, photoView } from './kitchen-drafts.service.js';
import { moodboardItemView } from './moodboard/moodboard.js';
import { MoodboardService } from './moodboard/moodboard.service.js';
import { isReadyForGeneration } from './readiness.js';

/** Costly actions still behind a placeholder (Renders are real since controlnet-render). */
export type CostlyAction = 'budget';

export function projectView(project: KitchenProjectRecord, gallery: StyleGalleryService): KitchenProjectView {
  const base = `/kitchen-projects/${project.id}`;
  return {
    id: project.id,
    status: 'claimed',
    measurements: { ...project.measurements },
    photos: project.photos.map((photo) => photoView(photo, `${base}/photos`)),
    moodboard: project.moodboard.map((item) => moodboardItemView(item, gallery, `${base}/moodboard/items`)),
    claimedAt: project.claimedAt.toISOString(),
  };
}

/**
 * Claimed Kitchen Projects (feature login-gate-claim): the claim of the browser's anonymous draft
 * at the Login Gate, the owner's read view and content, and the Budget placeholder.
 * Database failures give 503; logs carry error class names only.
 */
@Injectable()
export class KitchenProjectsService {
  private readonly logger = new Logger(KitchenProjectsService.name);

  constructor(
    @Inject(KITCHEN_DRAFT_REPOSITORY) private readonly repo: KitchenDraftRepository,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    private readonly gallery: StyleGalleryService,
    private readonly drafts: KitchenDraftsService,
    private readonly moodboard: MoodboardService,
  ) {}

  /**
   * Claims the draft of `draftToken` for `ownerSub`. Missing, malformed, unknown and expired
   * tokens, and a project claimed by another Account, all give the same generic 404. A repeated
   * claim by the same Account returns the same body (`claimedAt` unchanged).
   */
  async claim(draftToken: unknown, ownerSub: string): Promise<ClaimKitchenDraftResponse> {
    if (!isDraftTokenFormat(draftToken)) throw new NotFoundException();
    const result = await this.db(() => this.repo.claimByTokenHash(hashDraftToken(draftToken), ownerSub, this.clock()));
    if (result === 'not_found') throw new NotFoundException();
    return { project: this.view(result.record) };
  }

  view(project: KitchenProjectRecord): KitchenProjectView {
    return projectView(project, this.gallery);
  }

  photoContent(project: KitchenProjectRecord, photoId: string, variant: PhotoVariant): Promise<Readable> {
    return this.drafts.photoContent(project, photoId, variant);
  }

  moodboardContent(project: KitchenProjectRecord, itemId: string, variant: PhotoVariant): Promise<Readable> {
    return this.moodboard.content(project, itemId, variant);
  }

  /**
   * Placeholder of a costly action: 409 `project_incomplete` when the project is not ready for
   * generation, else 501 `not_available_yet`. It never calls the GPU job broker or an adapter;
   * budget-tier-computation replaces the 501 and keeps the 409 rule (controlnet-render did so
   * for Renders: see RendersService).
   */
  requestCostlyAction(project: KitchenProjectRecord, action: CostlyAction): never {
    if (!isReadyForGeneration(project)) throw draftError(HttpStatus.CONFLICT, 'project_incomplete');
    this.logger.debug(`Costly action ${action} not available yet`);
    throw draftError(HttpStatus.NOT_IMPLEMENTED, 'not_available_yet');
  }

  private async db<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Project database call failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
  }
}
