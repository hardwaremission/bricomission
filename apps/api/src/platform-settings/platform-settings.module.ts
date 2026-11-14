import { Module } from '@nestjs/common';
import { PLATFORM_SETTING_REPOSITORY, PrismaPlatformSettingRepository } from './platform-settings.repository.js';
import { PlatformSettingsService } from './platform-settings.service.js';

@Module({
  providers: [{ provide: PLATFORM_SETTING_REPOSITORY, useClass: PrismaPlatformSettingRepository }, PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
