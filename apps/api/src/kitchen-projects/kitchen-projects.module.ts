import { Module } from '@nestjs/common';
import { DraftCleanupService } from './draft-cleanup.service.js';
import { DraftTokenGuard } from './draft-token.guard.js';
import { KITCHEN_CLOCK, KITCHEN_DRAFT_CONFIG, readKitchenDraftConfig, systemClock } from './kitchen-projects.config.js';
import { KitchenDraftsController } from './kitchen-drafts.controller.js';
import { KITCHEN_DRAFT_REPOSITORY, PrismaKitchenDraftRepository } from './kitchen-drafts.repository.js';
import { KitchenDraftsService } from './kitchen-drafts.service.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';

/** Anonymous kitchen capture drafts (feature kitchen-capture-draft). Needs StorageModule. */
@Module({
  controllers: [KitchenDraftsController],
  providers: [
    { provide: KITCHEN_DRAFT_CONFIG, useFactory: () => readKitchenDraftConfig() },
    { provide: KITCHEN_CLOCK, useValue: systemClock },
    { provide: KITCHEN_DRAFT_REPOSITORY, useClass: PrismaKitchenDraftRepository },
    KitchenDraftsService,
    DraftTokenGuard,
    PhotoUploadInterceptor,
    DraftCleanupService,
  ],
})
export class KitchenProjectsModule {}
