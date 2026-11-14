import { Inject, Injectable, Logger } from '@nestjs/common';
import type { StyleBlendMode } from '@bricomission/shared-types';
import { PLATFORM_SETTING_REPOSITORY, type PlatformSettingRepository } from './platform-settings.repository.js';

export const STYLE_BLEND_KEY = 'style_blend_mode';
export const STYLE_BLEND_MODES: readonly StyleBlendMode[] = ['ip_adapter', 'vlm_text', 'both'];
/**
 * Used when the row is missing or invalid. `both` since the phase A spike proved IP-Adapter next to
 * the unloading residency rule (docs/spikes/simulations-gpu-spike.md); `vlm_text` needs no IP-Adapter
 * node and is the zero-extra-GPU choice an admin can set.
 */
export const DEFAULT_STYLE_BLEND_MODE: StyleBlendMode = 'both';

export function isStyleBlendMode(value: unknown): value is StyleBlendMode {
  return typeof value === 'string' && (STYLE_BLEND_MODES as readonly string[]).includes(value);
}

/** Typed access to the platform settings (feature simulations-ux-overhaul: the style blend mode). */
@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);

  constructor(@Inject(PLATFORM_SETTING_REPOSITORY) private readonly repo: PlatformSettingRepository) {}

  /** The stored blend mode; the default for a missing row, an invalid value or a database error. */
  async getStyleBlendMode(): Promise<StyleBlendMode> {
    try {
      const row = await this.repo.get(STYLE_BLEND_KEY);
      const value = (row?.value as { mode?: unknown } | string | null | undefined) ?? null;
      const mode = typeof value === 'object' && value !== null ? value.mode : value;
      return isStyleBlendMode(mode) ? mode : DEFAULT_STYLE_BLEND_MODE;
    } catch (error) {
      this.logger.warn(`Style blend setting unreadable, using the default (${error instanceof Error ? error.name : 'unknown'})`);
      return DEFAULT_STYLE_BLEND_MODE;
    }
  }

  async setStyleBlendMode(mode: StyleBlendMode, updatedBy: string | null, now: Date = new Date()): Promise<void> {
    await this.repo.set(STYLE_BLEND_KEY, { mode }, updatedBy, now);
  }
}
