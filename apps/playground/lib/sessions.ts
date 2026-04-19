import type { ChatMessage } from '@ziro-ai/core';

/**
 * In-memory session log. The playground is single-process and dev-only so a
 * `Map` is sufficient — sessions reset on server restart, which is desirable
 * during iteration. For multi-tab support we key by an opaque session id
 * generated on first POST.
 */
export interface SessionTrace {
  type: 'llm-start' | 'llm-text-delta' | 'llm-finish' | 'tool-call' | 'tool-result' | 'error';
  at: number;
  data: unknown;
}

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  trace: SessionTrace[];
}

class SessionStore {
  private readonly map = new Map<string, Session>();

  create(): Session {
    const id = randomId();
    const now = Date.now();
    const session: Session = {
      id,
      createdAt: now,
      updatedAt: now,
      messages: [],
      trace: [],
    };
    this.map.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.map.get(id);
  }

  list(): Array<Pick<Session, 'id' | 'createdAt' | 'updatedAt'>> {
    return Array.from(this.map.values())
      .map(({ id, createdAt, updatedAt }) => ({ id, createdAt, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  touch(id: string): void {
    const s = this.map.get(id);
    if (s) s.updatedAt = Date.now();
  }
}

declare global {
  // biome-ignore lint/style/noVar: must be `var` to attach to globalThis.
  var __ziroPlaygroundStore: SessionStore | undefined;
}

export const sessions: SessionStore =
  globalThis.__ziroPlaygroundStore ?? (globalThis.__ziroPlaygroundStore = new SessionStore());

function randomId(): string {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
}
