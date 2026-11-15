import type {
  DiagnosticsGroupId,
  DiagnosticsModuleSection,
  DiagnosticsNodeId,
  DiagnosticsNodeKind,
  DiagnosticsPinType,
  DiagnosticsTopology,
} from '@bricomission/shared-types';
import reference from './layout-reference.json' with { type: 'json' };

/**
 * Layout of the graph canvas (1360x1024 at 1:1). `layout-reference.json` is a byte copy of
 * `design/openpencil/diagnostics-dashboard/layout-reference.json` (a test fails on drift): node rects,
 * comment boxes and the 24 orthogonal polylines are used exactly as designed. ELK (layered, interactive,
 * fixed ports) could not keep them (it moved all 23 nodes and matched 0 of 24 routes), so no layout engine
 * runs at all: the routing test checks these polylines against every node box instead.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Point = [number, number];

export const CANVAS = reference.canvas as { w: number; h: number };
export const NODE_RECTS = reference.nodes as Record<DiagnosticsNodeId, Rect>;
export const NODE_IDS = Object.keys(NODE_RECTS) as DiagnosticsNodeId[];
export const EDGE_POINTS = reference.edges as unknown as Record<string, Point[]>;
export const GUTTERS = reference.gutters as unknown as Record<string, [number, number]>;

export const COMMENT_BOXES: Record<DiagnosticsGroupId, Rect> = Object.fromEntries(
  Object.entries(reference.comment_boxes).map(([id, [x, y, w, h]]) => [id, { x, y, w, h }]),
) as Record<DiagnosticsGroupId, Rect>;

/** Comment-box look (parts/d-canvas-comment-boxes.jsx). The API title is 12 px, the others 11 px. */
export const COMMENT_BOX_STYLE: Record<DiagnosticsGroupId, { title: string; bg: string; stroke: string; color: string; radius: number }> = {
  client: { title: 'CLIENT', bg: '#121A29', stroke: '#2F394B', color: '#94A3B8', radius: 12 },
  web: { title: 'WEB CONTAINER', bg: '#0D1930', stroke: '#173471', color: '#7FA8F5', radius: 12 },
  api: { title: 'API · NestJS', bg: '#0B1A27', stroke: '#0F5456', color: '#5EEAD4', radius: 14 },
  identity_mail: { title: 'IDENTITY AND MAIL', bg: '#1B1524', stroke: '#5C2235', color: '#FB7185', radius: 12 },
  ai_inference: { title: 'AI INFERENCE', bg: '#14172F', stroke: '#372C6B', color: '#C4B5FD', radius: 12 },
  data: { title: 'DATA', bg: '#1B1C1E', stroke: '#5D431C', color: '#FBBF24', radius: 12 },
};

/** The single "API TOTALS · shared" widget inside the API box (design rect). */
export const API_WIDGET_RECT: Rect = { x: 340, y: 46, w: 128, h: 96 };
/** The open legend card at 1:1 (bottom-left of the canvas). Height is the design render height. */
export const LEGEND_RECT: Rect = { x: 8, y: 596, w: 284, h: 420 };

export interface NodeMeta {
  kind: DiagnosticsNodeKind;
  group: DiagnosticsGroupId;
  section?: DiagnosticsModuleSection;
  /** Header title of the design (the node id for containers and modules). */
  title: string;
  /** Second line (design sub text). Structural description, never a model name or a metric. */
  sub: string;
}

const mod = (section: DiagnosticsModuleSection, id: string, sub: string): NodeMeta => ({ kind: 'module', group: 'api', section, title: id, sub });

/**
 * Structure the graph needs before (or without) the API topology: kind, group and the design's static
 * sub line. Model names and the adapter mode always come from `GET /diagnostics/topology`.
 */
export const NODE_META: Record<DiagnosticsNodeId, NodeMeta> = {
  browser: { kind: 'client', group: 'client', title: 'Browser PWA', sub: 'client device' },
  web: { kind: 'container', group: 'web', title: 'web', sub: 'session, proxy /api' },
  'api-guards': mod('request', 'api-guards', 'JWT, roles, guards'),
  'project-service': mod('request', 'project-service', 'drafts, claim, edits'),
  'style-gallery': mod('generation', 'style-gallery', '24 JPEGs, disk'),
  'simulation-runner': mod('generation', 'simulation-runner', 'Simulations, Renders'),
  'budget-engine': mod('budget', 'budget-engine', 'inventory, pricing'),
  'image-pipeline': mod('generation', 'image-pipeline', 'sharp, HEIC, 768px'),
  'style-engine': mod('generation', 'style-engine', 'calculated style'),
  'gpu-broker': mod('gpu', 'gpu-broker', '1 GPU job at a time'),
  'budget-math': mod('budget', 'budget-math', 'verify, compute'),
  'catalog-search': mod('budget', 'catalog-search', 'RAG, pgvector'),
  'residency-hook': mod('gpu', 'residency-hook', 'unload/reload LLM'),
  'ai-adapters': mod('gpu', 'ai-adapters', 'mode: unknown'),
  'storage-client': mod('infra', 'storage-client', 'S3 client'),
  'data-access': mod('infra', 'data-access', 'Prisma'),
  keycloak: { kind: 'container', group: 'identity_mail', title: 'keycloak', sub: 'realm BricoMission' },
  mailpit: { kind: 'container', group: 'identity_mail', title: 'mailpit', sub: 'email code inbox' },
  'llama-server': { kind: 'ai-gpu', group: 'ai_inference', title: 'llama-server', sub: '' },
  comfyui: { kind: 'ai-gpu', group: 'ai_inference', title: 'comfyui', sub: '' },
  embedder: { kind: 'ai-cpu', group: 'ai_inference', title: 'embedder', sub: '' },
  minio: { kind: 'container', group: 'data', title: 'minio', sub: 'S3 bucket media' },
  postgres: { kind: 'container', group: 'data', title: 'postgres', sub: 'PG 17 + pgvector' },
};

/** Pin type of each structural edge (equal to the API topology; `checkTopology` reports drift). */
const EDGE_KIND: Record<string, DiagnosticsPinType> = {
  'browser-web': 'http',
  'web-api-guards': 'http',
  'web-keycloak': 'auth',
  'web-postgres': 'sql',
  'api-guards-keycloak': 'auth',
  'api-guards-project-service': 'http',
  'api-guards-style-gallery': 'http',
  'api-guards-simulation-runner': 'http',
  'api-guards-budget-engine': 'http',
  'simulation-runner-style-engine': 'compute',
  'simulation-runner-gpu-broker': 'queue',
  'budget-engine-gpu-broker': 'queue',
  'budget-engine-budget-math': 'compute',
  'budget-engine-catalog-search': 'step',
  'catalog-search-embedder': 'embed',
  'gpu-broker-residency-hook': 'step',
  'gpu-broker-ai-adapters': 'queue',
  'residency-hook-llama-server': 'llm',
  'ai-adapters-llama-server': 'llm',
  'ai-adapters-comfyui': 'image',
  'image-pipeline-storage-client': 'object',
  'storage-client-minio': 'object',
  'data-access-postgres': 'sql',
  'keycloak-mailpit': 'mail',
};

export interface GraphEdge {
  id: string;
  from: DiagnosticsNodeId;
  to: DiagnosticsNodeId;
  kind: DiagnosticsPinType;
  points: Point[];
}

/** Splits `<from>-<to>` (node ids contain dashes): the longest known id that prefixes the name wins. */
export function splitEdgeId(id: string): { from: DiagnosticsNodeId; to: DiagnosticsNodeId } | null {
  for (const from of [...NODE_IDS].sort((a, b) => b.length - a.length)) {
    if (!id.startsWith(`${from}-`)) continue;
    const to = id.slice(from.length + 1) as DiagnosticsNodeId;
    if (to in NODE_RECTS) return { from, to };
  }
  return null;
}

export const EDGES: GraphEdge[] = Object.entries(EDGE_POINTS).map(([id, points]) => {
  const ends = splitEdgeId(id);
  if (!ends) throw new Error(`layout edge ${id} does not join two known nodes`);
  const kind = EDGE_KIND[id];
  if (!kind) throw new Error(`layout edge ${id} has no pin type`);
  return { id, ...ends, kind, points };
});

export const EDGE_BY_ID: Record<string, GraphEdge> = Object.fromEntries(EDGES.map((e) => [e.id, e]));

export interface Pin {
  side: 'in' | 'out';
  /** Offset from the node's top edge to the pin centre. */
  y: number;
  type: DiagnosticsPinType;
  edges: string[];
}

/** Pins are where the polylines touch the node: inputs on the left edge, outputs on the right. Edges that share an endpoint share the pin. */
export function pinsOf(id: DiagnosticsNodeId): Pin[] {
  const rect = NODE_RECTS[id];
  const pins = new Map<string, Pin>();
  for (const edge of EDGES) {
    const side = edge.from === id ? 'out' : edge.to === id ? 'in' : null;
    if (!side) continue;
    const point = side === 'out' ? edge.points[0] : edge.points[edge.points.length - 1];
    const key = `${side}:${point[1]}`;
    const pin = pins.get(key) ?? { side, y: point[1] - rect.y, type: edge.kind, edges: [] };
    pin.edges.push(edge.id);
    pins.set(key, pin);
  }
  return [...pins.values()].sort((a, b) => a.y - b.y);
}

/** Differences between the API topology and this layout (empty = in sync). Every id needs a layout and every layout id must be known. */
export function checkTopology(topology: Pick<DiagnosticsTopology, 'nodes' | 'edges'>): string[] {
  const problems: string[] = [];
  const nodeIds = new Set(topology.nodes.map((n) => n.id));
  for (const node of topology.nodes) {
    if (!(node.id in NODE_RECTS)) problems.push(`topology node ${node.id} has no layout`);
    else if (NODE_META[node.id].kind !== node.kind) problems.push(`node ${node.id}: kind ${node.kind} differs from the layout (${NODE_META[node.id].kind})`);
  }
  for (const id of NODE_IDS) if (!nodeIds.has(id)) problems.push(`layout node ${id} is unknown to the topology`);
  const edgeIds = new Set(topology.edges.map((e) => e.id));
  for (const edge of topology.edges) {
    const local = EDGE_BY_ID[edge.id];
    if (!local) problems.push(`topology edge ${edge.id} has no layout`);
    else if (local.kind !== edge.kind) problems.push(`edge ${edge.id}: pin type ${edge.kind} differs from the layout (${local.kind})`);
  }
  for (const edge of EDGES) if (!edgeIds.has(edge.id)) problems.push(`layout edge ${edge.id} is unknown to the topology`);
  return problems;
}
