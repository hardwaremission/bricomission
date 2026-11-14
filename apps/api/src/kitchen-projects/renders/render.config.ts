import type { RenderMode } from '@bricomission/shared-types';
import { DEFAULT_RENDER_CONTROL, type RenderControl } from '../../ai/adapters/image-adapter.js';

export { DEFAULT_RENDER_CONTROL };

/** Render settings from env (compose and `.env.example` hold the same defaults). */
export interface RenderConfig {
  /** ControlNet that keeps the geometry (`RENDER_CONTROL_MODE`, default canny: OQ-4). */
  mode: RenderMode;
  /** ControlNet tuning (`RENDER_CONTROL_*`, `RENDER_CANNY_*`, `RENDER_DEPTH_ASSIST_*`). */
  control: RenderControl;
}

export const RENDER_CONFIG = Symbol('RENDER_CONFIG');

export const DEFAULT_RENDER_CONFIG: RenderConfig = { mode: 'canny', control: DEFAULT_RENDER_CONTROL };

/** A number in [min, max] from env, else the fallback. */
function unit(raw: string | undefined, fallback: number, min = 0, max = 1): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function readRenderConfig(env: NodeJS.ProcessEnv = process.env): RenderConfig {
  const mode = env.RENDER_CONTROL_MODE?.trim();
  const d = DEFAULT_RENDER_CONTROL;
  const cannyLow = unit(env.RENDER_CANNY_LOW, d.cannyLow);
  const cannyHigh = unit(env.RENDER_CANNY_HIGH, d.cannyHigh);
  const assistStrength = unit(env.RENDER_DEPTH_ASSIST_STRENGTH, d.depthAssist?.strength ?? 0, 0, 2);
  return {
    mode: mode === 'depth' || mode === 'canny' ? mode : DEFAULT_RENDER_CONFIG.mode,
    control: {
      strength: unit(env.RENDER_CONTROL_STRENGTH, d.strength, 0, 2),
      endPercent: unit(env.RENDER_CONTROL_END, d.endPercent),
      // A low above the high threshold is a config error: keep both defaults.
      ...(cannyLow <= cannyHigh ? { cannyLow, cannyHigh } : { cannyLow: d.cannyLow, cannyHigh: d.cannyHigh }),
      depthAssist: assistStrength > 0 ? { strength: assistStrength, endPercent: unit(env.RENDER_DEPTH_ASSIST_END, d.depthAssist?.endPercent ?? 1) } : null,
    },
  };
}
