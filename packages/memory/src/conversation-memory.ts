import type { ChatMessage } from '@ziro-agent/core';
import type { MemoryProcessorContext } from './memory-processor.js';

export type ConversationMemoryContext = MemoryProcessorContext;

/**
 * Session-level windowing / summarisation hook before each model call (RFC 0011).
 */
export interface ConversationMemory {
  prepareForModel(
    messages: readonly ChatMessage[],
    ctx: ConversationMemoryContext,
  ): Promise<ChatMessage[]> | ChatMessage[];
}

/**
 * Sliding window: retain every `system` message in order, then the last
 * `maxNonSystemMessages` of all other roles.
 */
export class SlidingWindowConversationMemory implements ConversationMemory {
  constructor(private readonly maxNonSystemMessages: number) {}

  prepareForModel(
    messages: readonly ChatMessage[],
    _ctx: ConversationMemoryContext,
  ): ChatMessage[] {
    const system = messages.filter((m) => m.role === 'system');
    const rest = messages.filter((m) => m.role !== 'system');
    return [...system, ...rest.slice(-this.maxNonSystemMessages)];
  }
}

export interface SummarizingConversationMemoryOptions {
  /** When non-system messages exceed this count, `onOverflow` runs on the overflow prefix. */
  maxNonSystemMessages: number;
  /**
   * Replace the dropped prefix with a single summary message (typically
   * `role: 'user'` or `system`) — caller usually calls an LLM here.
   */
  onOverflow: (
    dropped: readonly ChatMessage[],
    kept: readonly ChatMessage[],
    ctx: ConversationMemoryContext,
  ) => Promise<ChatMessage[]>;
}

/**
 * Keeps a tail of `maxNonSystemMessages`; when trimming, invokes `onOverflow`
 * with messages removed from the head (excluding leading `system` messages,
 * which are always kept verbatim).
 */
export class SummarizingConversationMemory implements ConversationMemory {
  constructor(private readonly options: SummarizingConversationMemoryOptions) {}

  async prepareForModel(
    messages: readonly ChatMessage[],
    ctx: ConversationMemoryContext,
  ): Promise<ChatMessage[]> {
    const system = messages.filter((m) => m.role === 'system');
    const rest = messages.filter((m) => m.role !== 'system');
    if (rest.length <= this.options.maxNonSystemMessages) {
      return [...system, ...rest];
    }
    const overflow = rest.length - this.options.maxNonSystemMessages;
    const dropped = rest.slice(0, overflow);
    const kept = rest.slice(overflow);
    const replacement = await this.options.onOverflow(dropped, kept, ctx);
    return [...system, ...replacement, ...kept];
  }
}
