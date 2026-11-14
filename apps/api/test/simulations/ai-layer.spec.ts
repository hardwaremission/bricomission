import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRenderWorkflow, COMBINE_GROUP_SIZE } from '../../src/ai/adapters/comfyui-workflow.js';
import { FakeImageAdapter, referenceTint } from '../../src/ai/adapters/fake-image.adapter.js';
import { DEFAULT_RENDER_CONTROL } from '../../src/ai/adapters/image-adapter.js';
import { EnvAiEndpointsProvider } from '../../src/ai/ai-endpoints.provider.js';
import { GpuResidencyHook } from '../../src/ai/jobs/gpu-residency.hook.js';
import { LlamaRouterUnloader } from '../../src/ai/jobs/llm-unloader.js';
import { makeImage } from '../support/images.js';
import { imageRequest } from '../gpu-test-helpers.js';

type Node = { class_type: string; inputs: Record<string, unknown> };
const build = (references?: Array<{ inputImage: string; weight: number }>): Record<string, Node> =>
  buildRenderWorkflow({ mode: 'canny', inputImage: 'photo.jpg', width: 1216, height: 832, prompt: 'p', negativePrompt: 'n', seed: 3, control: DEFAULT_RENDER_CONTROL, references });
const refs = (n: number) => Array.from({ length: n }, (_, i) => ({ inputImage: `ref-${i}.jpg`, weight: 0.5 + i / 100 }));
const count = (wf: Record<string, Node>, type: string) => Object.values(wf).filter((node) => node.class_type === type).length;

describe('ComfyUI workflow with IP-Adapter references (Decision 4, spike A2)', () => {
  it('no references: no IP-Adapter node and the sampler reads the checkpoint model', () => {
    for (const wf of [build(), build([])]) {
      expect(Object.values(wf).some((node) => node.class_type.startsWith('IPAdapter') || node.class_type === 'CLIPVisionLoader')).toBe(false);
      expect((wf['10'] as Node).inputs.model).toEqual(['1', 0]);
    }
  });

  it('one reference: one encoder at its weight, IPAdapterEmbeds on the checkpoint model, no combine node', () => {
    const wf = build([{ inputImage: 'a.jpg', weight: 0.6 }]);
    expect(wf['20']).toEqual({ class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: 'ip-adapter-plus_sdxl_vit-h.safetensors' } });
    expect(wf['21']).toEqual({ class_type: 'CLIPVisionLoader', inputs: { clip_name: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors' } });
    expect(wf['300']).toEqual({ class_type: 'LoadImage', inputs: { image: 'a.jpg' } });
    expect(wf['400']).toEqual({ class_type: 'IPAdapterEncoder', inputs: { ipadapter: ['20', 0], image: ['300', 0], weight: 0.6, clip_vision: ['21', 0] } });
    expect(count(wf, 'IPAdapterCombineEmbeds')).toBe(0);
    expect(wf['60']).toEqual({
      class_type: 'IPAdapterEmbeds',
      inputs: { model: ['1', 0], ipadapter: ['20', 0], pos_embed: ['400', 0], weight: 1, weight_type: 'linear', start_at: 0, end_at: 1, embeds_scaling: 'V only', clip_vision: ['21', 0] },
    });
    expect((wf['10'] as Node).inputs.model).toEqual(['60', 0]);
    // ControlNet chain unchanged.
    expect((wf['10'] as Node).inputs).toMatchObject({ positive: ['15', 0], negative: ['15', 1] });
  });

  it('chains up to 12 references through groups of 5 that are combined again', () => {
    expect(COMBINE_GROUP_SIZE).toBe(5);
    for (const [n, combines] of [[2, 1], [5, 1], [6, 2], [12, 4]] as const) {
      const wf = build(refs(n));
      expect(count(wf, 'IPAdapterEncoder'), `${n} encoders`).toBe(n);
      expect(count(wf, 'IPAdapterCombineEmbeds'), `${n} combines`).toBe(combines);
      for (const node of Object.values(wf)) {
        if (node.class_type === 'IPAdapterCombineEmbeds') expect(Object.keys(node.inputs).filter((k) => k.startsWith('embed')).length).toBeLessThanOrEqual(5);
      }
      // Every encoder reaches the sampler through exactly the combine tree.
      const final = ((wf['60'] as Node).inputs.pos_embed as [string, number])[0];
      const reach = (id: string): string[] => {
        const node = wf[id] as Node;
        return node.class_type === 'IPAdapterEncoder' ? [id] : Object.entries(node.inputs).filter(([k]) => k.startsWith('embed')).flatMap(([, v]) => reach((v as [string, number])[0]));
      };
      expect(reach(final).sort()).toEqual(Array.from({ length: n }, (_, i) => `4${String(i).padStart(2, '0')}`));
    }
    const twelve = build(refs(12));
    expect((twelve['599'] as Node).inputs).toMatchObject({ method: 'concat', embed1: ['500', 0], embed2: ['501', 0], embed3: ['502', 0] });
    expect(((twelve['411'] as Node).inputs as { weight: number }).weight).toBeCloseTo(0.61, 5);
  });
});

describe('GPU residency hook (Decision 6, spike A3)', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  async function stub(status: number) {
    const seen: Array<{ method?: string; url?: string; body: string }> = [];
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, body });
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end('{"success":true}');
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    return { seen, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }

  it('beforeImage unloads the LLM through the router; beforeLlm, afterImage and afterLlm do nothing', async () => {
    const { seen, base } = await stub(200);
    const hook = new GpuResidencyHook(new LlamaRouterUnloader(new EnvAiEndpointsProvider({ LLM_BASE_URL: `${base}/` })));
    await hook.beforeLlm();
    await hook.afterLlm();
    await hook.afterImage();
    expect(seen).toEqual([]);
    await hook.beforeImage();
    expect(seen).toEqual([{ method: 'POST', url: '/models/unload', body: '{"model":"qwen3-vl"}' }]);
  });

  it('a model that is not loaded (400/404) is fine; an unload failure never fails the image job', async () => {
    for (const status of [400, 404]) {
      const { base } = await stub(status);
      await new LlamaRouterUnloader(new EnvAiEndpointsProvider({ LLM_BASE_URL: base })).unload();
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
    const { base } = await stub(500);
    await expect(new LlamaRouterUnloader(new EnvAiEndpointsProvider({ LLM_BASE_URL: base })).unload()).rejects.toThrow();
    const hook = new GpuResidencyHook(new LlamaRouterUnloader(new EnvAiEndpointsProvider({ LLM_BASE_URL: base })));
    await expect(hook.beforeImage()).resolves.toBeUndefined();
    const dead = new GpuResidencyHook({ unload: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    await expect(dead.beforeImage()).resolves.toBeUndefined();
    await expect(new GpuResidencyHook().beforeImage()).resolves.toBeUndefined();
  });
});

describe('fake image adapter tint by weighted reference mix', () => {
  it('no references keeps the blue tint; the same references repeat; other weights differ', async () => {
    const a = Buffer.from('reference-a');
    const b = Buffer.from('reference-b');
    expect(referenceTint(undefined)).toEqual({ r: 41, g: 104, b: 236 });
    expect(referenceTint([])).toEqual({ r: 41, g: 104, b: 236 });
    const even = referenceTint([{ image: a, weight: 0.5 }, { image: b, weight: 0.5 }]);
    expect(referenceTint([{ image: a, weight: 0.5 }, { image: b, weight: 0.5 }])).toEqual(even);
    expect(referenceTint([{ image: a, weight: 0.9 }, { image: b, weight: 0.1 }])).not.toEqual(even);
    const fake = new FakeImageAdapter();
    const photo = await makeImage(320, 240, 'jpeg');
    const out = await fake.render(imageRequest({ image: photo, width: 320, height: 240, references: [{ image: a, weight: 1 }] }), new AbortController().signal);
    expect(out.image.length).toBeGreaterThan(0);
  });
});
