import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AiModule } from './ai/ai.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { HealthModule } from './health/health.module.js';
import { KitchenProjectsModule } from './kitchen-projects/kitchen-projects.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';
import { StyleGalleryModule } from './style-gallery/style-gallery.module.js';

@Module({
  imports: [PrismaModule, AuthModule, HealthModule, AdminModule, AiModule.register(), CatalogModule, StorageModule, StyleGalleryModule, KitchenProjectsModule],
})
export class AppModule {}
