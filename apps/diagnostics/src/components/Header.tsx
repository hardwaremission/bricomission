'use client';

import { Activity, Gauge, KeyRound, LayoutList, Loader, PowerOff, RotateCcw, Scan } from 'lucide-react';
import { METRIC_COLOR } from '../graph/tokens.ts';
import { statusChip, type StatusChip } from '../lib/state/connection-state.ts';
import { agentUp, hostTiles, type HostTile } from '../lib/state/metrics-state.ts';
import { actions, useDashboard } from '../lib/store.ts';
import { FIT_EVENT } from './Graph.tsx';

const CHIP: Record<StatusChip, { bg: string; stroke: string; color: string; icon: React.ReactNode }> = {
  LIVE: { bg: '#0F2A1E', stroke: '#1F6B45', color: '#86EFAC', icon: <span className="block h-2 w-2 rounded-full" style={{ background: '#4ADE80' }} /> },
  RECONNECTING: { bg: '#2A2508', stroke: '#7A5C1A', color: '#FDE68A', icon: <Loader size={14} color="#FACC15" className="bm-spin" /> },
  'API DISABLED': { bg: '#1E293B', stroke: '#475569', color: '#CBD5E1', icon: <PowerOff size={14} color="#94A3B8" /> },
  'NO AGENT': { bg: '#1E293B', stroke: '#475569', color: '#CBD5E1', icon: <Gauge size={14} color="#94A3B8" /> },
  REPLAY: { bg: '#1E1740', stroke: '#4C1D95', color: '#DDD6FE', icon: <RotateCcw size={14} color="#C4B5FD" /> },
  'TOKEN MISMATCH': { bg: '#2A1017', stroke: '#7F1D1D', color: '#FECACA', icon: <KeyRound size={14} color="#FCA5A5" /> },
};

function HostStat({ tile, width }: { tile: HostTile; width: number }) {
  return (
    <div className="flex flex-col gap-1" style={{ width }} data-testid={`host-${tile.metric}`} data-value={tile.text}>
      <div className="flex w-full justify-between">
        <span className="font-semibold text-muted" style={{ fontSize: 11, lineHeight: '14px' }}>{tile.label}</span>
        <span className="font-mono font-semibold" style={{ fontSize: 11, lineHeight: '14px', color: tile.tone === 'na' || tile.tone === 'noagent' ? '#7E8DA6' : tile.tone === 'high' ? '#FCA5A5' : '#E6EDF7' }}>{tile.text}</span>
      </div>
      <div className="h-1 w-full rounded-full" style={{ background: '#16233A' }}>
        <div className="h-1 rounded-full" style={{ width: `${Math.round(tile.fill * 100)}%`, minWidth: tile.fill > 0 ? 2 : 0, background: tile.tone === 'high' ? '#EF4444' : METRIC_COLOR[tile.metric] }} />
      </div>
    </div>
  );
}

export function useStatusChip(): StatusChip {
  return useDashboard((s) => statusChip(s.conn, agentUp(s.metrics, s.now)));
}

export function Header() {
  const chipName = useStatusChip();
  const hostKey = useDashboard((s) => JSON.stringify(hostTiles(s.metrics.sample?.host, agentUp(s.metrics, s.now))));
  const legendOpen = useDashboard((s) => s.legendOpen);
  const tiles = JSON.parse(hostKey) as HostTile[];
  const chip = CHIP[chipName];
  const widths = [120, 150, 150, 120];
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line-panel bg-panel px-5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
          <Activity size={16} color="#FFFFFF" />
        </span>
        <span className="font-bold text-strong" style={{ fontSize: 16, lineHeight: '20px' }}>BricoMission</span>
        <span className="flex h-6 items-center rounded-full border border-line bg-chip px-[10px] font-semibold text-chip-text" style={{ fontSize: 12, lineHeight: '16px' }}>DIAGNOSTICS</span>
      </div>
      <div className="flex items-center gap-6" data-testid="host-strip" title="Host totals (exact): CPU share of all threads, RAM, VRAM and GPU busy % of the card">
        {tiles.map((tile, i) => (
          <HostStat key={tile.metric} tile={tile} width={widths[i]} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="status-chip" data-status={chipName} role="status" className="flex h-7 items-center gap-2 rounded-full px-3 font-bold" style={{ background: chip.bg, border: `1px solid ${chip.stroke}`, color: chip.color, fontSize: 12, lineHeight: '16px' }}>
          {chip.icon}
          {chipName}
        </span>
        <button type="button" data-testid="legend-button" aria-pressed={legendOpen} onClick={() => actions.setLegend(!legendOpen)} className="flex h-8 items-center gap-2 rounded-lg border border-line bg-chip px-3 font-semibold text-strong" style={{ fontSize: 13, lineHeight: '18px' }}>
          <LayoutList size={16} color="#9DB4D8" />
          Legend
        </button>
        <button type="button" data-testid="fit-button" aria-label="Fit the graph to the canvas" title="Fit view" onClick={() => window.dispatchEvent(new Event(FIT_EVENT))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-chip">
          <Scan size={16} color="#9DB4D8" />
        </button>
      </div>
    </header>
  );
}
