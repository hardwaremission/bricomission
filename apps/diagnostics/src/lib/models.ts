import type { DiagnosticsTopologyModel } from '@bricomission/shared-types';

export interface ModelLine {
  text: string;
  tone: 'strong' | 'accent' | 'muted' | 'dim';
}

/** `Qwen3-VL-30B-A3B-Instruct-mmproj-F16` next to model `Qwen3-VL-30B-A3B-Instruct-Q4_K_M` reads `F16`: the shared prefix and the word mmproj are dropped. */
export function shortMmproj(model: string | null, mmproj: string): string {
  let rest = mmproj;
  if (model) {
    let i = 0;
    while (i < model.length && i < mmproj.length && model[i] === mmproj[i]) i += 1;
    const cut = mmproj.lastIndexOf('-', i - 1);
    if (cut > 0) rest = mmproj.slice(cut + 1);
  }
  rest = rest.replace(/^mmproj[-_]?/i, '');
  return rest === '' ? mmproj : rest;
}

/**
 * Model block of an AI node. Every name comes from the API topology (real configuration); the dashboard only
 * adds the fixed role words of the design. Without a topology it says so instead of naming a model.
 */
export function modelLines(id: 'llama-server' | 'comfyui' | 'embedder', models: DiagnosticsTopologyModel[] | null): ModelLine[] {
  if (!models) return [{ text: 'models: waiting for the API topology', tone: 'dim' }];
  const by = (role: string): string | null => models.find((m) => m.role === role)?.name ?? null;
  if (id === 'llama-server') {
    const model = by('model');
    const mmproj = by('mmproj');
    const router = by('router id');
    const context = by('context');
    return [
      { text: model ?? router ?? 'model unknown', tone: 'strong' },
      { text: `${mmproj ? `+ mmproj ${shortMmproj(model, mmproj)} (vision)` : 'no mmproj'}${router ? ` · id ${router}` : ''}`, tone: 'accent' },
      { text: `MoE experts on CPU · ${context ? `ctx ${context} · ` : ''}router, one model at a time`, tone: 'muted' },
    ];
  }
  if (id === 'comfyui') {
    return [
      { text: `${by('checkpoint') ?? 'checkpoint unknown'} (SDXL)`, tone: 'strong' },
      { text: `ControlNet ${by('controlnet canny') ?? '?'} + ${by('controlnet depth') ?? '?'}`, tone: 'accent' },
      { text: `IP-Adapter ${(by('ip-adapter') ?? '?').replace(/^ip-adapter-/, '')}`, tone: 'accent' },
      { text: `CLIP vision ${(by('clip vision') ?? '?').replace(/^CLIP-/, '')}`, tone: 'muted' },
    ];
  }
  return [
    { text: by('model') ?? 'model unknown', tone: 'strong' },
    { text: `${by('dimensions') ?? '?'} dimensions · llama.cpp CPU only`, tone: 'muted' },
  ];
}
