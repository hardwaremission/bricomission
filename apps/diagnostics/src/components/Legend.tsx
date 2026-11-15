'use client';

import { ChevronDown } from 'lucide-react';
import { LEGEND_RECT } from '../graph/layout.ts';
import { METRIC_COLOR, PIN_COLOR, SECTION_COLOR } from '../graph/tokens.ts';
import { actions, useDashboard } from '../lib/store.ts';

const PIN_ROWS = [['http', 'sql', 'object'], ['llm', 'image', 'embed'], ['auth', 'mail', 'queue'], ['compute', 'step']] as const;
const SECTIONS = [['request', 'request'], ['generation', 'generation'], ['budget', 'budget'], ['gpu', 'GPU'], ['infra', 'infra clients']] as const;

const label = { color: '#8A9BB5', fontSize: 10, lineHeight: '13px' } as const;
const text = { color: '#CBD5E1', fontSize: 10, lineHeight: '13px' } as const;

function Sample({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-[3px] w-9 items-center">{children}</span>
      <span style={text}>{caption}</span>
    </div>
  );
}

/** Global legend card (bottom-left of the canvas, 284 wide). Open by default at 1920; toggled from the header button. */
export function Legend() {
  const open = useDashboard((s) => s.legendOpen);
  if (!open) return null;
  return (
    <aside data-testid="legend" aria-label="Legend" className="absolute flex flex-col gap-[10px] rounded-xl border border-line bg-panel p-3" style={{ left: LEGEND_RECT.x, bottom: 8, width: LEGEND_RECT.w }}>
      <div className="flex w-full items-center justify-between">
        <span className="font-bold text-strong" style={{ fontSize: 12, lineHeight: '16px' }}>LEGEND</span>
        <button type="button" aria-label="Collapse the legend" onClick={() => actions.setLegend(false)}>
          <ChevronDown size={14} color="#8A9BB5" />
        </button>
      </div>
      <div className="flex flex-col gap-[5px]">
        <span className="font-bold" style={label}>PIN TYPES (what flows through)</span>
        {PIN_ROWS.map((row) => (
          <div key={row[0]} className="flex gap-[6px]">
            {row.map((pin) => (
              <span key={pin} className="flex w-20 items-center gap-[5px]">
                <span className="block h-[9px] w-[9px] rounded-full" style={{ background: PIN_COLOR[pin] }} />
                <span className="font-mono" style={text}>{pin}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-[5px]">
        <span className="font-bold" style={label}>API MODULE GROUPS (left strip)</span>
        <div className="flex flex-wrap gap-x-2 gap-y-[5px]">
          {SECTIONS.map(([id, name]) => (
            <span key={id} className="flex items-center gap-[5px]">
              <span className="block h-[11px] w-[3px]" style={{ background: SECTION_COLOR[id] }} />
              <span style={text}>{name}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-[5px]">
        <span className="font-bold" style={label}>CONNECTIONS</span>
        <Sample caption="idle"><span className="block h-[2px] w-9" style={{ background: '#2A3A55' }} /></Sample>
        <Sample caption="active: coloured line + white packet">
          <span className="block h-[3px] w-9" style={{ background: '#5B9BFF' }} />
          <span className="absolute left-[10px] block h-[3px] w-[14px] bg-white" />
        </Sample>
        <Sample caption="response: packet comes back">
          <span className="block h-[3px] w-9" style={{ background: '#4ADE80' }} />
          <span className="absolute left-[10px] block h-[3px] w-[14px] bg-white" />
        </Sample>
        <Sample caption="dashed: simulated (fake adapter)">
          <span className="flex gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="block h-[3px] w-[7px]" style={{ background: '#A78BFA' }} />
            ))}
          </span>
        </Sample>
        <Sample caption="error: red for 3 s"><span className="block h-[3px] w-9" style={{ background: '#EF4444' }} /></Sample>
      </div>
      <div className="flex flex-col gap-[5px]">
        <span className="font-bold" style={label}>NODES AND METRICS</span>
        <div className="flex items-center gap-[10px]">
          {([['idle', '#475569'], ['working', '#5B9BFF'], ['error', '#EF4444']] as const).map(([name, color]) => (
            <span key={name} className="flex items-center gap-1">
              <span className="block h-2 w-2 rounded-full" style={{ background: color }} />
              <span style={text}>{name}</span>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="block h-2 w-2 rounded-full" style={{ background: '#1E293B', border: '1px solid #7E8DA6' }} />
            <span style={text}>offline</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(['cpu', 'ram', 'vram', 'gpu'] as const).map((metric) => (
            <span key={metric} className="flex items-center gap-1">
              <span className="block h-1 w-3" style={{ background: METRIC_COLOR[metric] }} />
              <span style={text}>{metric.toUpperCase()}</span>
            </span>
          ))}
        </div>
        <span style={label}>n/a = not measurable. shared = whole API container. ~ approx = card busy % attributed to the node; header GPU is exact.</span>
      </div>
    </aside>
  );
}
