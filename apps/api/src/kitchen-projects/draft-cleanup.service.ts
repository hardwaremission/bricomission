import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DIAGNOSTICS, type Diagnostics } from '../diagnostics/diagnostics.types.js';
import { projectStep } from '../diagnostics/narrate/project.js';
import { NULL_DIAGNOSTICS } from '../diagnostics/null-diagnostics.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { type Clock, KITCHEN_CLOCK, KITCHEN_DRAFT_CONFIG, type KitchenDraftConfig } from './kitchen-projects.config.js';
import { KITCHEN_DRAFT_REPOSITORY, type KitchenDraftRepository } from './kitchen-drafts.repository.js';

export const CLEANUP_BATCH_SIZE = 50;
/** Upper bound of batches per run, so one run never loops forever. */
const MAX_BATCHES_PER_RUN = 200;

/**
 * Deletes expired anonymous drafts: on API start and then every DRAFT_CLEANUP_INTERVAL_MS
 * (unref'd timer). Per batch of 50: storage objects first, then the rows (photos cascade).
 * If storage fails, the rows stay and the next run retries. Logs carry counts and error
 * class names only.
 */
@Injectable()
export class DraftCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DraftCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    @Inject(KITCHEN_DRAFT_REPOSITORY) private readonly repo: KitchenDraftRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(KITCHEN_DRAFT_CONFIG) private readonly config: KitchenDraftConfig,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    @Optional() @Inject(DIAGNOSTICS) private readonly diagnostics: Diagnostics = NULL_DIAGNOSTICS,
  ) {}

  onApplicationBootstrap(): void {
    // Not awaited: the API must boot even with the database or MinIO down.
    void this.runOnce();
    if (this.config.cleanupIntervalMs > 0) {
      this.timer = setInterval(() => void this.runOnce(), this.config.cleanupIntervalMs);
      this.timer.unref();
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One sweep; concurrent calls share the running sweep. Resolves to the number deleted. */
  runOnce(): Promise<number> {
    this.running ??= this.sweep().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async sweep(): Promise<number> {
    let deleted = 0;
    try {
      for (let batchNo = 0; batchNo < MAX_BATCHES_PER_RUN; batchNo++) {
        const batch = await this.repo.findExpired(this.clock(), CLEANUP_BATCH_SIZE);
        if (batch.length === 0) break;
        const keys = batch.flatMap((draft) => draft.keys);
        if (keys.length > 0) {
          try {
            await this.storage.deleteMany(keys);
          } catch (error) {
            this.logger.warn(`Draft cleanup paused: storage unavailable (${error instanceof Error ? error.name : 'unknown'})`);
            break;
          }
        }
        deleted += await this.repo.deleteDrafts(batch.map((draft) => draft.id));
        if (batch.length < CLEANUP_BATCH_SIZE) break;
      }
    } catch (error) {
      this.logger.warn(`Draft cleanup failed (${error instanceof Error ? error.name : 'unknown'})`);
    }
    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} expired kitchen draft(s)`);
      projectStep(this.diagnostics, `sweeper deleted ${deleted} expired draft${deleted === 1 ? '' : 's'}`, { deleted }, true);
    }
    return deleted;
  }
}
