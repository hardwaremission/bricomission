'use client';

import type { DiagnosticsEvent, DiagnosticsKind, DiagnosticsNodeId } from '@bricomission/shared-types';
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronUp, Ellipsis, GitCommitHorizontal, PanelRightClose, PanelRightOpen, Pause, Play, Radio, Terminal, Trash2, X } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NODE_META } from '../graph/layout.ts';
import { CATEGORY, CHIP_KINDS, KIND_BADGE_BG, KIND_COLOR, KINDS, nodeCategory } from '../graph/tokens.ts';
import { bufferCount } from '../lib/state/connection-state.ts';
import { formatDuration, formatTime, groupDurationMs, groupSummary, isFiltered, visibleRows, type EventRow, type LogRow } from '../lib/state/log-state.ts';
import { actions, useDashboard } from '../lib/store.ts';
import { useStatusChip } from './Header.tsx';
import { PayloadView } from './PayloadView.tsx';

const PAGE = 300;
const iconButton = 'flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-chip';

function NodeChip({ id }: { id: DiagnosticsNodeId }) {
  const category = CATEGORY[nodeCategory(id)];
  return (
    <span className="flex h-5 shrink-0 items-center rounded-full px-2 font-semibold" style={{ background: category.chipBg, color: category.chipText, fontSize: 11, lineHeight: '14px' }}>
      {NODE_META[id]?.title === 'Browser PWA' ? 'browser' : id}
    </span>
  );
}

function Tag({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span className="flex h-4 shrink-0 items-center rounded-[4px] px-[6px] font-bold" style={{ background: bg, color, fontSize: 9, lineHeight: '12px' }}>{children}</span>
  );
}

const EventLine = memo(function EventLine({ row, live, expanded, onToggle }: { row: EventRow; live: boolean; expanded: boolean; onToggle: (key: string) => void }) {
  const event = row.event;
  const group = row.children.length > 1;
  const failed = row.children.some((c) => c.ok === false);
  const response = event.span?.phase === 'end';
  const duration = group ? groupDurationMs(row.children) : (event.durationMs ?? null);
  const color = failed ? '#EF4444' : KIND_COLOR[event.kind];
  const summary = group ? groupSummary(row.children) : event.summary;
  // A response is narrated in the direction it travels: the end event repeats from/to of its request.
  const from = response ? event.to : event.from;
  const to = response ? event.from : event.to;
  const self = event.from === event.to;
  const stroke = failed ? '#7F1D1D' : live ? '#5B9BFF' : expanded ? '#2A3A55' : 'transparent';
  return (
    <div
      data-testid={`log-line-${event.id}`}
      data-from={event.from}
      data-to={event.to}
      data-kind={event.kind}
      data-phase={event.span?.phase ?? 'single'}
      data-correlation={event.correlationId}
      data-count={row.children.length}
      className="flex w-full shrink-0 overflow-hidden rounded-lg"
      style={{ background: failed ? '#1A1017' : '#101A2B', border: `1px solid ${stroke}`, minHeight: 58 }}
    >
      <span className="shrink-0 self-stretch rounded-[2px]" style={{ width: 3, background: color }} />
      <div className="flex min-w-0 flex-1 flex-col gap-[5px] px-[10px] py-2">
        <button type="button" className="flex w-full items-center gap-[6px] text-left" aria-expanded={expanded} onClick={() => onToggle(row.key)}>
          <span className="shrink-0 font-mono" style={{ color: failed ? '#FCA5A5' : live ? '#7FB0FF' : '#64748B', fontSize: 10, lineHeight: '13px' }}>{formatTime(event.ts)}</span>
          <NodeChip id={from} />
          {self ? null : (
            <>
              <ArrowRight size={12} color="#64748B" className="shrink-0" />
              <NodeChip id={to} />
            </>
          )}
          <span className="min-w-0 flex-1" />
          {duration !== null ? <span className="shrink-0 font-mono" style={{ color: failed ? '#FCA5A5' : '#8A9BB5', fontSize: 10, lineHeight: '13px' }}>{formatDuration(duration)}</span> : null}
          {live ? (
            <span className="flex shrink-0 items-center gap-1 font-bold" style={{ color: '#7FB0FF', fontSize: 9, lineHeight: '12px' }}>
              <span className="block h-2 w-2 rounded-full" style={{ background: '#5B9BFF' }} />
              NOW
            </span>
          ) : null}
          {event.correlationId === 'system' && !event.inferred ? <Tag bg="#1E293B" color="#94A3B8">SYSTEM</Tag> : null}
          {event.inferred ? <Tag bg="#1E293B" color="#94A3B8">INFERRED</Tag> : null}
          {event.simulated ? <Tag bg="#1E1740" color="#C4B5FD">SIMULATED</Tag> : null}
          {failed ? <Tag bg="#7F1D1D" color="#FEE2E2">FAILED</Tag> : <Tag bg={KIND_BADGE_BG[event.kind]} color={KIND_COLOR[event.kind]}>{event.kind.toUpperCase()}{group ? ` x${row.children.length}` : ''}</Tag>}
          {expanded ? <ChevronUp size={14} color="#9DB4D8" className="shrink-0" /> : <ChevronDown size={14} color="#9DB4D8" className="shrink-0" />}
        </button>
        <span className={expanded ? 'w-full break-words' : 'w-full truncate'} style={{ color: failed ? '#FCA5A5' : expanded || live ? '#E6EDF7' : '#CBD5E1', fontSize: 12, lineHeight: '16px', fontWeight: failed || expanded || live ? 600 : 400 }} data-testid="log-summary">
          {response && !failed ? 'reply · ' : ''}{summary}
        </span>
        {expanded ? (
          group ? (
            <div className="flex flex-col gap-2">
              {row.children.map((child) => (
                <ChildPayload key={child.id} event={child} />
              ))}
            </div>
          ) : (
            <PayloadView payload={event.payload} />
          )
        ) : null}
      </div>
    </div>
  );
});

function ChildPayload({ event }: { event: DiagnosticsEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="flex items-center gap-2 text-left font-mono" style={{ color: '#CBD5E1', fontSize: 11, lineHeight: '15px' }} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span style={{ color: '#64748B' }}>{formatTime(event.ts)}</span>
        <span className="min-w-0 flex-1 truncate">{event.summary}</span>
        {typeof event.durationMs === 'number' ? <span style={{ color: '#8A9BB5' }}>{formatDuration(event.durationMs)}</span> : null}
        {open ? <ChevronUp size={12} color="#9DB4D8" /> : <ChevronDown size={12} color="#9DB4D8" />}
      </button>
      {open ? <PayloadView payload={event.payload} /> : null}
    </div>
  );
}

function OtherRow({ row }: { row: Exclude<LogRow, EventRow> }) {
  if (row.type === 'thread') {
    return (
      <div className="flex w-full shrink-0 items-center gap-2" data-testid="log-thread" data-correlation={row.correlationId}>
        <span className="block h-px w-3" style={{ background: '#2A3A55' }} />
        <span className="flex h-5 min-w-0 items-center gap-[6px] rounded-full border border-line bg-chip px-2 font-mono font-bold text-chip-text" style={{ fontSize: 10, lineHeight: '13px' }}>
          <GitCommitHorizontal size={12} color="#9DB4D8" className="shrink-0" />
          <span className="truncate">{row.correlationId.slice(0, 6)} · {row.title} · {formatTime(row.ts).slice(0, 8)}</span>
        </span>
        <span className="block h-px min-w-3 flex-1" style={{ background: '#2A3A55' }} />
      </div>
    );
  }
  if (row.type === 'poll') {
    return (
      <div className="flex w-full shrink-0 items-center gap-2 rounded-lg border border-line-panel bg-panel px-[10px]" style={{ minHeight: 30 }} data-testid="log-poll" data-count={row.count}>
        <Ellipsis size={14} color="#64748B" className="shrink-0" />
        <span className="truncate text-muted" style={{ fontSize: 11, lineHeight: '14px' }} title={row.summaries.join(' · ')}>
          {row.count} poll event{row.count === 1 ? '' : 's'} grouped ({row.summaries[0]}{row.summaries.length > 1 ? ` and ${row.summaries.length - 1} more` : ''})
        </span>
      </div>
    );
  }
  const tone = row.tone === 'gap' ? '#FACC15' : row.tone === 'boot' ? '#C4B5FD' : '#9DB4D8';
  return (
    <div className="flex w-full shrink-0 items-center gap-2 rounded-lg border border-line-panel bg-panel px-[10px]" style={{ minHeight: 30 }} data-testid="log-marker" data-tone={row.tone}>
      <Ellipsis size={14} color={tone} className="shrink-0" />
      <span className="truncate" style={{ color: tone, fontSize: 11, lineHeight: '14px' }}>{row.text}</span>
    </div>
  );
}

function FilterRow() {
  const kinds = useDashboard((s) => s.kinds);
  const selected = useDashboard((s) => s.selected);
  const [menu, setMenu] = useState(false);
  const all = kinds.size === KINDS.length;
  const chip = 'flex h-[26px] shrink-0 items-center gap-[6px] rounded-full px-[10px]';
  const off = 'border border-line bg-chip font-semibold text-body';
  return (
    // One 44 px row when the chips fit (the design); they wrap to a second row in a narrower log (400 px at 1366 wide, or with the node chip).
    <div className="relative flex min-h-11 shrink-0 flex-wrap content-center items-center gap-2 border-b border-line-panel bg-panel px-4 py-2" data-testid="log-filters">
      <button type="button" data-testid="filter-all" aria-pressed={all} onClick={() => actions.allKinds()} className={`${chip} ${all ? 'bg-brand font-bold text-white' : off}`} style={{ fontSize: 11, lineHeight: '14px' }}>All</button>
      {CHIP_KINDS.map((kind) => {
        const on = !all && kinds.has(kind);
        return (
          <button key={kind} type="button" data-testid={`filter-${kind}`} aria-pressed={on} onClick={() => actions.toggleKind(kind)} className={`${chip} ${on ? 'border border-active bg-chip font-bold text-white' : off}`} style={{ fontSize: 11, lineHeight: '14px' }}>
            <span className="block h-2 w-2 rounded-full" style={{ background: KIND_COLOR[kind] }} />
            {kind}
          </button>
        );
      })}
      <button type="button" data-testid="filter-more" aria-expanded={menu} onClick={() => setMenu(!menu)} className={`${chip} ${off} gap-1`} style={{ fontSize: 11, lineHeight: '14px' }}>
        +{KINDS.length - CHIP_KINDS.length}
        <ChevronDown size={12} color="#9DB4D8" />
      </button>
      {selected ? (
        <button type="button" data-testid="filter-node" onClick={() => actions.select(null)} className={`${chip} border border-white bg-chip font-semibold text-white`} style={{ fontSize: 11, lineHeight: '14px' }} title="Clear the node filter (Esc)">
          {selected}
          <X size={12} color="#FFFFFF" />
        </button>
      ) : null}
      {menu ? (
        <div data-testid="filter-menu" className="absolute right-4 z-20 flex flex-col gap-[2px] rounded-[10px] border border-line bg-panel p-2" style={{ top: 'calc(100% - 4px)', width: 230, boxShadow: '0 8px 24px #00000066' }}>
          <span className="font-bold text-muted" style={{ fontSize: 10, lineHeight: '13px' }}>EVENT KINDS</span>
          {KINDS.map((kind: DiagnosticsKind) => {
            const on = kinds.has(kind);
            return (
              <button key={kind} type="button" role="checkbox" aria-checked={on} data-testid={`filter-opt-${kind}`} onClick={() => actions.setKind(kind, !on)} className="flex h-[30px] items-center gap-2 px-[6px] text-left">
                <span className="flex h-4 w-4 items-center justify-center rounded-[4px]" style={{ background: on ? '#2968EC' : 'transparent', border: on ? 'none' : '1px solid #2A3A55' }}>{on ? <Check size={11} color="#FFFFFF" /> : null}</span>
                <span className="block h-2 w-2 rounded-full" style={{ background: KIND_COLOR[kind] }} />
                <span className="text-body" style={{ fontSize: 12, lineHeight: '16px' }}>{kind}</span>
              </button>
            );
          })}
          <span className="text-muted" style={{ fontSize: 10, lineHeight: '14px' }}>Selecting a node in the graph also filters the log to the events that involve it (clear with Esc).</span>
        </div>
      ) : null}
    </div>
  );
}

function Rail() {
  const unread = useDashboard((s) => s.unread);
  const live = useStatusChip() === 'LIVE';
  return (
    <aside data-testid="log-panel" data-collapsed="true" className="flex h-full shrink-0 flex-col items-center gap-3 border-l border-line-panel bg-panel py-[10px]" style={{ width: 44 }}>
      <button type="button" data-testid="log-expand" aria-label="Expand the event log" onClick={() => actions.setCollapsed(false)} className={iconButton}>
        <PanelRightOpen size={14} color="#9DB4D8" />
      </button>
      {unread > 0 ? (
        <span data-testid="log-unread" className="flex h-5 items-center rounded-full bg-brand px-[7px] font-mono font-bold text-white" style={{ fontSize: 11, lineHeight: '14px' }}>+{unread > 999 ? '999' : unread}</span>
      ) : null}
      <span className="block h-2 w-2 rounded-full" style={{ background: live ? '#4ADE80' : '#475569' }} />
      <Terminal size={16} color="#64748B" />
      <span className="block h-[2px] w-5 rounded-full" style={{ background: '#2A3A55' }} />
      <span className="block h-[2px] w-[14px] rounded-full" style={{ background: '#2A3A55' }} />
      <span className="block h-[2px] w-5 rounded-full" style={{ background: '#2A3A55' }} />
      <span className="block h-[2px] w-4 rounded-full" style={{ background: unread > 0 ? '#5B9BFF' : '#2A3A55' }} />
    </aside>
  );
}

export function LogPanel({ width }: { width: number }) {
  const collapsed = useDashboard((s) => s.collapsed);
  return collapsed ? <Rail /> : <OpenLog width={width} />;
}

function OpenLog({ width }: { width: number }) {
  const rows = useDashboard((s) => s.log.rows);
  const total = useDashboard((s) => s.log.total);
  const kinds = useDashboard((s) => s.kinds);
  const selected = useDashboard((s) => s.selected);
  const paused = useDashboard((s) => s.paused);
  const held = useDashboard((s) => s.held.length);
  const buffer = useDashboard((s) => bufferCount(s.conn));
  const bufferSize = useDashboard((s) => s.conn.bufferSize);
  const chip = useStatusChip();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [following, setFollowing] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const filter = useMemo(() => ({ kinds, node: selected, allKinds: KINDS.length }), [kinds, selected]);
  const visible = useMemo(() => visibleRows(rows, filter), [rows, filter]);
  const shown = visible.length > limit ? visible.slice(visible.length - limit) : visible;
  const lastEventKey = useMemo(() => {
    for (let i = shown.length - 1; i >= 0; i -= 1) if (shown[i].type === 'event') return shown[i].key;
    return null;
  }, [shown]);

  // Follow mode: stay on the newest row unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [shown, following, expanded]);

  const toggle = useMemo(
    () => (key: string) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [],
  );

  const onScroll = (): void => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== following) setFollowing(atBottom);
  };

  const connected = chip === 'LIVE' || chip === 'NO AGENT' || chip === 'REPLAY';
  const streamText = chip === 'REPLAY' ? 'replay' : connected ? 'stream connected' : chip === 'RECONNECTING' ? 'stream reconnecting' : chip === 'API DISABLED' ? 'API stream disabled' : 'token rejected';
  return (
    <aside data-testid="log-panel" data-collapsed="false" className="flex h-full shrink-0 flex-col border-l border-line-panel bg-panel" style={{ width }}>
      <div className="flex shrink-0 items-center justify-between border-b border-line-panel px-4" style={{ height: 52 }}>
        <div className="flex items-center gap-[10px]">
          <Terminal size={16} color="#9DB4D8" />
          <span className="font-bold text-strong" style={{ fontSize: 14, lineHeight: '18px' }}>Event log</span>
          <span data-testid="log-count" className="flex h-5 items-center rounded-full bg-chip px-2 font-mono font-bold text-chip-text" style={{ fontSize: 11, lineHeight: '14px' }}>{total}</span>
          {paused ? <span className="font-mono text-muted" style={{ fontSize: 10 }}>paused · {held} held</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" data-testid="log-pause" aria-pressed={paused} aria-label={paused ? 'Resume the log' : 'Pause the log'} title={paused ? 'Resume' : 'Pause'} onClick={() => actions.setPaused(!paused)} className={iconButton} style={paused ? { borderColor: '#5B9BFF' } : undefined}>
            {paused ? <Play size={14} color="#7FB0FF" /> : <Pause size={14} color="#9DB4D8" />}
          </button>
          <button type="button" data-testid="log-clear" aria-label="Clear the log" title="Clear" onClick={() => actions.clear()} className={iconButton}>
            <Trash2 size={14} color="#9DB4D8" />
          </button>
          <button type="button" data-testid="log-collapse" aria-label="Collapse the event log" title="Collapse" onClick={() => actions.setCollapsed(true)} className={iconButton}>
            <PanelRightClose size={14} color="#9DB4D8" />
          </button>
        </div>
      </div>
      <FilterRow />
      <div ref={scroller} onScroll={onScroll} data-testid="log-rows" className="bm-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-12 text-center" data-testid="log-empty">
            <Radio size={36} color="#2A3A55" />
            <span className="font-bold text-strong" style={{ fontSize: 16, lineHeight: '22px' }}>{isFiltered(filter) && rows.length > 0 ? 'No event matches the filter' : 'Waiting for activity'}</span>
            <span className="text-muted" style={{ fontSize: 13, lineHeight: '20px', maxWidth: 420 }}>
              {isFiltered(filter) && rows.length > 0
                ? 'Clear the kind filter with All, or press Esc to clear the selected node.'
                : 'Open the app in the other browser and run a Simulation or a Budget. Every call between the modules will be narrated here, line by line.'}
            </span>
          </div>
        ) : null}
        {visible.length > shown.length ? (
          <button type="button" data-testid="log-older" onClick={() => { setFollowing(false); setLimit(limit + PAGE); }} className="shrink-0 rounded-lg border border-line-panel py-1 text-muted" style={{ fontSize: 11 }}>
            Show {Math.min(PAGE, visible.length - shown.length)} older rows ({visible.length - shown.length} hidden)
          </button>
        ) : null}
        {shown.map((row) =>
          row.type === 'event' ? (
            <EventLine key={row.key} row={row} live={following && !paused && connected && row.key === lastEventKey} expanded={expanded.has(row.key)} onToggle={toggle} />
          ) : (
            <OtherRow key={row.key} row={row} />
          ),
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line-panel px-4" style={{ height: 44 }}>
        <span data-testid="log-footer" className="font-mono text-muted" style={{ fontSize: 11, lineHeight: '14px' }}>buffer {buffer} / {bufferSize} · {streamText}</span>
        <button
          type="button"
          data-testid="jump-to-live"
          disabled={following}
          onClick={() => { setFollowing(true); setLimit(PAGE); }}
          className={`flex h-7 items-center gap-[6px] rounded-full px-3 font-semibold ${following ? 'border border-line bg-chip' : 'bg-brand'}`}
          style={{ fontSize: 12, lineHeight: '16px', color: following ? '#64748B' : '#FFFFFF', cursor: following ? 'default' : 'pointer' }}
        >
          <ArrowDownToLine size={14} color={following ? '#64748B' : '#FFFFFF'} />
          Jump to live
        </button>
      </div>
    </aside>
  );
}

/** Esc clears the selected node (and with it the node filter of the log). */
export function useEscapeClearsSelection(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') actions.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
