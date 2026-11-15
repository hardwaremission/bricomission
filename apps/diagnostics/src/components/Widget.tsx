'use client';

import { METRIC_COLOR } from '../graph/tokens.ts';
import type { Tile } from '../lib/state/metrics-state.ts';

const VALUE_COLOR = { normal: '#E6EDF7', high: '#FCA5A5', na: '#7E8DA6', noagent: '#64748B' } as const;

/**
 * One metric tile (N1): 9 px label, 12 px mono value, 3 px bar in the metric colour. `bar={false}` is the compact API totals variant.
 * Below 100 % zoom the label grows (globals.css, `.bm-micro`), so the value, the bar and the tile height move down by
 * `--bm-tile-shift` (0 at 100 %): the label line always ends above the value.
 */
export function MetricTile({ tile, x, y, w, bar = true }: { tile: Tile; x: number | string; y: number; w: number | string; bar?: boolean }) {
  return (
    <div className="absolute" style={{ left: x, top: y, width: w, height: 'calc(34px + var(--bm-tile-shift))' }} data-metric={tile.metric} data-tone={tile.tone}>
      <div className="flex items-center gap-1" data-testid="tile-label">
        <span className="bm-micro font-semibold" style={{ color: tile.tone === 'high' ? '#FCA5A5' : '#8A9BB5' }}>{tile.label}</span>
        {tile.tag === 'APPROX' ? (
          <span data-testid="tile-approx" className="bm-micro-tag rounded-[3px] px-[3px] font-bold" style={{ background: '#2A2508', color: '#FACC15' }} title="Estimate: the card-wide GPU busy % attributed to this container">APPROX</span>
        ) : null}
      </div>
      <div data-testid="tile-value" className="absolute left-0 whitespace-nowrap font-mono font-bold" style={{ top: 'calc(11px + var(--bm-tile-shift))', fontSize: 12, lineHeight: '15px', color: VALUE_COLOR[tile.tone] }}>{tile.text}</div>
      {bar ? (
        <div className="absolute left-0 rounded-full" style={{ top: 'calc(29px + var(--bm-tile-shift))', width: 'calc(100% - 6px)', height: 3, background: '#16233A' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.round(tile.fill * 100)}%`, minWidth: tile.fill > 0 ? 2 : 0, background: tile.tone === 'high' ? '#EF4444' : METRIC_COLOR[tile.metric] }} />
        </div>
      ) : null}
    </div>
  );
}

export function widgetData(tiles: Tile[]): Record<string, string> {
  return Object.fromEntries(tiles.map((t) => [`data-${t.metric}`, t.text]));
}

export function NoAgentTag({ right, top }: { right: number; top: number }) {
  return (
    <span className="absolute rounded-[4px] px-[5px] font-bold" style={{ right, top, background: '#1E293B', color: '#94A3B8', fontSize: 8, lineHeight: '13px' }}>NO AGENT</span>
  );
}
