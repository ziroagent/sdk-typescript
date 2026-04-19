'use client';

import { useMemo } from 'react';
import type { TraceEvent } from './Chat';

export default function TraceViewer({ events }: { events: TraceEvent[] }) {
  const grouped = useMemo(() => events.slice().reverse(), [events]);
  return (
    <div style={{ overflow: 'auto', padding: 8, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}>
      {grouped.length === 0 ? (
        <div style={{ color: 'var(--text-dim)' }}>No trace events yet.</div>
      ) : (
        grouped.map((ev, i) => (
          <details key={i} style={{ marginBottom: 4, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
            <summary style={{ cursor: 'pointer', color: colorFor(ev.type) }}>
              {fmtTime(ev.at)}  <strong>{ev.type}</strong>
            </summary>
            <pre style={{ margin: '6px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(ev.data ?? {}, null, 2)}
            </pre>
          </details>
        ))
      )}
    </div>
  );
}

function fmtTime(t: number): string {
  const d = new Date(t);
  return d.toISOString().slice(11, 23);
}

function colorFor(type: string): string {
  if (type === 'error') return 'var(--danger)';
  if (type.startsWith('llm-')) return 'var(--accent-2)';
  if (type.startsWith('tool-')) return 'var(--accent)';
  return 'var(--text)';
}
