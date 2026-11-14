import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import { SIMULATION_REPOSITORY, type SimulationRepository } from './simulations.repository.js';

/**
 * GPU jobs live in memory, so a Render that was queued or running when the API stopped can never
 * finish. On start (single API instance) every such Render becomes `failed` / `interrupted` and
 * every unfinished Simulation `finished` (so it shows as `partial` or `failed` with Retry).
 * Best effort: a database that is down at start only logs.
 */
@Injectable()
export class SimulationRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SimulationRecoveryService.name);

  constructor(
    @Inject(SIMULATION_REPOSITORY) private readonly repo: SimulationRepository,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recover();
  }

  async recover(): Promise<number> {
    try {
      const count = await this.repo.recoverInterrupted(this.clock());
      if (count > 0) this.logger.warn(`Marked ${count} interrupted Render(s) failed`);
      return count;
    } catch (error) {
      this.logger.warn(`Simulation recovery skipped (${error instanceof Error ? error.name : 'unknown'})`);
      return 0;
    }
  }
}
