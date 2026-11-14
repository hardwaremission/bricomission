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
import { ProjectEditsService } from './project-edits.service.js';
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
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { PrismaReferenceTraitRepository, REFERENCE_TRAIT_REPOSITORY } from './simulations/reference-traits.repository.js';
import { SimulationRecoveryService } from './simulations/simulation-recovery.service.js';
import { SimulationRunner } from './simulations/simulation-runner.js';
import { readSimulationConfig, SIMULATION_CONFIG } from './simulations/simulation.config.js';
import { PrismaSimulationRepository, SIMULATION_REPOSITORY } from './simulations/simulations.repository.js';
import { SimulationsService } from './simulations/simulations.service.js';
import { RendersService } from './renders/renders.service.js';

/**
 * Anonymous kitchen capture drafts (kitchen-capture-draft), their Moodboard (moodboard-selection)
 * claimed, owned Kitchen Projects (login-gate-claim) their Simulations of Renders (controlnet-render, simulations-ux-overhaul) and Budgets (budget-tier-computation).
 * Needs StorageModule and the global AiModule (GPU job broker, image adapter). Exports
 * OwnedProjectGuard and KitchenProjectsService for the costly features.
 */
@Module({
  imports: [StyleGalleryModule, CatalogModule, PlatformSettingsModule],
  controllers: [KitchenDraftsController, MoodboardController, KitchenProjectsController],
  providers: [
    { provide: KITCHEN_DRAFT_CONFIG, useFactory: () => readKitchenDraftConfig() },
    { provide: KITCHEN_CLOCK, useValue: systemClock },
    { provide: KITCHEN_DRAFT_REPOSITORY, useClass: PrismaKitchenDraftRepository },
    KitchenDraftsService,
    MoodboardService,
    KitchenProjectsService,
    ProjectEditsService,
    DraftTokenGuard,
    OwnedProjectGuard,
    PhotoUploadInterceptor,
    DraftCleanupService,
    { provide: RENDER_CONFIG, useFactory: () => readRenderConfig() },
    { provide: RENDER_REPOSITORY, useClass: PrismaRenderRepository },
    RendersService,
    { provide: SIMULATION_CONFIG, useFactory: () => readSimulationConfig() },
    { provide: SIMULATION_REPOSITORY, useClass: PrismaSimulationRepository },
    { provide: REFERENCE_TRAIT_REPOSITORY, useClass: PrismaReferenceTraitRepository },
    SimulationRunner,
    SimulationsService,
    SimulationRecoveryService,
    { provide: BUDGET_CONFIG, useFactory: () => readBudgetConfig() },
    { provide: BUDGET_REPOSITORY, useClass: PrismaBudgetRepository },
    BudgetService,
    BudgetRecoveryService,
  ],
  exports: [KITCHEN_DRAFT_REPOSITORY, OwnedProjectGuard, KitchenProjectsService],
})
export class KitchenProjectsModule {}
