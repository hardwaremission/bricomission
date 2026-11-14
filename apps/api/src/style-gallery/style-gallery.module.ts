import { Module } from '@nestjs/common';
import { StyleGalleryController } from './style-gallery.controller.js';
import { StyleGalleryService } from './style-gallery.service.js';

/** The curated offline Style Gallery (feature moodboard-selection). */
@Module({
  controllers: [StyleGalleryController],
  providers: [StyleGalleryService],
  exports: [StyleGalleryService],
})
export class StyleGalleryModule {}
