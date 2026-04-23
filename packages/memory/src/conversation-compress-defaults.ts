import type { ChatMessage } from '@ziro-agent/core';

import type { SummarizingConversationMemoryOptions } from './conversation-memory.js';

export interface SnippetCompressorOptions {
  /**
   * Role for the synthetic summary message inserted before the kept tail.
   * Defaults to `user` so most chat models treat it as opaque context.
   */
  summaryRole?: 'user' | 'system';
  /** Max characters retained per dropped message (content JSON-stringified). */
  maxCharsPerMessage?: number;
  /** Cap on total characters in the summary JSON payload. */
  maxTotalChars?: number;
}

function stringifyContent(msg: ChatMessage): string {
  try {
    return JSON.stringify(msg.content);
  } catch {
    return '[unserializable]';
  }
}

/**
 * Deterministic `onOverflow` for {@link SummarizingConversationMemory} when
 * you do not yet wire an LLM summariser — drops verbose history into one
 * compact JSON text block (RFC 0011 `compress()`-style default).
 */
export function createDroppedMessagesSnippetCompressor(
  options?: SnippetCompressorOptions,
): SummarizingConversationMemoryOptions['onOverflow'] {
  const summaryRole = options?.summaryRole ?? 'user';
  const maxCharsPerMessage = options?.maxCharsPerMessage ?? 400;
  const maxTotalChars = options?.maxTotalChars ?? 8000;

  return async (dropped) => {
    const snippets: { role: ChatMessage['role']; text: string }[] = [];
    let budget = maxTotalChars;
    for (const m of dropped) {
      if (budget <= 0) break;
      const raw = stringifyContent(m);
      const slice = raw.length > maxCharsPerMessage ? `${raw.slice(0, maxCharsPerMessage)}…` : raw;
      const piece = slice.length > budget ? `${slice.slice(0, budget)}…` : slice;
      snippets.push({ role: m.role, text: piece });
      budget -= piece.length;
    }
    const summaryText = `[ziro.memory.compress] dropped ${dropped.length} message(s): ${JSON.stringify(
      snippets,
    )}`;
    const summary: ChatMessage =
      summaryRole === 'system'
        ? { role: 'system', content: summaryText }
        : { role: 'user', content: [{ type: 'text' as const, text: summaryText }] };
    return [summary];
  };
}
