import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import { RENDER_REPOSITORY, type RenderRepository } from './render.repository.js';

/**
 * GPU jobs live in memory, so a Render that was queued or running when the API stopped can never
 * finish. On start (single API instance) every such row becomes `failed` / `interrupted`.
 * Best effort: a database that is down at start only logs.
 */
@Injectable()
export class RenderRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RenderRecoveryService.name);

  constructor(
    @Inject(RENDER_REPOSITORY) private readonly repo: RenderRepository,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recover();
  }

  async recover(): Promise<number> {
    try {
      const count = await this.repo.failActive('interrupted', this.clock());
      if (count > 0) this.logger.warn(`Marked ${count} interrupted Render(s) failed`);
      return count;
    } catch (error) {
      this.logger.warn(`Render recovery skipped (${error instanceof Error ? error.name : 'unknown'})`);
      return 0;
    }
  }
}
