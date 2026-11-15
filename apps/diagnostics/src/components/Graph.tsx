'use client';

import type { DiagnosticsNodeId } from '@bricomission/shared-types';
import { ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import { API_WIDGET_RECT, CANVAS, COMMENT_BOXES, EDGES, NODE_IDS, NODE_META, NODE_RECTS } from '../graph/layout.ts';
import { fitViewport } from '../graph/routing.ts';
import { actions } from '../lib/store.ts';
import { ApiWidgetNode, BlueprintNode, CommentBoxNode } from './BlueprintNode.tsx';
import { OrthoEdge } from './OrthoEdge.tsx';

// Stable identities (spike A3): the arrays never change; live state reaches nodes and edges through the store.
const nodeTypes = { blueprint: BlueprintNode, box: CommentBoxNode, apiWidget: ApiWidgetNode };
const edgeTypes = { ortho: OrthoEdge };

const fixed = { draggable: false, connectable: false, deletable: false, selectable: false } as const;

const NODES: Node[] = [
  ...Object.entries(COMMENT_BOXES).map(([group, rect]) => ({ id: `box-${group}`, type: 'box', position: { x: rect.x, y: rect.y }, data: {}, zIndex: -1, focusable: false, ...fixed })),
  { id: 'api-widget', type: 'apiWidget', position: { x: API_WIDGET_RECT.x, y: API_WIDGET_RECT.y }, data: {}, focusable: false, ...fixed },
  ...NODE_IDS.map((id) => ({
    id,
    type: 'blueprint',
    position: { x: NODE_RECTS[id].x, y: NODE_RECTS[id].y },
    data: {},
    className: 'bm-clickable',
    ariaLabel: `${NODE_META[id].title}: select to filter the log`,
    ...fixed,
  })),
];

const GRAPH_EDGES: Edge[] = EDGES.map((edge) => ({ id: edge.id, source: edge.from, target: edge.to, type: 'ortho', focusable: false, selectable: false, deletable: false }));

export const FIT_EVENT = 'bm-fit-view';

function Flow() {
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const fit = useCallback(() => {
    const el = wrapper.current;
    if (!el || el.clientWidth === 0) return;
    const viewport = fitViewport(el.clientWidth, el.clientHeight, CANVAS.w, CANVAS.h);
    el.style.setProperty('--bm-zoom', String(viewport.zoom));
    void flow.setViewport(viewport);
  }, [flow]);

  // The graph always starts in fit view and recentres whenever the canvas changes size (log collapse, window resize).
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    window.addEventListener(FIT_EVENT, fit);
    return () => {
      observer.disconnect();
      window.removeEventListener(FIT_EVENT, fit);
    };
  }, [fit]);

  return (
    <div ref={wrapper} className="bm-graph h-full w-full" data-testid="graph">
      <ReactFlow
        nodes={NODES}
        edges={GRAPH_EDGES}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={fit}
        onViewportChange={(viewport) => wrapper.current?.style.setProperty('--bm-zoom', String(viewport.zoom))}
        onNodeClick={(_, node) => {
          if (node.type === 'blueprint') actions.select(node.id as DiagnosticsNodeId);
        }}
        onPaneClick={() => actions.select(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        minZoom={0.3}
        maxZoom={2}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
      />
    </div>
  );
}

export function Graph() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
