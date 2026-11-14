import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [PlatformSettingsModule],
  controllers: [AdminController],
})
export class AdminModule {}
