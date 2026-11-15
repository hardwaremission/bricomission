import { readFileSync } from 'node:fs';
import type { DiagnosticsTopology } from '@bricomission/shared-types';
import { describe, expect, it } from 'vitest';
import { API_WIDGET_RECT, CANVAS, COMMENT_BOXES, EDGES, EDGE_BY_ID, GUTTERS, LEGEND_RECT, NODE_IDS, NODE_META, NODE_RECTS, checkTopology, pinsOf, splitEdgeId, type Rect } from '../src/graph/layout.ts';
import { fitViewport, isOrthogonal, packetDurationMs, pathData, pointAt, polylineLength, segmentCrossesRect, segmentsOf } from '../src/graph/routing.ts';

const topology = JSON.parse(readFileSync(new URL('./fixtures/topology.json', import.meta.url), 'utf8')) as DiagnosticsTopology;

describe('layout reference', () => {
  it('is a byte copy of the approved design export', () => {
    const design = readFileSync(new URL('../../../design/openpencil/diagnostics-dashboard/layout-reference.json', import.meta.url), 'utf8');
    const local = readFileSync(new URL('../src/graph/layout-reference.json', import.meta.url), 'utf8');
    expect(local).toBe(design);
  });

  it('has the 23 nodes, 24 edges and 6 comment boxes of the design', () => {
    expect(NODE_IDS).toHaveLength(23);
    expect(EDGES).toHaveLength(24);
    expect(Object.keys(COMMENT_BOXES)).toEqual(['client', 'web', 'api', 'identity_mail', 'ai_inference', 'data']);
    expect(CANVAS).toEqual({ w: 1360, h: 1024 });
  });

  it('matches the API topology: every id has a layout, no layout id is unknown, kinds and pin types agree', () => {
    expect(checkTopology(topology)).toEqual([]);
  });

  it('reports a topology node without layout and a layout node the topology does not know', () => {
    const extra = { ...topology, nodes: [...topology.nodes.slice(1), { ...topology.nodes[0], id: 'new-module' as never }] };
    const problems = checkTopology(extra);
    expect(problems).toContain('topology node new-module has no layout');
    expect(problems).toContain('layout node browser is unknown to the topology');
    const fewer = { ...topology, edges: topology.edges.slice(1) };
    expect(checkTopology(fewer)).toEqual([`layout edge ${topology.edges[0].id} is unknown to the topology`]);
  });

  it('splits edge names whose node ids contain dashes', () => {
    expect(splitEdgeId('api-guards-simulation-runner')).toEqual({ from: 'api-guards', to: 'simulation-runner' });
    expect(splitEdgeId('residency-hook-llama-server')).toEqual({ from: 'residency-hook', to: 'llama-server' });
    expect(splitEdgeId('nope-web')).toBeNull();
  });

  it('keeps every node inside its comment box and inside the canvas', () => {
    for (const id of NODE_IDS) {
      const rect = NODE_RECTS[id];
      const box = COMMENT_BOXES[NODE_META[id].group];
      expect(rect.x, id).toBeGreaterThanOrEqual(box.x);
      expect(rect.y, id).toBeGreaterThanOrEqual(box.y);
      expect(rect.x + rect.w, id).toBeLessThanOrEqual(box.x + box.w);
      expect(rect.y + rect.h, id).toBeLessThanOrEqual(box.y + box.h);
      expect(rect.x + rect.w, id).toBeLessThanOrEqual(CANVAS.w);
      expect(rect.y + rect.h, id).toBeLessThanOrEqual(CANVAS.h);
    }
  });
});

describe('routing rule (normative)', () => {
  it('uses only horizontal and vertical segments', () => {
    for (const edge of EDGES) expect(isOrthogonal(edge.points), edge.id).toBe(true);
  });

  it('never passes over or under a node: every routed segment against every node box, zero crossings', () => {
    const crossings: string[] = [];
    let checked = 0;
    for (const edge of EDGES) {
      for (const segment of segmentsOf(edge.points)) {
        for (const id of NODE_IDS) {
          checked += 1;
          if (segmentCrossesRect(segment, NODE_RECTS[id])) crossings.push(`${edge.id} crosses ${id}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(24 * 23);
    expect(crossings).toEqual([]);
  });

  it('never passes over the API totals widget, the legend card or a comment-box title', () => {
    const obstacles: Record<string, Rect> = { 'api-widget': API_WIDGET_RECT, legend: LEGEND_RECT };
    // Title strips: the text starts 12 px (API: 16 px) inside the box and is at most 150 px wide and 16 px high.
    for (const [group, box] of Object.entries(COMMENT_BOXES)) {
      const inset = group === 'api' ? { x: 16, y: 12, h: 16 } : { x: 12, y: 8, h: 14 };
      obstacles[`title-${group}`] = { x: box.x + inset.x, y: box.y + inset.y, w: Math.min(150, box.w - 2 * inset.x), h: inset.h };
    }
    const crossings: string[] = [];
    for (const edge of EDGES) {
      for (const segment of segmentsOf(edge.points)) {
        for (const [name, rect] of Object.entries(obstacles)) {
          if (segmentCrossesRect(segment, rect)) crossings.push(`${edge.id} crosses ${name}`);
        }
      }
    }
    expect(crossings).toEqual([]);
  });

  it('starts on the right border of the source and ends on the left border of the target', () => {
    for (const edge of EDGES) {
      const source = NODE_RECTS[edge.from];
      const target = NODE_RECTS[edge.to];
      const first = edge.points[0];
      const last = edge.points[edge.points.length - 1];
      expect(first[0], edge.id).toBe(source.x + source.w);
      expect(first[1], edge.id).toBeGreaterThan(source.y);
      expect(first[1], edge.id).toBeLessThan(source.y + source.h);
      expect(last[0], edge.id).toBe(target.x);
      expect(last[1], edge.id).toBeGreaterThan(target.y);
      expect(last[1], edge.id).toBeLessThan(target.y + target.h);
    }
  });

  it('keeps the two long edges straight (data-access to postgres, storage-client to minio)', () => {
    for (const id of ['data-access-postgres', 'storage-client-minio']) {
      const points = EDGE_BY_ID[id].points;
      expect(points, id).toHaveLength(2);
      expect(points[0][1], id).toBe(points[1][1]);
    }
    // Every edge whose pins align is straight too.
    for (const edge of EDGES) {
      const first = edge.points[0];
      const last = edge.points[edge.points.length - 1];
      if (first[1] === last[1]) expect(edge.points, edge.id).toHaveLength(2);
    }
  });

  it('runs vertical lanes only in the gutters or the outer channels, at most 5 per gutter', () => {
    const lanes = new Map<string, Set<number>>();
    for (const edge of EDGES) {
      for (const { a, b } of segmentsOf(edge.points)) {
        if (a[0] !== b[0]) continue;
        const gutter = Object.entries(GUTTERS).find(([, [from, to]]) => a[0] > from && a[0] < to);
        expect(gutter, `${edge.id} vertical at x=${a[0]}`).toBeDefined();
        const set = lanes.get(gutter![0]) ?? new Set<number>();
        set.add(a[0]);
        lanes.set(gutter![0], set);
      }
    }
    for (const [name, set] of lanes) expect(set.size, name).toBeLessThanOrEqual(5);
  });

  it('shares the first segment between lines that start at the same pin', () => {
    const starts = new Map<string, number>();
    for (const edge of EDGES) {
      const key = `${edge.from}:${edge.points[0][1]}`;
      starts.set(key, (starts.get(key) ?? 0) + 1);
    }
    expect(starts.get('api-guards:459')).toBe(5);
    expect(pinsOf('api-guards').filter((p) => p.side === 'out')).toHaveLength(1);
  });
});

describe('pins and geometry helpers', () => {
  it('derives typed pins from the polylines (inputs left, outputs right)', () => {
    expect(pinsOf('web').map((p) => `${p.side}:${p.type}@${p.y}`)).toEqual(['out:http@60', 'out:auth@90', 'in:http@100', 'out:sql@110']);
    expect(pinsOf('keycloak').map((p) => `${p.side}:${p.type}@${p.y}`)).toEqual(['in:auth@38', 'in:auth@50', 'out:mail@60']);
    expect(pinsOf('llama-server').map((p) => p.type)).toEqual(['llm', 'llm']);
    for (const id of NODE_IDS) expect(pinsOf(id).length, id).toBeGreaterThan(0);
  });

  it('measures polylines and finds points along them', () => {
    const points = EDGE_BY_ID['web-api-guards'].points;
    expect(polylineLength(points)).toBe(20 + 39 + 20);
    expect(pointAt(points, 0)).toEqual([296, 420]);
    expect(pointAt(points, 1)).toEqual([336, 459]);
    expect(pointAt(points, 0.5)).toEqual([316, 439.5]);
    expect(pathData(points)).toBe('M296 420 L316 420 L316 459 L336 459');
    expect(packetDurationMs(40)).toBe(600);
    expect(packetDurationMs(5000)).toBe(1800);
  });

  it('fits the graph at 1:1 on the 1920 layout and about 0.7 on the smaller ones', () => {
    expect(fitViewport(1360, 1024, 1360, 1024)).toEqual({ zoom: 1, x: 0, y: 0 });
    const collapsed = fitViewport(1876, 1024, 1360, 1024);
    expect(collapsed.zoom).toBe(1);
    expect(collapsed.x).toBe(258);
    expect(fitViewport(960, 1024, 1360, 1024).zoom).toBeCloseTo(0.706, 2);
    expect(fitViewport(966, 712, 1360, 1024).zoom).toBeCloseTo(0.695, 2);
  });
});
