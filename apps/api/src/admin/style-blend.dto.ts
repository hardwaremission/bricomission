import { ApiProperty } from '@nestjs/swagger';
import type { StyleBlendMode, StyleBlendSettingView } from '@bricomission/shared-types';

const MODES: StyleBlendMode[] = ['ip_adapter', 'vlm_text', 'both'];

/** Body and response of `GET/PUT /admin/settings/style-blend`. */
export class StyleBlendSettingDto implements StyleBlendSettingView {
  @ApiProperty({ enum: MODES, description: 'How the calculated style reaches the image model; read once per Simulation' })
  mode!: StyleBlendMode;
}
