import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_CONTROL, readRenderConfig } from '../../src/kitchen-projects/renders/render.config.js';

describe('readRenderConfig (controlnet-render tuning)', () => {
  it('defaults: canny, 10 per project, canny 0.6/0.95 at 0.8 until 0.5, depth assist 0.7 until 1', () => {
    expect(readRenderConfig({})).toEqual({
      mode: 'canny',
      maxPerProject: 10,
      control: { strength: 0.8, endPercent: 0.5, cannyLow: 0.6, cannyHigh: 0.95, depthAssist: { strength: 0.7, endPercent: 1 } },
    });
    expect(readRenderConfig({}).control).toEqual(DEFAULT_RENDER_CONTROL);
  });

  it('reads every env override', () => {
    const config = readRenderConfig({
      RENDER_CONTROL_MODE: 'depth',
      RENDER_MAX_PER_PROJECT: '3',
      RENDER_CONTROL_STRENGTH: '0.9',
      RENDER_CONTROL_END: '0.75',
      RENDER_CANNY_LOW: '0.4',
      RENDER_CANNY_HIGH: '0.8',
      RENDER_DEPTH_ASSIST_STRENGTH: '0.5',
      RENDER_DEPTH_ASSIST_END: '0.9',
    });
    expect(config).toEqual({ mode: 'depth', maxPerProject: 3, control: { strength: 0.9, endPercent: 0.75, cannyLow: 0.4, cannyHigh: 0.8, depthAssist: { strength: 0.5, endPercent: 0.9 } } });
  });

  it('depth assist strength 0 turns it off; invalid values fall back to the defaults', () => {
    expect(readRenderConfig({ RENDER_DEPTH_ASSIST_STRENGTH: '0' }).control.depthAssist).toBeNull();
    const bad = readRenderConfig({ RENDER_CONTROL_MODE: 'edges', RENDER_CONTROL_END: '1.5', RENDER_CONTROL_STRENGTH: 'x', RENDER_CANNY_LOW: '0.9', RENDER_CANNY_HIGH: '0.5', RENDER_MAX_PER_PROJECT: '0' });
    expect(bad).toEqual({ mode: 'canny', maxPerProject: 10, control: DEFAULT_RENDER_CONTROL });
  });
});
