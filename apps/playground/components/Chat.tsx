'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TraceEvent {
  type: string;
  data?: unknown;
  at: number;
}

interface ChatProps {
  onTraceEvent?: (event: TraceEvent) => void;
  onSession?: (sessionId: string) => void;
  onClear?: () => void;
}

export default function Chat({ onTraceEvent, onSession, onClear }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    let accumulated = '';
    setMessages((m) => [...m, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({ sessionId, messages: next }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const ev of events) {
          if (!ev.startsWith('data: ')) continue;
          const payload = ev.slice(6);
          let parsed: { type: string; [k: string]: unknown };
          try {
            parsed = JSON.parse(payload) as { type: string; [k: string]: unknown };
          } catch {
            continue;
          }
          onTraceEvent?.({ type: parsed.type, data: parsed, at: Date.now() });
          if (parsed.type === 'session') {
            const id = parsed.sessionId as string;
            setSessionId(id);
            onSession?.(id);
          } else if (parsed.type === 'text-delta') {
            accumulated += parsed.textDelta as string;
            setMessages((m) => {
              const copy = m.slice();
              copy[copy.length - 1] = { role: 'assistant', content: accumulated };
              return copy;
            });
          } else if (parsed.type === 'error') {
            accumulated += `\n[error: ${String(parsed.error)}]`;
            setMessages((m) => {
              const copy = m.slice();
              copy[copy.length - 1] = { role: 'assistant', content: accumulated };
              return copy;
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { role: 'assistant', content: `[error: ${msg}]` };
        return copy;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, sessionId, onTraceEvent, onSession]);

  const reset = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    onClear?.();
  }, [onClear]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  return (
    <div style={chatWrap}>
      <div style={listWrap}>
        {messages.length === 0 ? (
          <div style={emptyState}>
            <p>
              Start by sending a message. Configure the model in <code>.env.local</code>.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: messages list is append-only and ordered
              key={i}
              style={msgRow(m.role)}
            >
              <div style={roleBadge(m.role)}>{m.role}</div>
              <div style={msgBody}>
                {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
              </div>
            </div>
          ))
        )}
      </div>
      <form
        style={inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything…"
          rows={2}
          style={{ flex: 1, resize: 'vertical' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="submit" disabled={streaming || !input.trim()}>
            {streaming ? 'Streaming…' : 'Send'}
          </button>
          <button type="button" onClick={reset} disabled={streaming}>
            Reset
          </button>
        </div>
      </form>
      {sessionId ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '4px 12px' }}>
          session: {sessionId}
        </div>
      ) : null}
    </div>
  );
}

const chatWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
};

const listWrap: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const emptyState: React.CSSProperties = {
  color: 'var(--text-dim)',
  marginTop: 24,
};

const msgRow = (role: ChatMessage['role']): React.CSSProperties => ({
  display: 'flex',
  gap: 12,
  padding: 12,
  borderRadius: 8,
  background: role === 'assistant' ? 'var(--panel)' : 'transparent',
  border: role === 'user' ? '1px solid var(--border)' : 'none',
});

const roleBadge = (role: ChatMessage['role']): React.CSSProperties => ({
  flex: '0 0 auto',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color:
    role === 'user'
      ? 'var(--accent-2)'
      : role === 'assistant'
        ? 'var(--accent)'
        : 'var(--text-dim)',
  fontWeight: 600,
});

const msgBody: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  flex: 1,
};

const inputRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: 12,
  borderTop: '1px solid var(--border)',
  alignItems: 'stretch',
};
