import { ApiProperty } from '@nestjs/swagger';
import type { StyleGalleryImageView, StyleGalleryStyleView, StyleGalleryView } from '@bricomission/shared-types';

export class StyleGalleryImageViewDto implements StyleGalleryImageView {
  @ApiProperty({ pattern: '^[a-z0-9-]{1,64}$', example: 'scandinavian-01', description: 'Stable id, never reused' })
  id!: string;

  @ApiProperty({ type: 'integer', description: 'Width of the full image' })
  width!: number;

  @ApiProperty({ type: 'integer', description: 'Height of the full image' })
  height!: number;

  @ApiProperty({ example: '/style-gallery/images/scandinavian-01/content?variant=thumb', description: 'API-relative path' })
  thumbUrl!: string;

  @ApiProperty({ example: '/style-gallery/images/scandinavian-01/content?variant=full', description: 'API-relative path' })
  fullUrl!: string;
}

export class StyleGalleryStyleViewDto implements StyleGalleryStyleView {
  @ApiProperty({ pattern: '^[a-z0-9-]{1,64}$', example: 'scandinavian' })
  id!: string;

  @ApiProperty({ type: [StyleGalleryImageViewDto] })
  images!: StyleGalleryImageViewDto[];
}

export class StyleGalleryViewDto implements StyleGalleryView {
  @ApiProperty({ type: [StyleGalleryStyleViewDto], description: 'In manifest order' })
  styles!: StyleGalleryStyleViewDto[];
}
