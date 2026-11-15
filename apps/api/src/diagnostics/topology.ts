import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type {
  DiagnosticsGroupId,
  DiagnosticsModuleSection,
  DiagnosticsNodeId,
  DiagnosticsNodeKind,
  DiagnosticsPinType,
  DiagnosticsTopology,
  DiagnosticsTopologyEdge,
  DiagnosticsTopologyGroup,
  DiagnosticsTopologyModel,
  DiagnosticsTopologyNode,
} from '@bricomission/shared-types';
import { RENDER_WORKFLOW } from '../ai/adapters/comfyui-workflow.js';
import { DEFAULT_LLM_MODEL } from '../ai/adapters/llama-server-llm.adapter.js';
import { DEFAULT_EMBEDDING_MODEL } from '../catalog/catalog.config.js';
import { CATALOG_EMBEDDING_DIMENSIONS } from '../catalog/embedding/embedder.js';

/** Where the compose file mounts `infra/ai/llama-models.ini` (read-only) in the api container. */
export const DEFAULT_LLAMA_MODELS_INI = '/cfg/llama-models.ini';

interface NodeSpec {
  id: DiagnosticsNodeId;
  label: string;
  group: DiagnosticsGroupId;
  kind: DiagnosticsNodeKind;
  section?: DiagnosticsModuleSection;
}

/**
 * The 23 nodes. Ids, groups and columns follow `design/openpencil/diagnostics-dashboard/layout-reference.json`
 * (the layout test of the dashboard keys positions by these ids).
 */
export const NODE_SPECS: readonly NodeSpec[] = [
  { id: 'browser', label: 'Browser PWA', group: 'client', kind: 'client' },
  { id: 'web', label: 'Next.js web / BFF', group: 'web', kind: 'container' },
  { id: 'api-guards', label: 'HTTP entry and guards', group: 'api', kind: 'module', section: 'request' },
  { id: 'project-service', label: 'Kitchen Projects', group: 'api', kind: 'module', section: 'request' },
  { id: 'style-gallery', label: 'Style Gallery', group: 'api', kind: 'module', section: 'generation' },
  { id: 'simulation-runner', label: 'Simulations and Renders', group: 'api', kind: 'module', section: 'generation' },
  { id: 'budget-engine', label: 'Budget pipeline', group: 'api', kind: 'module', section: 'budget' },
  { id: 'image-pipeline', label: 'Image pipeline', group: 'api', kind: 'module', section: 'generation' },
  { id: 'style-engine', label: 'Calculated style', group: 'api', kind: 'module', section: 'generation' },
  { id: 'gpu-broker', label: 'GPU job broker', group: 'api', kind: 'module', section: 'gpu' },
  { id: 'budget-math', label: 'Verify and compute', group: 'api', kind: 'module', section: 'budget' },
  { id: 'catalog-search', label: 'Catalog RAG search', group: 'api', kind: 'module', section: 'budget' },
  { id: 'residency-hook', label: 'GPU residency hook', group: 'api', kind: 'module', section: 'gpu' },
  { id: 'ai-adapters', label: 'AI abstraction layer', group: 'api', kind: 'module', section: 'gpu' },
  { id: 'storage-client', label: 'Object storage client', group: 'api', kind: 'module', section: 'infra' },
  { id: 'data-access', label: 'Prisma data access', group: 'api', kind: 'module', section: 'infra' },
  { id: 'keycloak', label: 'Keycloak (realm BricoMission)', group: 'identity_mail', kind: 'container' },
  { id: 'mailpit', label: 'Mailpit', group: 'identity_mail', kind: 'container' },
  { id: 'llama-server', label: 'llama.cpp router', group: 'ai_inference', kind: 'ai-gpu' },
  { id: 'comfyui', label: 'ComfyUI', group: 'ai_inference', kind: 'ai-gpu' },
  { id: 'embedder', label: 'llama.cpp CPU embedder', group: 'ai_inference', kind: 'ai-cpu' },
  { id: 'minio', label: 'MinIO', group: 'data', kind: 'container' },
  { id: 'postgres', label: 'PostgreSQL 17 + pgvector', group: 'data', kind: 'container' },
];

export const GROUPS: readonly DiagnosticsTopologyGroup[] = [
  { id: 'client', label: 'Client' },
  { id: 'web', label: 'Web container' },
  { id: 'api', label: 'API (NestJS)' },
  { id: 'identity_mail', label: 'Identity and mail' },
  { id: 'ai_inference', label: 'AI inference' },
  { id: 'data', label: 'Data' },
];

type EdgeSpec = readonly [from: DiagnosticsNodeId, to: DiagnosticsNodeId, kind: DiagnosticsPinType];

/** The 24 structural edges of the design (id `<from>-<to>`), each with the pin type that colours it. */
export const EDGE_SPECS: readonly EdgeSpec[] = [
  ['browser', 'web', 'http'],
  ['web', 'api-guards', 'http'],
  ['web', 'keycloak', 'auth'],
  ['web', 'postgres', 'sql'],
  ['api-guards', 'keycloak', 'auth'],
  ['api-guards', 'project-service', 'http'],
  ['api-guards', 'style-gallery', 'http'],
  ['api-guards', 'simulation-runner', 'http'],
  ['api-guards', 'budget-engine', 'http'],
  ['simulation-runner', 'style-engine', 'compute'],
  ['simulation-runner', 'gpu-broker', 'queue'],
  ['budget-engine', 'gpu-broker', 'queue'],
  ['budget-engine', 'budget-math', 'compute'],
  ['budget-engine', 'catalog-search', 'step'],
  ['catalog-search', 'embedder', 'embed'],
  ['gpu-broker', 'residency-hook', 'step'],
  ['gpu-broker', 'ai-adapters', 'queue'],
  ['residency-hook', 'llama-server', 'llm'],
  ['ai-adapters', 'llama-server', 'llm'],
  ['ai-adapters', 'comfyui', 'image'],
  ['image-pipeline', 'storage-client', 'object'],
  ['storage-client', 'minio', 'object'],
  ['data-access', 'postgres', 'sql'],
  ['keycloak', 'mailpit', 'mail'],
];

export interface TopologyConfig {
  bootId: string;
  adapters: 'fake' | 'local';
  /** Router model id (`LLM_MODEL`). */
  llmModel: string;
  /** Text of `llama-models.ini`, when readable. */
  llamaModelsIni?: string;
  /** Context size of every llama-server model instance (`LLAMA_CTX_SIZE`, the same compose variable its `-c` flag reads). */
  llamaCtxSize?: number;
  embeddingModel: string;
  embeddingDimensions: number;
}

/** Reads the model-related configuration. `readIni` is injectable for tests; a missing file is not an error. */
export function topologyConfigFromEnv(
  env: NodeJS.ProcessEnv,
  bootId: string,
  adapters: 'fake' | 'local',
  readIni: (path: string) => string | undefined = defaultReadIni,
): TopologyConfig {
  return {
    bootId,
    adapters,
    llmModel: env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL,
    llamaModelsIni: readIni(env.LLAMA_MODELS_INI?.trim() || DEFAULT_LLAMA_MODELS_INI),
    llamaCtxSize: /^[1-9]\d{2,6}$/.test(env.LLAMA_CTX_SIZE?.trim() ?? '') ? Number(env.LLAMA_CTX_SIZE?.trim()) : undefined,
    embeddingModel: env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: CATALOG_EMBEDDING_DIMENSIONS,
  };
}

function defaultReadIni(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** `[section]` blocks of the llama-server presets file with their `key = value` pairs. */
export function parseLlamaModelsIni(text: string): Map<string, Record<string, string>> {
  const sections = new Map<string, Record<string, string>>();
  let current: Record<string, string> | undefined;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) {
      current = {};
      sections.set(header[1], current);
      continue;
    }
    const pair = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(trimmed);
    if (pair && current) current[pair[1]] = pair[2].trim();
  }
  return sections;
}

function modelName(path: string): string {
  return basename(path).replace(/\.(gguf|safetensors|pth)$/i, '');
}

function llamaModels(config: TopologyConfig): DiagnosticsTopologyModel[] {
  const models: DiagnosticsTopologyModel[] = [{ role: 'router id', name: config.llmModel }];
  const section = config.llamaModelsIni ? parseLlamaModelsIni(config.llamaModelsIni).get(config.llmModel) : undefined;
  if (section?.model) models.push({ role: 'model', name: modelName(section.model) });
  if (section?.mmproj) models.push({ role: 'mmproj', name: modelName(section.mmproj) });
  if (config.llamaCtxSize) models.push({ role: 'context', name: String(config.llamaCtxSize) });
  return models;
}

function modelsOf(id: DiagnosticsNodeId, config: TopologyConfig): DiagnosticsTopologyModel[] {
  switch (id) {
    case 'llama-server':
      return llamaModels(config);
    case 'comfyui':
      return [
        { role: 'checkpoint', name: modelName(RENDER_WORKFLOW.checkpoint) },
        { role: 'controlnet canny', name: modelName(RENDER_WORKFLOW.controlNets.canny) },
        { role: 'controlnet depth', name: modelName(RENDER_WORKFLOW.controlNets.depth) },
        { role: 'ip-adapter', name: modelName(RENDER_WORKFLOW.ipAdapter) },
        { role: 'clip vision', name: modelName(RENDER_WORKFLOW.clipVision) },
      ];
    case 'embedder':
      return [
        { role: 'model', name: config.embeddingModel },
        { role: 'dimensions', name: String(config.embeddingDimensions) },
      ];
    case 'ai-adapters':
      return [{ role: 'adapters', name: config.adapters }];
    default:
      return [];
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export const TOPOLOGY_EDGES: readonly DiagnosticsTopologyEdge[] = EDGE_SPECS.map(([from, to, kind]) => ({
  id: `${from}-${to}`,
  from,
  to,
  kind,
  fromPin: `out:${kind}`,
  toPin: `in:${kind}`,
}));

/** The topology served at `GET /diagnostics/topology` (single source of node ids, edges and model names). */
export function buildTopology(config: TopologyConfig): DiagnosticsTopology {
  const nodes: DiagnosticsTopologyNode[] = NODE_SPECS.map((spec) => {
    const node: DiagnosticsTopologyNode = {
      id: spec.id,
      label: spec.label,
      group: spec.group,
      kind: spec.kind,
      pins: {
        in: unique(TOPOLOGY_EDGES.filter((e) => e.to === spec.id).map((e) => e.kind)),
        out: unique(TOPOLOGY_EDGES.filter((e) => e.from === spec.id).map((e) => e.kind)),
      },
      models: modelsOf(spec.id, config),
    };
    if (spec.section) node.section = spec.section;
    return node;
  });
  return { bootId: config.bootId, groups: GROUPS.map((g) => ({ ...g })), nodes, edges: TOPOLOGY_EDGES.map((e) => ({ ...e })) };
}
