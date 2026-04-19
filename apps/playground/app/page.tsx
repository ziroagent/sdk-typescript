'use client';

import { useCallback, useState } from 'react';
import Chat, { type TraceEvent } from '@/components/Chat';
import TraceViewer from '@/components/TraceViewer';
import SessionList from '@/components/SessionList';

export default function HomePage() {
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);

  const onTraceEvent = useCallback((ev: TraceEvent) => {
    setTrace((t) => [...t, ev]);
    if (ev.type === 'finish' || ev.type === 'error') {
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const onSession = useCallback((id: string) => {
    setSessionId(id);
    setRefreshKey((k) => k + 1);
  }, []);

  const onClear = useCallback(() => {
    setTrace([]);
    setSessionId(undefined);
  }, []);

  return (
    <main style={layout}>
      <aside style={leftCol}>
        <header style={header}>Ziro Playground</header>
        <SessionList currentId={sessionId} refreshKey={refreshKey} />
      </aside>
      <section style={mainCol}>
        <header style={header}>Chat</header>
        <Chat onTraceEvent={onTraceEvent} onSession={onSession} onClear={onClear} />
      </section>
      <aside style={rightCol}>
        <header style={header}>Trace</header>
        <TraceViewer events={trace} />
      </aside>
    </main>
  );
}

const layout: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '240px 1fr 380px',
  height: '100vh',
};

const leftCol: React.CSSProperties = {
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

const mainCol: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

const rightCol: React.CSSProperties = {
  borderLeft: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

const header: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  letterSpacing: 0.3,
};
