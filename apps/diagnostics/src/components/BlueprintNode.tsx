'use client';

import type { DiagnosticsNodeId } from '@bricomission/shared-types';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { API_WIDGET_RECT, COMMENT_BOX_STYLE, COMMENT_BOXES, NODE_META, NODE_RECTS, pinsOf, type Pin } from '../graph/layout.ts';
import { CATEGORY, PIN_COLOR, SECTION_COLOR, nodeCategory } from '../graph/tokens.ts';
import { modelLines } from '../lib/models.ts';
import { formatTime } from '../lib/state/log-state.ts';
import { agentUp, aiChip, containerTiles, type AiChip, type Tile } from '../lib/state/metrics-state.ts';
import { counterLine, nodeView, type NodePhase } from '../lib/state/node-state.ts';
import { useDashboard } from '../lib/store.ts';
import { MetricTile, NoAgentTag, widgetData } from './Widget.tsx';

const DOT: Record<NodePhase, string> = { idle: '#475569', working: '#5B9BFF', recent: '#3B5A9A', error: '#EF4444', offline: '#1E293B' };
const BORDER: Record<NodePhase, { color: string; width: number }> = {
  idle: { color: '#2A3A55', width: 1 },
  working: { color: '#5B9BFF', width: 2 },
  recent: { color: '#3B5A9A', width: 2 },
  error: { color: '#EF4444', width: 2 },
  offline: { color: '#2A3A55', width: 1 },
};
const CHIP_STYLE: Record<Exclude<AiChip, null>, { bg: string; stroke: string; color: string }> = {
  LOADED: { bg: '#0F2A1E', stroke: '#1F6B45', color: '#86EFAC' },
  WARM: { bg: '#0F2A1E', stroke: '#1F6B45', color: '#86EFAC' },
  UNLOADED: { bg: '#2A220F', stroke: '#7A5C1A', color: '#FBBF24' },
  BUSY: { bg: '#0F1F3A', stroke: '#2968EC', color: '#7FB0FF' },
  ERROR: { bg: '#2A1017', stroke: '#7F1D1D', color: '#FCA5A5' },
  OFFLINE: { bg: '#1E293B', stroke: '#475569', color: '#94A3B8' },
};

/** React Flow needs a handle per edge end; the visible pins are drawn from the design polylines instead. */
function Anchors() {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} className="bm-anchor" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="bm-anchor" />
    </>
  );
}

function Pins({ id, width }: { id: DiagnosticsNodeId; width: number }) {
  const pins = pinsOf(id);
  return (
    <>
      {pins.map((pin) => (
        <PinDot key={`${pin.side}${pin.y}`} pin={pin} width={width} />
      ))}
    </>
  );
}

function PinDot({ pin, width }: { pin: Pin; width: number }) {
  // Tooltip: pin type and the latest call on the first edge that uses the pin.
  const latest = useDashboard((s) => {
    let best: { seq: number; summary: string | null } = { seq: -1, summary: null };
    for (const edge of pin.edges) {
      const runtime = s.edges[edge];
      if (runtime && (runtime.lastSeq ?? 0) > best.seq) best = { seq: runtime.lastSeq ?? 0, summary: runtime.lastSummary };
    }
    return best.summary;
  });
  return (
    <span
      className="absolute rounded-full"
      title={`${pin.side === 'in' ? 'input' : 'output'} pin · ${pin.type}${latest ? ` · latest call: ${latest}` : ' · no call yet'}`}
      data-pin={`${pin.side}:${pin.type}`}
      style={{ left: pin.side === 'in' ? -5 : width - 5, top: pin.y - 5, width: 10, height: 10, background: PIN_COLOR[pin.type], border: '2px solid #0B1220' }}
    />
  );
}

function useNode(id: DiagnosticsNodeId, service: string | null) {
  // One string per node: the component repaints only when something it shows changed.
  const key = useDashboard((s) => {
    const container = service ? s.metrics.sample?.containers[service] : undefined;
    const up = agentUp(s.metrics, s.now);
    const view = nodeView(s.nodes[id], s.now, up && service ? (container?.state ?? 'absent') : null);
    return `${view.phase}|${view.working ? 1 : 0}|${s.selected === id ? 1 : 0}|${up ? 1 : 0}`;
  });
  const [phase, working, selected, up] = key.split('|');
  return { phase: phase as NodePhase, working: working === '1', selected: selected === '1', up: up === '1' };
}

function Frame({ id, phase, selected, children }: { id: DiagnosticsNodeId; phase: NodePhase; selected: boolean; children: React.ReactNode }) {
  const rect = NODE_RECTS[id];
  const border = selected ? { color: '#FFFFFF', width: 2 } : BORDER[phase];
  return (
    <div
      data-testid={`node-${id}`}
      data-state={phase}
      data-selected={selected}
      className="relative"
      style={{ width: rect.w, height: rect.h, background: phase === 'error' ? '#1A1017' : '#101A2B', borderRadius: 8, opacity: phase === 'offline' ? 0.5 : 1 }}
    >
      {children}
      <div className="pointer-events-none absolute inset-0" style={{ border: `${border.width}px solid ${border.color}`, borderRadius: 8 }} />
      <Pins id={id} width={rect.w} />
      <Anchors />
    </div>
  );
}

function Header({ id, height, size, children }: { id: DiagnosticsNodeId; height: number; size: number; children?: React.ReactNode }) {
  const category = CATEGORY[nodeCategory(id)];
  return (
    <div className="absolute left-0 top-0 w-full" style={{ height, background: category.header, borderRadius: '8px 8px 0 0' }}>
      <span className="absolute font-bold" style={{ left: 10, top: height === 22 ? 4 : 5, fontSize: size, lineHeight: '14px', color: category.title }}>{NODE_META[id].title}</span>
      {children}
    </div>
  );
}

function Line({ x, y, color, size = 10, weight = 400, width, children }: { x: number; y: number; color: string; size?: number; weight?: number; width: number; children: React.ReactNode }) {
  return (
    <div className="absolute overflow-hidden text-ellipsis whitespace-nowrap font-mono" title={typeof children === 'string' ? children : undefined} style={{ left: x, top: y, width, color, fontSize: size, lineHeight: `${size + 3}px`, fontWeight: weight }}>
      {children}
    </div>
  );
}

function ModuleNode({ id }: { id: DiagnosticsNodeId }) {
  const { phase, working, selected } = useNode(id, null);
  const counter = useDashboard((s) => counterLine(id, s.nodes[id], working));
  const adapters = useDashboard((s) => s.topology?.nodes.find((n) => n.id === 'ai-adapters')?.models[0]?.name ?? null);
  const meta = NODE_META[id];
  const sub = id === 'ai-adapters' ? `mode: ${adapters ?? 'unknown'}` : meta.sub;
  const error = phase === 'error';
  return (
    <Frame id={id} phase={phase} selected={selected}>
      <Header id={id} height={22} size={11}>
        <span className="absolute rounded-full" style={{ left: 122, top: 7, width: 8, height: 8, background: DOT[phase], border: phase === 'offline' ? '1px solid #7E8DA6' : undefined }} />
      </Header>
      <div className="absolute left-0" style={{ top: 22, width: 3, height: 34, background: SECTION_COLOR[meta.section ?? 'infra'], borderRadius: '0 0 0 8px' }} />
      <Line x={12} y={26} width={123} color={error ? '#FCA5A5' : '#8A9BB5'}>{sub}</Line>
      <Line x={12} y={40} width={123} color={error ? '#FCA5A5' : '#5EEAD4'}>{counter}</Line>
    </Frame>
  );
}

function useTiles(service: string): { tiles: Tile[]; up: boolean } {
  const key = useDashboard((s) => {
    const up = agentUp(s.metrics, s.now);
    return JSON.stringify({ up, tiles: containerTiles(s.metrics.sample?.containers[service], s.metrics.sample?.host, up) });
  });
  return JSON.parse(key) as { tiles: Tile[]; up: boolean };
}

function lastLine(lastSummary: string | null, lastTs: number | null, phase: NodePhase): string {
  if (phase === 'offline') return lastTs ? `offline · last seen ${formatTime(lastTs).slice(0, 8)}` : 'offline · container not running';
  if (!lastSummary) return 'idle · no call yet';
  return `${phase === 'working' ? 'now' : 'last'}: ${lastSummary}`;
}

function ContainerNode({ id }: { id: DiagnosticsNodeId }) {
  const { phase, selected, up } = useNode(id, id);
  const { tiles } = useTiles(id);
  const meta = NODE_META[id];
  const rect = NODE_RECTS[id];
  const counter = useDashboard((s) => counterLine(id, s.nodes[id], false));
  const isWeb = id === 'web';
  return (
    <Frame id={id} phase={phase} selected={selected}>
      <Header id={id} height={24} size={12}>
        {isWeb ? <span className="bm-micro absolute font-bold" style={{ right: 8, top: 7, color: '#CFE0FF' }}>NEXT.JS BFF</span> : null}
      </Header>
      <Line x={10} y={isWeb ? 32 : 28} width={rect.w - 20} color="#8A9BB5">{meta.sub}</Line>
      <div data-testid={`widget-${id}`} {...widgetData(tiles)}>
        {isWeb ? (
          <>
            <MetricTile tile={tiles[0]} x={10} y={52} w={58} />
            <MetricTile tile={tiles[1]} x={76} y={52} w={58} />
            <MetricTile tile={tiles[2]} x={10} y={92} w={58} />
            <MetricTile tile={tiles[3]} x={76} y={92} w={58} />
          </>
        ) : (
          <>
            <MetricTile tile={tiles[0]} x={8} y={46} w={64} />
            <MetricTile tile={tiles[1]} x={78} y={46} w={64} />
          </>
        )}
      </div>
      {isWeb ? <Line x={10} y={146} width={120} color="#7FA8F5">{counter}</Line> : <Line x={10} y={92} width={130} color="#7E8DA6">{phase === 'offline' ? 'offline' : 'VRAM, GPU: n/a'}</Line>}
      {!up ? <NoAgentTag right={8} top={isWeb ? 166 : 106} /> : null}
    </Frame>
  );
}

const LINE_TONE = { strong: { color: '#E6EDF7', size: 11, weight: 600 }, accent: { color: '#C4B5FD', size: 10, weight: 400 }, muted: { color: '#8A9BB5', size: 10, weight: 400 }, dim: { color: '#7E8DA6', size: 10, weight: 400 } } as const;

function AiNode({ id }: { id: 'llama-server' | 'comfyui' | 'embedder' }) {
  const { phase, selected, up } = useNode(id, id);
  const { tiles } = useTiles(id);
  const models = useDashboard((s) => s.topology?.nodes.find((n) => n.id === id)?.models ?? null);
  const chipKey = useDashboard((s) => aiChip(id, phase, s.metrics.sample?.containers[id], agentUp(s.metrics, s.now)));
  const last = useDashboard((s) => {
    const node = s.nodes[id];
    return lastLine(node?.lastSummary ?? null, node?.lastTs ?? null, phase);
  });
  const lines = modelLines(id, models);
  const gpu = id !== 'embedder';
  const tilesY = id === 'llama-server' ? 80 : id === 'comfyui' ? 94 : 68;
  const lineY = [30, 46, 60, 74];
  const chip = chipKey ? CHIP_STYLE[chipKey] : null;
  return (
    <Frame id={id} phase={phase} selected={selected}>
      <Header id={id} height={24} size={12}>
        <span className="bm-micro absolute rounded-full px-[7px] font-bold" style={{ right: chip ? 84 : 20, top: 4, lineHeight: '16px', background: gpu ? '#4C1D95' : '#164E63', color: gpu ? '#DDD6FE' : '#A5F3FC' }}>{gpu ? 'GPU' : 'CPU'}</span>
        {chip && chipKey ? (
          <span data-testid={`chip-${id}`} className="bm-micro absolute rounded-full text-center font-bold" style={{ right: 6, top: 4, width: 70, lineHeight: '14px', background: chip.bg, border: `1px solid ${chip.stroke}`, color: chip.color }}>{chipKey}</span>
        ) : null}
      </Header>
      <div data-testid={`models-${id}`}>
        {lines.map((line, i) => (
          <Line key={line.text} x={12} y={lineY[i]} width={288} {...LINE_TONE[line.tone]}>{line.text}</Line>
        ))}
      </div>
      <div data-testid={`widget-${id}`} {...widgetData(tiles)}>
        {tiles.map((tile, i) => (
          // Scaled down, `GPU` plus the APPROX tag at 9 px effective is wider than a tile: the four tiles close up (pitch 74 at 100 %) so the tag stays inside the node.
          <MetricTile key={tile.metric} tile={tile} x={`calc(12px + ${i} * (74px - 15px * var(--bm-micro-grow)))`} y={tilesY} w="calc(68px - 15px * var(--bm-micro-grow))" />
        ))}
      </div>
      {id !== 'embedder' ? <Line x={12} y={id === 'llama-server' ? 120 : 136} width={up ? 288 : 226} color={phase === 'error' ? '#FCA5A5' : '#8A9BB5'}>{last}</Line> : null}
      {!up ? <NoAgentTag right={8} top={id === 'embedder' ? 46 : id === 'llama-server' ? 120 : 136} /> : null}
    </Frame>
  );
}

function ClientNode({ id }: { id: DiagnosticsNodeId }) {
  const { phase, selected } = useNode(id, null);
  return (
    <Frame id={id} phase={phase} selected={selected}>
      <Header id={id} height={24} size={11} />
      <Line x={10} y={32} width={92} color="#8A9BB5">{NODE_META[id].sub}</Line>
      <div data-testid={`widget-${id}`} data-cpu="n/a" data-ram="n/a" data-vram="n/a" data-gpu="n/a">
        <Line x={10} y={54} width={92} color="#7E8DA6">metrics: n/a</Line>
      </div>
      <Line x={10} y={72} width={92} color="#7FA8F5">portrait app</Line>
    </Frame>
  );
}

export const BlueprintNode = memo(function BlueprintNode({ id }: NodeProps) {
  const nodeId = id as DiagnosticsNodeId;
  const kind = NODE_META[nodeId].kind;
  if (kind === 'module') return <ModuleNode id={nodeId} />;
  if (kind === 'client') return <ClientNode id={nodeId} />;
  if (kind === 'ai-gpu' || kind === 'ai-cpu') return <AiNode id={nodeId as 'llama-server' | 'comfyui' | 'embedder'} />;
  return <ContainerNode id={nodeId} />;
});

export const CommentBoxNode = memo(function CommentBoxNode({ id }: NodeProps) {
  const group = id.replace(/^box-/, '') as keyof typeof COMMENT_BOXES;
  const rect = COMMENT_BOXES[group];
  const style = COMMENT_BOX_STYLE[group];
  const api = group === 'api';
  return (
    <div data-testid={`box-${group}`} className="pointer-events-none" style={{ width: rect.w, height: rect.h, background: style.bg, border: `1px solid ${style.stroke}`, borderRadius: style.radius }}>
      <span className="absolute font-bold" style={{ left: api ? 16 : 12, top: api ? 12 : 8, fontSize: api ? 12 : 11, lineHeight: api ? '16px' : '14px', color: style.color }}>{style.title}</span>
    </div>
  );
});

/** The single widget of the API container: its values are shared by the 14 modules (decision OQ-2). */
export const ApiWidgetNode = memo(function ApiWidgetNode() {
  const { tiles, up } = useTiles('api');
  const pos = [
    { x: 10, y: 28, w: 50 },
    { x: 68, y: 28, w: 54 },
    { x: 10, y: 62, w: 50 },
    { x: 68, y: 62, w: 54 },
  ];
  return (
    // Scaled down, the one-line title is wider than the design rect: the card widens with it (0 at 100 %, free space to its right in the API box).
    <div data-testid="widget-api" {...widgetData(tiles)} className="relative" style={{ width: `calc(${API_WIDGET_RECT.w}px + 44px * var(--bm-micro-grow))`, height: API_WIDGET_RECT.h, background: '#101A2B', border: '1px solid #0F5456', borderRadius: 8 }}>
      <span data-testid="widget-api-title" className="bm-micro absolute font-bold" style={{ left: 10, top: 8, color: '#5EEAD4' }}>API TOTALS · shared</span>
      {tiles.map((tile, i) => (
        <MetricTile key={tile.metric} tile={tile} {...pos[i]} bar={false} />
      ))}
      {!up ? <NoAgentTag right={6} top={-7} /> : null}
    </div>
  );
});
