import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { StyleGalleryModule } from '../style-gallery/style-gallery.module.js';
import { DraftCleanupService } from './draft-cleanup.service.js';
import { DraftTokenGuard } from './draft-token.guard.js';
import { KITCHEN_CLOCK, KITCHEN_DRAFT_CONFIG, readKitchenDraftConfig, systemClock } from './kitchen-projects.config.js';
import { KitchenDraftsController } from './kitchen-drafts.controller.js';
import { KITCHEN_DRAFT_REPOSITORY, PrismaKitchenDraftRepository } from './kitchen-drafts.repository.js';
import { KitchenDraftsService } from './kitchen-drafts.service.js';
import { KitchenProjectsController } from './kitchen-projects.controller.js';
import { KitchenProjectsService } from './kitchen-projects.service.js';
import { MoodboardController } from './moodboard/moodboard.controller.js';
import { MoodboardService } from './moodboard/moodboard.service.js';
import { BUDGET_CONFIG, readBudgetConfig } from './budget/budget.config.js';
import { BUDGET_REPOSITORY, PrismaBudgetRepository } from './budget/budget.repository.js';
import { BudgetRecoveryService } from './budget/budget-recovery.service.js';
import { BudgetService } from './budget/budget.service.js';
import { OwnedProjectGuard } from './owned-project.guard.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';
import { RENDER_CONFIG, readRenderConfig } from './renders/render.config.js';
import { PrismaRenderRepository, RENDER_REPOSITORY } from './renders/render.repository.js';
import { RenderRecoveryService } from './renders/render-recovery.service.js';
import { RendersService } from './renders/renders.service.js';

/**
 * Anonymous kitchen capture drafts (kitchen-capture-draft), their Moodboard (moodboard-selection)
 * claimed, owned Kitchen Projects (login-gate-claim) and their Renders (controlnet-render) and Budgets (budget-tier-computation).
 * Needs StorageModule and the global AiModule (GPU job broker, image adapter). Exports
 * OwnedProjectGuard and KitchenProjectsService for the costly features.
 */
@Module({
  imports: [StyleGalleryModule, CatalogModule],
  controllers: [KitchenDraftsController, MoodboardController, KitchenProjectsController],
  providers: [
    { provide: KITCHEN_DRAFT_CONFIG, useFactory: () => readKitchenDraftConfig() },
    { provide: KITCHEN_CLOCK, useValue: systemClock },
    { provide: KITCHEN_DRAFT_REPOSITORY, useClass: PrismaKitchenDraftRepository },
    KitchenDraftsService,
    MoodboardService,
    KitchenProjectsService,
    DraftTokenGuard,
    OwnedProjectGuard,
    PhotoUploadInterceptor,
    DraftCleanupService,
    { provide: RENDER_CONFIG, useFactory: () => readRenderConfig() },
    { provide: RENDER_REPOSITORY, useClass: PrismaRenderRepository },
    RendersService,
    RenderRecoveryService,
    { provide: BUDGET_CONFIG, useFactory: () => readBudgetConfig() },
    { provide: BUDGET_REPOSITORY, useClass: PrismaBudgetRepository },
    BudgetService,
    BudgetRecoveryService,
  ],
  exports: [KITCHEN_DRAFT_REPOSITORY, OwnedProjectGuard, KitchenProjectsService],
})
export class KitchenProjectsModule {}
