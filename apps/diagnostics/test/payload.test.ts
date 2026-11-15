import { readFileSync } from 'node:fs';
import type { DiagnosticsTopology } from '@bricomission/shared-types';
import { describe, expect, it } from 'vitest';
import { modelLines, shortMmproj } from '../src/lib/models.ts';
import { asThumb, copyText, formatBytes, headingOf, toolbarFacts } from '../src/lib/payload.ts';

const topology = JSON.parse(readFileSync(new URL('./fixtures/topology.json', import.meta.url), 'utf8')) as DiagnosticsTopology;
const models = (id: string) => topology.nodes.find((n) => n.id === id)?.models ?? null;
const thumb = { kind: 'thumbnail', dataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', width: 96, height: 64, bytes: 3000, originalBytes: 420_000 };

describe('payload helpers', () => {
  it('accepts only the API thumbnail shape for an image', () => {
    expect(asThumb(thumb)).toMatchObject({ width: 96, height: 64, originalBytes: 420_000 });
    expect(asThumb({ ...thumb, dataUri: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBeNull();
    expect(asThumb({ ...thumb, dataUri: 'https://example.com/x.jpg' })).toBeNull();
    expect(asThumb({ ...thumb, width: 2000 })).toBeNull();
    expect(asThumb({ ...thumb, kind: 'image' })).toBeNull();
    expect(asThumb('data:image/jpeg;base64,AAAA')).toBeNull();
  });

  it('copies the payload as JSON without any image data', () => {
    const text = copyText({ prompt: 'warm oak', references: [thumb] });
    expect(text).toContain('"prompt": "warm oak"');
    expect(text).toContain('[thumbnail 96x64, 410 kB]');
    expect(text).not.toContain('base64');
  });

  it('builds headings, sizes and the toolbar facts from keys that exist', () => {
    expect(headingOf('negativePrompt')).toBe('NEGATIVE PROMPT');
    expect(formatBytes(41_000)).toBe('40 kB');
    expect(toolbarFacts({ promptTokens: 1234, schema: 'budget_tiers', maxTokens: 1500 })).toBe('1,234 prompt tokens · schema budget_tiers · maxTokens 1500');
    expect(toolbarFacts({ rows: 3 })).toBe('');
  });
});

describe('AI node model lines', () => {
  it('names the models from the API topology, never from the dashboard', () => {
    expect(modelLines('llama-server', models('llama-server')).map((l) => l.text)).toEqual([
      'Qwen3-VL-30B-A3B-Instruct-Q4_K_M',
      '+ mmproj F16 (vision) · id qwen3-vl',
      'MoE experts on CPU · router, one model at a time',
    ]);
    expect(modelLines('comfyui', models('comfyui')).map((l) => l.text)).toEqual([
      'RealVisXL_V5.0_fp16 (SDXL)',
      'ControlNet sdxl-canny + sdxl-depth',
      'IP-Adapter plus_sdxl_vit-h',
      'CLIP vision ViT-H-14-laion2B-s32B-b79K',
    ]);
    expect(modelLines('embedder', models('embedder')).map((l) => l.text)).toEqual(['qwen3-embedding-0.6b-q8_0', '1024 dimensions · llama.cpp CPU only']);
  });

  it('says so when the topology is not available instead of naming a model', () => {
    expect(modelLines('llama-server', [{ role: 'router id', name: 'qwen3-vl' }, { role: 'context', name: '16384' }])[2].text).toBe(
      'MoE experts on CPU · ctx 16384 · router, one model at a time',
    );
    expect(modelLines('llama-server', null)).toEqual([{ text: 'models: waiting for the API topology', tone: 'dim' }]);
    expect(modelLines('llama-server', [{ role: 'router id', name: 'qwen3-vl' }]).map((l) => l.text).slice(0, 2)).toEqual(['qwen3-vl', 'no mmproj · id qwen3-vl']);
  });

  it('shortens the mmproj name by the prefix it shares with the model', () => {
    expect(shortMmproj('Qwen3-VL-30B-A3B-Instruct-Q4_K_M', 'Qwen3-VL-30B-A3B-Instruct-mmproj-F16')).toBe('F16');
    expect(shortMmproj(null, 'other-mmproj-f32')).toBe('other-mmproj-f32');
    expect(shortMmproj('abc', 'mmproj-x')).toBe('x');
  });
});
