import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RENDER_WORKFLOW } from '../../src/ai/adapters/comfyui-workflow.js';
import { DIAGNOSTICS_NODE_IDS } from '../../src/diagnostics/event.js';
import { buildTopology, parseLlamaModelsIni, topologyConfigFromEnv } from '../../src/diagnostics/topology.js';

const LAYOUT = fileURLToPath(new URL('../../../../design/openpencil/diagnostics-dashboard/layout-reference.json', import.meta.url));
const INI = fileURLToPath(new URL('../../../../infra/ai/llama-models.ini', import.meta.url));
const layout = JSON.parse(readFileSync(LAYOUT, 'utf8')) as { nodes: Record<string, unknown>; edges: Record<string, unknown>; comment_boxes: Record<string, unknown> };

const config = () => topologyConfigFromEnv({ LLM_MODEL: 'qwen3-vl', EMBEDDING_MODEL: 'qwen3-embedding-0.6b-q8_0' }, 'boot1', 'fake', () => readFileSync(INI, 'utf8'));

describe('topology', () => {
  it('has exactly the node ids of the approved layout reference (23)', () => {
    const topology = buildTopology(config());
    expect(topology.nodes.map((n) => n.id).sort()).toEqual(Object.keys(layout.nodes).sort());
    expect([...DIAGNOSTICS_NODE_IDS].sort()).toEqual(Object.keys(layout.nodes).sort());
    expect(topology.nodes).toHaveLength(23);
  });

  it('has exactly the 24 edges of the layout reference, id <from>-<to>, between known nodes', () => {
    const topology = buildTopology(config());
    expect(topology.edges.map((e) => e.id).sort()).toEqual(Object.keys(layout.edges).sort());
    const ids = new Set(topology.nodes.map((n) => n.id));
    for (const edge of topology.edges) {
      expect(edge.id).toBe(`${edge.from}-${edge.to}`);
      expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
      expect(edge.fromPin).toBe(`out:${edge.kind}`);
      expect(edge.toPin).toBe(`in:${edge.kind}`);
    }
  });

  it('groups match the six comment boxes and every node belongs to one', () => {
    const topology = buildTopology(config());
    expect(topology.groups.map((g) => g.id).sort()).toEqual(Object.keys(layout.comment_boxes).map((k) => (k === 'api' ? 'api' : k)).sort());
    const groups = new Set(topology.groups.map((g) => g.id));
    for (const node of topology.nodes) expect(groups.has(node.group)).toBe(true);
    expect(topology.nodes.filter((n) => n.kind === 'module')).toHaveLength(14);
    expect(topology.nodes.filter((n) => n.kind === 'module').every((n) => n.group === 'api' && n.section)).toBe(true);
  });

  it('derives one in and one out pin per pin type a node uses (no duplicates)', () => {
    const topology = buildTopology(config());
    const node = (id: string) => topology.nodes.find((n) => n.id === id)!;
    expect(node('web').pins).toEqual({ in: ['http'], out: ['http', 'auth', 'sql'] });
    expect(node('postgres').pins.out).toEqual([]);
    expect(node('postgres').pins.in).toEqual(['sql']);
    expect(node('llama-server').pins.in).toEqual(['llm']);
    for (const n of topology.nodes) {
      expect(new Set(n.pins.in).size).toBe(n.pins.in.length);
      expect(new Set(n.pins.out).size).toBe(n.pins.out.length);
    }
  });

  it('reads model names from the real configuration', () => {
    const topology = buildTopology(config());
    const models = (id: string) => topology.nodes.find((n) => n.id === id)!.models;
    expect(models('llama-server')).toEqual([
      { role: 'router id', name: 'qwen3-vl' },
      { role: 'model', name: 'Qwen3-VL-30B-A3B-Instruct-Q4_K_M' },
      { role: 'mmproj', name: 'Qwen3-VL-30B-A3B-Instruct-mmproj-F16' },
    ]);
    expect(models('comfyui').map((m) => m.name)).toEqual([
      RENDER_WORKFLOW.checkpoint.replace('.safetensors', ''),
      'sdxl-canny',
      'sdxl-depth',
      RENDER_WORKFLOW.ipAdapter.replace('.safetensors', ''),
      RENDER_WORKFLOW.clipVision.replace('.safetensors', ''),
    ]);
    expect(models('embedder')).toEqual([
      { role: 'model', name: 'qwen3-embedding-0.6b-q8_0' },
      { role: 'dimensions', name: '1024' },
    ]);
    expect(models('ai-adapters')).toEqual([{ role: 'adapters', name: 'fake' }]);
    expect(models('web')).toEqual([]);
  });

  it('falls back to the router id when the ini is missing and follows env', () => {
    const topology = buildTopology(topologyConfigFromEnv({ LLM_MODEL: 'other', EMBEDDING_MODEL: 'bge-m3', LLAMA_MODELS_INI: '/nope' }, 'b', 'local', () => undefined));
    expect(topology.nodes.find((n) => n.id === 'llama-server')!.models).toEqual([{ role: 'router id', name: 'other' }]);
    expect(topology.nodes.find((n) => n.id === 'embedder')!.models[0].name).toBe('bge-m3');
    expect(topology.nodes.find((n) => n.id === 'ai-adapters')!.models[0].name).toBe('local');
    expect(topology.bootId).toBe('b');
  });

  it('adds the llama-server context size only from a numeric LLAMA_CTX_SIZE', () => {
    const llama = (env: NodeJS.ProcessEnv) =>
      buildTopology(topologyConfigFromEnv(env, 'b', 'local', () => undefined)).nodes.find((n) => n.id === 'llama-server')!.models;
    expect(llama({ LLAMA_CTX_SIZE: '16384' })).toContainEqual({ role: 'context', name: '16384' });
    expect(llama({ LLAMA_CTX_SIZE: ' 8192 ' })).toContainEqual({ role: 'context', name: '8192' });
    expect(llama({}).some((m) => m.role === 'context')).toBe(false);
    expect(llama({ LLAMA_CTX_SIZE: 'big' }).some((m) => m.role === 'context')).toBe(false);
    expect(llama({ LLAMA_CTX_SIZE: '0' }).some((m) => m.role === 'context')).toBe(false);
  });

  it('parses the ini sections, ignoring comments', () => {
    const parsed = parseLlamaModelsIni('; c\nversion = 1\n\n[a]\nmodel = /m/x.gguf\n# note\n[b]\nmmproj=/m/y.gguf\n');
    expect(parsed.get('a')).toEqual({ model: '/m/x.gguf' });
    expect(parsed.get('b')).toEqual({ mmproj: '/m/y.gguf' });
  });
});
