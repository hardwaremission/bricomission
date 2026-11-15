'use client';

import { useEffect, useState } from 'react';
import { actions, useDashboard } from '../lib/store.ts';
import { startStream } from '../lib/stream-client.ts';
import { Graph } from './Graph.tsx';
import { Header, useStatusChip } from './Header.tsx';
import { Legend } from './Legend.tsx';
import { LogPanel, useEscapeClearsSelection } from './LogPanel.tsx';
import { StateCards } from './StateCards.tsx';

/** Responsive rules (CK): log 560 at 1920, 480 at 1440, 400 at 1366; legend open only on the wide layout; log collapsed below 1280. */
export function logWidthFor(viewport: number): number {
  if (viewport >= 1600) return 560;
  if (viewport > 1366) return 480;
  return 400;
}

export function Dashboard() {
  const [viewport, setViewport] = useState<number | null>(null);
  const chip = useStatusChip();
  const collapsed = useDashboard((s) => s.collapsed);
  useEscapeClearsSelection();

  useEffect(() => {
    const width = window.innerWidth;
    setViewport(width);
    actions.setLegend(width >= 1600);
    if (width < 1280) actions.setCollapsed(true);
    const onResize = (): void => setViewport(window.innerWidth);
    window.addEventListener('resize', onResize);
    const stop = startStream();
    return () => {
      window.removeEventListener('resize', onResize);
      stop();
    };
  }, []);

  const dim = chip === 'RECONNECTING';
  return (
    <div className="flex h-screen w-screen flex-col bg-page" data-testid="dashboard" data-status={chip} data-log={collapsed ? 'collapsed' : 'open'}>
      <Header />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 bg-canvas">
          <div className="h-full w-full" style={{ opacity: dim ? 0.6 : 1 }}>
            <Graph />
          </div>
          <Legend />
          <StateCards />
        </main>
        {viewport === null ? null : <LogPanel width={logWidthFor(viewport)} />}
      </div>
    </div>
  );
}
