import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, HealthModule, AiModule.register()],
})
export class AppModule {}
