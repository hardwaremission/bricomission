import type { Readable } from 'node:stream';
import { HttpException, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { ClaimKitchenDraftResponse, KitchenProjectView } from '@bricomission/shared-types';
import { DIAGNOSTICS, type Diagnostics } from '../diagnostics/diagnostics.types.js';
import { projectStep } from '../diagnostics/narrate/project.js';
import { NULL_DIAGNOSTICS } from '../diagnostics/null-diagnostics.js';
import { StyleGalleryService } from '../style-gallery/style-gallery.service.js';
import { hashDraftToken, isDraftTokenFormat } from './draft-token.js';
import { type Clock, KITCHEN_CLOCK } from './kitchen-projects.config.js';
import { KITCHEN_DRAFT_REPOSITORY, type KitchenDraftRepository, type KitchenProjectRecord } from './kitchen-drafts.repository.js';
import { KitchenDraftsService, type PhotoVariant, photoView } from './kitchen-drafts.service.js';
import { moodboardItemView } from './moodboard/moodboard.js';
import { MoodboardService } from './moodboard/moodboard.service.js';

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
 * at the Login Gate, the owner's read view and content, and content.
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
    @Optional() @Inject(DIAGNOSTICS) private readonly diagnostics: Diagnostics = NULL_DIAGNOSTICS,
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
    projectStep(this.diagnostics, 'claim draft', { photos: result.record.photos.length, moodboardItems: result.record.moodboard.length });
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
