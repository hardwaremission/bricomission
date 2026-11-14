import { describe, expect, it } from 'vitest';
import { buildRenderPrompt, RENDER_NEGATIVE_PROMPT, type RenderPromptItem, styleText } from '../../src/kitchen-projects/renders/render-prompt.js';
import { StyleGalleryService } from '../../src/style-gallery/style-gallery.service.js';

const PREFIX = 'photorealistic renovated kitchen, (clean empty countertops:1.3), (nothing on the counters:1.2), every cabinet stays a cabinet in the same position, same walls, doors and windows, ';
const SUFFIX = ', interior design photography, natural daylight, sharp focus';
const gallery = {
  find: (id: string) => ({ 'a-1': { styleId: 'a' }, 'a-2': { styleId: 'a' }, 'b-1': { styleId: 'b' }, 'b-2': { styleId: 'b' }, 'modern-01': { styleId: 'modern' } })[id] ?? null,
  promptFor: (id: string) => `${id} kitchen, oak, interior design photography, wide angle shot, photorealistic`,
};
const g = (position: number, galleryImageId: string): RenderPromptItem => ({ position, source: 'gallery', galleryImageId });
const u = (position: number): RenderPromptItem => ({ position, source: 'upload', galleryImageId: null });

describe('buildRenderPrompt (controlnet-render OQ-2/OQ-3)', () => {
  it('uses the dominant gallery style and its first Moodboard item, suffix stripped', () => {
    const prompt = buildRenderPrompt([g(0, 'a-1'), g(1, 'b-2'), g(2, 'b-1'), u(3)], gallery);
    expect(prompt).toEqual({ styleId: 'b', positive: `${PREFIX}b-2 kitchen, oak${SUFFIX}`, text: 'b-2 kitchen, oak', negative: RENDER_NEGATIVE_PROMPT });
  });

  it('breaks a tie by the lowest position (order of the input does not matter)', () => {
    expect(buildRenderPrompt([g(3, 'a-1'), g(0, 'b-1'), g(1, 'a-2'), g(2, 'b-2')], gallery).styleId).toBe('b');
    expect(buildRenderPrompt([g(1, 'b-1'), g(0, 'a-2')], gallery)).toMatchObject({ styleId: 'a', positive: expect.stringContaining('a-2 kitchen') });
  });

  it('uploads never change the prompt; an uploads-only Moodboard uses modern-01 and styleId null', () => {
    expect(buildRenderPrompt([u(0), g(1, 'a-1'), u(2), u(3)], gallery).styleId).toBe('a');
    expect(buildRenderPrompt([u(0), u(1)], gallery)).toEqual({ styleId: null, positive: `${PREFIX}modern-01 kitchen, oak${SUFFIX}`, text: 'modern-01 kitchen, oak', negative: RENDER_NEGATIVE_PROMPT });
  });

  it('the negative prompt targets clutter and structural hallucinations within one CLIP chunk', () => {
    for (const term of ['kettle', 'dish rack', 'dish drainer', 'plastic tub', 'bottles', 'utensils', 'dishes', 'small appliances', 'clutter', 'doorway', 'glass door', 'extra door', 'archway', 'wall opening', 'new window', 'removed wall', 'structural change']) {
      expect(RENDER_NEGATIVE_PROMPT).toContain(term);
    }
    // Word/punctuation count is an upper bound of CLIP tokens for these plain words (72 measured
    // with the SD tokenizer in the ComfyUI image); keep it within one 75-token chunk.
    const words = (s: string) => s.replace(/:\d\.\d/g, '').split(/[\s,()]+/).filter(Boolean).length;
    expect(words(RENDER_NEGATIVE_PROMPT)).toBeLessThanOrEqual(60);
    // The constraints open the positive prompt, so they always sit in the first chunk.
    expect(words(PREFIX)).toBeLessThanOrEqual(30);
  });

  it('styleText cuts at the shared suffix only', () => {
    expect(styleText('x, y, interior design photography, z')).toBe('x, y');
    expect(styleText('plain text')).toBe('plain text');
  });

  it('works with the committed Style Gallery manifest (prompts stay internal)', () => {
    const real = new StyleGalleryService();
    const prompt = buildRenderPrompt([g(0, 'japandi-02'), g(1, 'modern-01'), g(2, 'japandi-01')], real);
    expect(prompt.styleId).toBe('japandi');
    expect(prompt.positive.startsWith(`${PREFIX}japandi kitchen`)).toBe(true);
    expect(prompt.positive.endsWith(SUFFIX)).toBe(true);
    expect(prompt.positive).not.toMatch(/wide angle shot|no people/);
    // The public gallery view never exposes the prompt.
    expect(JSON.stringify(real.view())).not.toMatch(/prompt|interior design photography/);
  });
});
