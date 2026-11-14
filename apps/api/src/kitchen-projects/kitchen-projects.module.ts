import { Module } from '@nestjs/common';
import { StyleGalleryModule } from '../style-gallery/style-gallery.module.js';
import { DraftCleanupService } from './draft-cleanup.service.js';
import { DraftTokenGuard } from './draft-token.guard.js';
import { KITCHEN_CLOCK, KITCHEN_DRAFT_CONFIG, readKitchenDraftConfig, systemClock } from './kitchen-projects.config.js';
import { KitchenDraftsController } from './kitchen-drafts.controller.js';
import { KITCHEN_DRAFT_REPOSITORY, PrismaKitchenDraftRepository } from './kitchen-drafts.repository.js';
import { KitchenDraftsService } from './kitchen-drafts.service.js';
import { MoodboardController } from './moodboard/moodboard.controller.js';
import { MoodboardService } from './moodboard/moodboard.service.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';

/** Anonymous kitchen capture drafts (kitchen-capture-draft) and their Moodboard (moodboard-selection). Needs StorageModule. */
@Module({
  imports: [StyleGalleryModule],
  controllers: [KitchenDraftsController, MoodboardController],
  providers: [
    { provide: KITCHEN_DRAFT_CONFIG, useFactory: () => readKitchenDraftConfig() },
    { provide: KITCHEN_CLOCK, useValue: systemClock },
    { provide: KITCHEN_DRAFT_REPOSITORY, useClass: PrismaKitchenDraftRepository },
    KitchenDraftsService,
    MoodboardService,
    DraftTokenGuard,
    PhotoUploadInterceptor,
    DraftCleanupService,
  ],
})
export class KitchenProjectsModule {}
