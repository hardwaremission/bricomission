import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { KitchenPhotoView, KitchenProjectView, MoodboardItemView } from '@bricomission/shared-types';
import { StyleGalleryService } from '../style-gallery/style-gallery.service.js';
import { BUDGET_REPOSITORY, type BudgetRepository } from './budget/budget.repository.js';
import { draftError } from './kitchen-draft.errors.js';
import { KitchenDraftsService } from './kitchen-drafts.service.js';
import type { KitchenProjectRecord } from './kitchen-drafts.repository.js';
import { projectView } from './kitchen-projects.service.js';
import { MoodboardService } from './moodboard/moodboard.service.js';
import { SIMULATION_REPOSITORY, type SimulationRepository } from './simulations/simulations.repository.js';

/**
 * Owner edits of a claimed Kitchen Project (feature simulations-ux-overhaul, Decision 14): photos,
 * measurements and Moodboard Items. They reuse the draft services (same validation, image pipeline,
 * keys, limits and error codes) in `owner` mode and are refused with 409 while a Simulation
 * (`simulation_in_progress`) or a Budget (`budget_in_progress`) of the project is queued or running.
 * Readiness is not enforced here, as in the draft flow: an emptied project is only refused by the
 * costly routes (409 `project_incomplete`). Editing never touches existing Simulations.
 */
@Injectable()
export class ProjectEditsService {
  private readonly logger = new Logger(ProjectEditsService.name);

  constructor(
    @Inject(SIMULATION_REPOSITORY) private readonly simulations: SimulationRepository,
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    private readonly drafts: KitchenDraftsService,
    private readonly moodboard: MoodboardService,
    private readonly gallery: StyleGalleryService,
  ) {}

  async updateMeasurements(project: KitchenProjectRecord, body: unknown): Promise<KitchenProjectView> {
    await this.assertIdle(project.id);
    return projectView(await this.drafts.updateProjectMeasurements(project, body), this.gallery);
  }

  async addPhoto(project: KitchenProjectRecord, file: Buffer): Promise<KitchenPhotoView> {
    await this.assertIdle(project.id);
    return this.drafts.addPhoto(project, file, 'owner');
  }

  async deletePhoto(project: KitchenProjectRecord, photoId: string): Promise<void> {
    await this.assertIdle(project.id);
    await this.drafts.deletePhoto(project, photoId, 'owner');
  }

  async addGalleryItem(project: KitchenProjectRecord, body: unknown): Promise<{ item: MoodboardItemView; created: boolean }> {
    await this.assertIdle(project.id);
    return this.moodboard.addGalleryItem(project, body, 'owner');
  }

  async addUpload(project: KitchenProjectRecord, file: Buffer): Promise<MoodboardItemView> {
    await this.assertIdle(project.id);
    return this.moodboard.addUpload(project, file, 'owner');
  }

  async removeItem(project: KitchenProjectRecord, itemId: string): Promise<void> {
    await this.assertIdle(project.id);
    await this.moodboard.remove(project, itemId, 'owner');
  }

  /**
   * 409 while a Simulation or a Budget of the project is active. The check precedes any decoding or
   * storage work. A Simulation started right after the check keeps the `before` crops it stored.
   */
  private async assertIdle(projectId: string): Promise<void> {
    try {
      if (await this.simulations.hasActive(projectId)) throw draftError(HttpStatus.CONFLICT, 'simulation_in_progress');
      if (await this.budgets.hasActive(projectId)) throw draftError(HttpStatus.CONFLICT, 'budget_in_progress');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Active work lookup failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
  }
}
