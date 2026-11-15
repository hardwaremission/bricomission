'use client';

import type { EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { EDGE_BY_ID } from '../graph/layout.ts';
import { packetDurationMs, pathData, pointAt, polylineLength } from '../graph/routing.ts';
import { PIN_COLOR } from '../graph/tokens.ts';
import { edgeView, type EdgePhase } from '../lib/state/edge-state.ts';
import { useDashboard } from '../lib/store.ts';

const PACKET = 24;

/**
 * One connection, drawn on the design polyline (never on React Flow's own path). Idle 2 px grey; active 3 px
 * in the pin-type colour with a white packet travelling source to target; response green with the packet
 * coming back, fading over 1 s; simulated dashed; error red with an X at the midpoint. No blur or glow.
 */
export const OrthoEdge = memo(function OrthoEdge({ id }: EdgeProps) {
  const edge = EDGE_BY_ID[id];
  const key = useDashboard((s) => {
    const view = edgeView(s.edges[id], s.now);
    const dashed = view.simulated || (s.conn.source === 'replay' && view.phase !== 'idle');
    return `${view.phase}|${view.direction}|${dashed ? 1 : 0}|${s.edges[id]?.lastSeq ?? ''}|${s.conn.phase === 'open' && s.conn.api !== 'reconnecting' ? 0 : 1}`;
  });
  if (!edge) return null;
  const [phase, direction, dashed, lastSeq, dim] = key.split('|') as [EdgePhase, 'forward' | 'reverse', string, string, string];
  const d = pathData(edge.points);
  const length = polylineLength(edge.points);
  const lit = phase !== 'idle';
  const color = phase === 'idle' ? '#2A3A55' : phase === 'error' ? '#EF4444' : phase === 'response' ? '#4ADE80' : phase === 'recent' ? '#3B5A9A' : PIN_COLOR[edge.kind];
  const moving = phase === 'active' || phase === 'response';
  const forward = direction === 'forward';
  const mid = pointAt(edge.points, 0.5);
  return (
    <g
      data-testid={`edge-${id}`}
      data-active={moving ? 'true' : 'false'}
      data-kind={edge.kind}
      data-last-seq={lastSeq}
      data-phase={phase}
      data-direction={direction}
      data-simulated={dashed === '1' ? 'true' : 'false'}
      opacity={dim === '1' ? 0.45 : 1}
    >
      <path
        key={phase}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={lit ? 3 : 2}
        strokeLinejoin="round"
        strokeDasharray={lit && dashed === '1' ? '7 5' : undefined}
        className={phase === 'response' ? 'bm-response' : undefined}
      />
      {moving ? (
        <>
          <path
            key={`${phase}${direction}`}
            d={d}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={4}
            strokeLinejoin="round"
            strokeDasharray={`${PACKET} ${length + PACKET}`}
            className="bm-packet"
            style={{
              ['--bm-from' as string]: forward ? `${PACKET}px` : `${-length}px`,
              ['--bm-to' as string]: forward ? `${-length}px` : `${PACKET}px`,
              animationDuration: `${packetDurationMs(length)}ms`,
            }}
          />
          <g className="bm-marks">
            {[0.25, 0.5, 0.75].map((f) => {
              const [x, y] = pointAt(edge.points, f);
              return <rect key={f} x={x - 3} y={y - 3} width={6} height={6} fill="#FFFFFF" />;
            })}
          </g>
        </>
      ) : null}
      {phase === 'error' ? (
        <g stroke="#FFFFFF" strokeWidth={2} strokeLinecap="square">
          <line x1={mid[0] - 5} y1={mid[1] - 5} x2={mid[0] + 5} y2={mid[1] + 5} />
          <line x1={mid[0] - 5} y1={mid[1] + 5} x2={mid[0] + 5} y2={mid[1] - 5} />
        </g>
      ) : null}
    </g>
  );
});
