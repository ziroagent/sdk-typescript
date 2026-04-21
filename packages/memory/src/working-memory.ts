/**
 * Per-run / per-thread scratchpad (RFC 0011 — working memory tier, minimal v0.4 slice).
 */

import type { ChatMessage } from '@ziro-agent/core';

export type WorkingMemoryScope = 'resource' | 'thread';

export interface WorkingMemory {
  readonly scope: WorkingMemoryScope;
  /** Namespace key (e.g. user id + resource id, or thread id). */
  readonly key: string;
  read(): Promise<string>;
  write(markdown: string): Promise<void>;
  append(markdown: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Markdown-first working buffer kept in process memory. Not durable across
 * restarts — pair with a `Checkpointer` for crash safety.
 */
export class InMemoryWorkingMemory implements WorkingMemory {
  private buf = '';

  constructor(
    readonly scope: WorkingMemoryScope,
    readonly key: string,
  ) {}

  async read(): Promise<string> {
    return this.buf;
  }

  async write(markdown: string): Promise<void> {
    this.buf = markdown;
  }

  async append(markdown: string): Promise<void> {
    if (this.buf.length > 0 && !this.buf.endsWith('\n')) this.buf += '\n';
    this.buf += markdown;
  }

  async clear(): Promise<void> {
    this.buf = '';
  }
}

const WORKING_HEADER = '\n\n## Working memory\n\n';

/**
 * Appends `workingMarkdown` to the first `system` message, or prepends a new
 * system message when none exists.
 */
export function injectWorkingMemoryIntoMessages(
  messages: readonly ChatMessage[],
  workingMarkdown: string,
): ChatMessage[] {
  const block = workingMarkdown.trim();
  if (!block) return [...messages];
  const injection = `${WORKING_HEADER}${block}`;
  if (messages.length === 0) {
    return [{ role: 'system', content: `## Working memory\n\n${block}` }];
  }
  const first = messages[0];
  if (first && first.role === 'system') {
    const next: ChatMessage[] = [
      { role: 'system', content: first.content + injection },
      ...messages.slice(1),
    ];
    return next;
  }
  return [{ role: 'system', content: `## Working memory\n\n${block}` }, ...messages];
}
