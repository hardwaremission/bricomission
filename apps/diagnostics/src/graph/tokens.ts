import type { DiagnosticsKind, DiagnosticsModuleSection, DiagnosticsNodeId, DiagnosticsPinType } from '@bricomission/shared-types';

// Values of docs/design/diagnostics-dashboard.md ("Visual language"). No blur, glow or gradient anywhere.
export const COLOR = {
  page: '#080E1A',
  canvas: '#0B1220',
  panel: '#0E1626',
  node: '#101A2B',
  well: '#0A1020',
  stroke: '#2A3A55',
  strokePanel: '#1C2A44',
  strong: '#E6EDF7',
  body: '#CBD5E1',
  muted: '#8A9BB5',
  dim: '#7E8DA6',
  brand: '#2968EC',
  active: '#5B9BFF',
  recent: '#3B5A9A',
  ok: '#4ADE80',
  warning: '#FACC15',
  error: '#EF4444',
  chip: '#16233A',
  chipText: '#9DB4D8',
} as const;

export const PIN_COLOR: Record<DiagnosticsPinType, string> = {
  http: '#4F8EF7',
  sql: '#F5A524',
  object: '#FB923C',
  llm: '#A78BFA',
  image: '#F472B6',
  embed: '#22D3EE',
  auth: '#F87171',
  mail: '#4ADE80',
  queue: '#FACC15',
  compute: '#5EEAD4',
  step: '#94A3B8',
};

/** The 14 event kinds in the order of the filter menu (L2). `guard`, `residency` and `session` have no pin type of their own. */
export const KINDS: DiagnosticsKind[] = ['http', 'auth', 'guard', 'sql', 'object', 'llm', 'image', 'embed', 'queue', 'residency', 'step', 'compute', 'mail', 'session'];
/** Chips shown in the filter row; the rest live in the `+N` menu. */
export const CHIP_KINDS: DiagnosticsKind[] = ['llm', 'image', 'queue', 'sql', 'http'];

export const KIND_COLOR: Record<DiagnosticsKind, string> = {
  ...PIN_COLOR,
  guard: '#5EEAD4',
  residency: '#FACC15',
  session: '#F5A524',
};

/** Dark badge background behind a kind label (L1). */
export const KIND_BADGE_BG: Record<DiagnosticsKind, string> = {
  http: '#0F1F3A',
  auth: '#2A1220',
  guard: '#0C2A2D',
  sql: '#2A2010',
  object: '#2A1A10',
  llm: '#1E1740',
  image: '#2A1226',
  embed: '#0C2A33',
  queue: '#2A2508',
  residency: '#2A2508',
  step: '#1E293B',
  compute: '#0C2A2D',
  mail: '#0F2A1E',
  session: '#2A2010',
};

export const METRIC_COLOR = { cpu: '#5B9BFF', ram: '#4ADE80', vram: '#A78BFA', gpu: '#FACC15' } as const;

export const SECTION_COLOR: Record<DiagnosticsModuleSection, string> = {
  request: '#14B8A6',
  generation: '#84CC16',
  budget: '#38BDF8',
  gpu: '#FACC15',
  infra: '#94A3B8',
};

export type NodeCategory = 'client' | 'web' | 'api' | 'identity' | 'data' | 'ai-gpu' | 'ai-cpu';

/** Header colour, title colour and the log chip colours of each node category. */
export const CATEGORY: Record<NodeCategory, { header: string; title: string; chipBg: string; chipText: string }> = {
  client: { header: '#475569', title: '#E2E8F0', chipBg: '#1E293B', chipText: '#CBD5E1' },
  web: { header: '#2968EC', title: '#FFFFFF', chipBg: '#0F1F3A', chipText: '#7FA8F5' },
  api: { header: '#0F766E', title: '#CCFBF1', chipBg: '#0C2A2D', chipText: '#5EEAD4' },
  identity: { header: '#BE123C', title: '#FFE4E6', chipBg: '#2A1220', chipText: '#FB7185' },
  data: { header: '#B45309', title: '#FEF3C7', chipBg: '#2A2010', chipText: '#FBBF24' },
  'ai-gpu': { header: '#6D28D9', title: '#EDE9FE', chipBg: '#1E1740', chipText: '#C4B5FD' },
  'ai-cpu': { header: '#0E7490', title: '#CFFAFE', chipBg: '#0C2A33', chipText: '#67E8F9' },
};

const NODE_CATEGORY: Partial<Record<DiagnosticsNodeId, NodeCategory>> = {
  browser: 'client',
  web: 'web',
  keycloak: 'identity',
  mailpit: 'identity',
  minio: 'data',
  postgres: 'data',
  'llama-server': 'ai-gpu',
  comfyui: 'ai-gpu',
  embedder: 'ai-cpu',
};

/** Every node that is not a container is an API module. */
export function nodeCategory(id: DiagnosticsNodeId): NodeCategory {
  return NODE_CATEGORY[id] ?? 'api';
}
