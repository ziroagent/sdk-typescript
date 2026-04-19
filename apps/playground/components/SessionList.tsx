'use client';

import { useEffect, useState } from 'react';

interface SessionMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
}

interface Props {
  currentId?: string;
  refreshKey: number;
}

export default function SessionList({ currentId, refreshKey }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/sessions')
      .then((r) => r.json() as Promise<{ sessions: SessionMeta[] }>)
      .then((d) => {
        if (!cancelled) setSessions(d.sessions);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div style={{ overflow: 'auto', padding: 8 }}>
      {sessions.length === 0 ? (
        <div style={{ color: 'var(--text-dim)' }}>No sessions yet.</div>
      ) : (
        sessions.map((s) => (
          <div
            key={s.id}
            style={{
              padding: '6px 8px',
              borderRadius: 4,
              marginBottom: 4,
              background: s.id === currentId ? 'var(--panel-2)' : 'transparent',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
            }}
          >
            <div>{s.id}</div>
            <div style={{ color: 'var(--text-dim)' }}>
              updated {new Date(s.updatedAt).toLocaleTimeString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
