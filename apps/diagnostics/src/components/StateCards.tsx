'use client';

import { KeyRound, PowerOff, RefreshCw, WifiOff } from 'lucide-react';
import { formatTime } from '../lib/state/log-state.ts';
import { useDashboard } from '../lib/store.ts';
import { retryNow } from '../lib/stream-client.ts';
import { useStatusChip } from './Header.tsx';

function Card({ testId, stroke, iconBg, icon, title, children }: { testId: string; stroke: string; iconBg: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(8, 14, 26, 0.55)' }}>
      <div data-testid={testId} role="alert" className="pointer-events-auto flex flex-col gap-[10px] rounded-[14px] bg-panel p-5" style={{ width: 360, border: `1px solid ${stroke}`, boxShadow: '0 12px 32px #00000080' }}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: iconBg }}>{icon}</span>
        <span className="font-bold text-strong" style={{ fontSize: 16, lineHeight: '22px' }}>{title}</span>
        {children}
      </div>
    </div>
  );
}

const body = { fontSize: 12, lineHeight: '18px', color: '#8A9BB5' } as const;

/** Setup and connection cards (ST1), centred over the dimmed graph. */
export function StateCards() {
  const chip = useStatusChip();
  const retryIn = useDashboard((s) => (s.conn.retryAt === null ? null : Math.max(0, Math.ceil((s.conn.retryAt - s.now) / 1000))));
  const lastTs = useDashboard((s) => {
    for (let i = s.log.rows.length - 1; i >= 0; i -= 1) {
      const row = s.log.rows[i];
      if (row.type === 'event') return row.lastTs;
    }
    return null;
  });
  if (chip === 'RECONNECTING') {
    return (
      <Card testId="card-disconnected" stroke="#2A3A55" iconBg="#2A2508" icon={<WifiOff size={20} color="#FACC15" />} title="Connection lost">
        <span style={body}>
          The dashboard lost the event stream. {retryIn === null ? 'Retrying with back-off.' : `Retrying in ${retryIn} s.`} {lastTs ? `Last event ${formatTime(lastTs).slice(0, 8)}. ` : ''}
          The graph shows the last known state until the stream returns.
        </span>
        <button type="button" data-testid="retry-now" onClick={retryNow} className="flex h-9 items-center justify-center gap-[6px] rounded-full bg-brand font-semibold text-white" style={{ fontSize: 13, lineHeight: '18px' }}>
          <RefreshCw size={14} color="#FFFFFF" />
          Retry now
        </button>
      </Card>
    );
  }
  if (chip === 'API DISABLED') {
    return (
      <Card testId="card-api-disabled" stroke="#2A3A55" iconBg="#1E293B" icon={<PowerOff size={20} color="#94A3B8" />} title="Diagnostics are off in the API">
        <span style={body}>Start the demo with the diagnostics profile so the API emits events:</span>
        <code className="rounded-lg border border-line-panel bg-well p-[10px] font-mono text-body" style={{ fontSize: 11, lineHeight: '16px' }}>./launch-demo.sh</code>
      </Card>
    );
  }
  if (chip === 'TOKEN MISMATCH') {
    return (
      <Card testId="card-token-mismatch" stroke="#7F1D1D" iconBg="#2A1017" icon={<KeyRound size={20} color="#FCA5A5" />} title="The API rejected the token">
        <span style={body}>DIAGNOSTICS_TOKEN differs between the API and the dashboard. Restart both from the same environment.</span>
      </Card>
    );
  }
  return null;
}
