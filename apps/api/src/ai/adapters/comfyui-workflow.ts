import type { RenderControl } from './image-adapter.js';

/**
 * ComfyUI API-format workflow of a Render (feature controlnet-render). A TypeScript port of the
 * spike workflows `infra/comfyui/workflows/sdxl-controlnet-{canny,depth}.json`: RealVisXL V5.0,
 * 25 steps, dpmpp_2m karras, cfg 6, Depth Anything V2 Small at resolution 1024. The ControlNet
 * strength, end percent and canny thresholds come from {@link RenderControl} (tuned defaults:
 * canny 0.6/0.95 at 0.8 for the first half of the steps). A canny Render can stack a depth
 * ControlNet for the whole run (`depthAssist`, nodes 13-15). `SaveImage` is replaced by
 * `PreviewImage`, so results go to ComfyUI's temp dir and never to the `comfyui-output` volume;
 * the control hints are not saved.
 */
export interface RenderWorkflowParams {
  mode: 'canny' | 'depth';
  /** Name returned by ComfyUI `POST /upload/image`. */
  inputImage: string;
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
  seed: number;
  control: RenderControl;
  /** IP-Adapter style references (names returned by `POST /upload/image`) with their weights; none: no IP-Adapter nodes. */
  references?: Array<{ inputImage: string; weight: number }>;
}

export const RENDER_WORKFLOW = {
  checkpoint: 'RealVisXL_V5.0_fp16.safetensors',
  controlNets: { canny: 'sdxl-canny.safetensors', depth: 'sdxl-depth.safetensors' },
  depthCheckpoint: 'depth_anything_v2_vits.pth',
  steps: 25,
  cfg: 6,
  sampler: 'dpmpp_2m',
  scheduler: 'karras',
  depthResolution: 1024,
  ipAdapter: 'ip-adapter-plus_sdxl_vit-h.safetensors',
  clipVision: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
} as const;

/** `IPAdapterCombineEmbeds` has inputs `embed1..embed5` only (spike A2): more are chained in groups of this size. */
export const COMBINE_GROUP_SIZE = 5;

/** Id of the node whose output is the Render. */
export const RENDER_OUTPUT_NODE = '12';

type Node = { class_type: string; inputs: Record<string, unknown> };

export function buildRenderWorkflow(p: RenderWorkflowParams): Record<string, Node> {
  const w = RENDER_WORKFLOW;
  const c = p.control;
  const depthNode = (): Node => ({
    class_type: 'DepthAnythingV2Preprocessor',
    inputs: { image: ['5', 0], ckpt_name: w.depthCheckpoint, resolution: w.depthResolution },
  });
  const preprocessor: Node =
    p.mode === 'canny' ? { class_type: 'Canny', inputs: { image: ['5', 0], low_threshold: c.cannyLow, high_threshold: c.cannyHigh } } : depthNode();
  const assist = p.mode === 'canny' && c.depthAssist ? c.depthAssist : null;
  // The sampler reads the conditioning of the last ControlNet in the chain.
  const conditioning = assist ? '15' : '8';
  const workflow: Record<string, Node> = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: w.checkpoint } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: p.prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: p.negativePrompt, clip: ['1', 1] } },
    '4': { class_type: 'LoadImage', inputs: { image: p.inputImage } },
    // A no-op when the input already has the target size (the API sends the exact crop).
    '5': { class_type: 'ImageScale', inputs: { image: ['4', 0], upscale_method: 'lanczos', width: p.width, height: p.height, crop: 'center' } },
    '6': preprocessor,
    '7': { class_type: 'ControlNetLoader', inputs: { control_net_name: w.controlNets[p.mode] } },
    '8': {
      class_type: 'ControlNetApplyAdvanced',
      inputs: { positive: ['2', 0], negative: ['3', 0], control_net: ['7', 0], image: ['6', 0], strength: c.strength, start_percent: 0, end_percent: c.endPercent, vae: ['1', 2] },
    },
    '9': { class_type: 'EmptyLatentImage', inputs: { width: p.width, height: p.height, batch_size: 1 } },
    '10': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        seed: p.seed,
        steps: w.steps,
        cfg: w.cfg,
        sampler_name: w.sampler,
        scheduler: w.scheduler,
        positive: [conditioning, 0],
        negative: [conditioning, 1],
        latent_image: ['9', 0],
        denoise: 1,
      },
    },
    '11': { class_type: 'VAEDecode', inputs: { samples: ['10', 0], vae: ['1', 2] } },
    [RENDER_OUTPUT_NODE]: { class_type: 'PreviewImage', inputs: { images: ['11', 0] } },
  };
  if (p.references && p.references.length > 0) {
    addIpAdapter(workflow, p.references);
    (workflow['10'] as Node).inputs.model = ['60', 0];
  }
  if (assist) {
    workflow['13'] = depthNode();
    workflow['14'] = { class_type: 'ControlNetLoader', inputs: { control_net_name: w.controlNets.depth } };
    workflow['15'] = {
      class_type: 'ControlNetApplyAdvanced',
      inputs: { positive: ['8', 0], negative: ['8', 1], control_net: ['14', 0], image: ['13', 0], strength: assist.strength, start_percent: 0, end_percent: assist.endPercent, vae: ['1', 2] },
    };
  }
  return workflow;
}

/**
 * IP-Adapter nodes (spike A2): one `IPAdapterEncoder` per reference at its weight, merged by
 * `IPAdapterCombineEmbeds` in groups of {@link COMBINE_GROUP_SIZE} whose partial results are
 * combined again (12 references work), applied by `IPAdapterEmbeds` on the checkpoint model
 * (node 60, which the sampler reads). The Plus model also needs `clip_vision`.
 */
function addIpAdapter(workflow: Record<string, Node>, references: Array<{ inputImage: string; weight: number }>): void {
  const w = RENDER_WORKFLOW;
  workflow['20'] = { class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: w.ipAdapter } };
  workflow['21'] = { class_type: 'CLIPVisionLoader', inputs: { clip_name: w.clipVision } };
  const encoders = references.map((reference, index) => {
    const load = `3${String(index).padStart(2, '0')}`;
    const encode = `4${String(index).padStart(2, '0')}`;
    workflow[load] = { class_type: 'LoadImage', inputs: { image: reference.inputImage } };
    workflow[encode] = { class_type: 'IPAdapterEncoder', inputs: { ipadapter: ['20', 0], image: [load, 0], weight: reference.weight, clip_vision: ['21', 0] } };
    return encode;
  });
  const combine = (ids: string[], tag: string): string => {
    if (ids.length === 1) return ids[0] as string;
    const id = `5${tag}`;
    const inputs: Record<string, unknown> = { method: 'concat' };
    ids.forEach((embed, index) => {
      inputs[`embed${index + 1}`] = [embed, 0];
    });
    workflow[id] = { class_type: 'IPAdapterCombineEmbeds', inputs };
    return id;
  };
  const parts: string[] = [];
  for (let start = 0; start < encoders.length; start += COMBINE_GROUP_SIZE) {
    parts.push(combine(encoders.slice(start, start + COMBINE_GROUP_SIZE), String(parts.length).padStart(2, '0')));
  }
  const final = parts.length > 1 ? combine(parts, '99') : (parts[0] as string);
  workflow['60'] = {
    class_type: 'IPAdapterEmbeds',
    inputs: { model: ['1', 0], ipadapter: ['20', 0], pos_embed: [final, 0], weight: 1, weight_type: 'linear', start_at: 0, end_at: 1, embeds_scaling: 'V only', clip_vision: ['21', 0] },
  };
}
