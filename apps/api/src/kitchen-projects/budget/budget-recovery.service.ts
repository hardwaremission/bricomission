import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import { BUDGET_REPOSITORY, type BudgetRepository } from './budget.repository.js';

/**
 * GPU jobs live in memory, so a Budget that was queued or running when the API stopped can never
 * finish. On start (single API instance) every such row becomes `failed` / `interrupted`.
 * Best effort: a database that is down at start only logs.
 */
@Injectable()
export class BudgetRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BudgetRecoveryService.name);

  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly repo: BudgetRepository,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recover();
  }

  async recover(): Promise<number> {
    try {
      const count = await this.repo.failActive('interrupted', this.clock());
      if (count > 0) this.logger.warn(`Marked ${count} interrupted Budget(s) failed`);
      return count;
    } catch (error) {
      this.logger.warn(`Budget recovery skipped (${error instanceof Error ? error.name : 'unknown'})`);
      return 0;
    }
  }
}
